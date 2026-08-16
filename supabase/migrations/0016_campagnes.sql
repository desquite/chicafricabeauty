-- ============================================================================
-- Campagnes recurrentes
--
-- Une promotion se repete pendant sa duree de validite, puis s arrete d elle
-- meme. Sans date de fin, une campagne oubliee continue d envoyer une offre
-- expiree : c est la panne la plus probable de ce genre de mecanisme.
--
-- Le texte vit ici et non dans le code : le modele Meta porte l offre en
-- variable, donc changer le prix ou la date ne demande aucune approbation ni
-- aucun deploiement.
--
-- Pas de table d envois dediee : notifications_envoyees suffit, sa cle
-- (type, cle_jour, destinataire) empeche deja de servir deux fois la meme
-- cliente le meme jour.
-- ============================================================================

create table if not exists campagnes (
  id            uuid primary key default gen_random_uuid(),
  libelle       text not null,
  -- Le contenu de la variable {{2}} du modele promotion. Une seule ligne :
  -- une variable WhatsApp n accepte pas de retour a la ligne.
  texte         text not null,
  -- venues : clientes ayant au moins une seance. toutes : tout le fichier.
  cible         text not null default 'venues' check (cible in ('venues', 'toutes')),
  -- 0 = dimanche, conforme a extract(dow).
  jour_semaine  int not null check (jour_semaine between 0 and 6),
  debut         date not null,
  fin           date not null,
  actif         boolean not null default true,
  cree_par      uuid references profiles(id),
  created_at    timestamptz not null default now(),
  check (fin >= debut)
);

create index if not exists campagnes_actives_idx
  on campagnes (debut, fin) where actif;

alter table campagnes enable row level security;

drop policy if exists campagnes_staff on campagnes;
create policy campagnes_staff on campagnes
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());
