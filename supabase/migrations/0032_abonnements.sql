-- ============================================================================
-- 0032 : abonnements
--
-- Une abonnee paie d avance une formule de 3, 6 ou 12 mois sur UN soin : un
-- nombre de seances choisi par la gerante, a un rythme donne (chaque semaine,
-- toutes les 2 ou 3 semaines, chaque mois pour 12 mois). Le prix se regle par
-- lien de paiement en 1 a 3 versements, tous avant la fin.
--
-- Pendant l abonnement, ses rendez-vous pour ce soin n exigent pas d acompte.
-- Ses seances d abonnement ne comptent pas pour la fidelite.
-- Une pause repousse la fin : jours_pause s ajoute a la duree.
-- ============================================================================

create table if not exists abonnements (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete restrict,
  soin_id        uuid not null references soins_catalogue(id),
  debut          date not null,
  duree_mois     int not null check (duree_mois in (3, 6, 12)),
  rythme         text not null check (rythme in ('1s', '2s', '3s', '1m')),
  nb_seances     int not null check (nb_seances between 1 and 60),
  prix           int not null check (prix > 0),
  nb_versements  int not null default 1 check (nb_versements between 1 and 3),
  statut         text not null default 'actif'
                 check (statut in ('actif', 'pause', 'termine', 'annule')),
  pause_depuis   date,
  jours_pause    int not null default 0 check (jours_pause >= 0),
  code_paiement  text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  notes          text,
  cree_par       uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- Chaque mois n a de sens que sur un an.
  constraint abonnements_rythme_mensuel check (rythme <> '1m' or duree_mois = 12)
);

create unique index if not exists abonnements_code_idx on abonnements (code_paiement);
create index if not exists abonnements_cliente_idx on abonnements (cliente_id, statut);

drop trigger if exists abonnements_touch on abonnements;
create trigger abonnements_touch before update on abonnements
  for each row execute function touch_updated_at();

alter table abonnements enable row level security;
drop policy if exists abonnements_staff on abonnements;
create policy abonnements_staff on abonnements
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

-- Versements, sur le modele de paiements_acompte.
create table if not exists paiements_abonnement (
  id              uuid primary key default gen_random_uuid(),
  abonnement_id   uuid not null references abonnements(id) on delete restrict,
  order_id        text not null unique,
  transaction_id  text,
  operateur       text not null check (operateur in ('orange', 'mtn', 'moov', 'wave')),
  telephone       text not null,
  montant         int not null check (montant > 0),
  statut          text not null default 'en_attente'
                  check (statut in ('en_attente', 'reussi', 'echoue')),
  lien_paiement   text,
  detail          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists paiements_abonnement_abo_idx on paiements_abonnement (abonnement_id, statut);

drop trigger if exists paiements_abonnement_touch on paiements_abonnement;
create trigger paiements_abonnement_touch before update on paiements_abonnement
  for each row execute function touch_updated_at();

alter table paiements_abonnement enable row level security;
drop policy if exists paiements_abonnement_lecture on paiements_abonnement;
create policy paiements_abonnement_lecture on paiements_abonnement
  for select to authenticated using (est_staff_actif());

-- Seance faite au titre d un abonnement : decomptee, hors fidelite.
alter table seances add column if not exists abonnement_id uuid references abonnements(id);
create index if not exists seances_abonnement_idx on seances (abonnement_id);

-- Dernier jour couvert, pauses comprises.
create or replace function fin_abonnement(p_debut date, p_duree int, p_pause int)
returns date language sql immutable as $$
  select ((p_debut + make_interval(months => p_duree, days => p_pause))::date - 1)
$$;

-- Le soin de ce jour-la est-il couvert par un abonnement actif ?
create or replace function abonnement_couvre(p_cliente uuid, p_soin uuid, p_date date)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from abonnements a
    where a.cliente_id = p_cliente
      and a.soin_id = p_soin
      and a.statut = 'actif'
      and p_date between a.debut and fin_abonnement(a.debut, a.duree_mois, a.jours_pause)
  )
$$;

-- reserver_en_ligne : pas d acompte pour un soin couvert par un abonnement.
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
  values (p_cliente, p_date, p_heure, v_duree, p_soin, 'en_ligne',
          coalesce(v_obligatoire, false) and not abonnement_couvre(p_cliente, p_soin, p_date))
  returning id, code_acompte into v_id, v_code;

  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

revoke all on function reserver_en_ligne(uuid, uuid, date, time) from public, anon, authenticated;
grant execute on function reserver_en_ligne(uuid, uuid, date, time) to service_role;
