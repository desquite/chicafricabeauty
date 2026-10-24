-- ============================================================================
-- 0036 : brouillon de l assistant IA
--
-- Apres chaque message d une cliente, l assistant propose une reponse que la
-- gerante envoie, modifie ou ignore : rien ne part sans elle. La proposition
-- vit sur la conversation, avec le message auquel elle repond (une nouvelle
-- entree la rend caduque).
-- ============================================================================

alter table conversations add column if not exists brouillon text;
alter table conversations add column if not exists brouillon_main boolean not null default false;
alter table conversations add column if not exists brouillon_raison text;
alter table conversations add column if not exists brouillon_pour uuid references messages(id) on delete set null;
alter table conversations add column if not exists brouillon_le timestamptz;
