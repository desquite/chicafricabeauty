-- ============================================================================
-- Lien entre un rendez-vous annule ou manque et celui qui le remplace
--
-- Un rendez-vous reprogramme restait affiche sur sa journee, a cote du
-- nouveau, et encombrait lagenda. Le supprimer aurait efface la trace de
-- lannulation, donc fausse le taux dabsence : une absente reprogrammee
-- naurait plus jamais compte comme absente.
--
-- On le masque donc au lieu de le supprimer. La colonne dit par quel
-- rendez-vous il a ete remplace ; lagenda ecarte les lignes renseignees, les
-- statistiques continuent de les compter.
-- ============================================================================

alter table rendez_vous
  add column if not exists remplace_par uuid references rendez_vous(id) on delete set null;

create index if not exists rendez_vous_remplace_idx
  on rendez_vous (remplace_par) where remplace_par is not null;
