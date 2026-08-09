-- ============================================================================
-- Bascule progressive des rappels clientes vers Infobip
--
-- WasenderAPI est un pont non officiel vers WhatsApp Web : la session peut
-- etre coupee sans preavis, et le compte impose un message toutes les cinq
-- secondes. Infobip est l API officielle, avec des modeles approuves par Meta.
--
-- La bascule se fait cliente par cliente et non d un coup : le premier essai
-- doit pouvoir se faire sur un ou deux numeros connus, sans risquer d envoyer
-- a tout le fichier un message mal forme. La colonne vaut faux par defaut,
-- donc rien ne change tant qu elle n est pas mise a vrai.
--
-- Les gerantes restent sur WasenderAPI : leur recapitulatif est une liste de
-- longueur variable, qu aucun modele WhatsApp ne sait porter.
-- ============================================================================

alter table clientes
  add column if not exists rappels_infobip boolean not null default false;

-- Quel canal a reellement porte l envoi. Indispensable pendant la periode ou
-- les deux coexistent : sans cela, un rappel manquant ne se diagnostique pas.
alter table notifications_envoyees
  add column if not exists canal text;
