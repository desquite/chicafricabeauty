-- ============================================================================
-- Bascule du recapitulatif des gerantes vers Infobip
--
-- Meme mecanique que pour les clientes, et pour la meme raison : la bascule
-- doit pouvoir se faire sur une gerante avant les deux, et se defaire d un
-- geste si le modele rend mal.
--
-- La colonne vaut faux par defaut : tant que le modele recapitulatif_gerante
-- n est pas approuve par Meta, le recapitulatif continue de partir en texte
-- libre par WasenderAPI, avec ses puces et ses lignes separees.
-- ============================================================================

alter table profiles
  add column if not exists notifications_infobip boolean not null default false;
