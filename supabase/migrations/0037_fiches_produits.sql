-- ============================================================================
-- 0037 : fiches produits
--
-- Preparation de la boutique en ligne : chaque produit recoit une accroche
-- (une ligne, sous le nom dans la liste), une description (texte libre,
-- paragraphes et listes a tirets) et une photo (chemin dans le stockage).
-- ============================================================================

alter table produits add column if not exists accroche    text;
alter table produits add column if not exists description text;
alter table produits add column if not exists photo       text;
