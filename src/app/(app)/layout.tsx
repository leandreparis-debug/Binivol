import { AppShell } from "@/components/layout/AppShell";
import { NAV_ITEMS, type NavHref } from "@/components/layout/navigation";
import { getEnv } from "@/lib/env";
import { requireActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { canSome } from "@/server/policy/can";
import { PROFILE_ORDER } from "@/server/services/accounts";
import { overdueCandidacies } from "@/server/services/candidacies";
import { countUnreadNotifications } from "@/server/services/notifications";

/** Every page of the app requires a signed-in responsible (profiles re-read). */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireActor();
  const allowedHrefs: NavHref[] = NAV_ITEMS.filter(
    (item) => item.action === null || canSome(actor, item.action),
  ).map((item) => item.href);
  const [unreadNotifications, overdue] = await Promise.all([
    countUnreadNotifications(getDb(), actor.userId),
    canSome(actor, "candidacy.manage") ? overdueCandidacies(getDb(), actor) : Promise.resolve(0),
  ]);
  return (
    <AppShell
      user={{
        name: actor.name,
        email: actor.email,
        profiles: PROFILE_ORDER.filter((p) => actor.profiles.has(p)),
        canManageAccounts: canSome(actor, "user.manage"),
        canImport: canSome(actor, "import.run"),
        canReadMailLog: getEnv().MAIL_DRIVER === "log" && canSome(actor, "mail.log.read"),
        canManageSettings: canSome(actor, "setting.manage"),
        canExport: canSome(actor, "person.export"),
        canReadLogs: canSome(actor, "audit.read"),
        canPurge: canSome(actor, "person.purge"),
      }}
      allowedHrefs={allowedHrefs}
      unreadNotifications={unreadNotifications}
      navBadges={{ "/candidats": overdue }}
    >
      {children}
    </AppShell>
  );
}
