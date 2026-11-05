import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { REFERENCE_CATEGORY_LABELS } from "@/lib/labels";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { referenceOptions } from "@/server/services/trainings";
import { ReferenceEditor } from "../TeamTools";

export const metadata: Metadata = { title: "Référentiel des formations" };
export const dynamic = "force-dynamic";

/** The reference list (TOPAZE, FORMAT): labels, validity, 31/12, minors, prerequisites, managedBy. */
export default async function ReferencePage() {
  await requirePageAccess("reference.manage");
  const items = await referenceOptions(getDb(), { includeInactive: true });
  const rule = (i: (typeof items)[number]) =>
    [
      i.validityMonths !== null ? `${String(i.validityMonths)} mois` : null,
      i.expiresEndOfYear ? "31/12" : null,
      i.forbiddenForMinors ? "interdit aux mineurs" : null,
      i.prerequisites.length > 0
        ? `prérequis : ${i.prerequisites.map((p) => p.code).join(", ")}`
        : null,
      i.managedBy.length > 0 ? `nommée par ${i.managedBy.join(", ")}` : null,
      i.active ? null : "inactive",
    ]
      .filter(Boolean)
      .join(" · ") || "sans échéance";
  return (
    <>
      {(["TRAINING", "FUNCTION"] as const).map((kind) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle as="h2">{kind === "TRAINING" ? "Formations" : "Fonctions"}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-line">
              {items
                .filter((i) => i.kind === kind)
                .map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="flex min-w-0 flex-col">
                      <span className="text-body text-ink">
                        {i.code} — {i.label}
                      </span>
                      <span className="text-small text-ink-2">
                        {REFERENCE_CATEGORY_LABELS[i.category]} · {rule(i)}
                      </span>
                    </span>
                    <ReferenceEditor item={i} all={items} />
                  </li>
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </>
  );
}
