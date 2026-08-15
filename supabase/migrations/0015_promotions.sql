-- ============================================================================
-- Refus des promotions, distinct des autres consentements
--
-- Trois messages de nature differente partent desormais aux clientes, et une
-- cliente peut vouloir les uns sans les autres :
--   rappels_whatsapp      rendez-vous, categorie Utilite chez Meta
--   anniversaire_whatsapp voeux, courtoisie
--   promotions_whatsapp   offres commerciales
--
-- rappels_whatsapp garde son role de refus global : le libelle du formulaire
-- dit « si la cliente ne souhaite pas etre contactee ». A faux, plus rien ne
-- part, quelles que soient les deux autres colonnes.
-- ============================================================================

alter table clientes
  add column if not exists promotions_whatsapp boolean not null default true;
