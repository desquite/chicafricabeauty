-- Assistant des gérantes sur WhatsApp.
--
-- Une gérante écrit au numéro de l'institut depuis son téléphone : son
-- message ne va pas dans la boîte des clientes, l'assistant lui répond et
-- prépare les actions demandées. Chaque action attend son « OUI ».
--
-- L'assistant agit avec la clé de service, sans session : auth.uid() y est
-- vide. L'encaissement et les mouvements de stock prennent donc la gérante
-- en paramètre, dans des variantes réservées à la clé de service.

/* ------------------------------------------------ Journal des échanges */

create table if not exists echanges_gerante (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references profiles(id),
  role text not null check (role in ('gerante', 'assistant')),
  texte text not null,
  cree_le timestamptz not null default now()
);
create index if not exists echanges_gerante_profil on echanges_gerante (profil_id, cree_le desc);
alter table echanges_gerante enable row level security;

/* ------------------------------------------- Actions en attente du OUI */

create table if not exists actions_gerante (
  id uuid primary key default gen_random_uuid(),
  profil_id uuid not null references profiles(id),
  outil text not null,
  arguments jsonb not null,
  resume text not null,
  statut text not null default 'proposee' check (statut in ('proposee', 'faite', 'echec', 'abandonnee')),
  resultat text,
  cree_le timestamptz not null default now(),
  traitee_le timestamptz
);
create index if not exists actions_gerante_attente on actions_gerante (profil_id, cree_le desc) where statut = 'proposee';
alter table actions_gerante enable row level security;

/* -------------------------------------------- Stock : variante service */

create or replace function mouvement_stock_par(p_produit uuid, p_quantite int, p_type text, p_note text, p_acteur uuid)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_stock int;
  v_delta int;
begin
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
  values (p_produit, v_delta, p_type, nullif(trim(p_note), ''), p_acteur);
  return v_stock + v_delta;
end;
$$;
revoke execute on function mouvement_stock_par(uuid, int, text, text, uuid) from public, anon, authenticated;
grant execute on function mouvement_stock_par(uuid, int, text, text, uuid) to service_role;

create or replace function mouvement_stock(p_produit uuid, p_quantite int, p_type text, p_note text)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not est_gerante() then raise exception 'reserve a la gerante'; end if;
  return mouvement_stock_par(p_produit, p_quantite, p_type, p_note, auth.uid());
end;
$$;

/* -------------------------------------- Encaissement : variante service */

create or replace function encaisser_facture_par(p_facture uuid, p_mode text, p_acteur uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_facture factures;
  v_numero int;
  v_affiche text;
  l record;
begin
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
    values (l.produit_id, -l.quantite, 'vente', p_facture, p_acteur);
  end loop;

  update factures
  set statut = 'payee', numero = v_numero, numero_affiche = v_affiche,
      mode_paiement = p_mode, payee_le = now(), encaissee_par = p_acteur
  where id = p_facture;

  -- Le rendez-vous facture est forcement honore.
  if v_facture.rendez_vous_id is not null then
    update rendez_vous set statut = 'honore' where id = v_facture.rendez_vous_id and statut = 'prevu';
  end if;

  return jsonb_build_object('numero', v_affiche);
end;
$$;
revoke execute on function encaisser_facture_par(uuid, text, uuid) from public, anon, authenticated;
grant execute on function encaisser_facture_par(uuid, text, uuid) to service_role;

create or replace function encaisser_facture(p_facture uuid, p_mode text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not est_gerante() then raise exception 'reserve a la gerante'; end if;
  return encaisser_facture_par(p_facture, p_mode, auth.uid());
end;
$$;
