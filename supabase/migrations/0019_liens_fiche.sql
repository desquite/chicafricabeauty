-- ============================================================================
-- Liens de fiche a distance
--
-- La cliente remplit sa fiche depuis son propre telephone, avant de venir.
-- Elle na pas de compte : le lien lui-meme porte le droit decrire, une seule
-- fois, pour une seule fiche, pendant une duree limitee.
--
-- Seule lempreinte SHA-256 du jeton est conservee. Une fuite de cette table
-- ne permet donc de rouvrir aucun lien.
--
-- Aucune policy nouvre la table au role anon : la page publique passe par le
-- serveur, qui verifie le jeton avec la cle de service avant toute ecriture.
-- ============================================================================

create table if not exists liens_fiche (
  id          uuid primary key default gen_random_uuid(),
  jeton_hash  text not null unique,
  cree_par    uuid references profiles(id),
  cree_le     timestamptz not null default now(),
  expire_le   timestamptz not null,
  -- Renseignes a la soumission : le lien ne sert plus.
  utilise_le  timestamptz,
  cliente_id  uuid references clientes(id) on delete set null,
  -- Retrait manuel par le personnel, avant usage.
  revoque_le  timestamptz,
  check (expire_le > cree_le)
);

create index if not exists liens_fiche_actifs_idx
  on liens_fiche (expire_le) where utilise_le is null and revoque_le is null;

alter table liens_fiche enable row level security;

drop policy if exists liens_fiche_staff on liens_fiche;
create policy liens_fiche_staff on liens_fiche
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());
