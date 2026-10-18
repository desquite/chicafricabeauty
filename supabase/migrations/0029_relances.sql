-- ============================================================================
-- Relances : qui a deja ete contactee
--
-- Lecran A relancer liste les clientes dont le delai conseille est depasse.
-- Une fois contactee, une cliente en sort pour deux semaines, et le
-- recapitulatif du matin ne la propose plus non plus : on ne relance pas
-- deux fois la meme personne en quelques jours.
-- ============================================================================

alter table clientes add column if not exists relancee_le timestamptz;
alter table clientes add column if not exists relancee_par uuid references profiles(id);
