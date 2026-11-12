import type { Metadata } from "next";
import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatPhone } from "@/lib/phone";
import { qualificationKey } from "@/lib/status";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { findTeam, referenceOptions } from "@/server/services/trainings";
import { CopyEmails } from "../TeamTools";

export const metadata: Metadata = { title: "Trouver une équipe" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * « Trouver » (legacy tool): up to 3 valid competences (AND), one competence
 * the people must **not** hold, and a name;
 * present people only, never suspended; the directory visibility applies in
 * SQL. Phone and e-mail are directory fields (not `PersonSensitive`).
 */
export default async function FindPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("training.read");
  const raw = await searchParams;
  const db = getDb();
  const options = await referenceOptions(db);
  const codes = ["c1", "c2", "c3"]
    .map((k) => first(raw[k]))
    .filter((c) => options.some((o) => o.code === c));
  const without = options.find((o) => o.code === first(raw.sans))?.code ?? null;
  const q = first(raw.q).slice(0, 80);
  const searched = codes.length > 0 || without !== null || q.trim() !== "";
  const result = searched ? await findTeam(db, actor, { codes, q, without }) : null;
  return (
    <>
      <Card>
        <CardContent className="pt-6">
          <form
            method="get"
            className="flex flex-wrap items-end gap-3"
            role="search"
            aria-label="Trouver des bénévoles"
          >
            {(["c1", "c2", "c3"] as const).map((k, i) => (
              <Field
                key={k}
                label={`Compétence ${String(i + 1)}`}
                htmlFor={`find-${k}`}
                className="min-w-48"
              >
                <Select id={`find-${k}`} name={k} defaultValue={first(raw[k])}>
                  <option value="">—</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.code}>
                      {o.code} — {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label="Sans la compétence" htmlFor="find-sans" className="min-w-48">
              <Select id="find-sans" name="sans" defaultValue={without ?? ""}>
                <option value="">—</option>
                {options.map((o) => (
                  <option key={o.id} value={o.code}>
                    {o.code} — {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nom" htmlFor="find-q" className="min-w-48">
              <Input id="find-q" name="q" type="search" defaultValue={q} />
            </Field>
            <Button type="submit">Trouver</Button>
          </form>
        </CardContent>
      </Card>
      {result && (
        <section aria-label="Résultats" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-body text-ink" role="status">
              {result.total} bénévole{result.total > 1 ? "s" : ""} présent
              {result.total > 1 ? "s" : ""}
              {codes.length > 0 &&
                ` avec ${codes.join(" + ")} valide${codes.length > 1 ? "s" : ""}`}
              {without && ` sans ${without} valide`}
            </p>
            <CopyEmails emails={result.people.flatMap((p) => (p.email ? [p.email] : []))} />
          </div>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="team">
            {result.people.map((p) => (
              <li key={p.id}>
                <Card>
                  <CardContent className="flex flex-col gap-2 pt-6">
                    <Link
                      href={`/benevoles/${p.ref}`}
                      className="text-body font-semibold text-ink underline-offset-4 hover:underline"
                    >
                      {p.firstName} {p.lastName}
                    </Link>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {p.states.map((s) => (
                        <span
                          key={s.code}
                          className="flex items-center gap-1 text-small text-ink-2"
                        >
                          {s.code} <StatusDot status={qualificationKey(s.status)} />
                        </span>
                      ))}
                    </div>
                    {p.phone && (
                      <a
                        href={`tel:${p.phone}`}
                        className="inline-flex min-h-11 items-center gap-2 text-body text-ink underline"
                      >
                        <Phone className="size-4" aria-hidden="true" /> {formatPhone(p.phone)}
                      </a>
                    )}
                    {p.email && (
                      <a
                        href={`mailto:${p.email}`}
                        className="inline-flex min-h-11 items-center gap-2 text-body break-all text-ink underline"
                      >
                        <Mail className="size-4" aria-hidden="true" /> {p.email}
                      </a>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
