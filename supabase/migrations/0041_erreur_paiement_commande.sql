-- Réponse de Jèko quand la demande de paiement est refusée : sans elle, une
-- panne ne se lit que dans les journaux de Vercel.
alter table commandes add column if not exists erreur_paiement text;
