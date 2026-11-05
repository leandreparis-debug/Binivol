"use client";

import { useRef, useState } from "react";
import { Archive, Download, FileWarning, Upload } from "lucide-react";
import type { DocumentKind } from "@/generated/prisma/enums";
import { DeadlineDot } from "@/components/person/DeadlineDot";
import { FormMessage, useFormAction } from "@/components/person/useFormAction";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Field";
import { formatDate } from "@/lib/dates";
import type { DeadlineClass } from "@/lib/deadlines";
import { DOCUMENT_KIND_LABELS } from "@/lib/labels";
import { archiveDocumentAction, uploadDocumentAction } from "./actions";

export interface DocumentItem {
  id: string;
  kind: DocumentKind;
  fileName: string;
  sizeBytes: number;
  fileMissing: boolean;
  createdAt: Date;
  uploadedBy: string | null;
  archivedAt: Date | null;
  deadline: { value: DeadlineClass; date: Date | null };
}

const MAX_BYTES = 10 * 1024 * 1024;
const size = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${String(Math.max(1, Math.round(bytes / 1024)))} Ko`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

function UploadForm({ personId }: { personId: string }) {
  const { pending, feedback, errorOf, run } = useFormAction<{ id: string }>();
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      noValidate
      className="grid grid-cols-1 gap-4 sm:grid-cols-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          setLocalError("Choisissez un fichier PDF, JPEG ou PNG.");
          return;
        }
        if (file.size > MAX_BYTES) {
          setLocalError(
            `Le fichier dépasse 10 Mo (${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} Mo).`,
          );
          return;
        }
        setLocalError(null);
        form.set("personId", personId);
        run(() => uploadDocumentAction(form), {
          success: "Document déposé.",
          onSuccess: () => formRef.current?.reset(),
        });
      }}
    >
      <Field label="Type de document" htmlFor="doc-kind" error={errorOf("kind")} required>
        <Select id="doc-kind" name="kind" defaultValue="OTHER">
          {(Object.keys(DOCUMENT_KIND_LABELS) as DocumentKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {DOCUMENT_KIND_LABELS[kind]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Date d'expiration"
        htmlFor="doc-expires"
        hint="Facultative"
        error={errorOf("expiresAt")}
      >
        <Input id="doc-expires" name="expiresAt" type="date" />
      </Field>
      <Field
        label="Fichier"
        htmlFor="doc-file"
        hint="PDF, JPEG ou PNG, 10 Mo au maximum"
        error={localError ?? errorOf("file")}
        required
      >
        <Input
          id="doc-file"
          name="file"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
        <Button type="submit" loading={pending} leftIcon={<Upload aria-hidden="true" />}>
          Déposer
        </Button>
        <FormMessage feedback={feedback} />
      </div>
    </form>
  );
}

function ArchiveDocument({ id, label }: { id: string; label: string }) {
  const { pending, feedback, run } = useFormAction<null>();
  return (
    <span className="flex flex-col items-end">
      <Button
        variant="ghost"
        loading={pending}
        leftIcon={<Archive aria-hidden="true" />}
        aria-label={`Archiver ${label}`}
        onClick={() => {
          run(() => archiveDocumentAction({ documentId: id }));
        }}
      >
        Archiver
      </Button>
      <FormMessage feedback={feedback} />
    </span>
  );
}

/**
 * « Documents » tab: list (download through `/api/documents/[id]`, which
 * journals the consultation), upload and archive with `document.upload`.
 */
export function DocumentsPanel({
  personId,
  documents,
  canUpload,
}: {
  personId: string;
  documents: DocumentItem[];
  canUpload: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      {canUpload && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Déposer un document</CardTitle>
          </CardHeader>
          <CardContent>
            <UploadForm personId={personId} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-body text-muted">Aucun document.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {documents.map((doc) => {
                const label = `${DOCUMENT_KIND_LABELS[doc.kind]} — ${doc.fileName}`;
                return (
                  <li
                    key={doc.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-body font-medium text-ink">
                        {DOCUMENT_KIND_LABELS[doc.kind]}
                      </span>
                      <span className="text-small break-all text-ink-2">{doc.fileName}</span>
                      <span className="text-small text-muted">
                        Déposé le{" "}
                        <span className="font-mono text-mono">{formatDate(doc.createdAt)}</span>
                        {doc.uploadedBy ? ` par ${doc.uploadedBy}` : ""} · {size(doc.sizeBytes)}
                      </span>
                      {doc.deadline.value !== "none" && (
                        <DeadlineDot deadline={doc.deadline.value} date={doc.deadline.date} />
                      )}
                      {doc.archivedAt && (
                        <span className="text-small text-muted">
                          Archivé le{" "}
                          <span className="font-mono text-mono">{formatDate(doc.archivedAt)}</span>
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {doc.fileMissing ? (
                        <span className="inline-flex items-center gap-1.5 text-small text-ink-2">
                          <FileWarning aria-hidden="true" className="size-4" /> Fichier absent
                        </span>
                      ) : (
                        <Button
                          asChild
                          variant="outline"
                          leftIcon={<Download aria-hidden="true" />}
                        >
                          <a href={`/api/documents/${doc.id}`} aria-label={`Télécharger ${label}`}>
                            Télécharger
                          </a>
                        </Button>
                      )}
                      {canUpload && !doc.archivedAt && (
                        <ArchiveDocument id={doc.id} label={label} />
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
