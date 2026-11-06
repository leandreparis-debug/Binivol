import type { Metadata } from "next";
import { getDb } from "@/server/db";
import { privacyPage } from "@/server/services/privacy";

export const metadata: Metadata = { title: "Confidentialité" };
export const dynamic = "force-dynamic";

/**
 * Public page (step 14): how the UL handles the data of candidates and
 * volunteers. The text is the `RGPD_NOTICE` setting (a draft until the DPO
 * validates it, which the text itself says).
 */
export default async function PrivacyPage() {
  const { text, contactEmail } = await privacyPage(getDb());
  return (
    <article className="flex flex-col gap-4">
      <h1 className="text-title text-ink">Confidentialité et données personnelles</h1>
      {text.split(/\n{2,}/).map((paragraph, i) => (
        <p key={i} className="text-body whitespace-pre-line text-ink-2">
          {paragraph}
        </p>
      ))}
      {contactEmail && (
        <p className="text-body text-ink-2">
          Pour exercer vos droits (accès, rectification, opposition, effacement) :{" "}
          <a href={`mailto:${contactEmail}`} className="text-ink underline underline-offset-4">
            {contactEmail}
          </a>
          .
        </p>
      )}
    </article>
  );
}
