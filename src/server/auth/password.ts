import { hash, verify } from "@node-rs/argon2";

/**
 * Password hashing (ADR-070): argon2id with the OWASP minimum parameters
 * (19 MiB, 2 iterations, 1 lane). The hash is a PHC string
 * (`$argon2id$v=19$m=19456,t=2,p=1$…`) that carries its own parameters, so
 * they can be raised later without invalidating the existing hashes.
 *
 * A password is never logged, stored in clear, nor returned to a client.
 */
export const ARGON2_OPTIONS = {
  // The algorithm is the library default, argon2id (`Algorithm` is a const
  // enum, not importable with isolatedModules); the tests check the prefix.
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** True when `password` matches `passwordHash`; false for a malformed hash. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

/**
 * Verifies against a throw-away hash, so that an unknown identifier takes
 * as long to refuse as a wrong password (no account enumeration by timing).
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("binivol-dummy-password-never-valid");
  await verifyPassword(await dummyHash, password);
}

/**
 * Password rules (NIST SP 800-63B): a length, no composition rule. Returns
 * the French reason of a refusal, or null.
 */
export function passwordProblem(password: string, username: string | null): string | null {
  const length = password.length;
  if (length < PASSWORD_MIN_LENGTH)
    return `Le mot de passe doit compter au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  if (length > PASSWORD_MAX_LENGTH)
    return `Le mot de passe doit compter au plus ${PASSWORD_MAX_LENGTH} caractères.`;
  if (password.trim() === "") return "Le mot de passe ne peut pas être fait que d'espaces.";
  if (username && password.toLowerCase().includes(username.toLowerCase()))
    return "Le mot de passe ne doit pas contenir l'identifiant.";
  if (new Set(password).size < 4) return "Ce mot de passe est trop simple.";
  return null;
}
