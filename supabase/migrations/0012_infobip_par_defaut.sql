-- ============================================================================
-- Infobip devient le canal par defaut des clientes
--
-- La colonne valait faux le temps de la bascule, pour qu aucune cliente ne
-- parte sur un canal non eprouve. Les 96 fiches existantes ont ete basculees
-- le 6 aout 2026, apres validation de bout en bout : deux modeles envoyes et
-- recus sur WhatsApp, rendu conforme.
--
-- Sans ce changement de defaut, toute fiche creee ensuite repartirait sur
-- WasenderAPI sans que personne s en apercoive, et sa cliente recevrait ses
-- rappels d un autre numero que toutes les autres.
--
-- WasenderAPI reste le canal des gerantes, et l exception que l on coche a la
-- main pour une cliente qui poserait probleme.
-- ============================================================================

alter table clientes alter column rappels_infobip set default true;
