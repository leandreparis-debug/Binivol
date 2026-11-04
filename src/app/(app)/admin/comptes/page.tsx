import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { getEnv } from "@/lib/env";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listAccounts } from "@/server/services/accounts";
import { AccountsManager } from "./AccountsManager";

export const metadata: Metadata = { title: "Comptes" };

/** TOPAZE: accounts, profiles, activation. Accounts are never deleted. */
export default async function AccountsPage() {
  const actor = await requirePageAccess("user.manage");
  const accounts = await listAccounts(getDb());
  const env = getEnv();
  const domains = [env.AUTH_ALLOWED_DOMAIN, ...(env.AUTH_DEMO_LOGIN ? ["binivol.test"] : [])];
  return (
    <>
      <PageHeader
        title="Comptes"
        subtitle="Les responsables qui peuvent se connecter à Binivol, et leurs profils."
      />
      <AccountsManager
        currentUserId={actor.userId}
        domains={domains}
        accounts={accounts.map((a) => ({
          ...a,
          lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
