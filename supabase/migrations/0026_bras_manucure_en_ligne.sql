-- ============================================================================
-- Demi-bras, bras entiers et manucure en ligne
--
-- Durees donnees par la gerante : 30 minutes chacun. Ils rejoignent la page
-- de reservation, a leur place dans le menu.
-- ============================================================================

update soins_catalogue
set duree_std = 30, en_ligne = true
where libelle in ('Épilation demi-bras', 'Épilation bras entiers', 'Manucure');
