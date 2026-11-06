import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import type { GuideInline } from "@/lib/guideMarkdown";
import { requireActor } from "@/server/auth/actor";
import { guidesFor } from "@/server/services/guides";

export const metadata: Metadata = { title: "Aide" };
export const dynamic = "force-dynamic";

function Text({ parts }: { parts: GuideInline[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.bold ? (
          <strong key={i} className="font-semibold text-ink">
            {p.text}
          </strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** Aide (step 15): the guide of each profile of the signed-in responsible. */
export default async function HelpPage() {
  const actor = await requireActor();
  const guides = await guidesFor(actor.profiles);
  return (
    <>
      <PageHeader title="Aide" subtitle="Le guide de chacun de tes profils." />
      <div className="flex flex-col gap-6">
        {guides.map((g) => (
          <Card key={g.key}>
            <CardContent className="flex flex-col gap-3 pt-6 text-body text-ink-2">
              {g.blocks.map((b, i) => {
                if (b.type === "h1")
                  return (
                    <h2 key={i} className="text-section text-ink">
                      <Text parts={b.content} />
                    </h2>
                  );
                if (b.type === "h2")
                  return (
                    <h3 key={i} className="mt-2 text-body font-semibold text-ink">
                      <Text parts={b.content} />
                    </h3>
                  );
                if (b.type === "p")
                  return (
                    <p key={i}>
                      <Text parts={b.content} />
                    </p>
                  );
                if (!("items" in b)) return null;
                const List = b.type === "ul" ? "ul" : "ol";
                return (
                  <List
                    key={i}
                    className={b.type === "ul" ? "list-disc pl-6" : "list-decimal pl-6"}
                  >
                    {b.items.map((item, j) => (
                      <li key={j} className="py-0.5">
                        <Text parts={item} />
                      </li>
                    ))}
                  </List>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
