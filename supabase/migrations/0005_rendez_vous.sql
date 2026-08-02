-- ============================================================================
-- Rendez-vous et notifications internes
--
-- seances.prochain_rdv ne portait quune date posee en fin de seance : pas
-- dheure, pas de statut, impossible a deplacer ni a annuler, et inutilisable
-- pour une cliente qui appelle. Cette table en fait un vrai agenda.
--
-- Les rappels vont aux gerantes, jamais aux clientes : do le telephone sur
-- profiles et non un envoi vers clientes.telephone.
-- ============================================================================

alter table profiles add column if not exists telephone text;
alter table profiles add column if not exists notifications_whatsapp boolean not null default true;

create table if not exists rendez_vous (
  id           uuid primary key default gen_random_uuid(),
  cliente_id   uuid not null references clientes(id) on delete restrict,
  date_rdv     date not null,
  heure_rdv    time,
  duree_min    int,
  soin_id      uuid references soins_catalogue(id) on delete set null,
  statut       text not null default 'prevu'
               check (statut in ('prevu', 'honore', 'annule', 'absent')),
  -- Renseigne quand la seance correspondante est saisie : cest ce lien qui
  -- permet de distinguer un rendez-vous honore dune absence.
  seance_id    uuid references seances(id) on delete set null,
  notes        text,
  cree_par     uuid references profiles(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists rendez_vous_date_idx on rendez_vous (date_rdv, heure_rdv);
create index if not exists rendez_vous_cliente_idx on rendez_vous (cliente_id, date_rdv desc);
create index if not exists rendez_vous_statut_idx on rendez_vous (statut) where statut = 'prevu';

drop trigger if exists rendez_vous_touch on rendez_vous;
create trigger rendez_vous_touch before update on rendez_vous
  for each row execute function touch_updated_at();

alter table rendez_vous enable row level security;

drop policy if exists rendez_vous_staff on rendez_vous;
create policy rendez_vous_staff on rendez_vous
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

-- ----------------------------------------------------------------- journal
-- Trace des envois automatiques. Sert a ne pas renvoyer deux fois le meme
-- recapitulatif si le cron est rejoue, et a diagnostiquer un envoi manquant
-- sans avoir a fouiller les journaux de la plateforme.
create table if not exists notifications_envoyees (
  id           uuid primary key default gen_random_uuid(),
  type         text not null,
  cle_jour     date not null,
  destinataire text not null,
  succes       boolean not null,
  detail       text,
  envoye_le    timestamptz not null default now()
);

create unique index if not exists notifications_unicite
  on notifications_envoyees (type, cle_jour, destinataire) where succes;

alter table notifications_envoyees enable row level security;

drop policy if exists notifications_lecture on notifications_envoyees;
create policy notifications_lecture on notifications_envoyees
  for select to authenticated using (est_staff_actif());
