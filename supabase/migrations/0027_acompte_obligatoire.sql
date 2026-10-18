-- ============================================================================
-- Acompte obligatoire
--
-- Regle unique pour toutes les clientes : lacompte se regle au plus tard la
-- veille du rendez-vous a 18h, sinon le rendez-vous est annule
-- automatiquement et le creneau libere.
--
--   reservation en ligne  payer tout de suite, ou par le lien recu, avant
--                         la veille 18h ; prise apres la veille 18h, le
--                         paiement est immediat (30 minutes pour le faire)
--   saisie a la tablette  lien envoye 48 h avant ; saisie apres la veille
--                         18h, pas declheance : la cliente regle sur place
--
-- Lecheance nest pas stockee : elle se deduit de la date du rendez-vous et
-- de sa creation, et suit donc un rendez-vous deplace.
--
-- Rien ne change tant que la gerante na pas allume le reglage : les
-- messages WhatsApp qui previennent la cliente doivent dabord etre valides
-- par Meta. Seuls les rendez-vous crees apres lallumage sont concernes.
-- ============================================================================

alter table reglages_rdv add column if not exists acompte_obligatoire boolean not null default false;

alter table rendez_vous add column if not exists acompte_requis boolean not null default false;
-- Code du lien de paiement /a/<code>. Il ne donne que le droit de payer cet
-- acompte : aucune donnee de la cliente nen depend.
alter table rendez_vous add column if not exists code_acompte text
  default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
update rendez_vous set code_acompte = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
where code_acompte is null;
alter table rendez_vous alter column code_acompte set not null;
create unique index if not exists rendez_vous_code_acompte_idx on rendez_vous (code_acompte);

alter table rendez_vous add column if not exists annulation_motif text;

create or replace function echeance_acompte(p_date date, p_cree timestamptz, p_source text)
returns timestamp
language sql
immutable
as $$
  select case
    when (p_cree at time zone 'UTC') < (p_date - 1) + time '18:00'
      then (p_date - 1) + time '18:00'
    when p_source = 'en_ligne'
      then (p_cree at time zone 'UTC') + interval '30 minutes'
    else null
  end
$$;

-- reserver_en_ligne : un rendez-vous dont lacompte requis na pas ete paye a
-- lecheance ne bloque plus le creneau, meme avant son annulation formelle.
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

  select horizon_jours, acompte_obligatoire and acompte_montant > 0
  into v_horizon, v_obligatoire
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
      and r.date_rdv + r.heure_rdv < v_fin
      and r.date_rdv + r.heure_rdv
          + make_interval(mins => coalesce(r.duree_min, s.duree_std, 60)) > v_debut
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
