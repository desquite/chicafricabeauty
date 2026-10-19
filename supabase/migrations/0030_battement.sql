-- ============================================================================
-- 0030 : battement entre deux rendez-vous
--
-- La salle se prepare entre deux clientes : un rendez-vous ne peut ni
-- commencer moins de battement_min minutes apres la fin du precedent, ni
-- finir moins de battement_min minutes avant le suivant. Reglable par la
-- gerante dans Disponibilites, 30 minutes par defaut. Aucun battement nest
-- exige contre une fermeture ou lheure de fermeture.
-- ============================================================================

alter table reglages_rdv
  add column if not exists battement_min int not null default 30
  check (battement_min between 0 and 120);

create or replace function reserver_en_ligne(
  p_cliente uuid,
  p_soin    uuid,
  p_date    date,
  p_heure   time
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duree    int;
  v_debut    timestamp;
  v_fin      timestamp;
  v_maintenant timestamp := now() at time zone 'UTC';
  v_horizon  int;
  v_obligatoire boolean;
  v_battement int;
  v_horaire  horaires_semaine;
  v_futurs   int;
  v_id       uuid;
  v_code     text;
begin
  select duree_std into v_duree
  from soins_catalogue
  where id = p_soin and actif and en_ligne;
  if v_duree is null then
    return jsonb_build_object('erreur', 'soin');
  end if;

  v_debut := p_date + p_heure;
  v_fin := v_debut + make_interval(mins => v_duree);

  if v_debut <= v_maintenant then
    return jsonb_build_object('erreur', 'passe');
  end if;

  select horizon_jours, acompte_obligatoire and acompte_montant > 0, battement_min
  into v_horizon, v_obligatoire, v_battement
  from reglages_rdv where id;
  if p_date > v_maintenant::date + coalesce(v_horizon, 60) then
    return jsonb_build_object('erreur', 'horizon');
  end if;

  if extract(minute from p_heure)::int % 30 <> 0 or extract(second from p_heure) <> 0 then
    return jsonb_build_object('erreur', 'creneau');
  end if;

  perform pg_advisory_xact_lock(hashtext('reserver_en_ligne'), p_date - date '2000-01-01');

  select * into v_horaire from horaires_semaine where jour = extract(dow from p_date)::int;
  if not found or not v_horaire.ouvert
     or v_debut < p_date + v_horaire.ouverture
     or v_fin > p_date + v_horaire.fermeture then
    return jsonb_build_object('erreur', 'ferme');
  end if;

  if exists (
    select 1 from fermetures f
    where p_date between f.date_debut and f.date_fin
      and (f.heure_debut is null
           or (p_date + f.heure_debut < v_fin and p_date + f.heure_fin > v_debut))
  ) then
    return jsonb_build_object('erreur', 'ferme');
  end if;

  if exists (
    select 1
    from rendez_vous r
    left join soins_catalogue s on s.id = r.soin_id
    where r.date_rdv = p_date
      and r.statut = 'prevu'
      and r.remplace_par is null
      and r.masque_le is null
      and r.heure_rdv is not null
      and not (r.acompte_requis and r.acompte_paye_le is null
               and echeance_acompte(r.date_rdv, r.created_at, r.source) <= v_maintenant)
      and r.date_rdv + r.heure_rdv < v_fin + make_interval(mins => coalesce(v_battement, 0))
      and r.date_rdv + r.heure_rdv
          + make_interval(mins => coalesce(r.duree_min, s.duree_std, 60) + coalesce(v_battement, 0)) > v_debut
  ) then
    return jsonb_build_object('erreur', 'pris');
  end if;

  select count(*) into v_futurs
  from rendez_vous
  where cliente_id = p_cliente
    and source = 'en_ligne'
    and statut = 'prevu'
    and date_rdv >= v_maintenant::date;
  if v_futurs >= 3 then
    return jsonb_build_object('erreur', 'trop');
  end if;

  insert into rendez_vous (cliente_id, date_rdv, heure_rdv, duree_min, soin_id, source, acompte_requis)
  values (p_cliente, p_date, p_heure, v_duree, p_soin, 'en_ligne', coalesce(v_obligatoire, false))
  returning id, code_acompte into v_id, v_code;

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

revoke all on function reserver_en_ligne(uuid, uuid, date, time) from public, anon, authenticated;
grant execute on function reserver_en_ligne(uuid, uuid, date, time) to service_role;
