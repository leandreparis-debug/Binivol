import type { Metadata } from "next";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { PROFILE_LABELS } from "@/lib/labels";
import { requireActor } from "@/server/auth/actor";
import { allowedActions } from "@/server/policy/describe";
import { PROFILE_ORDER } from "@/server/services/accounts";

export const metadata: Metadata = { title: "Mon compte" };

/** My account, my profiles and what the policy allows me (generated). */
export default async function MyAccountPage() {
  const actor = await requireActor();
  const profiles = PROFILE_ORDER.filter((p) => actor.profiles.has(p));
  const actions = allowedActions(actor);
  return (
    <>
      <PageHeader
        title="Mon compte"
        subtitle="Vos profils et ce qu'ils vous permettent de faire dans Binivol."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3">
              <div>
                <dt className="text-small text-muted">Nom</dt>
                <dd className="text-body text-ink">{actor.name}</dd>
              </div>
              <div>
                <dt className="text-small text-muted">Adresse e-mail</dt>
                <dd className="text-body break-all text-ink">{actor.email}</dd>
              </div>
              <div>
                <dt className="text-small text-muted">Profils</dt>
                <dd>
                  <ul className="mt-1 flex flex-col gap-2" aria-label="Mes profils">
                    {profiles.map((profile) => (
                      <li key={profile} className="flex flex-wrap items-center gap-2">
                        <Chip tone="ink">{profile.replace("_", " ")}</Chip>
                        <span className="text-small text-muted">
                          {PROFILE_LABELS[profile].split(" · ")[1]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-col items-start gap-1">
            <CardTitle>Ce que je peux faire</CardTitle>
            <p className="text-small text-muted">Liste générée depuis la politique d'accès.</p>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-line" data-testid="allowed-actions">
              {actions.map((item) => (
                <li
                  key={item.action}
                  className="flex items-start gap-3 py-3"
                  data-action={item.action}
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-pill bg-ok-soft text-ok-ink"
                  >
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-body text-ink">{item.label}</span>
                    <span className="text-small text-muted">{item.condition}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
