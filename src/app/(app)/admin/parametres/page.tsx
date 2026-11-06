import type { Metadata } from "next";
import Link from "next/link";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getEnv } from "@/lib/env";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { PARAMETER_THEME_LABELS, PARAMETER_THEMES, PARAMETERS } from "@/server/parameters";
import { parametersOverview } from "@/server/services/parameters";
import { ParameterForm } from "./ParameterForm";

export const metadata: Metadata = { title: "Paramètres de l'UL" };
export const dynamic = "force-dynamic";

const LINK =
  "inline-flex min-h-11 items-center text-body text-ink underline underline-offset-4 focus-ring";

/** Paramètres de l'UL (step 14, TOPAZE): every setting, by theme. */
export default async function ParametersPage() {
  const actor = await requirePageAccess("setting.manage");
  const values = await parametersOverview(getDb(), actor);
  return (
    <>
      <PageHeader
        title="Paramètres de l'UL"
        subtitle="Chaque modification est validée et tracée dans le journal d'audit."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {PARAMETER_THEMES.map((theme) => (
          <Card key={theme} className={theme === "emails" ? "xl:col-span-2" : undefined}>
            <CardHeader>
              <CardTitle as="h2">{PARAMETER_THEME_LABELS[theme]}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {PARAMETERS.filter((p) => p.theme === theme).map((def) => (
                <ParameterForm key={def.key} def={def} value={values[def.key] ?? ""} />
              ))}
              {theme === "emails" && (
                <Link href="/admin/reglages" className={LINK}>
                  Récapitulatif, prévenance Urgence et e-mails d&apos;anniversaire : Réglages
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle as="h2">Référentiel</CardTitle>
          </CardHeader>
          <CardContent>
            <Link href="/formations/referentiel" className={LINK}>
              Modifier le référentiel des formations et fonctions
            </Link>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
