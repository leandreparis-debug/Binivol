import type { Metadata } from "next";
import { InvalidLink } from "@/components/dossier/InvalidLink";

export const metadata: Metadata = {
  title: "Lien non valable",
  robots: { index: false, follow: false },
};

/** Neutral page of a refused link (`/dossier/[token]` redirects here). */
export default function InvalidLinkPage() {
  return <InvalidLink />;
}
