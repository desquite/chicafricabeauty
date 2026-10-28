-- ============================================================================
-- 0040 : boutique en ligne
--
-- La cliente remplit son panier, donne son adresse, paie par Jèko. Le stock
-- est réservé dès la commande créée : deux clientes ne peuvent pas payer le
-- dernier pot. Une commande restée sans paiement 45 minutes expire et rend
-- son stock. La livraison Yango se règle au livreur : elle n'entre pas dans
-- le montant.
--
-- Toutes les écritures passent par les fonctions ci-dessous, appelées par
-- le serveur avec la clé de service. La gérante ne fait que suivre la
-- commande (expédiée, livrée, annulée).
-- ============================================================================

create sequence if not exists commandes_numero_seq;

create table if not exists commandes (
  id               uuid primary key default gen_random_uuid(),
  numero           text unique not null,
  -- Seul identifiant que voit la cliente, dans l'adresse de suivi.
  code             text unique not null,
  nom              text not null,
  telephone        text not null,
  commune          text not null,
  adresse          text not null,
  note             text,
  montant          int not null check (montant > 0),
  statut           text not null default 'en_attente'
                   check (statut in ('en_attente', 'payee', 'expediee', 'livree', 'annulee', 'expiree')),
  operateur        text,
  jeko_id          text,
  jeko_transaction text,
  payee_le         timestamptz,
  expediee_le      timestamptz,
  livree_le        timestamptz,
  annulee_le       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists commandes_statut_idx on commandes (statut, created_at desc);

drop trigger if exists commandes_touch on commandes;
create trigger commandes_touch before update on commandes
  for each row execute function touch_updated_at();

create table if not exists lignes_commande (
  id           uuid primary key default gen_random_uuid(),
  commande_id  uuid not null references commandes(id) on delete cascade,
  produit_id   uuid not null references produits(id) on delete restrict,
  -- Nom et prix figés au moment de la commande.
  nom          text not null,
  prix         int not null check (prix >= 0),
  quantite     int not null check (quantite > 0)
);
create index if not exists lignes_commande_idx on lignes_commande (commande_id);

alter table commandes enable row level security;
alter table lignes_commande enable row level security;
drop policy if exists commandes_lecture on commandes;
create policy commandes_lecture on commandes for select to authenticated using (est_staff_actif());
drop policy if exists lignes_commande_lecture on lignes_commande;
create policy lignes_commande_lecture on lignes_commande for select to authenticated using (est_staff_actif());

-- Les sorties de stock de la boutique se voient dans le journal du stock.
alter table mouvements_stock add column if not exists commande_id uuid references commandes(id);
alter table mouvements_stock drop constraint if exists mouvements_stock_type_check;
alter table mouvements_stock add constraint mouvements_stock_type_check
  check (type in ('vente', 'reception', 'cabine', 'inventaire', 'annulation', 'boutique'));

/* ------------------------------------------------------------ Stock */

-- Rend le stock d'une commande non payée, ou d'une commande payée annulée.
create or replace function rendre_stock_commande(p_commande uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  for l in select produit_id, quantite from lignes_commande where commande_id = p_commande loop
    update produits set stock = stock + l.quantite where id = l.produit_id;
    insert into mouvements_stock (produit_id, quantite, type, commande_id, note)
    values (l.produit_id, l.quantite, 'annulation', p_commande, p_note);
  end loop;
end;
$$;

-- Sortie de stock d'une commande ; le stock peut passer sous zéro quand une
-- commande expirée est finalement payée : la gérante le voit au stock.
create or replace function sortir_stock_commande(p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
declare l record;
begin
  for l in select produit_id, quantite from lignes_commande where commande_id = p_commande loop
    update produits set stock = stock - l.quantite where id = l.produit_id;
    insert into mouvements_stock (produit_id, quantite, type, commande_id)
    values (l.produit_id, -l.quantite, 'boutique', p_commande);
  end loop;
end;
$$;

create or replace function expirer_commandes()
returns int language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
begin
  for c in select id from commandes
           where statut = 'en_attente' and created_at < now() - interval '45 minutes'
           for update skip locked loop
    update commandes set statut = 'expiree', annulee_le = now() where id = c.id;
    perform rendre_stock_commande(c.id, 'Commande boutique non payée');
    n := n + 1;
  end loop;
  return n;
end;
$$;

/* ------------------------------------------------------ Créer, payer */

-- p_lignes : [{"produit": uuid, "quantite": int}]. Prix lus en base, jamais
-- ceux du navigateur.
create or replace function creer_commande(
  p_nom text, p_telephone text, p_commune text, p_adresse text, p_note text,
  p_operateur text, p_lignes jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_id uuid := gen_random_uuid();
  v_numero text;
  v_code text := substr(md5(gen_random_uuid()::text), 1, 18);
  v_total int := 0;
  l record;
  p produits;
begin
  perform expirer_commandes();

  if jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    return jsonb_build_object('erreur', 'vide');
  end if;

  v_numero := 'C-' || lpad(nextval('commandes_numero_seq')::text, 5, '0');
  insert into commandes (id, numero, code, nom, telephone, commune, adresse, note, montant, operateur)
  values (v_id, v_numero, v_code, trim(p_nom), trim(p_telephone), trim(p_commune), trim(p_adresse),
          nullif(trim(p_note), ''), 1, p_operateur);

  for l in select (e->>'produit')::uuid as produit, sum((e->>'quantite')::int) as quantite
           from jsonb_array_elements(p_lignes) e group by 1 loop
    if l.quantite is null or l.quantite <= 0 or l.quantite > 50 then
      raise exception 'quantite';
    end if;
    select * into p from produits where id = l.produit for update;
    if not found or p.stock < l.quantite then
      -- Tout est défait : la commande et ses lignes ne restent pas à moitié.
      raise exception 'stock:%', coalesce(p.nom, '?');
    end if;
    insert into lignes_commande (commande_id, produit_id, nom, prix, quantite)
    values (v_id, p.id, p.nom, p.prix_vente, l.quantite);
    v_total := v_total + p.prix_vente * l.quantite;
  end loop;

  if v_total <= 0 then raise exception 'montant'; end if;
  update commandes set montant = v_total where id = v_id;
  perform sortir_stock_commande(v_id);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'code', v_code, 'montant', v_total);
exception
  when raise_exception then
    if sqlerrm like 'stock:%' then
      return jsonb_build_object('erreur', 'stock', 'produit', substr(sqlerrm, 7));
    end if;
    return jsonb_build_object('erreur', sqlerrm);
end;
$$;

-- Paiement confirmé par Jèko. Rejouable : renvoie premiere = true une seule
-- fois, pour que l'alerte ne parte qu'une fois.
create or replace function payer_commande(p_commande uuid, p_transaction text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c commandes;
begin
  select * into c from commandes where id = p_commande for update;
  if not found then return jsonb_build_object('erreur', 'introuvable'); end if;
  if c.payee_le is not null then return jsonb_build_object('premiere', false); end if;
  -- Payée après expiration ou abandon : le stock avait été rendu.
  if c.statut in ('expiree', 'annulee') then perform sortir_stock_commande(c.id); end if;
  update commandes
  set statut = 'payee', payee_le = now(), annulee_le = null,
      jeko_transaction = coalesce(p_transaction, jeko_transaction)
  where id = c.id;
  return jsonb_build_object('premiere', true);
end;
$$;

-- Paiement refusé ou abandonné : la commande rend son stock.
create or replace function abandonner_commande(p_commande uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update commandes set statut = 'annulee', annulee_le = now()
  where id = p_commande and statut = 'en_attente';
  if found then perform rendre_stock_commande(p_commande, 'Paiement boutique non abouti'); end if;
end;
$$;

/* ------------------------------------------------------ Suivi gérante */

create or replace function suivre_commande(p_commande uuid, p_etape text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare c commandes;
begin
  if not est_gerante() then raise exception 'reserve a la gerante'; end if;
  select * into c from commandes where id = p_commande for update;
  if not found then return jsonb_build_object('erreur', 'introuvable'); end if;
  if p_etape = 'expediee' and c.statut = 'payee' then
    update commandes set statut = 'expediee', expediee_le = now() where id = c.id;
  elsif p_etape = 'livree' and c.statut in ('payee', 'expediee') then
    update commandes set statut = 'livree', livree_le = now(),
      expediee_le = coalesce(expediee_le, now()) where id = c.id;
  elsif p_etape = 'annulee' and c.statut in ('payee', 'expediee') then
    update commandes set statut = 'annulee', annulee_le = now() where id = c.id;
    perform rendre_stock_commande(c.id, 'Commande boutique annulée par la gérante');
  else
    return jsonb_build_object('erreur', 'statut');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Les fonctions de la cliente ne s'appellent que depuis le serveur.
revoke all on function rendre_stock_commande(uuid, text) from public, anon, authenticated;
revoke all on function sortir_stock_commande(uuid) from public, anon, authenticated;
revoke all on function expirer_commandes() from public, anon, authenticated;
revoke all on function creer_commande(text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function payer_commande(uuid, text) from public, anon, authenticated;
revoke all on function abandonner_commande(uuid) from public, anon, authenticated;
grant execute on function expirer_commandes() to service_role;
grant execute on function creer_commande(text, text, text, text, text, text, jsonb) to service_role;
grant execute on function payer_commande(uuid, text) to service_role;
grant execute on function abandonner_commande(uuid) to service_role;
revoke all on function suivre_commande(uuid, text) from public, anon;
grant execute on function suivre_commande(uuid, text) to authenticated;
