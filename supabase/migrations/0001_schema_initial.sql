-- ============================================================================
-- Institut de beauté — schéma initial
-- Mono-institut. Seul le personnel authentifié accède aux données.
-- Les clientes n'ont pas de compte : elles saisissent leur fiche sur la
-- tablette, à l'intérieur de la session ouverte par la gérante.
--
-- Ce script est idempotent : il peut être relancé autant de fois que
-- nécessaire, y compris sur une base partiellement migrée.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------ types
do $$ begin
  create type role_staff as enum ('gerante', 'estheticienne');
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_venue as enum ('premiere_seance', 'suivi');
exception when duplicate_object then null; end $$;

do $$ begin
  create type type_peau as enum ('normale', 'seche', 'grasse', 'mixte');
exception when duplicate_object then null; end $$;

do $$ begin
  create type etat_peau as enum ('deshydratee', 'sensible', 'mature', 'asphyxiee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type nature_consentement as enum ('soin', 'photo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type moment_photo as enum ('avant', 'apres');
exception when duplicate_object then null; end $$;

do $$ begin
  create type evolution_peau as enum (
    'premiere_seance', 'nette_amelioration', 'legere_amelioration', 'stable', 'degradation'
  );
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------- personnel (staff)
-- Une ligne par membre du personnel, liée au compte Supabase Auth.
-- pin_hash sert à savoir QUI saisit sur la tablette partagée ; ce n'est pas
-- une frontière de sécurité (la vraie frontière est la session Supabase).
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nom         text not null,
  role        role_staff not null default 'estheticienne',
  pin_hash    text,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Utilisée par toutes les policies : l'appelant est-il un membre actif ?
create or replace function est_staff_actif()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and actif
  );
$$;

-- ---------------------------------------------------------------- clientes
create table if not exists clientes (
  id              uuid primary key default gen_random_uuid(),
  nom             text not null,
  prenoms         text not null,
  date_naissance  date,
  profession      text,
  telephone       text not null unique,
  email           text,
  notes           text,
  actif           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists clientes_recherche_idx on clientes
  using gin (to_tsvector('simple', nom || ' ' || prenoms || ' ' || telephone));

-- --------------------------------------------------------------- anamnèses
-- Bilan santé + habitudes. Une nouvelle ligne à chaque mise à jour :
-- l'historique est conservé, la ligne la plus récente fait foi.
create table if not exists anamneses (
  id                      uuid primary key default gen_random_uuid(),
  cliente_id              uuid not null references clientes(id) on delete cascade,
  date_maj                timestamptz not null default now(),
  saisie_par              uuid references profiles(id),

  -- bilan santé
  allergies               text,
  traitement_en_cours     boolean,
  traitement_detail       text,
  grossesse_allaitement   boolean,
  port_lentilles          boolean,
  implants_pacemaker      boolean,
  injections_recentes     boolean,
  injections_detail       text,

  -- habitudes & routine
  fumeur                  boolean,
  exposition_uv           text,      -- jamais | moderee | frequente
  hydratation             text,      -- moins_1l | plus_1_5l
  routine_actuelle        text,
  priorites               text[]     -- eclat, rides, imperfections, hydratation, taches
);

create index if not exists anamneses_cliente_idx on anamneses (cliente_id, date_maj desc);

-- Dernière anamnèse connue de chaque cliente, pour l'écran fiche.
create or replace view anamneses_courantes as
select distinct on (cliente_id) *
from anamneses
order by cliente_id, date_maj desc;

-- ----------------------------------------------------------- consentements
-- Daté et jamais écrasé : un retrait de consentement = une nouvelle ligne.
create table if not exists consentements (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  nature         nature_consentement not null,
  accepte        boolean not null,
  texte_version  text not null,     -- le texte exact signé ce jour-là
  signature_path text,              -- signature manuscrite, bucket privé
  signe_le       timestamptz not null default now(),
  recueilli_par  uuid references profiles(id)
);

create index if not exists consentements_cliente_idx
  on consentements (cliente_id, nature, signe_le desc);

-- --------------------------------------------------------- catalogue soins
-- Table et non liste en dur : la gérante ajoute ses soins elle-même.
create table if not exists soins_catalogue (
  id         uuid primary key default gen_random_uuid(),
  libelle    text not null unique,
  categorie  text,
  duree_std  int,          -- minutes
  prix       numeric(10,2),
  actif      boolean not null default true,
  ordre      int not null default 0
);

-- ----------------------------------------------------------------- séances
create table if not exists seances (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete restrict,
  praticienne_id       uuid references profiles(id),
  date_seance          date not null default current_date,
  type_venue           type_venue not null default 'suivi',

  -- diagnostic
  type_peau            type_peau,
  etat_peau            etat_peau,
  observations_peau    text[],   -- cicatrices, taches, pores, age, comedons…

  -- soin réalisé
  zones                text[],
  produits_utilises    text,
  appareil             text,
  duree_min            int,

  -- observations
  reactions            text[],
  evolution            evolution_peau,
  observations         text,
  incident             text,

  -- suite à donner
  programme            text,
  conseils             text,
  produits_conseilles  text,
  delai_recommande     text,
  prochain_rdv         date,

  cloturee             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists seances_cliente_idx on seances (cliente_id, date_seance desc);
create index if not exists seances_date_idx on seances (date_seance desc);
create index if not exists seances_rdv_idx on seances (prochain_rdv) where prochain_rdv is not null;

create table if not exists seance_soins (
  seance_id uuid not null references seances(id) on delete cascade,
  soin_id   uuid not null references soins_catalogue(id) on delete restrict,
  primary key (seance_id, soin_id)
);

-- ------------------------------------------------------------------ photos
create table if not exists photos (
  id           uuid primary key default gen_random_uuid(),
  seance_id    uuid not null references seances(id) on delete cascade,
  moment       moment_photo not null,
  storage_path text not null,
  prise_le     timestamptz not null default now(),
  prise_par    uuid references profiles(id)
);

create index if not exists photos_seance_idx on photos (seance_id, moment);

-- ------------------------------------------------------------ updated_at
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists clientes_touch on clientes;
create trigger clientes_touch before update on clientes
  for each row execute function touch_updated_at();

drop trigger if exists seances_touch on seances;
create trigger seances_touch before update on seances
  for each row execute function touch_updated_at();

-- ============================================================================
-- RLS — activée dès la première migration, pas « plus tard ».
-- Données de santé : aucune table n'est lisible sans session staff active.
-- ============================================================================
alter table profiles         enable row level security;
alter table clientes         enable row level security;
alter table anamneses        enable row level security;
alter table consentements    enable row level security;
alter table soins_catalogue  enable row level security;
alter table seances          enable row level security;
alter table seance_soins     enable row level security;
alter table photos           enable row level security;

-- profiles : chacun lit l'annuaire du personnel, seule la gérante modifie.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (est_staff_actif());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_gerante_all on profiles;
create policy profiles_gerante_all on profiles
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gerante' and p.actif))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gerante' and p.actif));

-- Données métier : tout le personnel actif, en lecture comme en écriture.
drop policy if exists clientes_staff on clientes;
create policy clientes_staff on clientes
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists anamneses_staff on anamneses;
create policy anamneses_staff on anamneses
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists soins_staff on soins_catalogue;
create policy soins_staff on soins_catalogue
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists seances_staff on seances;
create policy seances_staff on seances
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists seance_soins_staff on seance_soins;
create policy seance_soins_staff on seance_soins
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists photos_staff on photos;
create policy photos_staff on photos
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

-- Consentements : insérables et lisibles, jamais modifiables ni supprimables.
drop policy if exists consentements_select on consentements;
create policy consentements_select on consentements
  for select to authenticated using (est_staff_actif());

drop policy if exists consentements_insert on consentements;
create policy consentements_insert on consentements
  for insert to authenticated with check (est_staff_actif());

-- ---------------------------------------------------------------- storage
-- Buckets privés. Accès uniquement par URL signée générée côté serveur.
insert into storage.buckets (id, name, public)
values ('photos-soins', 'photos-soins', false),
       ('signatures',   'signatures',   false)
on conflict (id) do nothing;

-- Selon le rôle utilisé dans l'éditeur SQL, la création d'une policy sur
-- storage.objects peut être refusée. Dans ce cas la migration ne s'arrête
-- pas : les policies se créent alors depuis Storage > Policies.
do $$ begin
  drop policy if exists storage_soins_staff on storage.objects;
  create policy storage_soins_staff on storage.objects
    for all to authenticated
    using (bucket_id in ('photos-soins', 'signatures') and est_staff_actif())
    with check (bucket_id in ('photos-soins', 'signatures') and est_staff_actif());
exception when insufficient_privilege then
  raise notice 'Policy storage.objects non créée : privilèges insuffisants. À créer depuis Storage > Policies.';
end $$;

-- ------------------------------------------------------------------- seed
-- Catalogue de départ, à remplacer par le menu réel de l'institut.
insert into soins_catalogue (libelle, categorie, duree_std, ordre) values
  ('Nettoyage de peau',  'Visage', 60, 10),
  ('Soin hydratant',     'Visage', 60, 20),
  ('Soin éclat',         'Visage', 60, 30),
  ('Soin anti-âge',      'Visage', 75, 40),
  ('Soin anti-taches',   'Visage', 60, 50),
  ('Soin anti-acné',     'Visage', 60, 60),
  ('Peeling',            'Visage', 45, 70),
  ('Masque',             'Visage', 30, 80),
  ('Massage du visage',  'Visage', 30, 90)
on conflict (libelle) do nothing;
