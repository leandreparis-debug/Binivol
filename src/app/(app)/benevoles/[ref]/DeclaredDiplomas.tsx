"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { DiplomaProposal } from "@/server/services/declaredDiplomas";
import { openDeclaredQualificationAction } from "./actions";

/**
 * Formations tab: diplomas declared in the online dossier that match the
 * reference list. Opening the qualification « à vérifier dans Pegass » is
 * proposed, never automatic, to whoever holds `training.write`.
 */
export function DeclaredDiplomas({
  proposals,
  canWrite,
}: {
  proposals: DiplomaProposal[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Déclarés dans le dossier</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-small text-muted">
          Diplômes déclarés par la personne et connus du référentiel. Rien n&apos;est ouvert sans
          vous : vérifiez dans Pegass.
        </p>
        <ul className="flex flex-col divide-y divide-line">
          {proposals.map((p) => (
            <li
              key={p.diplomaId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="flex flex-col">
                <span className="text-body text-ink">{p.label}</span>
                <span className="text-small text-ink-2">
                  {[
                    p.year ? `Obtenu en ${String(p.year)}` : null,
                    p.issuer,
                    `Référentiel : ${p.reference.label}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {p.alreadyRecorded ? (
                <span className="text-small text-muted">Déjà dans la fiche</span>
              ) : (
                canWrite && (
                  <Button
                    variant="outline"
                    leftIcon={<ClipboardCheck />}
                    disabled={pending}
                    onClick={() => {
                      startTransition(async () => {
                        const result = await openDeclaredQualificationAction({
                          diplomaId: p.diplomaId,
                        });
                        if (!result.ok) setError(result.error);
                        else setError(null);
                        router.refresh();
                      });
                    }}
                  >
                    Ouvrir « à vérifier dans Pegass »
                  </Button>
                )
              )}
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="text-small font-medium text-danger-ink">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
