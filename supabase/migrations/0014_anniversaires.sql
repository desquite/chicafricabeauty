-- ============================================================================
-- Voeux d anniversaire, et prenom d usage
--
-- Les 106 fiches ont toutes une date de naissance : la fonctionnalite couvre
-- le fichier entier des le premier jour.
--
-- prenom_usuel existe parce que nom et prenoms sont un seul champ, decision
-- prise au depart et maintenue. Un message d anniversaire qui commence par
-- « Bonjour Konan Amoin ANge Marie » perd tout ce qu il avait de chaleureux.
-- Le champ est facultatif et ne sert qu aux messages chaleureux ; vide, on
-- retombe sur le nom complet. Il ne remplace jamais nom_complet, qui reste
-- l identite de la fiche.
--
-- anniversaire_whatsapp est distinct de rappels_whatsapp : une cliente doit
-- pouvoir refuser les voeux sans perdre ses rappels de rendez-vous. Les voeux
-- relevent de la categorie Marketing chez Meta, les rappels de la categorie
-- Utilite.
-- ============================================================================

alter table clientes add column if not exists prenom_usuel text;

alter table clientes
  add column if not exists anniversaire_whatsapp boolean not null default true;

-- Pas d index sur le jour anniversaire : la recherche se fait cote code, sur
-- la centaine de fiches lues en une requete. Un index sur to_char serait
-- refuse de toute facon, la fonction n etant pas IMMUTABLE.
