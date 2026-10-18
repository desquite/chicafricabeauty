-- ============================================================================
-- Disponibilites et prestations en ligne
--
-- Socle de la prise de rendez-vous en ligne : ce que la gerante regle pour
-- que les creneaux proposes aux clientes suivent la realite de linstitut.
--
--   horaires_semaine  heures douverture de chaque jour, lundi ferme
--   fermetures        jours feries, conges, demi-journees, creneaux bloques
--   reglages_rdv      une seule ligne : horizon de reservation, acompte
--
-- Les prestations restent dans soins_catalogue : seances et rendez-vous y
-- sont rattaches. Elles gagnent un nom affiche en ligne, un drapeau de
-- publication et une promotion datee, qui sarrete seule a sa date de fin.
-- ============================================================================

-- 0 = dimanche, conforme a extract(dow), comme campagnes.jour_semaine.
create table if not exists horaires_semaine (
  jour        int primary key check (jour between 0 and 6),
  ouvert      boolean not null default false,
  ouverture   time,
  fermeture   time,
  check (not ouvert or (ouverture is not null and fermeture is not null and fermeture > ouverture))
);

insert into horaires_semaine (jour, ouvert, ouverture, fermeture) values
  (0, true,  '09:00', '18:00'),
  (1, false, null,    null),
  (2, true,  '07:30', '17:30'),
  (3, true,  '07:30', '17:30'),
  (4, true,  '07:30', '17:30'),
  (5, true,  '07:30', '17:30'),
  (6, true,  '07:30', '18:00')
on conflict (jour) do nothing;

-- Sans heures : la journee entiere, sur chaque jour de la periode.
-- Avec heures : seulement cette plage, sur chaque jour de la periode.
create table if not exists fermetures (
  id           uuid primary key default gen_random_uuid(),
  date_debut   date not null,
  date_fin     date not null,
  heure_debut  time,
  heure_fin    time,
  motif        text,
  cree_par     uuid references profiles(id),
  created_at   timestamptz not null default now(),
  check (date_fin >= date_debut),
  check ((heure_debut is null and heure_fin is null)
      or (heure_debut is not null and heure_fin is not null and heure_fin > heure_debut))
);

create index if not exists fermetures_periode_idx on fermetures (date_fin, date_debut);

create table if not exists reglages_rdv (
  id               boolean primary key default true check (id),
  horizon_jours    int not null default 60 check (horizon_jours between 1 and 365),
  acompte_montant  int not null default 10000 check (acompte_montant >= 0)
);

insert into reglages_rdv (id) values (true) on conflict (id) do nothing;

alter table soins_catalogue add column if not exists libelle_public text;
alter table soins_catalogue add column if not exists en_ligne boolean not null default false;
alter table soins_catalogue add column if not exists prix_promo numeric(10,2);
alter table soins_catalogue add column if not exists promo_debut date;
alter table soins_catalogue add column if not exists promo_fin date;

alter table soins_catalogue drop constraint if exists soins_promo_complete;
alter table soins_catalogue add constraint soins_promo_complete check (
  (prix_promo is null and promo_debut is null and promo_fin is null)
  or (prix_promo is not null and prix_promo >= 0
      and promo_debut is not null and promo_fin is not null and promo_fin >= promo_debut)
);

-- Une prestation proposee en ligne doit dire combien de temps elle bloque
-- lagenda : sans duree, aucun creneau ne peut etre calcule.
alter table soins_catalogue drop constraint if exists soins_en_ligne_duree;
alter table soins_catalogue add constraint soins_en_ligne_duree check (
  not en_ligne or (duree_std is not null and duree_std > 0 and prix is not null)
);

alter table horaires_semaine enable row level security;
alter table fermetures enable row level security;
alter table reglages_rdv enable row level security;

drop policy if exists horaires_staff on horaires_semaine;
create policy horaires_staff on horaires_semaine
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists fermetures_staff on fermetures;
create policy fermetures_staff on fermetures
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists reglages_rdv_staff on reglages_rdv;
create policy reglages_rdv_staff on reglages_rdv
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());
