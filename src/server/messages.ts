/** Messages shared by modules that must stay free of the database driver (edge-safe). */
export const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL est absente : l'application ne peut pas joindre PostgreSQL. " +
  "Renseigne-la dans .env (voir .env.example et la section « Base de données » du README).";

/** Import refused on a hosted demo (ADR-035): its database holds fictitious data only. */
export const IMPORT_DISABLED_MESSAGE =
  "Import désactivé sur ce déploiement de démonstration : sa base ne contient que des données fictives, et aucun vrai classeur ne doit y être déposé.";
