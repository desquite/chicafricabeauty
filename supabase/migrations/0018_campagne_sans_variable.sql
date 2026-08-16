-- ============================================================================
-- Une campagne peut employer un modele sans variable d offre
--
-- Le modele valide porte son offre en dur dans le corps : le prix, la remise
-- et la date de fin y sont ecrits. Il n a donc qu une seule variable, le nom
-- de la cliente, la ou le code en envoyait deux — et un modele qui recoit
-- plus de variables qu il n en attend refuse le message.
--
-- texte devient facultatif. Renseigne, il alimente la seconde variable et le
-- modele resservira d une campagne a l autre. Vide, l offre vit dans le
-- modele lui-meme, qui ne servira que pour cette promotion.
-- ============================================================================

alter table campagnes alter column texte drop not null;
