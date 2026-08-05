-- ============================================================================
-- Rappels WhatsApp aux clientes
--
-- Jusquici les envois nallaient quaux gerantes. Une cliente doit pouvoir
-- refuser detre contactee : la colonne vaut vrai par defaut, le formulaire
-- de modification permet de la mettre a faux.
-- ============================================================================

alter table clientes
  add column if not exists rappels_whatsapp boolean not null default true;
