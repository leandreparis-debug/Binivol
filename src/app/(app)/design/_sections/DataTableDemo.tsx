"use client";

import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatDate } from "@/lib/dates";
import { formatNivol } from "@/lib/nivol";
import type { VolunteerStatus } from "@/lib/status";

interface DemoRow extends Record<string, unknown> {
  id: string;
  name: string;
  nivol: string;
  status: VolunteerStatus;
  lastTraining: string;
}

/** Synthetic rows — not real people. */
const ROWS: DemoRow[] = [
  {
    id: "1",
    name: "Camille Démo",
    nivol: "DEMO00001",
    status: "active",
    lastTraining: "2026-03-14",
  },
  {
    id: "2",
    name: "Noa Exemple",
    nivol: "DEMO00002",
    status: "paused",
    lastTraining: "2025-11-02",
  },
  { id: "3", name: "Sacha Fictif", nivol: "DEMO00003", status: "candidate", lastTraining: "" },
  {
    id: "4",
    name: "Alix Témoin",
    nivol: "DEMO00004",
    status: "suspended",
    lastTraining: "2024-09-21",
  },
];

const COLUMNS: DataTableColumn<DemoRow>[] = [
  { key: "name", header: "Nom" },
  { key: "nivol", header: "NIVOL", mono: true, cell: (row) => formatNivol(row.nivol) },
  { key: "status", header: "Statut", cell: (row) => <StatusDot status={row.status} /> },
  {
    key: "lastTraining",
    header: "Dernière formation",
    mono: true,
    cell: (row) => formatDate(row.lastTraining),
  },
];

export function DataTableDemo() {
  return (
    <DataTable
      caption="Bénévoles (données fictives)"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(row) => row.id}
      selectable
      selectedKeys={["2"]}
    />
  );
}
