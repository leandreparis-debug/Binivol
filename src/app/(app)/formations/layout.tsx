import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { getEnv } from "@/lib/env";
import { requirePageAccess } from "@/server/auth/page";
import { canSome } from "@/server/policy/can";
import { FormationsNav } from "./FormationsNav";

/**
 * /formations (step 10): sessions, group entry, waiting lists, Trouver and
 * the reference list, as pills. Each page checks its own action.
 */
export default async function FormationsLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageAccess("training.read");
  const manage = canSome(actor, "trainingSession.manage");
  const items = [
    ...(manage
      ? [
          { href: "/formations/sessions", label: "Sessions" },
          { href: "/formations/saisie", label: "Saisie de groupe" },
          { href: "/formations/attente", label: "Listes d'attente" },
        ]
      : []),
    { href: "/formations/trouver", label: "Trouver" },
    ...(canSome(actor, "reference.manage")
      ? [{ href: "/formations/referentiel", label: "Référentiel" }]
      : []),
  ];
  return (
    <>
      <PageHeader
        title="Formations"
        subtitle="Sessions, résultats, listes d'attente et recherche d'équipe. Pegass fait foi pour les diplômes."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <FormationsNav items={items} />
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </>
  );
}
