/**
 * Sign-in identifier rule (ADR-070), shared by the server and the forms.
 * Same rule as the CHECK `users_username_format`.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,39}$/;

export const USERNAME_HINT =
  "3 à 40 caractères : lettres minuscules sans accent, chiffres, point, tiret ou tiret bas.";
