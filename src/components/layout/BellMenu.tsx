"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bell, CheckCheck, ListChecks } from "lucide-react";
import {
  markAllReadAction,
  markReadAction,
  recentNotificationsAction,
} from "@/app/(app)/rappels/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { IconButton } from "@/components/ui/IconButton";
import { formatRelative } from "@/lib/dates";
import type { NotificationView } from "@/server/services/notifications";

/**
 * The bell of the top bar (step 12): unread count, a panel with the latest
 * reminders (loaded when opened), « Tout marquer comme lu » and a link to
 * /rappels.
 */
export function BellMenu({ unread }: { unread: number }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const badge = unread > 9 ? "9+" : String(unread);

  const load = () => {
    startTransition(async () => {
      const result = await recentNotificationsAction({});
      if (result.ok) {
        setItems(result.data);
        setFailed(false);
      } else setFailed(true);
    });
  };

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) load();
      }}
    >
      <DropdownMenuTrigger asChild>
        <IconButton
          aria-label={`Notifications, ${String(unread)} non lue${unread > 1 ? "s" : ""}`}
          variant="outline"
          data-testid="bell"
        >
          <Bell className="size-5" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-1 text-[11px] font-semibold text-white tabular-nums"
            >
              {badge}
            </span>
          )}
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>
          {unread > 0
            ? `${String(unread)} rappel${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`
            : "Aucun rappel non lu"}
        </DropdownMenuLabel>
        {failed && (
          <p role="alert" className="px-3 py-2 text-small text-danger-ink">
            Les rappels n&apos;ont pas pu être chargés.
          </p>
        )}
        {items === null && !failed && (
          <p className="px-3 py-2 text-small text-muted">{pending ? "Chargement…" : ""}</p>
        )}
        {items?.length === 0 && <p className="px-3 py-2 text-small text-muted">Aucun rappel.</p>}
        {items?.map((n) => (
          <DropdownMenuItem key={n.id} asChild>
            <Link
              href={n.href ?? "/rappels"}
              onClick={() => {
                if (!n.read) void markReadAction({ id: n.id });
              }}
              className="flex-col items-start gap-0.5 py-2"
            >
              <span
                className={n.read ? "text-small text-ink-2" : "text-small font-semibold text-ink"}
              >
                {n.read ? "" : <span className="sr-only">Non lu : </span>}
                {n.title}
              </span>
              <span className="text-[12px] text-muted">{formatRelative(n.createdAt)}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {unread > 0 && (
          <DropdownMenuItem
            disabled={pending}
            onSelect={(event) => {
              event.preventDefault();
              startTransition(async () => {
                await markAllReadAction({});
                setItems((list) => list?.map((n) => ({ ...n, read: true })) ?? null);
                router.refresh();
              });
            }}
          >
            <CheckCheck />
            Tout marquer comme lu
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link href="/rappels">
            <ListChecks />
            Voir tous les rappels
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
