# Chic Africa Beauty Online

Fiches clientes et suivi des soins de l'institut. Application web installable
(PWA), conçue pour la tablette de l'institut.

Remplace le Google Form « FICHE CLIENT & DIAGNOSTIC », qui ne permettait ni
l'historique par cliente, ni la reprise de saisie, ni les photos.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind 4) déployé sur **Vercel**
- **Supabase** — Postgres, Auth, Storage, RLS
- Aucune application native : la PWA s'installe sur l'écran d'accueil de la
  tablette et accède à l'appareil photo.

## Mise en route

```bash
pnpm install
```

Copier `.env.local.example` en `.env.local`, renseigner les deux variables,
puis `pnpm dev`.

L'URL du projet se trouve dans **Settings → Data API**, la clé dans
**Settings → API Keys**. Prendre la **Publishable key** (`sb_publishable_…`),
qui remplace l'ancienne clé `anon` ; jamais la **Secret key**, qui contourne
la RLS.

### Base de données

Coller `supabase/migrations/0001_schema_initial.sql` dans l'éditeur SQL du
projet Supabase. La migration crée les 8 tables, active la RLS sur chacune,
crée les deux buckets privés et pré-remplit le catalogue de soins.

### Créer le premier compte

1. Supabase → **Authentication** → **Add user** → email + mot de passe.
2. Puis dans l'éditeur SQL, rattacher ce compte au personnel :

```sql
insert into profiles (id, nom, role)
select id, 'Nom de la gérante', 'gerante'
from auth.users where email = 'email@exemple.com';
```

Sans cette seconde étape, la connexion réussit mais l'application refuse
l'accès : c'est volontaire, un compte Auth ne vaut pas habilitation.

## Modèle de données

| Table | Rôle |
|---|---|
| `profiles` | Personnel de l'institut, rattaché à `auth.users` |
| `clientes` | Identité, téléphone unique |
| `anamneses` | Bilan santé + habitudes, **une ligne par mise à jour** |
| `consentements` | Soin et photo, datés, **ni modifiables ni supprimables** |
| `soins_catalogue` | Menu de soins, éditable par la gérante |
| `seances` | Une ligne par venue : diagnostic, soin, observations, suite |
| `seance_soins` | Liaison séance ↔ soins réalisés |
| `photos` | Avant / après, bucket privé |

Deux partis pris à connaître avant de modifier le schéma :

- **`anamneses` est en append-only.** Une grossesse ou une allergie découverte
  crée une ligne, elle n'écrase pas l'ancienne. La vue `anamneses_courantes`
  renvoie la version à jour.
- **`seances.cliente_id` est en `on delete restrict`.** Une cliente ayant un
  historique ne peut pas être supprimée ; `clientes.actif` sert à l'archiver.

## Sécurité

Données de santé. La RLS est active dès la première migration, sans phase
« ouverte le temps du développement ». Toutes les politiques passent par
`est_staff_actif()` : aucune donnée n'est lisible sans session d'un membre
actif du personnel. Les clientes n'ont pas de compte.

## Avancement

| Lot | Contenu | État |
|---|---|---|
| 0 | Scaffold, auth, schéma, RLS, coque tablette | fait |
| 1 | Clientes, fiche d'accueil, consentement signé | à faire |
| 2 | Séances, historique, catalogue | à faire |
| 3 | Photos avant / après | à faire |
| 4 | Rendez-vous et rappels WhatsApp | à faire |
| 5 | Statistiques | à faire |

## Exploitation

⚠️ **Le plan Supabase gratuit met le projet en pause après environ une semaine
sans activité**, ce qui coupe l'application. Un institut qui n'ouvre l'app que
certains jours correspond exactement à ce profil. Passer en plan **Pro** avant
la mise en service.
