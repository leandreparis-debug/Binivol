import { BottomNav } from "./BottomNav";
import { SessionKeepAlive } from "./SessionKeepAlive";
import { TopBar } from "./TopBar";
import type { ShellProps } from "./types";

export interface AppShellProps extends ShellProps {
  children: React.ReactNode;
}

/**
 * Canvas background, 1440 px container, top bar and mobile bottom navigation.
 */
export function AppShell({ children, ...shell }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <TopBar {...shell} />
      <main
        id="contenu"
        className="mx-auto w-full max-w-app flex-1 px-gutter py-6 pb-24 sm:px-6 sm:pb-8"
      >
        {children}
      </main>
      <BottomNav allowedHrefs={shell.allowedHrefs} navBadges={shell.navBadges} />
      <SessionKeepAlive />
    </div>
  );
}
