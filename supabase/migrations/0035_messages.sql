-- ============================================================================
-- 0035 : boite de reception WhatsApp
--
-- Les messages que les clientes envoient au numero de l institut arrivent
-- par Infobip (notification entrante) et s affichent dans l ecran Messages,
-- ou la gerante repond. Les envois automatiques de l application (liens,
-- rappels, recus) y figurent aussi, pour que la conversation se lise en
-- entier.
--
-- Une conversation par numero (chiffres internationaux), rattachee a la
-- fiche cliente quand le numero est connu.
-- ============================================================================

create table if not exists conversations (
  id                  uuid primary key default gen_random_uuid(),
  telephone           text not null unique,
  cliente_id          uuid references clientes(id) on delete set null,
  nom_contact         text,
  statut              text not null default 'a_traiter' check (statut in ('a_traiter', 'reglee')),
  non_lus             int not null default 0 check (non_lus >= 0),
  dernier_message_le  timestamptz,
  dernier_apercu      text,
  -- Dernier message de la cliente : ouvre la fenetre de 24 h de reponse libre.
  derniere_entree_le  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists conversations_recentes_idx on conversations (dernier_message_le desc);
create index if not exists conversations_cliente_idx on conversations (cliente_id);

drop trigger if exists conversations_touch on conversations;
create trigger conversations_touch before update on conversations
  for each row execute function touch_updated_at();

create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  sens             text not null check (sens in ('entrant', 'sortant', 'auto')),
  type             text not null default 'texte',
  texte            text,
  media_url        text,
  infobip_id       text unique,
  auteur           uuid references profiles(id),
  echec            text,
  cree_le          timestamptz not null default now()
);
create index if not exists messages_conversation_idx on messages (conversation_id, cree_le);

alter table conversations enable row level security;
alter table messages enable row level security;

-- Le personnel lit et traite ; les ecritures entrantes passent par le
-- serveur (cle de service).
drop policy if exists conversations_staff on conversations;
create policy conversations_staff on conversations
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());
drop policy if exists messages_staff on messages;
create policy messages_staff on messages
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());
