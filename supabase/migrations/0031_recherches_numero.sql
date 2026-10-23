-- ============================================================================
-- 0031 : recherches de numero sur la page de reservation
--
-- La page /rdv reconnait une cliente a son numero et affiche son prenom.
-- Pour qu on ne puisse pas essayer des numeros en serie et decouvrir qui est
-- cliente, chaque recherche est notee sous une empreinte de l appareil (jamais
-- l adresse IP en clair) et limitee a quelques-unes par heure.
--
-- Aucune politique : seule la cle de service, cote serveur, y accede.
-- ============================================================================

create table if not exists recherches_numero (
  id        bigserial primary key,
  empreinte text not null,
  faite_le  timestamptz not null default now()
);

create index if not exists recherches_numero_empreinte
  on recherches_numero (empreinte, faite_le);

alter table recherches_numero enable row level security;
