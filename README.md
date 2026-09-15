# QCM d'évaluation — Module 4 : Diffusion et distribution du documentaire

Système d'évaluation en ligne : 140 questions en banque, 40 tirées par participant,
chronomètre de 45 min basé sur l'heure serveur, détection de changement de fenêtre
avec régénération du tirage, enregistrement et notation automatique côté serveur.

## ⚠️ Limites techniques à connaître avant utilisation

Deux points ne sont **pas** résolus, et ne peuvent pas l'être par un site web,
quelle que soit la plateforme utilisée :

1. **Aucun site web ne peut empêcher un stagiaire d'utiliser un deuxième appareil**
   (téléphone à côté d'un ordinateur, par exemple) pour chercher les réponses.
   La détection de changement de fenêtre (« Anti-triche ») ne voit que ce qui se
   passe sur l'appareil utilisé pour l'évaluation, pas sur un appareil externe.
2. **Aucun navigateur ne peut être verrouillé** depuis une simple page web — la
   détection de perte de focus est la meilleure alternative technique possible.
   Un vrai verrouillage demanderait un logiciel dédié (type *Safe Exam Browser*)
   installé sur chaque poste, ce qui sort du périmètre d'un site web hébergé.

Il est recommandé d'annoncer clairement ces règles aux stagiaires en amont — l'effet
dissuasif (nominatif + horodatage serveur + détection) reste réel, même sans blocage total.

---

## Pourquoi ce changement d'architecture ?

La version précédente utilisait un backend Google Apps Script. En pratique, les
requêtes `POST` envoyées à une Web App Apps Script sont parfois converties en `GET`
par une redirection interne à Google, ce qui casse les appels de façon imprévisible
(erreurs 405 difficiles à diagnostiquer). Ce projet abandonne complètement Apps
Script au profit de **Cloudflare Pages** :

- Le frontend (fichiers statiques) et le backend (API) sont déployés **ensemble
  depuis ce même dépôt GitHub**, en connectant simplement le dépôt dans le
  tableau de bord Cloudflare — chaque `git push` redéploie tout automatiquement.
- Le backend tourne dans un vrai environnement serveur (Cloudflare Pages
  Functions), avec des routes HTTP `GET`/`POST` classiques et fiables — plus de
  contrainte ou de comportement surprenant côté plateforme.
- Le frontend et l'API étant servis depuis le **même domaine**, il n'y a même
  plus besoin de gérer le CORS (contrairement à Apps Script, hébergé sur un
  domaine différent de GitHub Pages).
- Niveau gratuit généreux, sans carte bancaire requise.

Les emails de résultat sont envoyés via **Resend**, une API d'envoi transactionnel
avec un vrai niveau gratuit (100 emails/jour, 3000/mois) sans carte bancaire.

---

## Architecture

```
Stagiaire (mobile ou ordinateur)
        │
        ▼
Cloudflare (Worker + assets statiques, un seul projet)
  ├─ docs/ (index.html, style.css, app.js)   ← interface, servie directement, publique
  │         │  fetch() POST /api/...
  │         ▼
  └─ src/worker.js → functions/api/*.js       ← backend : questions, correction,
              │                                  horodatage, calcul de note
              ▼
     Cloudflare KV (namespace QCM_KV)          ← stockage des sessions et résultats
              │
              ▼
     Resend (API email)                        ← envoi automatique du résultat
```

Le corrigé (bonnes réponses) vit **uniquement** dans `functions/_lib/questions.js`,
qui n'est jamais servi comme fichier statique (seul le contenu de `docs/` est
public) — un stagiaire qui inspecte le code source de la page ne peut donc pas
voir les réponses. La correction s'exécute uniquement dans le Worker
(`functions/api/submit.js`, appelé depuis `src/worker.js`), jamais dans le
navigateur.

---

## Étape 1 — Créer un compte Cloudflare

1. Allez sur [dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up),
   créez un compte gratuit (aucune carte bancaire requise).

## Étape 2 — Créer l'espace de stockage KV

1. Dans le tableau de bord Cloudflare : menu **Workers & Pages** (barre latérale)
   → onglet **KV** (ou **Stockage et bases de données > KV**).
2. Cliquez sur **Créer un espace de noms** (*Create a namespace*), nommez-le par
   exemple `qcm-module4`.
3. Une fois créé, copiez son **ID** affiché dans la liste.
4. Ouvrez le fichier `wrangler.toml` à la racine du dépôt et remplacez
   `REMPLACER_PAR_ID_NAMESPACE_KV` par cet ID. Profitez-en pour renseigner
   aussi `ADMIN_EMAIL` dans la section `[vars]` du même fichier (l'adresse qui
   recevra chaque résultat — voir étape 3 pour la contrainte Resend). Committez
   et poussez ce changement sur GitHub.

## Étape 3 — Créer un compte Resend et obtenir une clé API

1. Allez sur [resend.com](https://resend.com), créez un compte gratuit (aucune
   carte bancaire requise).
2. Dans le tableau de bord : **API Keys > Create API Key**. Copiez la clé
   (commence par `re_`) — elle ne sera plus affichée ensuite.
3. **Important — limite du niveau gratuit sans domaine vérifié** : tant que vous
   n'avez pas vérifié un nom de domaine sur Resend, vous ne pouvez envoyer des
   emails **qu'à l'adresse email utilisée pour créer votre compte Resend**.
   `ADMIN_EMAIL` (l'adresse du formateur) fonctionne donc directement.
4. **Obligatoire pour ce projet — vérifier un domaine** : chaque participant
   reçoit automatiquement le détail de ses réponses à sa propre adresse email
   (obligation légale de lui fournir une trace de son évaluation). Comme ces
   adresses sont différentes de celle du compte Resend, un domaine **doit**
   être vérifié, sinon l'envoi aux participants échouera systématiquement (le
   suivi de chaque envoi reste visible sans planter l'appli — voir Étape 7 —
   mais aucun participant ne recevra rien tant que ce n'est pas fait) :
   - Menu **Domains** sur Resend > **Add Domain**, indiquez un domaine ou
     sous-domaine que vous possédez (ex. `formation.mondomaine.fr`).
   - Resend fournit des enregistrements DNS (SPF, DKIM) à ajouter chez votre
     hébergeur de domaine. Une fois propagés (quelques minutes à quelques
     heures), le domaine passe en statut **Vérifié**.
   - Mettez alors à jour la variable `EMAIL_FROM` (étape 6) avec une adresse
     `@votredomaine`, par exemple `QCM Module 4 <evaluation@formation.mondomaine.fr>`
     — un email envoyé depuis `onboarding@resend.dev` (valeur par défaut) reste
     limité au seul destinataire du compte Resend, domaine vérifié ou non.

## Étape 4 — Pousser le code sur GitHub

Le dépôt doit contenir à sa racine les dossiers `docs/` et `functions/`, ainsi
que `wrangler.toml`. C'est déjà le cas dans ce projet — poussez simplement vos
modifications sur votre dépôt GitHub habituel.

## Étape 5 — Créer le projet Cloudflare (Workers + assets statiques)

Le dépôt utilise le modèle actuel de Cloudflare : un Worker (`src/worker.js`)
qui gère les routes `/api/*`, et des fichiers statiques (`docs/`) servis
directement — les deux dans un seul projet, déclaré dans `wrangler.toml`.

1. Dans le tableau de bord Cloudflare : **Workers & Pages > Créer une
   application > Importer un dépôt** (ou *Connecter à Git*).
2. Autorisez Cloudflare à accéder à votre compte GitHub, puis sélectionnez ce
   dépôt.
3. Cloudflare détecte `wrangler.toml` et propose une **commande de déploiement**
   par défaut : laissez `npx wrangler deploy` (ne la changez pas en
   `wrangler pages deploy`, qui ne fonctionne pas avec ce modèle de projet).
4. Cliquez sur **Enregistrer et déployer**. Le premier déploiement échouera
   probablement (les liaisons KV/email ne sont pas encore configurées) — c'est
   normal, l'étape suivante corrige ça.

## Étape 6 — Relier le stockage KV et les clés au projet

⚠️ **Piège fréquent** : la page **Settings** du projet contient DEUX sections
qui se ressemblent :
- **"Runtime variables and secrets"**, tout en haut de la page — c'est celle
  que le Worker lit réellement quand il répond aux requêtes (`env.MA_VARIABLE`
  dans le code).
- **"Variables and secrets"** à l'intérieur de la section **Builds** (plus
  bas, dans la configuration Git) — celle-ci ne sert qu'au processus de
  build/CI, jamais au code du Worker en production.

Une variable ajoutée dans la mauvaise section (Builds) n'aura **aucun effet**
sur l'application, même si elle a l'air bien enregistrée. Utilisez toujours
la section du **haut** ("Runtime variables and secrets").

1. Dans votre projet : **Settings**, section **Runtime variables and secrets**
   (tout en haut de la page) → **+ Add variable**.
2. Ajoutez :
   - `RESEND_API_KEY` → la clé copiée à l'étape 3, type **Secret**
   - `EMAIL_FROM` (optionnel) → laissez vide pour utiliser la valeur par défaut
     `QCM Module 4 <onboarding@resend.dev>`, ou indiquez une adresse `@votredomaine`
     si vous avez vérifié un domaine sur Resend
3. `ADMIN_EMAIL` est déjà fixé dans `wrangler.toml` (variable `[vars]`) — pas
   besoin de l'ajouter ici. Si vous devez le changer, modifiez cette valeur
   dans `wrangler.toml` et repoussez sur GitHub plutôt que de l'ajouter dans
   le dashboard (plus fiable : ça survit à chaque redéploiement).
4. Le binding KV (`QCM_KV`) est déjà déclaré dans `wrangler.toml` avec l'ID de
   votre namespace (étape 2) — Cloudflare le relie automatiquement au
   déploiement, rien à faire de plus ici pour lui.
5. Les variables "Runtime" prennent effet immédiatement, sans redéploiement.
   Vérifiez sur `https://<votre-url>/api/health` : le champ `email_config`
   doit afficher `RESEND_API_KEY: true`.

## Étape 7 — Test complet avant utilisation réelle

1. Ouvrez l'URL du projet (format `https://qcm-module4.<votre-compte>.workers.dev`,
   visible dans le tableau de bord) sur un téléphone.
2. Entrez un nom test, démarrez l'évaluation. Vérifiez que le chronomètre
   démarre bien à 0:45:00.
3. Répondez à 2-3 questions, puis changez d'application (ou verrouillez
   l'écran) : vérifiez que les réponses sont effacées, qu'un bandeau
   d'avertissement apparaît, et qu'un **nouveau** tirage de questions démarre —
   **sans que le chronomètre ne redémarre**.
4. Allez au bout du questionnaire, validez.
5. Vérifiez que l'écran de confirmation s'affiche, que l'email de résultat est
   arrivé à `ADMIN_EMAIL`, et que le résultat est bien enregistré (voir
   ci-dessous pour consulter les données stockées dans KV).

### Consulter les résultats enregistrés

Les résultats sont stockés dans l'espace KV `QCM_KV`, sous des clés
`result:<token>`. Pour les consulter :

- Dans le tableau de bord Cloudflare : **Workers & Pages > KV > (votre
  namespace)**, vous pouvez parcourir et voir chaque clé/valeur directement
  dans l'interface.
- Ou avec la CLI Wrangler (voir section développement local ci-dessous) :
  `npx wrangler kv key list --namespace-id=<ID_NAMESPACE>` puis
  `npx wrangler kv key get "result:<token>" --namespace-id=<ID_NAMESPACE>`.

Chaque résultat contient, en plus du score et du détail complet des réponses
(question, réponse donnée, réponse attendue, correct ou non) : `email` (adresse
du participant), `adminEmailSent`/`adminEmailDebug` et
`participantEmailSent`/`participantEmailDebug` — pratique pour vérifier
rapidement si l'envoi a réussi sans avoir besoin des logs Cloudflare.

### Envoyer les résultats manuellement (sans domaine Resend vérifié)

Tant qu'aucun domaine n'est vérifié sur Resend (voir Étape 3), l'envoi
automatique au participant échoue systématiquement — `participantEmailSent`
vaudra `false`. Chaque résultat contient quand même de quoi envoyer
manuellement :

- **`participantEmailText`** : le message complet, déjà rédigé et mis en
  forme (score, détail question par question), prêt à copier-coller dans le
  corps d'un email que vous envoyez vous-même à l'adresse du champ `email`.
- **`resultPdfUrl`** : un lien direct vers un PDF mis en forme du résultat
  (score, détail complet des réponses), à télécharger et joindre à votre
  email. Le lien a la forme
  `https://<votre-url>/api/result-pdf?token=<token>` — ouvrez-le simplement
  dans un navigateur pour télécharger le fichier.

Dès qu'un domaine sera vérifié sur Resend, ce même PDF sera automatiquement
joint aux emails envoyés (participant et formateur), sans changement à faire
dans le code.

---

## Développement local (optionnel, pour tester avant de déployer)

Nécessite [Node.js](https://nodejs.org/) installé sur votre ordinateur.

```bash
npm install
cp .dev.vars.example .dev.vars   # puis renseignez vos vraies clés dans .dev.vars
npm run dev
```

Le site est alors accessible sur l'URL locale affichée par Wrangler, avec un
stockage KV local (isolé du KV de production) et les variables de
`.dev.vars` (jamais commité — il est dans `.gitignore`).

Pour déployer manuellement en ligne de commande (alternative à la connexion Git
du tableau de bord) :

```bash
npx wrangler login
npm run deploy
```

---

## Modifier la banque de questions

Toutes les questions sont dans `functions/_lib/questions.js`, tableau
`QUESTION_BANK` (140 questions actuellement, dont 40 sont tirées par
participant). Avec 14 stagiaires, le chevauchement moyen mesuré entre deux
questionnaires est d'environ **29 %** (11-12 questions communes sur 40) —
largement suffisant pour qu'aucun stagiaire n'ait un questionnaire identique à
son voisin. Chaque question suit ce format :

```js
{ id: "q061", type: "mcq", text: "Votre question ?",
  options: ["Option A", "Option B", "Option C", "Option D"],
  answer: "Option B", points: 1 }
```

- `type: "mcq"` → question à choix multiple, `answer` doit correspondre
  exactement à l'une des `options`.
- `type: "text"` → réponse courte ; `answer` peut être un tableau de
  formulations acceptées (la correction cherche si la réponse du stagiaire
  **contient** l'une d'elles).
- Le nombre total de questions tirées (`NB_QUESTIONS` dans
  `functions/_lib/config.js`, 40 par défaut) ne peut pas dépasser la taille de
  `QUESTION_BANK` (140 actuellement).
- Plus `QUESTION_BANK` est grand par rapport à `NB_QUESTIONS`, moins les
  stagiaires ont de questions en commun entre eux.

Après modification, un simple `git push` redéploie automatiquement le site
(si le projet Pages est connecté au dépôt Git).

## Ajuster les réglages

Dans `functions/_lib/config.js` :
- `NB_QUESTIONS` : nombre de questions tirées par participant (40 par défaut)
- `DUREE_MAX_MINUTES` : durée de l'épreuve (45 par défaut)
- `SESSION_TTL_SECONDS` : durée de conservation d'une session « en cours » dans
  KV avant expiration automatique (6h par défaut — largement supérieure à la
  durée de l'épreuve, pour laisser une marge en cas de soumission tardive)

---

## Ce qui se passe en cas de changement de fenêtre

1. Le navigateur détecte la perte de focus (`visibilitychange` ou `blur`).
2. Le frontend appelle `POST /api/violation`.
3. Le serveur incrémente le compteur de violations, tire un **nouveau** jeu de
   40 questions (différent du précédent, via le même algorithme déterministe
   mulberry32 + hash), mais conserve l'heure de départ d'origine.
4. Le frontend efface les réponses en cours et affiche les nouvelles questions.
5. Le nombre de violations est enregistré dans le résultat final, visible par
   le formateur dans KV et dans l'email de résultat.

## Fichiers du projet

```
docs/index.html              → structure de la page
docs/style.css                → mise en forme mobile-first
docs/app.js                   → logique frontend (chrono, anti-triche, appels API)
src/worker.js                 → point d'entrée du Worker : route /api/* vers les handlers,
                                 le reste retombe sur les fichiers statiques de docs/
functions/api/health.js       → handler GET /api/health (vérification que l'API répond)
functions/api/start.js        → handler POST /api/start (démarrage, tirage, horodatage serveur)
functions/api/violation.js    → handler POST /api/violation (nouveau tirage après changement de fenêtre)
functions/api/submit.js       → handler POST /api/submit (correction serveur, enregistrement, email, PDF)
functions/api/result-pdf.js   → handler GET /api/result-pdf?token=... (téléchargement du PDF de résultat)
functions/_lib/questions.js   → banque de 140 questions AVEC les bonnes réponses (jamais public)
functions/_lib/random.js      → tirage pseudo-aléatoire déterministe (mulberry32 + hash)
functions/_lib/grading.js     → correction et filtrage des questions envoyées au client
functions/_lib/email.js       → envoi des emails (formateur + participant) via l'API Resend
functions/_lib/pdf.js         → génération du PDF de résultat mis en forme (pdf-lib)
functions/_lib/config.js      → réglages (nombre de questions, durée, TTL session)
wrangler.toml                  → configuration Cloudflare (Worker, assets statiques, liaison KV)
package.json                  → scripts npm (dev local, déploiement CLI)
.dev.vars.example             → modèle de variables d'environnement pour le développement local
README.md                     → ce fichier
```
