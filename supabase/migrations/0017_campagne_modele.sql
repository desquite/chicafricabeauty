-- ============================================================================
-- Le modele Meta employe par une campagne
--
-- Un modele approuve ne se modifie pas : changer une phrase impose d en creer
-- un autre et de le faire approuver. Figer son nom dans le code obligerait a
-- deployer a chaque changement de formulation.
--
-- La colonne permet de basculer une campagne d un modele a l autre par une
-- simple mise a jour, le jour ou le nouveau est approuve.
-- ============================================================================

alter table campagnes
  add column if not exists modele text not null default 'promotion';
