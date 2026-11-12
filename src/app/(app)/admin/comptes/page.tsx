import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listAccounts } from "@/server/services/accounts";
import { AccountsManager } from "./AccountsManager";

export const metadata: Metadata = { title: "Comptes" };

/** TOPAZE: invitations, access links, profiles, activation. Accounts are never deleted. */
export default async function AccountsPage() {
  const actor = await requirePageAccess("user.manage");
  const accounts = await listAccounts(getDb());
  return (
    <>
      <PageHeader
        title="Comptes"
        subtitle="Les responsables qui peuvent se connecter à Binivol, et leurs profils."
      />
      <AccountsManager
        currentUserId={actor.userId}
        accounts={accounts.map((a) => ({
          ...a,
          lastLoginAt: a.lastLoginAt?.toISOString() ?? null,
        }))}
      />
    </>
  );
}
