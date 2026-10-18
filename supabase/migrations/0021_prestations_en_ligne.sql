-- ============================================================================
-- Les 15 prestations de la page de reservation
--
-- Reprises a lidentique de la page Krenup : nom, duree, prix, ordre. Treize
-- existent deja dans le catalogue sous un libelle interne, que seances et
-- rendez-vous referencent : elles recoivent un nom public, sans etre
-- dupliquees. Deux sont nouvelles. Le libelle interne ne change pas.
--
-- Microdermabrasion et Hydrafacial ont dans le catalogue une duree differente
-- de celle de Krenup (70 et 80 min contre 60 et 90) : elles ne sont pas
-- touchees ici, la gerante tranche dans lecran Catalogue.
-- ============================================================================

insert into soins_catalogue (libelle, categorie, duree_std, prix, ordre) values
  ('La pédicure',                        'Mains et pieds', 60, 5000, 6),
  ('Pose capsule avec vernis permanent', 'Mains et pieds', 60, 3000, 11)
on conflict (libelle) do nothing;

update soins_catalogue as s
set libelle_public = v.public,
    ordre = v.ordre,
    en_ligne = true
from (values
  ('Soin classique',             'Soin du visage classique',                            1),
  ('Soin dermaplaning',          'Soin Dermaplanning',                                  2),
  ('Soin microdermabrasion',     'Soin Microdermabrasion',                              3),
  ('Soin microneedling',         'Soin micro needling',                                 4),
  ('Soin du visage et du corps', 'Soin complet ( soin du visage classique+ du corps)',  5),
  ('La pédicure',                'La pédicure',                                         6),
  ('Épilation menton',           'Épilation du menton',                                 7),
  ('Epilation maillot intégral', 'Épilation maillot intégral',                          8),
  ('Épilation jambes entières',  'Épilation des jambes entières',                       9),
  ('Epilation maillot (bikini)', 'Épilation maillot ( bikini )',                       10),
  ('Pose capsule avec vernis permanent', 'Pose capsule avec vernis permanent',         11),
  ('Soin hydrafacial',           'Hydrafacial',                                        12),
  ('Soin classique+',            'Soin du visage classique +',                         13),
  ('Soin du corps',              'Soin du corps',                                      14),
  ('Épilation aisselles',        'épilation aisselles',                                15)
) as v(libelle, public, ordre)
where s.libelle = v.libelle;

-- Absent de la page Krenup : garde sa place dans le catalogue, hors ligne.
update soins_catalogue set ordre = 16 where libelle = 'Epilation demi jambes';
