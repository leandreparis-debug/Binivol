import { BottomNav } from "./BottomNav";
import { SessionKeepAlive } from "./SessionKeepAlive";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";
import type { ShellProps } from "./types";

export interface AppShellProps extends ShellProps {
  children: React.ReactNode;
}

/**
 * Canvas background; side navigation (sidebar from 1024 px, rail from
 * 640 px) or bottom navigation on a phone; top bar and the 1440 px content.
 */
export function AppShell({ children, ...shell }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SideNav allowedHrefs={shell.allowedHrefs} navBadges={shell.navBadges} />
      <div className="flex min-h-dvh flex-col sm:pl-20 lg:pl-60">
        <TopBar {...shell} />
        <main
          id="contenu"
          className="mx-auto w-full max-w-app flex-1 px-gutter py-6 pb-24 sm:px-6 sm:pb-8"
        >
          {children}
        </main>
      </div>
      <BottomNav allowedHrefs={shell.allowedHrefs} navBadges={shell.navBadges} />
      <SessionKeepAlive />
    </div>
  );
}
