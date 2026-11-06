"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { markAllReadAction } from "./actions";

/** « Tout marquer comme lu » on /rappels. */
export function MarkAllRead() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      leftIcon={<CheckCheck aria-hidden="true" />}
      onClick={() => {
        startTransition(async () => {
          await markAllReadAction({});
          router.refresh();
        });
      }}
    >
      Tout marquer comme lu
    </Button>
  );
}
