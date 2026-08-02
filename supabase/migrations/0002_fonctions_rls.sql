-- ============================================================================
-- 2/3 — Fonctions, déclencheurs et politiques de sécurité
-- À exécuter après 0001_tables.sql.
--
-- Données de santé : la RLS est posée dès la mise en place, pas « plus tard ».
-- Aucune table n'est lisible sans session d'un membre actif du personnel.
-- ============================================================================

-- Utilisée par toutes les policies : l'appelant est-il un membre actif ?
create or replace function est_staff_actif()
returns boolean
language sql
security definer
set search_path = public
stable
as $fn$
  select exists (select 1 from profiles where id = auth.uid() and actif);
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

-- ---------------------------------------------------------------------- RLS
alter table profiles         enable row level security;
alter table clientes         enable row level security;
alter table anamneses        enable row level security;
alter table consentements    enable row level security;
alter table soins_catalogue  enable row level security;
alter table seances          enable row level security;
alter table seance_soins     enable row level security;
alter table photos           enable row level security;

-- profiles : chacun lit l'annuaire du personnel, seule la gérante modifie.
create policy profiles_select on profiles
  for select to authenticated using (est_staff_actif());

create policy profiles_self_update on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy profiles_gerante_all on profiles
  for all to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gerante' and p.actif))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'gerante' and p.actif));

-- Données métier : tout le personnel actif, en lecture comme en écriture.
create policy clientes_staff on clientes
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

create policy anamneses_staff on anamneses
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

create policy soins_staff on soins_catalogue
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

create policy seances_staff on seances
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

create policy seance_soins_staff on seance_soins
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

create policy photos_staff on photos
  for all to authenticated using (est_staff_actif()) with check (est_staff_actif());

-- Consentements : insérables et lisibles, jamais modifiables ni supprimables.
create policy consentements_select on consentements
  for select to authenticated using (est_staff_actif());

create policy consentements_insert on consentements
  for insert to authenticated with check (est_staff_actif());
