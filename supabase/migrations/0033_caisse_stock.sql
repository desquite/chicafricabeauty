-- ============================================================================
-- 0033 : caisse et stock
--
-- Un rendez-vous honore descend en « a facturer ». La gerante saisit le
-- montant final des soins (forfait), ajoute les produits vendus, encaisse :
-- la facture recoit son numero, le stock des produits baisse, le recu
-- s imprime (ticket 80 mm ou A5). Pas de TVA.
--
-- Une facture encaissee ne se modifie plus : seule l annulation, qui remet
-- les produits en stock, la fait sortir du chiffre d affaires.
-- ============================================================================

-- Les rendez-vous honores avant la mise en service ne remontent pas.
alter table reglages_rdv add column if not exists caisse_depuis date not null default current_date;

/* ------------------------------------------------------------- Produits */

create table if not exists produits (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null,
  categorie   text,
  prix_vente  int not null default 0 check (prix_vente >= 0),
  prix_achat  int check (prix_achat >= 0),
  stock       int not null default 0,
  seuil       int not null default 0 check (seuil >= 0),
  actif       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists produits_touch on produits;
create trigger produits_touch before update on produits
  for each row execute function touch_updated_at();

alter table produits enable row level security;
drop policy if exists produits_lecture on produits;
create policy produits_lecture on produits for select to authenticated using (est_staff_actif());
drop policy if exists produits_gerante on produits;
create policy produits_gerante on produits for all to authenticated
  using (est_gerante()) with check (est_gerante());

/* ------------------------------------------------------------- Factures */

create sequence if not exists factures_numero_seq;

create table if not exists factures (
  id                    uuid primary key default gen_random_uuid(),
  numero                int unique,
  numero_affiche        text unique,
  cliente_id            uuid references clientes(id) on delete restrict,
  rendez_vous_id        uuid references rendez_vous(id) on delete restrict,
  statut                text not null default 'brouillon'
                        check (statut in ('brouillon', 'payee', 'annulee')),
  -- Prix des soins au catalogue, puis montant final saisi par la gerante.
  montant_soins_normal  int not null default 0 check (montant_soins_normal >= 0),
  montant_soins         int not null default 0 check (montant_soins >= 0),
  montant_produits      int not null default 0 check (montant_produits >= 0),
  remise_fidelite       int not null default 0 check (remise_fidelite >= 0),
  remise_sur            text check (remise_sur in ('soin', 'produit')),
  acompte_deduit        int not null default 0 check (acompte_deduit >= 0),
  total                 int not null default 0 check (total >= 0),
  mode_paiement         text check (mode_paiement in ('especes', 'wave', 'orange', 'mtn', 'moov', 'carte')),
  payee_le              timestamptz,
  annulee_le            timestamptz,
  notes                 text,
  cree_par              uuid references profiles(id),
  encaissee_par         uuid references profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Une seule facture vivante par rendez-vous.
create unique index if not exists factures_rdv_unique
  on factures (rendez_vous_id) where rendez_vous_id is not null and statut <> 'annulee';
create index if not exists factures_payee_idx on factures (statut, payee_le);

drop trigger if exists factures_touch on factures;
create trigger factures_touch before update on factures
  for each row execute function touch_updated_at();

create table if not exists lignes_facture (
  id             uuid primary key default gen_random_uuid(),
  facture_id     uuid not null references factures(id) on delete cascade,
  type           text not null check (type in ('soin', 'produit')),
  soin_id        uuid references soins_catalogue(id),
  produit_id     uuid references produits(id),
  libelle        text not null,
  quantite       int not null default 1 check (quantite > 0),
  prix_unitaire  int not null default 0 check (prix_unitaire >= 0),
  ordre          int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists lignes_facture_idx on lignes_facture (facture_id, ordre);

alter table factures enable row level security;
alter table lignes_facture enable row level security;

-- Lecture pour le personnel ; ecriture par la gerante, et seulement tant que
-- la facture est un brouillon. L encaissement et l annulation passent par
-- les fonctions ci-dessous.
drop policy if exists factures_lecture on factures;
create policy factures_lecture on factures for select to authenticated using (est_staff_actif());
drop policy if exists factures_creation on factures;
create policy factures_creation on factures for insert to authenticated
  with check (est_gerante() and statut = 'brouillon');
drop policy if exists factures_brouillon on factures;
create policy factures_brouillon on factures for update to authenticated
  using (est_gerante() and statut = 'brouillon') with check (est_gerante() and statut = 'brouillon');
drop policy if exists factures_suppression on factures;
create policy factures_suppression on factures for delete to authenticated
  using (est_gerante() and statut = 'brouillon');

drop policy if exists lignes_lecture on lignes_facture;
create policy lignes_lecture on lignes_facture for select to authenticated using (est_staff_actif());
drop policy if exists lignes_brouillon on lignes_facture;
create policy lignes_brouillon on lignes_facture for all to authenticated
  using (est_gerante() and exists (select 1 from factures f where f.id = facture_id and f.statut = 'brouillon'))
  with check (est_gerante() and exists (select 1 from factures f where f.id = facture_id and f.statut = 'brouillon'));

/* ------------------------------------------------------ Mouvements stock */

create table if not exists mouvements_stock (
  id          uuid primary key default gen_random_uuid(),
  produit_id  uuid not null references produits(id) on delete restrict,
  quantite    int not null,
  type        text not null check (type in ('vente', 'reception', 'cabine', 'inventaire', 'annulation')),
  facture_id  uuid references factures(id),
  note        text,
  cree_par    uuid references profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists mouvements_stock_idx on mouvements_stock (produit_id, created_at desc);

alter table mouvements_stock enable row level security;
drop policy if exists mouvements_lecture on mouvements_stock;
create policy mouvements_lecture on mouvements_stock for select to authenticated using (est_staff_actif());

-- Reception, usage en cabine ou inventaire. Pour l inventaire, p_quantite est
-- le nombre compte : l ecart est enregistre.
create or replace function mouvement_stock(p_produit uuid, p_quantite int, p_type text, p_note text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
  v_delta int;
begin
  if not est_gerante() then raise exception 'reserve a la gerante'; end if;
  if p_type not in ('reception', 'cabine', 'inventaire') then raise exception 'type inconnu'; end if;
  select stock into v_stock from produits where id = p_produit for update;
  if not found then raise exception 'produit inconnu'; end if;
  v_delta := case p_type
    when 'reception' then abs(p_quantite)
    when 'cabine' then -abs(p_quantite)
    else p_quantite - v_stock end;
  if p_type = 'inventaire' and p_quantite < 0 then raise exception 'quantite negative'; end if;
  update produits set stock = stock + v_delta where id = p_produit;
  insert into mouvements_stock (produit_id, quantite, type, note, cree_par)
  values (p_produit, v_delta, p_type, nullif(trim(p_note), ''), auth.uid());
  return v_stock + v_delta;
end;
$$;
grant execute on function mouvement_stock(uuid, int, text, text) to authenticated;

/* --------------------------------------------- Encaisser et annuler */

-- Encaissement : numero, sortie de stock des produits, facture figee. Le
-- stock peut passer sous zero (produit vendu mais pas encore saisi en
-- reception) : la gerante le voit et corrige par un inventaire.
create or replace function encaisser_facture(p_facture uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_facture factures;
  v_numero int;
  v_affiche text;
  l record;
begin
  if not est_gerante() then raise exception 'reserve a la gerante'; end if;
  if p_mode not in ('especes', 'wave', 'orange', 'mtn', 'moov', 'carte') then
    return jsonb_build_object('erreur', 'mode');
  end if;
  select * into v_facture from factures where id = p_facture for update;
  if not found then return jsonb_build_object('erreur', 'introuvable'); end if;
  if v_facture.statut <> 'brouillon' then return jsonb_build_object('erreur', 'deja'); end if;

  v_numero := nextval('factures_numero_seq');
  v_affiche := to_char(now() at time zone 'UTC', 'YYYY') || '-' || lpad(v_numero::text, 6, '0');

  for l in select produit_id, quantite from lignes_facture
           where facture_id = p_facture and type = 'produit' and produit_id is not null loop
    update produits set stock = stock - l.quantite where id = l.produit_id;
    insert into mouvements_stock (produit_id, quantite, type, facture_id, cree_par)
    values (l.produit_id, -l.quantite, 'vente', p_facture, auth.uid());
  end loop;

  update factures
  set statut = 'payee', numero = v_numero, numero_affiche = v_affiche,
      mode_paiement = p_mode, payee_le = now(), encaissee_par = auth.uid()
  where id = p_facture;

  -- Le rendez-vous facture est forcement honore.
  if v_facture.rendez_vous_id is not null then
    update rendez_vous set statut = 'honore' where id = v_facture.rendez_vous_id and statut = 'prevu';
  end if;

  return jsonb_build_object('numero', v_affiche);
end;
$$;
grant execute on function encaisser_facture(uuid, text) to authenticated;

create or replace function annuler_facture(p_facture uuid, p_motif text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_facture factures;
  l record;
begin
  if not est_gerante() then raise exception 'reserve a la gerante'; end if;
  select * into v_facture from factures where id = p_facture for update;
  if not found or v_facture.statut <> 'payee' then return jsonb_build_object('erreur', 'statut'); end if;
  for l in select produit_id, quantite from lignes_facture
           where facture_id = p_facture and type = 'produit' and produit_id is not null loop
    update produits set stock = stock + l.quantite where id = l.produit_id;
    insert into mouvements_stock (produit_id, quantite, type, facture_id, note, cree_par)
    values (l.produit_id, l.quantite, 'annulation', p_facture, nullif(trim(p_motif), ''), auth.uid());
  end loop;
  update factures
  set statut = 'annulee', annulee_le = now(),
      notes = concat_ws(' | ', notes, 'Annulee : ' || nullif(trim(p_motif), ''))
  where id = p_facture;
  return jsonb_build_object('ok', true);
end;
$$;
grant execute on function annuler_facture(uuid, text) to authenticated;
