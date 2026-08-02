-- ============================================================================
-- Corrige la recursion infinie sur profiles (42P17)
--
-- La policy profiles_gerante_all interrogeait profiles dans sa propre clause
-- using. Evaluer la policy declenchait une lecture de profiles, qui
-- reevaluait la policy : Postgres refusait toute lecture de la table, donc
-- toute connexion aboutissait a "compte non habilite".
--
-- La fonction est_gerante est en security definer : elle sexecute avec les
-- droits de son proprietaire, hors RLS, ce qui casse la boucle. Cest le
-- meme procede que est_staff_actif, qui lui etait deja correct.
-- ============================================================================

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

drop policy if exists profiles_gerante_all on profiles;
create policy profiles_gerante_all on profiles
  for all to authenticated
  using (est_gerante()) with check (est_gerante());
