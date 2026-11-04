/** Messages shared by modules that must stay free of the database driver (edge-safe). */
export const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL est absente : l'application ne peut pas joindre PostgreSQL. " +
  "Renseigne-la dans .env (voir .env.example et la section « Base de données » du README).";
