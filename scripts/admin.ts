/**
 * Account administration from the command line, for the very first TOPAZE
 * account and for recovery (ADR-070).
 *
 *   pnpm admin:grant <email> <PROFIL...> [--name "Prénom Nom"] [--username identifiant]
 *   pnpm admin:revoke <email>
 *
 * `grant` creates the account if needed, sets exactly these profiles,
 * activates it and prints a single-use access link: an invitation while no
 * password is set, a new-password link afterwards. The link is built on
 * APP_URL (or AUTH_URL) and is printed only on the terminal.
 *
 * Reads DIRECT_URL (or DATABASE_URL). Entries are audited with actorLabel
 * « CLI ». The last-TOPAZE guards apply.
 */
import "dotenv/config";
import { Profile } from "../src/generated/prisma/enums";
import { getEnv } from "../src/lib/env";
import { formatDateTime } from "../src/lib/dates";
import { createDb } from "../src/server/db";
import { DomainError } from "../src/server/errors";
import { issueAccessLink } from "../src/server/services/accountAccess";
import { grantAccount, revokeAccount } from "../src/server/services/accounts";

const PROFILES = Object.values(Profile);
const USAGE =
  'Usage : pnpm admin:grant <email> <PROFIL...> [--name "Nom"] [--username identifiant] | pnpm admin:revoke <email>';

/** Extracts `--flag value` options; the rest are positional arguments. */
function parseArgs(argv: string[]) {
  const [command, email, ...rest] = argv;
  const options: Record<string, string | undefined> = {};
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i] ?? "";
    if (arg === "--name" || arg === "--username") {
      options[arg.slice(2)] = rest[i + 1];
      i++;
    } else {
      positional.push(arg);
    }
  }
  const profiles = positional.map((p) => p.toUpperCase().replace("-", "_"));
  return { command, email, name: options.name, username: options.username, profiles };
}

async function main(): Promise<void> {
  const { command, email, name, username, profiles } = parseArgs(process.argv.slice(2));
  if (!email || (command !== "grant" && command !== "revoke")) throw new Error(USAGE);
  const unknown = profiles.filter((p) => !(PROFILES as string[]).includes(p));
  if (unknown.length > 0)
    throw new Error(`Profil inconnu : ${unknown.join(", ")}. Profils : ${PROFILES.join(", ")}.`);

  const env = getEnv();
  const url = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL ou DATABASE_URL est absente (voir .env.example).");
  const actor = { userId: null, label: "CLI" };
  const db = createDb(url);
  try {
    if (command === "grant") {
      if (profiles.length === 0) throw new Error(USAGE);
      const baseUrl = env.APP_URL ?? env.AUTH_URL;
      if (!baseUrl) {
        throw new Error("APP_URL (ou AUTH_URL) est absente : impossible de construire le lien.");
      }
      const { account, created } = await grantAccount(db, actor, {
        email,
        profiles: profiles as Profile[],
        name,
        username,
      });
      const link = await issueAccessLink(db, actor, account.id, {
        baseUrl: new URL(baseUrl).origin,
        mail: null,
      });
      process.stdout.write(
        [
          `${created ? "Compte créé" : "Compte mis à jour"} : ${account.email} (${account.profiles.join(", ")}), actif.`,
          `Identifiant : ${account.username ?? "à choisir en ouvrant le lien"}.`,
          link.purpose === "INVITE"
            ? "Lien d'invitation (usage unique) :"
            : "Lien de nouveau mot de passe (usage unique ; l'ancien mot de passe reste valable jusqu'à son utilisation) :",
          link.url,
          `Valable jusqu'au ${formatDateTime(link.expiresAt)}. Ne le collez ni dans un ticket ni dans une conversation.`,
          "",
        ].join("\n"),
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
