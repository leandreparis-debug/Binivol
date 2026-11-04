# `src/server/` — couche d'accès aux données

Ce dossier est volontairement vide à l'étape 1. Il accueillera, à partir de l'étape 2 :

- `repositories/` : l'accès aux tables via Prisma (une classe ou un module par agrégat :
  `volunteerRepository`, `candidateRepository`, `trainingRepository`…). Aucune logique métier,
  uniquement des requêtes typées.
- `services/` : la logique métier (intégration d'un candidat, calcul des échéances, moteur de
  rappels…). Un service orchestre un ou plusieurs repositories et les interfaces techniques
  (`StorageService`, `MailService`).
- `interfaces/` : les contrats techniques portables (`StorageService` pour les fichiers,
  `MailService` pour les mails SMTP), avec une implémentation locale et une implémentation
  de production.

## Règle d'accès

**Les composants et les pages n'accèdent jamais directement à la base.** Un Server Component,
une Server Action ou un Route Handler appelle un service de `src/server/`, qui appelle un
repository, qui appelle Prisma. C'est la seule chaîne autorisée.

Conséquences :

- aucun `import` de `@prisma/client` en dehors de `src/server/` ;
- aucun SDK Supabase, aucune dépendance propre à Vercel dans ce dossier (PostgreSQL standard
  uniquement, pour rester portable vers un VPS) ;
- toute entrée est validée par Zod avant d'atteindre un service.
