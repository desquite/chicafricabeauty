-- ============================================================================
-- 1/3 — Tables, vue et déclencheurs
-- À exécuter en premier dans l'éditeur SQL Supabase.
--
-- Pas de type ENUM ni de bloc DO : uniquement du DDL simple, pour rester
-- lisible par n'importe quel client SQL. Les valeurs fermées sont tenues par
-- des contraintes CHECK, qui ont l'avantage d'évoluer par un simple ALTER
-- quand l'institut ajoute une catégorie.
-- ============================================================================

-- --------------------------------------------------------------- remise à plat
-- Ces objets viennent de la migration partielle du 2 août 2026, qu'aucune
-- application n'a jamais alimentée. On repart proprement.
drop view if exists anamneses_courantes;
drop table if exists photos cascade;
drop table if exists seance_soins cascade;
drop table if exists seances cascade;
drop table if exists consentements cascade;
drop table if exists anamneses cascade;
drop table if exists clientes cascade;
drop table if exists soins_catalogue cascade;
drop table if exists profiles cascade;

drop type if exists role_staff;
drop type if exists type_venue;
drop type if exists type_peau;
drop type if exists etat_peau;
drop type if exists type_consentement;
drop type if exists nature_consentement;
drop type if exists moment_photo;
drop type if exists evolution_peau;

create extension if not exists "pgcrypto";

-- ------------------------------------------------------- personnel (staff)
-- pin_hash sert à savoir QUI saisit sur la tablette partagée ; ce n'est pas
-- une frontière de sécurité (la vraie frontière est la session Supabase).
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nom         text not null,
  role        text not null default 'estheticienne'
              check (role in ('gerante', 'estheticienne')),
  pin_hash    text,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- clientes
create table clientes (
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

create index clientes_recherche_idx on clientes
  using gin (to_tsvector('simple', nom || ' ' || prenoms || ' ' || telephone));

-- --------------------------------------------------------------- anamnèses
-- Bilan santé + habitudes. Une nouvelle ligne à chaque mise à jour :
-- l'historique est conservé, la ligne la plus récente fait foi.
create table anamneses (
  id                      uuid primary key default gen_random_uuid(),
  cliente_id              uuid not null references clientes(id) on delete cascade,
  date_maj                timestamptz not null default now(),
  saisie_par              uuid references profiles(id),

  allergies               text,
  traitement_en_cours     boolean,
  traitement_detail       text,
  grossesse_allaitement   boolean,
  port_lentilles          boolean,
  implants_pacemaker      boolean,
  injections_recentes     boolean,
  injections_detail       text,

  fumeur                  boolean,
  exposition_uv           text check (exposition_uv in ('jamais', 'moderee', 'frequente')),
  hydratation             text check (hydratation in ('moins_1l', 'plus_1_5l')),
  routine_actuelle        text,
  priorites               text[]
);

create index anamneses_cliente_idx on anamneses (cliente_id, date_maj desc);

-- Dernière anamnèse connue de chaque cliente, pour l'écran fiche.
create view anamneses_courantes as
select distinct on (cliente_id) *
from anamneses
order by cliente_id, date_maj desc;

-- ----------------------------------------------------------- consentements
-- Daté et jamais écrasé : un retrait de consentement = une nouvelle ligne.
create table consentements (
  id             uuid primary key default gen_random_uuid(),
  cliente_id     uuid not null references clientes(id) on delete cascade,
  nature         text not null check (nature in ('soin', 'photo')),
  accepte        boolean not null,
  texte_version  text not null,
  signature_path text,
  signe_le       timestamptz not null default now(),
  recueilli_par  uuid references profiles(id)
);

create index consentements_cliente_idx
  on consentements (cliente_id, nature, signe_le desc);

-- --------------------------------------------------------- catalogue soins
-- Table et non liste en dur : la gérante ajoute ses soins elle-même.
create table soins_catalogue (
  id         uuid primary key default gen_random_uuid(),
  libelle    text not null unique,
  categorie  text,
  duree_std  int,
  prix       numeric(10,2),
  actif      boolean not null default true,
  ordre      int not null default 0
);

-- ----------------------------------------------------------------- séances
create table seances (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references clientes(id) on delete restrict,
  praticienne_id       uuid references profiles(id),
  date_seance          date not null default current_date,
  type_venue           text not null default 'suivi'
                       check (type_venue in ('premiere_seance', 'suivi')),

  type_peau            text check (type_peau in ('normale', 'seche', 'grasse', 'mixte')),
  etat_peau            text check (etat_peau in ('deshydratee', 'sensible', 'mature', 'asphyxiee')),
  observations_peau    text[],

  zones                text[],
  produits_utilises    text,
  appareil             text,
  duree_min            int,

  reactions            text[],
  evolution            text check (evolution in ('premiere_seance', 'nette_amelioration',
                                                 'legere_amelioration', 'stable', 'degradation')),
  observations         text,
  incident             text,

  programme            text,
  conseils             text,
  produits_conseilles  text,
  delai_recommande     text,
  prochain_rdv         date,

  cloturee             boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index seances_cliente_idx on seances (cliente_id, date_seance desc);
create index seances_date_idx on seances (date_seance desc);
create index seances_rdv_idx on seances (prochain_rdv) where prochain_rdv is not null;

create table seance_soins (
  seance_id uuid not null references seances(id) on delete cascade,
  soin_id   uuid not null references soins_catalogue(id) on delete restrict,
  primary key (seance_id, soin_id)
);

-- ------------------------------------------------------------------ photos
create table photos (
  id           uuid primary key default gen_random_uuid(),
  seance_id    uuid not null references seances(id) on delete cascade,
  moment       text not null check (moment in ('avant', 'apres')),
  storage_path text not null,
  prise_le     timestamptz not null default now(),
  prise_par    uuid references profiles(id)
);

create index photos_seance_idx on photos (seance_id, moment);
