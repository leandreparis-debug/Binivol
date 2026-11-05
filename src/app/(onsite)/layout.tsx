import { BinivolLogo } from "@/components/brand/BinivolLogo";
import { requireActor } from "@/server/auth/actor";

/**
 * On-site mode: the candidate fills the dossier on the responsible's device.
 * No application navigation, no user menu: only the form and the way back.
 * The responsible's session stays the security (every action checks
 * `dossier.manage`).
 */
export default async function OnSiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireActor();
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex justify-center px-gutter py-5">
        <BinivolLogo size={28} />
      </header>
      <main id="contenu" className="mx-auto w-full max-w-lg flex-1 px-gutter pb-10">
        {children}
      </main>
    </div>
  );
}
