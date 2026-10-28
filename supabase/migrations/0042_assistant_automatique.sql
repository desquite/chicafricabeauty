-- ============================================================================
-- 0042 : envoi automatique des reponses de l assistant
--
-- Un interrupteur, tenu par la gerante : coupe, l assistant ne fait que des
-- brouillons (comportement de 0036) ; allume, il envoie lui-meme les
-- reponses qu il juge sures et laisse a la gerante celles ou il passe la
-- main. Les messages partis seuls sont marques, pour le compte rendu.
-- ============================================================================

create table if not exists reglages_assistant (
  id           boolean primary key default true check (id),
  envoi_auto   boolean not null default false,
  modifie_le   timestamptz,
  modifie_par  uuid references profiles(id)
);

insert into reglages_assistant (id) values (true) on conflict (id) do nothing;

alter table reglages_assistant enable row level security;

drop policy if exists "personnel lit les reglages assistant" on reglages_assistant;
create policy "personnel lit les reglages assistant" on reglages_assistant
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.actif));

alter table messages add column if not exists par_assistant boolean not null default false;
