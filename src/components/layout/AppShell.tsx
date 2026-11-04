import type { DevUser } from "@/lib/dev-user";
import { BottomNav } from "./BottomNav";
import { TopBar } from "./TopBar";

export interface AppShellProps {
  user: DevUser;
  children: React.ReactNode;
}

/**
 * Canvas background, 1440 px container, top bar and mobile bottom navigation.
 */
export function AppShell({ user, children }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <TopBar user={user} notificationCount={3} />
      <main
        id="contenu"
        className="mx-auto w-full max-w-app flex-1 px-gutter py-6 pb-24 sm:px-6 sm:pb-8"
      >
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
