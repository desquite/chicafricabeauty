-- Promotion sur un produit : un prix réduit, actif tant qu'il est renseigné
-- et inférieur au prix normal. La gérante l'arrête en le vidant.

alter table produits add column prix_promo int check (prix_promo > 0);

-- Prix payé aujourd'hui : la promotion si elle baisse le prix, sinon le prix normal.
create or replace function prix_actuel(p produits) returns int
language sql immutable as $$
  select case when p.prix_promo is not null and p.prix_promo < p.prix_vente then p.prix_promo else p.prix_vente end
$$;

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
    values (v_id, p.id, p.nom, prix_actuel(p), l.quantite);
    v_total := v_total + prix_actuel(p) * l.quantite;
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
