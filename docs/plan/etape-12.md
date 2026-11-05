## Étape 12 — Alertes, rappels et e-mails automatiques

### 0. Corrections préalables

Dépend des étapes 10 et 11. Relis `docs/mail.md` : tous les e-mails passent par
`MailService` ; la démo hébergée est en `MAIL_DRIVER=log`.

### Contexte

Deux mécanismes complémentaires, à ne pas confondre :

- les **alertes** : un contrôle de qualité **calculé** (état des données à l'instant T), avec
  une priorité. Elles disparaissent d'elles-mêmes quand la donnée est corrigée. Reprises de
  l'ancien outil, c'est ce qui fait gagner du temps chaque semaine ;
- les **rappels** : des notifications **datées** produites par des règles paramétrables
  (`ReminderRule` → `Notification`, cloche dans l'app, dédoublonnées par `dedupeKey`).

### Objectif

#### 1. Moteur d'alertes (`src/server/alerts/`, fonctions pures + requêtes)

Priorités `HIGH` (Haute), `MEDIUM` (Moyenne), `LOW` (Basse), `INFO`. Une alerte = personne
(ou objet), code de règle, priorité, message en français, lien vers l'endroit à corriger.
Elles ne portent que sur les **présents** (candidat, actif, en pause, suspendu), sauf la purge.

- **Haute** :
  - formation expirée ;
  - mineur nommé à une fonction interdite aux mineurs ;
  - NIVOL invalide ou en double ;
  - session ou nomination rattachée à un code inconnu ou inactif du référentiel.
- **Moyenne** :
  - formation qui expire dans le délai d'alerte (`ALERT_DAYS`, 60 j) ;
  - prérequis manquant pour une compétence valide ;
  - mineur sans autorisation parentale ;
  - B3 non vérifié cette année pour un encadrant régulier de mineurs ;
  - tronc commun incomplet (CRB, TCAU, TCAS ; liste dans un `Setting`), en précisant si la
    personne est déjà inscrite et à quelle date ;
  - PSE sans OPR ou sans ECG (règle paramétrable : « compétence X exige Y ») ;
  - fiche à purger (`purgeEligibleAt` passé) ;
  - relance de candidat échue ; point de suivi en retard ; reprise de pause dépassée.
- **Basse** :
  - résultat de session à reporter (session passée encore « Inscrit(e) ») ;
  - fiche incomplète (e-mail, date de naissance, dates d'obtention manquantes).
- **Info** : formation sans durée de validité ni règle du 31/12 dans le référentiel.

Chaque règle peut être désactivée par TOPAZE (`Setting`). Chaque profil ne voit que les
alertes des personnes de son périmètre (`visibleSql`) **et** des sujets qui le concernent
(ex. B3 et purge : TOPAZE ; candidats : DIAMANT ; formations : FORMAT, ACTION, LASER selon
la matrice). Mets cette correspondance dans la politique, pas dans l'écran.

**Affichage** :

- page `/alertes` : regroupées par priorité, filtres (priorité, règle, responsable), un clic
  ouvre la fiche au bon onglet ;
- **nombre d'alertes par personne** dans l'annuaire (pastille) et en tête de la fiche ;
- calcul à la demande, performant (requêtes groupées, pas de N+1) ; teste avec 500 personnes
  fictives que la page répond en moins d'une seconde en local.

#### 2. Rappels (`ReminderRule`, `/rappels`)

- Règles par défaut, désactivables, délais modifiables par TOPAZE (écran de réglage) :
  - candidat sans action depuis 7 j → DIAMANT ;
  - dossier envoyé et non signé après 5 j → relance du candidat (e-mail, ton de l'UL) et
    DIAMANT ;
  - formation qui arrive à échéance (60 j) → ACTION, LASER, FORMAT selon la formation ;
  - point de suivi à 3 mois ou annuel arrivé → DIAMANT ;
  - bénévole sans activité depuis 6 mois → TOPAZE (définis « activité » : session, nomination
    ou point de suivi ; note-le) ;
  - B3 annuel en janvier → TOPAZE ;
  - reprise de pause arrivée → DIAMANT.
- **Cloche** dans l'en-tête : nombre non lu, panneau, « tout marquer comme lu ».
- Dédoublonnage : `dedupeKey` stable (règle + objet + échéance), jamais deux fois la même
  notification.

#### 3. Tâche planifiée

- Route `POST /api/taches/quotidienne` (et `GET` pour Vercel Cron), protégée par
  `Authorization: Bearer <CRON_SECRET>` comparé en temps constant ; sans `CRON_SECRET`
  configuré, elle refuse tout (et le dit dans les logs, sans valeur).
- `vercel.json` : un cron **quotidien** à 05:00 UTC (le plan gratuit de Vercel n'autorise
  qu'un cron par jour). Toutes les tâches passent par cette route unique : rappels,
  récapitulatifs, mails du jour.
- Idempotente : relancée deux fois le même jour, elle ne double rien (verrou en base, table
  ou `Setting` daté).
- Le code métier ne dépend pas de Vercel : la route marchera avec un cron système plus tard.

#### 4. E-mails automatiques (tous via `MailService`, tutoiement, pas de tiret cadratin)

- **Récapitulatif des alertes** par profil : fréquence paramétrable (`DIGEST_FREQUENCY` :
  `MONTHLY` le 1er du mois par défaut, comme l'ancien outil, ou `WEEKLY` le lundi, ou
  `OFF`). Une personne de la liste n'y figure que si le destinataire peut la voir.
- **Prévenance du pôle Urgence** (besoin réel, déjà en service dans l'ancien outil) :
  - un e-mail dès qu'une session d'une formation de la liste (`URGENCE_NOTIFY_CODES`, par
    défaut `TCAU`) est **validée** ou **inscrite** ;
  - **un seul e-mail pour une saisie de groupe** ;
  - destinataires dans `URGENCE_NOTIFY_RECIPIENTS` (liste d'e-mails, vide par défaut : rien
    ne part) ;
  - la saisie est **enregistrée même si l'e-mail échoue** (envoi après la transaction, échec
    journalisé et visible) ;
  - bouton « Récapitulatif TCAU » sur `/formations` : envoie la liste des personnes avec leur
    état TCAU.
- **Anniversaire et anniversaire d'engagement** (fidélisation, **désactivés par défaut**,
  `GREETING_EMAILS_ENABLED` existe déjà) :
  - jamais deux fois le même jour à la même personne ; **jamais l'âge cité** ;
  - 29 février fêté le 28 les années non bissextiles ;
  - tutoiement, signé « L'équipe Cadre » (texte dans `Setting`, modifiable) ;
  - envoyé depuis l'adresse de l'équipe (`MAIL_FROM`) ;
  - le 31/12, une notification à TOPAZE invite à relire les textes ;
  - **opposition** : une case « Ne pas recevoir les messages d'anniversaire » sur la fiche,
    respectée par le moteur. Note dans `docs/nuit/questions.md` que l'information des
    bénévoles doit le mentionner (RGPD).
- **Relance de dossier** (règle « dossier non signé ») : rappelle le lien **sans le jeton**
  (le jeton n'est jamais stocké) : le message invite à demander un nouveau lien, ou DIAMANT
  en renvoie un d'un clic.

#### 5. Réglages (TOPAZE, `/admin/reglages` ou section existante)

Un écran pour les règles d'alerte (actives), les règles de rappel (délais, destinataires,
actives), la fréquence du récapitulatif, la prévenance Urgence, les e-mails d'anniversaire
et leurs textes. Validation Zod, `withAudit`.

### Seed

Assez de cas pour que **chaque règle d'alerte** produise au moins une alerte, des
notifications lues et non lues, une saisie TCAU de groupe.

### Tests attendus

- Vitest : chaque règle d'alerte (cas positif et négatif), priorités, dédoublonnage, dates
  (29 février, 1er du mois, lundi), contenu et ton des e-mails (aucun âge, pas de `—`).
- `test:db` : la tâche quotidienne de bout en bout, rejouée deux fois sans doublon ; refus
  sans secret ou avec un mauvais secret ; prévenance Urgence (un seul mail pour un groupe,
  saisie conservée si le mail échoue) ; visibilité des alertes par profil ; opposition aux
  messages d'anniversaire.
- Playwright : TOPAZE ouvre `/alertes`, clique une alerte Haute et arrive sur la bonne fiche ;
  la cloche ; l'écran de réglages ; axe sans violation.

### Documentation

`docs/alertes.md` (règles, priorités, qui voit quoi), `docs/taches.md` (route, secret, cron
Vercel aujourd'hui, cron système demain), `docs/mail.md` complété, ADR, `.env.example`
(`CRON_SECRET`, sans valeur).

### Récapitulatif (dans le journal)

Migrations, tests, écarts, captures (`/alertes`, cloche, réglages). Ajoute dans
`docs/nuit/recap.md` la variable `CRON_SECRET` à créer dans Vercel.
