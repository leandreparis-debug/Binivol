# Récapitulatif de la nuit (05 → 06/11/2026)

## 1. En une phrase

La V1 est **fonctionnellement complète** (étapes 8 à 14 terminées, l'étape 15 presque) et
déployée sur la démo ; il reste des finitions de recette (parcours e2e d'un seul tenant, CSP
avec nonce, audit au lecteur d'écran) et **tes réglages dans Vercel**.

## 2. Les étapes

| #   | Étape                                      | Statut                    | Commits principaux                                    | Migrations                                          | Tests (unit / base / e2e) |
| --- | ------------------------------------------ | ------------------------- | ----------------------------------------------------- | --------------------------------------------------- | ------------------------- |
| 8   | Signature électronique et PDF officiels    | terminée (version `main`) | `e6fcb9b` → `29e4618` (session parallèle)             | celles de la session parallèle                      | 698 / 245 / —             |
| 9   | Assistant Gaia, passage au statut bénévole | terminée                  | `2900a7a` → `d25e3d7`                                 | `20261108090000_gaia_checklist_and_followup_cancel` | 711 / 257 / 90            |
| 10  | Formations, compétences, nominations       | terminée                  | `7c571c1` → `669a143`                                 | aucune                                              | 739 / 265 / 93            |
| 11  | Suivi, parrainage, B3, pauses, départs     | terminée                  | `c98b4ad`, `2b99737`, `6070977`                       | `20261109090000_pause_and_b3_checker`               | 769 / 270 / 95            |
| 12  | Alertes, rappels, e-mails automatiques     | terminée                  | `80db74b`, `7704d9b`, `dbf4119`, `2c6f583`            | `20261110090000_alerts_reminders_jobs`              | 832 / 277 / 98            |
| 13  | Tableaux de bord, matrice, exports         | terminée                  | `6f091d2`, `1bacf40`, `869940d`                       | aucune                                              | 846 / 284 / 103           |
| 14  | RGPD et administration                     | terminée                  | `f987b1a`, `7862d68`, `0c61f74`, `6585495`, `1932bef` | `20261111090000_storage_orphans`                    | 870 / 293 / 107           |
| 15  | Recette, audit et guides                   | partielle                 | `7fbbd49`, `ee917d7`, `af9f33f`, + ce récap           | `20261112090000_rate_limits`                        | 873 / 294 / 118           |

Détail de chaque étape (écarts, captures) : `docs/nuit/journal.md`.

## 3. État de `main`, de la CI et de la démo

- **`main`** est avancé en fast-forward jusqu'au dernier commit de la branche
  `claude/binivol-v1-marathon-nuit-7yijue` (jamais de `--force`).
- **Démo Vercel** : déploiements de production des étapes 9 à 14 vérifiés **READY** (outil Vercel) ;
  celui de l'étape 15 était en file d'attente à l'écriture de ce récap (non vérifié).
- **CI GitHub** : verte jusqu'à l'étape 13 ; rouge sur l'étape 14 (`main`, un test e2e de purge
  instable sous les relances de la CI) et sur la branche après (compte de tables dans un test
  base). Les deux sont corrigés dans le dernier commit ; **résultat de la CI sur ce dernier commit
  non vérifié**.

## 4. Ce que tu dois faire (Léandre)

**Dans Vercel** (Project → Settings → Environment Variables, Production), noms seulement :

1. `CRON_SECRET` : 32 caractères aléatoires ou plus (`openssl rand -hex 32`), puis redéployer.
   Sans elle, la tâche quotidienne (rappels, purge, e-mails) refuse tout : c'est voulu.
2. Rien d'autre n'est requis pour la démo. Pour de vraies données plus tard : suivre
   `docs/mise-en-service.md` (S3, SMTP, Google, retrait de `AUTH_DEMO_LOGIN` /
   `AUTH_DEMO_ON_VERCEL`, sauvegarde avec `BACKUP_ENCRYPTION_KEY`).

**Sur la démo, à regarder** (bouton de connexion démo) :

- **Alex Démo (TOPAZE)** : l'accueil (effectif, alertes hautes, fidélisation), Rappels → Alertes,
  menu du compte → Réglages, Paramètres de l'UL, Journaux, Purge RGPD (une fiche fictive
  éligible), Exports (préfecture), une fiche → « Exporter les données (RGPD) ».
- **Maé Démo (DIAMANT)** : l'entonnoir sur l'accueil, Candidats → Suivi des bénévoles, compléter
  un point à 3 mois, la cloche.
- **Noa Démo (FORMAT)** : Formations → Matrice (et son export), « Récapitulatif TCAU ».
- **Camille Démo (ACTION)**, **Sacha Démo (LASER)**, **Lou Démo (FORMAT GP)** : leur accueil.
- **Eden Démo (FORMAT + DIAMANT)** : deux blocs sur l'accueil.
- Tous : menu du compte → Aide ; en bas du dossier en ligne, « Confidentialité ».

## 5. Décisions prises seul, à confirmer

Toutes dans `docs/nuit/questions.md` (questions 1 à 28), notamment : liste de suivi dans
`/candidats/suivi` ; compte rendu de suivi non sensible ; B3 réservé à TOPAZE ; `/alertes` rangée
sous « Rappels » ; e-mails d'anniversaire désactivés par défaut (mentionner l'opposition dans
l'information RGPD) ; export de l'annuaire réservé à TOPAZE ; purge en mode manuel ; registre RGPD
et texte d'information **à faire valider par le DPO**. Décisions d'architecture : ADR-049 à
ADR-063 dans `docs/decisions.md`.

## 6. Ce qui reste à faire (pour un prochain prompt)

- **Étape 15** : un parcours e2e d'un seul tenant « candidat → NIVOL » et « mineur » (aujourd'hui
  par segments) ; CSP avec nonce par requête ; audit au lecteur d'écran (NVDA/VoiceOver) ;
  relecture des messages d'erreur et états vides des étapes 1 à 10 ; vérifier la CI verte.
- **Étapes 8 à 14** : rien de bloquant. À surveiller : un test axe de la page 403 sur mobile a
  échoué une fois (`html-has-lang`) puis passé à chaque essai.
- **Hors périmètre de la nuit** : VPS, Docker de production, cron système, sauvegardes hors
  serveur automatisées, Brevo et S3 réels.

## 7. Tests e2e non exécutés

Aucun test n'est marqué `skip` dans le code pour raison d'environnement. Les « ignorés » (47) sont
les tests réservés à un format d'écran (bureau ou 390 px) qui ne tournent pas dans l'autre
projet, comme avant cette nuit. Non écrits (donc non exécutés) : les parcours continus
« candidat → NIVOL » et « mineur » de l'étape 15 (couverts par segments).
