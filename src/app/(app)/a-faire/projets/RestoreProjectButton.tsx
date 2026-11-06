"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { restoreProjectAction } from "../actions";

/** Restores an archived project (OWNER, 30 days). */
export function RestoreProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      leftIcon={<RotateCcw />}
      loading={pending}
      onClick={() => {
        startTransition(async () => {
          await restoreProjectAction({ projectId });
          router.refresh();
        });
      }}
    >
      Restaurer
    </Button>
  );
}
