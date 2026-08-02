-- ============================================================================
-- 3/3 -- Buckets de stockage et catalogue de depart
-- A executer apres 0002_fonctions_rls.sql.
-- ============================================================================

-- Buckets prives. Acces uniquement par URL signee generee cote serveur.
insert into storage.buckets (id, name, public)
values ('photos-soins', 'photos-soins', false),
       ('signatures',   'signatures',   false)
on conflict (id) do nothing;

-- Si cette instruction echoue avec "must be owner of table objects", ce
-- nest pas bloquant : creer la meme regle depuis Storage > Policies, sur
-- les deux buckets, pour le role authenticated.
drop policy if exists storage_soins_staff on storage.objects;
create policy storage_soins_staff on storage.objects
  for all to authenticated
  using (bucket_id in ('photos-soins', 'signatures') and est_staff_actif())
  with check (bucket_id in ('photos-soins', 'signatures') and est_staff_actif());

-- Catalogue de depart, a remplacer par le menu reel de linstitut.
insert into soins_catalogue (libelle, categorie, duree_std, ordre) values
  ('Nettoyage de peau',  'Visage', 60, 10),
  ('Soin hydratant',     'Visage', 60, 20),
  ('Soin eclat',         'Visage', 60, 30),
  ('Soin anti-age',      'Visage', 75, 40),
  ('Soin anti-taches',   'Visage', 60, 50),
  ('Soin anti-acne',     'Visage', 60, 60),
  ('Peeling',            'Visage', 45, 70),
  ('Masque',             'Visage', 30, 80),
  ('Massage du visage',  'Visage', 30, 90)
on conflict (libelle) do nothing;
