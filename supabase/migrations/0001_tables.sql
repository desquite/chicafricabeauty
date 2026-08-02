-- ============================================================================
-- 1/3 -- Tables, vue et index
--
-- Commentaires volontairement en ASCII sans apostrophe : une apostrophe dans
-- un commentaire suffit a faire croire a certains editeurs SQL quune chaine
-- souvre, et tout ce qui suit cesse detre execute. Les explications en
-- francais sont dans le README.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Personnel de linstitut. pin_hash sert a identifier qui saisit sur la
-- tablette partagee ; ce nest pas une frontiere de securite.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nom         text not null,
  role        text not null default 'estheticienne'
              check (role in ('gerante', 'estheticienne')),
  pin_hash    text,
  actif       boolean not null default true,
  created_at  timestamptz not null default now()
);

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

-- Bilan sante et habitudes. Une nouvelle ligne a chaque mise a jour :
-- lhistorique est conserve, la ligne la plus recente fait foi.
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

-- Derniere anamnese connue de chaque cliente, pour la fiche.
create view anamneses_courantes as
select distinct on (cliente_id) *
from anamneses
order by cliente_id, date_maj desc;

-- Consentement date et jamais ecrase : un retrait cree une nouvelle ligne.
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

-- Catalogue de soins en table et non en dur : la gerante le modifie seule.
create table soins_catalogue (
  id         uuid primary key default gen_random_uuid(),
  libelle    text not null unique,
  categorie  text,
  duree_std  int,
  prix       numeric(10,2),
  actif      boolean not null default true,
  ordre      int not null default 0
);

-- Une ligne par venue de la cliente.
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

create table photos (
  id           uuid primary key default gen_random_uuid(),
  seance_id    uuid not null references seances(id) on delete cascade,
  moment       text not null check (moment in ('avant', 'apres')),
  storage_path text not null,
  prise_le     timestamptz not null default now(),
  prise_par    uuid references profiles(id)
);

create index photos_seance_idx on photos (seance_id, moment);
