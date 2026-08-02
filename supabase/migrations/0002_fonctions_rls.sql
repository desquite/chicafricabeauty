-- ============================================================================
-- 2/3 -- Fonctions, declencheurs et politiques de securite
-- A executer apres 0001_tables.sql.
--
-- Donnees de sante : la RLS est posee des la mise en place. Aucune table
-- nest lisible sans session dun membre actif du personnel.
-- ============================================================================

-- Utilisee par toutes les policies : lappelant est-il un membre actif ?
create or replace function est_staff_actif()
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  select exists (select 1 from profiles where id = auth.uid() and actif);
$fn$;

-- Meme role que est_staff_actif pour les droits reserves a la gerante.
-- Indispensable en security definer : une policy sur profiles qui
-- interrogerait profiles directement provoquerait une recursion infinie
-- (42P17). Le security definer contourne la RLS, ce qui casse la boucle.
create or replace function est_gerante()
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'gerante' and actif
  );
$fn$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists clientes_touch on clientes;
create trigger clientes_touch before update on clientes
  for each row execute function touch_updated_at();

drop trigger if exists seances_touch on seances;
create trigger seances_touch before update on seances
  for each row execute function touch_updated_at();

alter table profiles         enable row level security;
alter table clientes         enable row level security;
alter table anamneses        enable row level security;
alter table consentements    enable row level security;
alter table soins_catalogue  enable row level security;
alter table seances          enable row level security;
alter table seance_soins     enable row level security;
alter table photos           enable row level security;

-- profiles : chacun lit lannuaire du personnel, seule la gerante modifie.
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (est_staff_actif());

drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_gerante_all on profiles;
create policy profiles_gerante_all on profiles
  for all to authenticated
  using (est_gerante()) with check (est_gerante());

-- Donnees metier : tout le personnel actif, en lecture comme en ecriture.
drop policy if exists clientes_staff on clientes;
create policy clientes_staff on clientes
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists anamneses_staff on anamneses;
create policy anamneses_staff on anamneses
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists soins_staff on soins_catalogue;
create policy soins_staff on soins_catalogue
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists seances_staff on seances;
create policy seances_staff on seances
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists seance_soins_staff on seance_soins;
create policy seance_soins_staff on seance_soins
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

drop policy if exists photos_staff on photos;
create policy photos_staff on photos
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

-- Consentements : inserables et lisibles, jamais modifiables ni supprimables.
drop policy if exists consentements_select on consentements;
create policy consentements_select on consentements
  for select to authenticated using (est_staff_actif());

drop policy if exists consentements_insert on consentements;
create policy consentements_insert on consentements
  for insert to authenticated with check (est_staff_actif());
