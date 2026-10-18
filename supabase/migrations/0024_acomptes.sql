-- ============================================================================
-- Acomptes en ligne, par AfribaPay
--
-- Lacompte est facultatif : le rendez-vous est enregistre dabord, le
-- paiement vient ensuite. Un paiement echoue ne fait donc jamais perdre son
-- creneau a la cliente.
--
-- Une ligne par tentative. Le statut ne devient definitif que par la
-- notification signee dAfribaPay, ou par lAPI de statut en secours : jamais
-- sur la seule parole du navigateur.
-- ============================================================================

create table if not exists paiements_acompte (
  id              uuid primary key default gen_random_uuid(),
  rendez_vous_id  uuid not null references rendez_vous(id) on delete restrict,
  -- Identifiant transmis a AfribaPay, qui le renvoie dans sa notification.
  order_id        text not null unique,
  transaction_id  text,
  operateur       text not null check (operateur in ('orange', 'mtn', 'moov', 'wave')),
  telephone       text not null,
  montant         int not null check (montant > 0),
  statut          text not null default 'en_attente'
                  check (statut in ('en_attente', 'reussi', 'echoue')),
  -- Wave : la cliente paie sur ce lien.
  lien_paiement   text,
  detail          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists paiements_acompte_rdv_idx on paiements_acompte (rendez_vous_id);

drop trigger if exists paiements_acompte_touch on paiements_acompte;
create trigger paiements_acompte_touch before update on paiements_acompte
  for each row execute function touch_updated_at();

-- Le resultat utile au quotidien, lu directement par lagenda.
alter table rendez_vous add column if not exists acompte_montant int;
alter table rendez_vous add column if not exists acompte_paye_le timestamptz;

alter table paiements_acompte enable row level security;

-- Le personnel consulte, seul le serveur ecrit (cle de service).
drop policy if exists paiements_acompte_lecture on paiements_acompte;
create policy paiements_acompte_lecture on paiements_acompte
  for select to authenticated using (est_staff_actif());
