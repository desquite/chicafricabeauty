-- ============================================================================
-- Nom et prenoms fusionnes en un seul champ
--
-- La separation netait pas comprise de la meme facon dune saisie a lautre :
-- sur les cinq fiches dessai, deux avaient le nom de famille dans prenoms.
-- Le formulaire Google dorigine navait dailleurs quun seul champ.
--
-- Contrepartie assumee : le tri se fait desormais sur la chaine entiere,
-- donc sur le premier mot saisi et non sur le nom de famille.
-- ============================================================================

alter table clientes add column if not exists nom_complet text;

-- Reprise des lignes existantes avant de rendre la colonne obligatoire.
update clientes
set nom_complet = nullif(trim(concat_ws(' ', prenoms, nom)), '')
where nom_complet is null;

-- Filet pour une ligne qui aurait eu les deux champs vides.
update clientes set nom_complet = 'Sans nom' where nom_complet is null;

alter table clientes alter column nom_complet set not null;

-- L index de recherche referencait les deux anciennes colonnes.
drop index if exists clientes_recherche_idx;

alter table clientes drop column if exists prenoms;
alter table clientes drop column if exists nom;

create index if not exists clientes_recherche_idx on clientes
  using gin (to_tsvector('simple', nom_complet || ' ' || telephone));
