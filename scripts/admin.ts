/**
 * Account administration from the command line, for the very first TOPAZE
 * account and for recovery.
 *
 *   pnpm admin:grant <email> <PROFIL...> [--name "Prénom Nom"]
 *   pnpm admin:revoke <email>
 *
 * Reads DIRECT_URL (or DATABASE_URL). Entries are audited with actorLabel
 * « CLI ». Addresses must belong to AUTH_ALLOWED_DOMAIN, or to binivol.test
 * when the demo sign-in is enabled. The last-TOPAZE guards apply.
 */
import "dotenv/config";
import { Profile } from "../src/generated/prisma/enums";
import { getEnv, isDemoLoginEnabled } from "../src/lib/env";
import { createDb } from "../src/server/db";
import { DomainError } from "../src/server/errors";
import { grantAccount, revokeAccount } from "../src/server/services/accounts";

const PROFILES = Object.values(Profile);
const USAGE =
  'Usage : pnpm admin:grant <email> <PROFIL...> [--name "Nom"] | pnpm admin:revoke <email>';

function parseArgs(argv: string[]) {
  const [command, email, ...rest] = argv;
  const nameIndex = rest.indexOf("--name");
  const name = nameIndex >= 0 ? rest[nameIndex + 1] : undefined;
  const profiles = rest
    .filter((_, i) => nameIndex < 0 || (i !== nameIndex && i !== nameIndex + 1))
    .map((p) => p.toUpperCase().replace("-", "_"));
  return { command, email, name, profiles };
}

async function main(): Promise<void> {
  const { command, email, name, profiles } = parseArgs(process.argv.slice(2));
  if (!email || (command !== "grant" && command !== "revoke")) throw new Error(USAGE);
  const unknown = profiles.filter((p) => !(PROFILES as string[]).includes(p));
  if (unknown.length > 0)
    throw new Error(`Profil inconnu : ${unknown.join(", ")}. Profils : ${PROFILES.join(", ")}.`);

  const env = getEnv();
  const url = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL ou DATABASE_URL est absente (voir .env.example).");
  const allowedDomains = [
    env.AUTH_ALLOWED_DOMAIN,
    ...(isDemoLoginEnabled(env) ? ["binivol.test"] : []),
  ];
  const actor = { userId: null, label: "CLI" };
  const db = createDb(url);
  try {
    if (command === "grant") {
      if (profiles.length === 0) throw new Error(USAGE);
      const { account, created } = await grantAccount(
        db,
        actor,
        { email, profiles: profiles as Profile[], name },
        { allowedDomains },
      );
      process.stdout.write(
        `${created ? "Compte créé" : "Compte mis à jour"} : ${account.email} (${account.profiles.join(", ")}), actif.\n`,
      );
    } else {
      const account = await revokeAccount(db, actor, email);
      process.stdout.write(`Compte désactivé : ${account.email}. Ses sessions sont fermées.\n`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof DomainError || error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
