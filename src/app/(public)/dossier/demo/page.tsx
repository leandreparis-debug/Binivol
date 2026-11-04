import type { Metadata } from "next";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { ProgressBar } from "@/components/ui/ProgressBar";

export const metadata: Metadata = { title: "Dossier de candidature (démo)" };

/**
 * Demo of the candidate form on a phone. No data is saved. Replaced at step 7.
 */
export default function DossierDemoPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-title text-ink">Votre dossier</h1>
        <FakeDataBanner>Démo</FakeDataBanner>
      </div>
      <ProgressBar
        value={1}
        max={3}
        label="Avancement du dossier"
        valueText="Étape 1 sur 3"
        showValue
      />
      <Card>
        <CardHeader>
          <CardTitle>Vos coordonnées</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" action="#" method="get">
            <Field label="Prénom" required>
              <Input name="firstName" autoComplete="given-name" placeholder="Camille" />
            </Field>
            <Field label="Nom" required>
              <Input name="lastName" autoComplete="family-name" placeholder="Durand" />
            </Field>
            <Field label="Activité souhaitée" hint="Vous pourrez changer d'avis plus tard.">
              <Select name="activity" defaultValue="">
                <option value="" disabled>
                  Choisir…
                </option>
                <option value="secours">Postes de secours</option>
                <option value="urgence">Urgence</option>
                <option value="formation">Formation</option>
              </Select>
            </Field>
            <Button type="submit" size="lg" className="mt-2 w-full">
              Continuer
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
