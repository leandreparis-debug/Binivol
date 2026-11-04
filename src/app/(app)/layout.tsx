import { AppShell } from "@/components/layout/AppShell";
import { NAV_ITEMS, type NavHref } from "@/components/layout/navigation";
import { requireActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { canSome } from "@/server/policy/can";
import { PROFILE_ORDER } from "@/server/services/accounts";
import { countUnreadNotifications } from "@/server/services/notifications";

/** Every page of the app requires a signed-in responsible (profiles re-read). */
export default async function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const actor = await requireActor();
  const allowedHrefs: NavHref[] = NAV_ITEMS.filter(
    (item) => item.action === null || canSome(actor, item.action),
  ).map((item) => item.href);
  const unreadNotifications = await countUnreadNotifications(getDb(), actor.userId);
  return (
    <AppShell
      user={{
        name: actor.name,
        email: actor.email,
        profiles: PROFILE_ORDER.filter((p) => actor.profiles.has(p)),
        canManageAccounts: canSome(actor, "user.manage"),
      }}
      allowedHrefs={allowedHrefs}
      unreadNotifications={unreadNotifications}
    >
      {children}
    </AppShell>
  );
}
