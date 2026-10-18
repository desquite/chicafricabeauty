-- ============================================================================
-- Durees alignees sur la page Krenup
--
-- La gerante a tranche : Microdermabrasion 1h, Hydrafacial 1h30, comme sur
-- la page que les clientes connaissent. Cette duree decide desormais des
-- creneaux en ligne. Les seances passees gardent leur propre duree saisie.
-- ============================================================================

update soins_catalogue set duree_std = 60 where libelle = 'Soin microdermabrasion';
update soins_catalogue set duree_std = 90 where libelle = 'Soin hydrafacial';
