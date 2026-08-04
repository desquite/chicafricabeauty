-- ============================================================================
-- Retrait manuel dun rendez-vous de lagenda
--
-- remplace_par ne couvre que les reprogrammations faites depuis le bouton
-- prevu a cet effet. Les rendez-vous annules puis reprogrammes a la main,
-- avant que ce bouton nexiste, nont aucun lien vers leur remplacant et
-- restent donc affiches sur leur ancienne date.
--
-- masque_le permet de les ecarter un par un. Comme remplace_par, cest un
-- masquage et non une suppression : le rendez-vous continue dalimenter le
-- taux dabsence.
-- ============================================================================

alter table rendez_vous
  add column if not exists masque_le timestamptz;

create index if not exists rendez_vous_masque_idx
  on rendez_vous (masque_le) where masque_le is not null;
