import type { Metadata } from "next";
import { OpenLink } from "@/components/dossier/OpenLink";
import { openDossierLinkAction } from "../actions";

export const metadata: Metadata = {
  title: "Ouverture du dossier",
  robots: { index: false, follow: false },
};

/**
 * Opening of a dossier link `/dossier/ouvrir#<token>`. The token is in the
 * fragment: the browser never sends it with this request. The page reads it,
 * clears it from the address, and posts it to the exchange action (ADR-043).
 */
export default function OpenDossierPage() {
  return <OpenLink exchange={openDossierLinkAction} />;
}
