"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { ActionResult } from "@/server/actions/defineAction";

/**
 * Reads the token from the address fragment, removes it from the address bar
 * and the history (`history.replaceState`) before anything else, sends it in
 * the body of a POST (Server Action), then goes to the form or to the neutral
 * page.
 */
export function OpenLink({
  exchange,
}: {
  exchange: (input: { token: string }) => Promise<ActionResult<{ ok: boolean }>>;
}) {
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    if (!token) {
      router.replace("/dossier/lien-invalide");
      return;
    }
    exchange({ token })
      .then((result) => {
        router.replace(result.ok && result.data.ok ? "/dossier" : "/dossier/lien-invalide");
      })
      .catch(() => {
        router.replace("/dossier/lien-invalide");
      });
  }, [exchange, router]);
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center" role="status">
      <Spinner />
      <p className="text-body text-ink-2">Ouverture de votre dossier…</p>
      <noscript>
        <p className="text-body text-ink">
          Activez JavaScript dans votre navigateur pour ouvrir votre dossier.
        </p>
      </noscript>
    </div>
  );
}
