"use client";

import Link from "next/link";
import { Info, Mail, Phone } from "lucide-react";
import type { PersonStatus } from "@/generated/prisma/enums";
import { DeadlineDot } from "@/components/person/DeadlineDot";
import { QualificationPills } from "@/components/person/QualificationPills";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusDot } from "@/components/ui/StatusDot";
import type { DeadlineClass } from "@/lib/deadlines";
import { formatPhone, phoneHref } from "@/lib/phone";
import { toVolunteerStatus } from "@/lib/status";

/** A directory line as sent to the client (only what the actor may see). */
export interface DirectoryItem extends Record<string, unknown> {
  id: string;
  ref: string;
  nivol: string | null;
  name: string;
  status: PersonStatus;
  email: string | null;
  phone: string | null;
  archived: boolean;
  canOpen: boolean;
  training: {
    qualifications: string[];
    extra: number;
    next: { code: string; expiresAt: Date; deadline: DeadlineClass } | null;
  } | null;
}

const NO_ACCESS = "Fiche non accessible : cette personne ne relève pas de vos profils.";

function NameCell({ item }: { item: DirectoryItem }) {
  if (item.canOpen) {
    return (
      <Link
        href={`/benevoles/${item.ref}`}
        className="inline-flex min-h-11 items-center rounded-inner font-medium text-ink underline-offset-4 focus-ring hover:underline"
      >
        {item.name}
      </Link>
    );
  }
  const tipId = `tip-${item.id}`;
  return (
    <span className="group relative inline-flex min-h-11 items-center gap-1.5">
      <span>{item.name}</span>
      <span
        tabIndex={0}
        aria-describedby={tipId}
        className="inline-flex size-11 items-center justify-center rounded-pill text-muted focus-ring"
      >
        <Info aria-hidden="true" className="size-4" />
        <span className="sr-only">Pourquoi pas de fiche ?</span>
      </span>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none absolute top-full left-0 z-10 hidden w-64 rounded-inner bg-ink px-3 py-2 text-small text-white shadow-pop group-focus-within:block group-hover:block"
      >
        {NO_ACCESS}
      </span>
    </span>
  );
}

function ContactCell({ item }: { item: DirectoryItem }) {
  return (
    <span className="flex flex-col gap-0.5">
      {item.email && (
        <a
          href={`mailto:${item.email}`}
          className="inline-flex min-h-6 items-center gap-1.5 text-small text-ink-2 hover:underline"
        >
          <Mail aria-hidden="true" className="size-3.5" />
          {item.email}
        </a>
      )}
      {item.phone && (
        <a
          href={phoneHref(item.phone)}
          className="inline-flex min-h-6 items-center gap-1.5 font-mono text-mono text-ink-2 hover:underline"
        >
          <Phone aria-hidden="true" className="size-3.5" />
          {formatPhone(item.phone)}
        </a>
      )}
      {!item.email && !item.phone && <span className="text-small text-muted">—</span>}
    </span>
  );
}

export function DirectoryList({
  items,
  showTraining,
}: {
  items: DirectoryItem[];
  showTraining: boolean;
}) {
  const columns: DataTableColumn<DirectoryItem>[] = [
    { key: "name", header: "Nom", cell: (item) => <NameCell item={item} /> },
    {
      key: "nivol",
      header: "NIVOL",
      mono: true,
      cell: (item) => item.nivol ?? <span className="text-muted">Sans NIVOL</span>,
    },
    {
      key: "status",
      header: "Statut",
      cell: (item) => (
        <span className="flex flex-col gap-0.5">
          <StatusDot status={toVolunteerStatus(item.status)} />
          {item.archived && <span className="text-small text-muted">Archivée</span>}
        </span>
      ),
    },
    ...(showTraining
      ? [
          {
            key: "training",
            header: "Qualifications",
            cell: (item: DirectoryItem) =>
              item.training ? (
                <QualificationPills
                  codes={item.training.qualifications}
                  extra={item.training.extra}
                />
              ) : (
                <span className="text-small text-muted">Non visible</span>
              ),
          },
          {
            key: "deadline",
            header: "Prochaine échéance",
            cell: (item: DirectoryItem) =>
              item.training ? (
                item.training.next ? (
                  <DeadlineDot
                    deadline={item.training.next.deadline}
                    date={item.training.next.expiresAt}
                    code={item.training.next.code}
                  />
                ) : (
                  <span className="text-small text-muted">Aucune</span>
                )
              ) : (
                <span className="text-small text-muted">Non visible</span>
              ),
          },
        ]
      : []),
    { key: "contact", header: "Contact", cell: (item) => <ContactCell item={item} /> },
  ];
  return (
    <DataTable
      caption="Annuaire des bénévoles"
      columns={columns}
      rows={items}
      rowKey={(item) => item.id}
      primaryKey="name"
      emptyMessage="Aucune personne"
    />
  );
}
