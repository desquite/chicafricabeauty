-- Date de fin d'une promotion produit : dernier jour inclus, vide si la
-- promotion dure tant que la gérante ne l'arrête pas. L'assistant la donne
-- aux clientes qui demandent.

alter table produits add column promo_fin date;

-- Abidjan est en UTC : current_date est le jour local.
create or replace function prix_actuel(p produits) returns int
language sql stable as $$
  select case
    when p.prix_promo is not null and p.prix_promo < p.prix_vente
         and (p.promo_fin is null or p.promo_fin >= current_date)
    then p.prix_promo else p.prix_vente end
$$;
