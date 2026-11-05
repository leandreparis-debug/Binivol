import type { Metadata } from "next";
import { Mail } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDateTime } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listOutboundMails } from "@/server/services/outboundMails";

export const metadata: Metadata = { title: "Courriels" };
export const dynamic = "force-dynamic";

/** Text with its http(s) links clickable. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"]+)/g);
  return (
    <p className="text-small break-words whitespace-pre-line text-ink-2">
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} className="text-ink underline" data-testid="mail-link">
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

/**
 * TOPAZE: the e-mails kept by the `log` driver (tests and demo), instead of
 * being sent. Hidden when the `smtp` driver sends for real.
 */
export default async function OutboundMailsPage() {
  const actor = await requirePageAccess("mail.log.read");
  const env = getEnv();
  const mails = env.MAIL_DRIVER === "log" ? await listOutboundMails(getDb(), actor) : [];
  return (
    <>
      <PageHeader
        title="Courriels"
        subtitle="Les e-mails que Binivol aurait envoyés : ils sont consignés ici au lieu de partir (MAIL_DRIVER=log)."
        actions={env.AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      {env.MAIL_DRIVER !== "log" ? (
        <EmptyState
          icon={<Mail />}
          title="Les e-mails partent par SMTP"
          description="Rien n'est consigné ici quand MAIL_DRIVER=smtp."
        />
      ) : mails.length === 0 ? (
        <EmptyState
          icon={<Mail />}
          title="Aucun courriel"
          description="Rien n'a encore été envoyé."
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {mails.map((mail) => (
            <li key={mail.id}>
              <Card>
                <CardContent className="flex flex-col gap-2 pt-6">
                  <p className="text-small text-muted">
                    {formatDateTime(mail.createdAt)}
                    {mail.createdBy ? ` · par ${mail.createdBy}` : ""} · à {mail.to}
                  </p>
                  <h2 className="text-section text-ink">{mail.subject}</h2>
                  {mail.text === null ? (
                    <p className="text-small text-muted">
                      Contenu illisible (clé de chiffrement changée).
                    </p>
                  ) : (
                    <Linkified text={mail.text} />
                  )}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
