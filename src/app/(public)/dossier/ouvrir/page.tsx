import type { Metadata } from "next";
import { OpenDossierLink } from "@/components/dossier/OpenDossierLink";
import { openDossierAction } from "../actions";

export const metadata: Metadata = {
  title: "Ouverture de votre dossier",
  robots: { index: false, follow: false },
};

/**
 * Opening of a dossier link (`/dossier/ouvrir#<token>`, ADR-043). The token
 * is in the fragment: the browser never sends it with this request, so it
 * never reaches the server's or the host's access logs. The page reads it,
 * removes it from the address, then exchanges it for the dossier cookie by a
 * POST (`openDossierAction`).
 */
export default function OpenDossierPage() {
  return <OpenDossierLink open={openDossierAction} />;
}
