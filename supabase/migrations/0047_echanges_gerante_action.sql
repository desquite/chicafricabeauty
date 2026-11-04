-- Le résumé envoyé pour une action : relu par l'assistant comme l'appel
-- d'outil qu'il a été, pour qu'il ne l'imite pas en texte libre.
alter table echanges_gerante add column if not exists action_id uuid references actions_gerante(id);
