import type { DbOrTx } from "../db";
import { dossierSettings } from "../settings";

/** Text of the public privacy page (step 14): `RGPD_NOTICE` and `UL_CONTACT_EMAIL`. */
export async function privacyPage(
  db: DbOrTx,
): Promise<{ text: string; contactEmail: string | null }> {
  const [{ rgpdNotice }, contact] = await Promise.all([
    dossierSettings(db),
    db.setting.findUnique({ where: { key: "UL_CONTACT_EMAIL" } }),
  ]);
  const email =
    typeof contact?.value === "string" && contact.value.includes("@") ? contact.value : null;
  return { text: rgpdNotice, contactEmail: email };
}
