-- ============================================================================
-- 3/3 — Buckets de stockage et catalogue de départ
-- À exécuter après 0002_fonctions_rls.sql.
-- ============================================================================

-- Buckets privés. Accès uniquement par URL signée générée côté serveur.
insert into storage.buckets (id, name, public)
values ('photos-soins', 'photos-soins', false),
       ('signatures',   'signatures',   false)
on conflict (id) do nothing;

-- Si cette instruction échoue avec « must be owner of table objects »,
-- ce n'est pas bloquant : créer la même règle depuis Storage > Policies,
-- sur les deux buckets, pour le rôle authenticated.
create policy storage_soins_staff on storage.objects
  for all to authenticated
  using (bucket_id in ('photos-soins', 'signatures') and est_staff_actif())
  with check (bucket_id in ('photos-soins', 'signatures') and est_staff_actif());

-- Catalogue de départ, à remplacer par le menu réel de l'institut.
insert into soins_catalogue (libelle, categorie, duree_std, ordre) values
  ('Nettoyage de peau',  'Visage', 60, 10),
  ('Soin hydratant',     'Visage', 60, 20),
  ('Soin éclat',         'Visage', 60, 30),
  ('Soin anti-âge',      'Visage', 75, 40),
  ('Soin anti-taches',   'Visage', 60, 50),
  ('Soin anti-acné',     'Visage', 60, 60),
  ('Peeling',            'Visage', 45, 70),
  ('Masque',             'Visage', 30, 80),
  ('Massage du visage',  'Visage', 30, 90)
on conflict (libelle) do nothing;
