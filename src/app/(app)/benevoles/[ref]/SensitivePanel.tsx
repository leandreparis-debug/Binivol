"use client";

import { useState, useTransition } from "react";
import { Eye, Lock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { B3_STATUS_LABELS, CIVILITY_LABELS } from "@/lib/labels";
import { formatPhone } from "@/lib/phone";
import { revealSensitiveAction } from "./actions";

type Revealed = Extract<Awaited<ReturnType<typeof revealSensitiveAction>>, { ok: true }>["data"];

const unknown = <span className="text-muted">Non renseigné</span>;
const day = (iso: string | null) => (iso ? formatDate(new Date(`${iso}T00:00:00.000Z`)) : null);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-[14rem_1fr] sm:gap-4">
      <dt className="text-small text-muted">{label}</dt>
      <dd className="text-body text-ink">{children ?? unknown}</dd>
    </div>
  );
}

/**
 * Sensitive block, folded. Nothing sensitive is in the page as rendered by
 * the server: the button calls a Server Action that checks
 * `person.sensitive.read` and writes the access log.
 */
export function SensitivePanel({ personId }: { personId: string }) {
  const [data, setData] = useState<Revealed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reveal = () => {
    startTransition(async () => {
      const result = await revealSensitiveAction({ personId });
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else setError(result.error);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2">
          <Lock aria-hidden="true" className="size-4" /> Données sensibles
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!data ? (
          <>
            <p className="text-body text-ink-2">
              Naissance, adresse, personnes à prévenir, B3 et autorisation parentale.
            </p>
            <div>
              <Button
                variant="outline"
                onClick={reveal}
                loading={pending}
                leftIcon={<Eye aria-hidden="true" />}
              >
                Afficher les données sensibles
              </Button>
            </div>
            <p className="text-small text-muted">Cette consultation est enregistrée.</p>
            {error && (
              <p role="alert" className="text-small font-medium text-danger-ink">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <p role="status" className="text-small font-medium text-ink-2">
              Cette consultation est enregistrée.
            </p>
            <dl className="flex flex-col gap-3">
              <Row label="Date de naissance">
                {data.birthDate && (
                  <span className="font-mono text-mono">{day(data.birthDate)}</span>
                )}
              </Row>
              <Row label="Lieu de naissance">
                {[data.birthCity, data.birthDepartment, data.birthCountry]
                  .filter(Boolean)
                  .join(", ") || null}
              </Row>
              <Row label="Adresse">
                {[
                  data.street,
                  data.addressComplement,
                  [data.postalCode, data.city].filter(Boolean).join(" "),
                  data.country,
                ]
                  .filter(Boolean)
                  .join(", ") || null}
              </Row>
              <Row label="B3">
                {data.b3Status || data.b3CheckedAt
                  ? [
                      data.b3Status
                        ? B3_STATUS_LABELS[data.b3Status as keyof typeof B3_STATUS_LABELS]
                        : null,
                      data.b3CheckedAt ? `vérifié le ${day(data.b3CheckedAt) ?? ""}` : null,
                      data.b3Restricted ? "issue réservée à TOPAZE" : null,
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : null}
              </Row>
              <Row label="Autorisation parentale">
                {data.parentalAuthorization === null
                  ? null
                  : data.parentalAuthorization
                    ? `Oui${data.parentalAuthorizationDate ? `, le ${day(data.parentalAuthorizationDate) ?? ""}` : ""}`
                    : "Non"}
              </Row>
              <Row label="Personnes à prévenir">
                {data.emergencyContacts.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {data.emergencyContacts.map((c) => (
                      <li key={c.id}>
                        <span className="font-medium">
                          {[
                            c.civility
                              ? CIVILITY_LABELS[c.civility as keyof typeof CIVILITY_LABELS]
                              : null,
                            c.firstName,
                            c.lastName,
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                        {c.relationship && <span className="text-muted"> ({c.relationship})</span>}
                        <span className="block font-mono text-mono text-ink-2">
                          {[c.phone1, c.phone2]
                            .filter(Boolean)
                            .map((p) => formatPhone(p))
                            .join(" · ")}
                        </span>
                        {c.email && <span className="block text-small text-ink-2">{c.email}</span>}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Row>
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
