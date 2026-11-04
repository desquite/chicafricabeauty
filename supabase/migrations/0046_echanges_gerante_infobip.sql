-- Un message de gérante renvoyé par Infobip n'est traité qu'une fois.
alter table echanges_gerante add column if not exists infobip_id text;
create unique index if not exists echanges_gerante_infobip on echanges_gerante (infobip_id) where infobip_id is not null;
