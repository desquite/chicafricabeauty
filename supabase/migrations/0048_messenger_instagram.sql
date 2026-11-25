-- ============================================================================
-- 0048 : Messenger et Instagram dans la boite de reception
--
-- Les messages prives de la page Facebook et du compte Instagram de
-- l institut arrivent par Meta et s affichent dans l ecran Messages, a cote
-- de WhatsApp. L assistant y repond avec les memes regles.
--
-- Une conversation Meta n a pas de numero : la colonne telephone, unique,
-- porte alors la cle « messenger:<id> » ou « instagram:<id> », l identifiant
-- de la personne pour la page. Les recherches par numero ne portent que sur
-- le canal whatsapp.
-- ============================================================================

alter table conversations add column if not exists canal text not null default 'whatsapp';
alter table conversations drop constraint if exists conversations_canal_check;
alter table conversations add constraint conversations_canal_check
  check (canal in ('whatsapp', 'messenger', 'instagram'));

-- Identifiant Meta du message : un message renvoye par Meta ne compte qu une fois.
alter table messages add column if not exists meta_id text;
create unique index if not exists messages_meta_id_idx on messages (meta_id) where meta_id is not null;
