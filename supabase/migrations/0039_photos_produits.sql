-- ============================================================================
-- 0039 : photos des produits
--
-- Bucket public « produits » : la boutique en ligne affiche les photos sans
-- connexion. Seul le serveur (cle de service) y ecrit. produits.photo garde
-- le chemin de la photo principale, produits.galerie les suivantes.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('produits', 'produits', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update set public = true;

alter table produits add column if not exists galerie text[] not null default '{}';
