-- ============================================================================
-- Fidelite : une remise de 20 pour cent toutes les cinq seances
--
-- Le droit est porte par la seance qui le declenche, et non par un compteur
-- separe. Deux consequences voulues : le rang est fige au moment de la saisie,
-- donc la suppression d une venue anterieure ne decale pas les remises deja
-- accordees ; et une remise non utilisee le jour meme est perdue, sans avoir a
-- suivre dans le temps.
--
-- Aucun montant n est enregistre. Le prix vit dans le catalogue et n est pas
-- fige sur la seance : l adosser ici le rendrait faux des la premiere hausse
-- de tarif. Le calcul se fait a la caisse, l application dit seulement qui y a
-- droit et ce que la cliente en a fait.
-- ============================================================================

alter table seances add column if not exists remise_palier int;
alter table seances add column if not exists remise_fidelite text;

-- Contrainte posee separement : add column if not exists ne rejoue pas le
-- check quand la colonne est deja la.
alter table seances drop constraint if exists seances_remise_fidelite_check;
alter table seances add constraint seances_remise_fidelite_check
  check (remise_fidelite in ('soin', 'produit', 'non_utilisee'));

create index if not exists seances_remise_idx
  on seances (remise_palier) where remise_palier is not null;
