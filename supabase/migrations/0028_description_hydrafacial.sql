-- ============================================================================
-- Description de lHydrafacial, donnee par la gerante
--
-- Le texte garde ses retours a la ligne : la page de reservation les affiche,
-- une etape par ligne.
-- ============================================================================

update soins_catalogue
set description = $txt$Le seul soin qui combine nettoyage, peeling doux, extraction des comédons et hydratation profonde.
L'appareil crée un vortex qui aspire les impuretés tout en propulsant des sérums antioxydants et ultra hydratants. Malgré les apparences, le soin est totalement indolore : aucune gêne, aucun picotement, juste un vrai moment de détente.

Les étapes :

Nettoyage : élimine en surface les peaux mortes et le sébum.

Exfoliation : un peeling doux aux acides salicylique et glycolique, reconnus pour leurs vertus purifiantes.

Extraction des comédons : le vortex aspire délicatement les impuretés incrustées pour des pores désobstrués.

Hydratation : des sérums concentrés pénètrent en profondeur pour une peau tonifiée et régénérée.

Ce soin convient à tous les types de peau.$txt$
where libelle = 'Soin hydrafacial';
