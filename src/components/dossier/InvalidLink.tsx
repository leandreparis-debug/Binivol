import { Card, CardContent } from "@/components/ui/Card";

/**
 * The single page of a refused dossier link (unknown, expired, revoked,
 * used) or an expired session: it never says which.
 */
export function InvalidLink() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-6">
        <h1 className="text-title text-ink">Ce lien n&apos;est plus valable.</h1>
        <p className="text-body text-ink-2">Contactez l&apos;unité locale.</p>
        <p className="text-small text-muted">
          Si votre session a expiré, rouvrez le lien reçu par e-mail : vos réponses sont
          enregistrées. Si le lien ne fonctionne plus, l&apos;unité locale peut vous en envoyer un
          nouveau.
        </p>
      </CardContent>
    </Card>
  );
}
