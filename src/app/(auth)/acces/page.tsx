import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { AccessLinkForm } from "./AccessLinkForm";

export const metadata: Metadata = {
  title: "Accès à Binivol",
  robots: { index: false, follow: false },
};

/**
 * Invitation and new-password link `/acces#<token>` (ADR-070). The token is in
 * the fragment: the browser never sends it with this request. The form reads
 * it, clears it from the address and posts it to the actions.
 */
export default function AccessLinkPage() {
  return (
    <div className="w-full max-w-md rounded-card bg-surface p-6 sm:p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo size={34} />
        <h1 className="text-title text-ink">Accès à Binivol</h1>
      </div>
      <div className="mt-6">
        <AccessLinkForm />
      </div>
      <p className="mt-8 flex items-center justify-center gap-2 border-t border-line pt-4 text-small text-muted">
        <Lock aria-hidden="true" className="size-4" />
        Données confidentielles (C3)
      </p>
    </div>
  );
}
