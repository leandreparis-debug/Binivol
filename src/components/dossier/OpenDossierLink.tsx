"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import type { ActionResult } from "@/server/actions/defineAction";
import { InvalidLink } from "./InvalidLink";

export interface OpenDossierLinkProps {
  /** Public action: checks the token, sets the dossier cookie. */
  open: (input: { token: string }) => Promise<ActionResult<{ opened: boolean }>>;
}

/**
 * Reads the token from the fragment (`#…`), removes it from the address
 * (`history.replaceState`) before anything else, then posts it to the
 * exchange action. On success the browser goes to `/dossier`; otherwise the
 * neutral page is shown, whatever the reason.
 */
export function OpenDossierLink({ open }: OpenDossierLinkProps) {
  const [refused, setRefused] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.replace(/^#/, "");
    // After the router's own mount effects (a parent effect runs after this one and
    // rewrites the address it knows, fragment included): then the fragment goes.
    const timer = window.setTimeout(() => {
      window.history.replaceState(window.history.state, "", window.location.pathname);
      if (token === "") {
        setRefused(true);
        return;
      }
      // Both outcomes leave this page by a real navigation: the router can no
      // longer put the fragment back in the address.
      void open({ token })
        .then((result) => {
          window.location.replace(
            result.ok && result.data.opened ? "/dossier" : "/dossier/lien-invalide",
          );
        })
        .catch(() => {
          setRefused(true);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [open]);

  if (refused) return <InvalidLink />;
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-6" role="status">
        <Spinner aria-hidden />
        <p className="text-body text-ink-2">Ouverture de votre dossier…</p>
      </CardContent>
    </Card>
  );
}
