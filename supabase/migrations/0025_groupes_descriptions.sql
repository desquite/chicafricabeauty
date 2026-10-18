-- ============================================================================
-- Prestations regroupees et decrites
--
-- La page de reservation range les soins en quatre groupes deroulants, dans
-- lordre du menu de linstitut : visage, corps, epilation a la cire chaude,
-- onglerie. Chaque soin peut porter une description, affichee derriere
-- En savoir plus. Les textes viennent de la page Krenup, corriges.
--
-- Trois soins du menu nexistaient pas : demi-bras, bras entiers, manucure.
-- Ils sont crees hors ligne, faute de duree connue : une prestation en ligne
-- doit dire combien de temps elle bloque lagenda.
-- ============================================================================

alter table soins_catalogue add column if not exists description text;
alter table soins_catalogue add column if not exists groupe text;
alter table soins_catalogue drop constraint if exists soins_groupe_check;
alter table soins_catalogue add constraint soins_groupe_check
  check (groupe is null or groupe in ('visage', 'corps', 'cire', 'ongles'));

insert into soins_catalogue (libelle, categorie, prix, ordre) values
  ('Épilation demi-bras',   'Épilation à la cire', 10000, 14),
  ('Épilation bras entiers', 'Épilation à la cire', 20000, 15),
  ('Manucure',              'Mains et pieds',       2000, 18)
on conflict (libelle) do nothing;

update soins_catalogue as s
set groupe = v.groupe,
    ordre = v.ordre,
    libelle_public = coalesce(v.public, s.libelle_public),
    description = v.description
from (values
  ('Soin microneedling', 'visage', 1, null,
   'Une méthode qui accélère la production de collagène et d''élastine, deux protéines responsables de la qualité de la peau. Grâce à un stylo muni de micro-aiguilles à usage unique, la peau est perforée à différentes vitesses afin de se régénérer plus rapidement, ce qui facilite aussi la pénétration de vos produits de beauté.'),
  ('Soin hydrafacial', 'visage', 2, null, null),
  ('Soin microdermabrasion', 'visage', 3, null,
   'Cette méthode est une exfoliation réalisée par projection de microcristaux : elle affine le grain de peau et en révèle l''éclat. Vous ressortez avec une peau lisse et éclatante.'),
  ('Soin dermaplaning', 'visage', 4, null,
   'C''est une technique d''exfoliation de la peau au moyen d''un scalpel chirurgical à usage unique : elle retire la couche superficielle de l''épiderme et surtout le duvet. Cette méthode permet une meilleure pénétration de vos soins et révèle l''éclat de votre peau. Non, le poil ne repousse pas plus épais ni plus dru, car il est rasé au-dessus du follicule pileux.'),
  ('Soin classique+', 'visage', 5, null,
   'Ce soin vous offre plus de 10 protocoles : du nettoyage à l''extraction manuelle des comédons, jusqu''à l''hydratation et la protection de votre peau. Pour les peaux à imperfections marquées : extraction approfondie et temps de soin prolongé, pour un résultat net et durable.'),
  ('Soin classique', 'visage', 6, null,
   'Ce soin vous offre plus de 10 protocoles : du nettoyage à l''extraction manuelle des comédons, jusqu''à l''hydratation et la protection de votre peau.'),
  ('Soin du corps', 'corps', 7, null,
   'Le soin du corps comprend un gommage, un enveloppement au chocolat, un mélange de cataplasmes pour vous garder au chaud, et enfin un modelage du corps.'),
  ('Soin du visage et du corps', 'corps', 8, null,
   'Le soin classique du visage et le soin du corps, en une seule séance. Le soin du corps comprend un gommage, un enveloppement au chocolat, un mélange de cataplasmes pour vous garder au chaud, et enfin un modelage du corps.'),
  ('Épilation jambes entières', 'cire', 9, null, null),
  ('Epilation maillot intégral', 'cire', 10, null, null),
  ('Epilation maillot (bikini)', 'cire', 11, null, 'Épilation à la cire des côtés du maillot.'),
  ('Epilation demi jambes', 'cire', 12, 'Épilation demi-jambes', null),
  ('Épilation aisselles', 'cire', 13, null, null),
  ('Épilation demi-bras', 'cire', 14, 'Épilation demi-bras', null),
  ('Épilation bras entiers', 'cire', 15, 'Épilation bras entiers', null),
  ('Épilation menton', 'cire', 16, null, null),
  ('La pédicure', 'ongles', 17, null,
   'Cette séance comprend un bain de pieds chaud, puis un gommage, la pose d''un masque et un modelage, et enfin la pose de vernis permanent.'),
  ('Manucure', 'ongles', 18, 'Manucure', null),
  ('Pose capsule avec vernis permanent', 'ongles', 19, null, null)
) as v(libelle, groupe, ordre, public, description)
where s.libelle = v.libelle;

-- Demi-jambes a deja sa duree (60 min) : elle passe en ligne tout de suite.
update soins_catalogue set en_ligne = true
where libelle = 'Epilation demi jambes' and duree_std is not null and prix is not null;
