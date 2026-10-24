-- ============================================================================
-- 0034 : recu envoye par WhatsApp
--
-- A l encaissement, la cliente recoit l image de son recu (modele
-- recu_facture, en-tete image). Meta telecharge l image a une adresse
-- publique : chaque facture recoit un jeton aleatoire de 24 caracteres,
-- impossible a deviner, qui ne donne acces qu a cette image.
-- ============================================================================

alter table factures add column if not exists jeton_public text
  default substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 24);
update factures
set jeton_public = substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, 24)
where jeton_public is null;
alter table factures alter column jeton_public set not null;
create unique index if not exists factures_jeton_idx on factures (jeton_public);
