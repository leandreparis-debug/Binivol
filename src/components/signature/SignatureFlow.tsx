"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { CircleCheck, FileText, Mail, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input } from "@/components/ui/Field";
import type { ActionResult } from "@/server/actions/defineAction";
import { SignaturePad, type SignatureValue } from "./SignaturePad";

type Role = "VOLUNTEER" | "PARENT";

export interface SignatureDocument {
  key: string;
  label: string;
  fileName: string;
}

/** What the screens need (no sensitive data besides the signer's own name). */
export interface SignatureFlowView {
  minor: boolean;
  next: Role | "DONE";
  signerName: string;
  /** Name of the legal guardian, for her own turn. */
  guardianName: string;
  codeTo: string | null;
  documents: SignatureDocument[];
  storageReady: boolean;
}

export interface SignatureFlowActions {
  requestCode: (input: {
    personId?: string;
    role: Role;
  }) => Promise<ActionResult<{ sentTo: string; expiresAt: string }>>;
  signWithCode: (input: {
    personId?: string;
    role: Role;
    inputKind: "DRAWN" | "TYPED";
    image: string;
    code: string;
  }) => Promise<ActionResult<{ next: Role | "DONE" }>>;
  /** On-site mode only: identity checked in person by the signed-in responsible. */
  signInPerson?: (input: {
    personId: string;
    role: Role;
    inputKind: "DRAWN" | "TYPED";
    image: string;
    identityChecked: true;
  }) => Promise<ActionResult<{ next: Role | "DONE" }>>;
}

export interface SignatureFlowProps {
  view: SignatureFlowView;
  actions: SignatureFlowActions;
  /** Base of the preview links: `${previewBase}/${documentKey}`. */
  previewBase: string;
  /** On-site mode: the person, and the responsible who may check the identity. */
  onSite?: { personId: string; verifierName: string; exitHref: string };
}

type Screen = "documents" | "trace" | "code" | "guardian-intro" | "done";

function StepTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-title text-ink" data-testid="signature-step-title" tabIndex={-1}>
      {children}
    </h2>
  );
}

/**
 * The signature screens (step 8), phone first: the three documents (preview
 * before signing, generated on the fly), the trace, the code e-mailed to the
 * signer, the confirmation; for a minor, « Au tour de ton représentant
 * légal » follows with the guardian's own trace and code.
 */
export function SignatureFlow({ view, actions, previewBase, onSite }: SignatureFlowProps) {
  const [role, setRole] = useState<Role | "DONE">(view.next);
  const [screen, setScreen] = useState<Screen>(
    view.next === "DONE" ? "done" : view.next === "PARENT" ? "guardian-intro" : "documents",
  );
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeId = useId();
  const personId = onSite?.personId;
  const signerName = role === "PARENT" ? view.guardianName : view.signerName;

  if (!view.storageReady) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <StepTitle>Signature indisponible</StepTitle>
          <p className="text-body text-ink-2">
            La signature n&apos;est pas disponible sur cette démo : le stockage des documents
            n&apos;est pas configuré. Ton dossier est bien envoyé.
          </p>
        </CardContent>
      </Card>
    );
  }

  const afterSign = (next: Role | "DONE") => {
    setSignature(null);
    setSentTo(null);
    setCode("");
    setChecked(false);
    setRole(next);
    setScreen(next === "DONE" ? "done" : "guardian-intro");
  };

  async function requestCode() {
    if (role === "DONE") return;
    setBusy(true);
    setError(null);
    const result = await actions.requestCode({ personId, role });
    setBusy(false);
    if (result.ok) setSentTo(result.data.sentTo);
    else setError(result.error);
  }

  async function signWithCode() {
    if (role === "DONE" || !signature) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Le code compte 6 chiffres.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await actions.signWithCode({
      personId,
      role,
      inputKind: signature.inputKind,
      image: signature.image,
      code: code.trim(),
    });
    setBusy(false);
    if (result.ok) afterSign(result.data.next);
    else setError(result.error);
  }

  async function signInPerson() {
    if (role === "DONE" || !signature || !actions.signInPerson || !personId) return;
    if (!checked) {
      setError("Coche « J'ai vérifié l'identité de la personne », ou envoie-lui un code.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await actions.signInPerson({
      personId,
      role,
      inputKind: signature.inputKind,
      image: signature.image,
      identityChecked: true,
    });
    setBusy(false);
    if (result.ok) afterSign(result.data.next);
    else setError(result.error);
  }

  const errorBox = error && (
    <p role="alert" className="text-small font-medium text-danger-ink">
      {error}
    </p>
  );

  if (screen === "done") {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 pt-6">
          <CircleCheck className="size-10 text-ok" aria-hidden="true" />
          <StepTitle>Ton dossier est signé</StepTitle>
          <p className="text-body text-ink-2">
            Merci ! L&apos;unité locale va le contresigner. Tu recevras ensuite tes documents par
            e-mail, avec le règlement et le code de conduite.
          </p>
          {onSite && (
            <Button asChild size="lg">
              <Link href={onSite.exitHref}>Rendre l&apos;appareil au responsable</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  if (screen === "guardian-intro") {
    return (
      <Card>
        <CardContent className="flex flex-col items-start gap-4 pt-6">
          <Users className="size-10 text-accent" aria-hidden="true" />
          <StepTitle>Au tour de ton représentant légal</StepTitle>
          <p className="text-body text-ink-2">
            Tu es mineur : {view.guardianName || "ton représentant légal"} signe aussi le dossier,
            avec sa propre signature
            {view.codeTo
              ? " et un code envoyé sur son e-mail."
              : ". Son e-mail n'est pas connu : la signature se fait avec un responsable."}
          </p>
          <Button
            size="lg"
            onClick={() => {
              setScreen("trace");
            }}
          >
            Continuer
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (screen === "documents") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <StepTitle>Signature</StepTitle>
          <p className="text-body text-ink-2">
            Ton dossier est envoyé. Il reste à signer ces trois documents : relis-les, puis signe
            une seule fois pour les trois.
          </p>
          <ul className="flex flex-col gap-2">
            {view.documents.map((d) => (
              <li key={d.key}>
                <a
                  href={`${previewBase}/${d.key}`}
                  target="_blank"
                  rel="noopener"
                  className="flex min-h-11 items-center gap-3 rounded-inner border border-line px-4 py-2 text-body text-ink focus-ring"
                >
                  <FileText className="size-5 shrink-0 text-muted" aria-hidden="true" />
                  <span className="flex flex-col">
                    <span>{d.label}</span>
                    <span className="text-small text-muted">Aperçu avant signature (PDF)</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <Button
            size="lg"
            onClick={() => {
              setScreen("trace");
            }}
          >
            Je signe
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (screen === "trace") {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <StepTitle>
            {role === "PARENT" ? "Signature du représentant légal" : "Ta signature"}
          </StepTitle>
          <SignaturePad
            key={role}
            defaultName={signerName}
            validateLabel="Valider la signature"
            onValidate={(value) => {
              setSignature(value);
              setError(null);
              setScreen("code");
            }}
          />
        </CardContent>
      </Card>
    );
  }

  // screen === "code"
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        <StepTitle>{role === "PARENT" ? "Code du représentant légal" : "Ton code"}</StepTitle>
        {view.codeTo || role === "VOLUNTEER" ? (
          <>
            <p className="text-body text-ink-2">
              Pour confirmer, un code à 6 chiffres est envoyé par e-mail
              {sentTo ? ` à ${sentTo}` : ""}. Il est valable 10 minutes.
            </p>
            <Button
              variant={sentTo ? "outline" : "primary"}
              size="lg"
              leftIcon={<Mail className="size-4" aria-hidden="true" />}
              loading={busy && !sentTo}
              onClick={() => void requestCode()}
            >
              {sentTo ? "Renvoyer un code" : "Recevoir mon code"}
            </Button>
            {sentTo && (
              <>
                <Field label="Code reçu par e-mail" htmlFor={codeId}>
                  <Input
                    id={codeId}
                    value={code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    onChange={(event) => {
                      setCode(event.target.value.replace(/\D/g, ""));
                    }}
                  />
                </Field>
                <Button size="lg" loading={busy} onClick={() => void signWithCode()}>
                  Signer
                </Button>
              </>
            )}
          </>
        ) : (
          <p className="text-body text-ink-2">
            Pas d&apos;e-mail pour recevoir le code : la signature se fait avec un responsable de
            l&apos;unité locale.
          </p>
        )}
        {onSite && actions.signInPerson && (
          <div className="flex flex-col gap-3 rounded-inner bg-canvas p-4">
            <p className="flex items-center gap-2 text-small font-medium text-ink">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Sans code, en présence
            </p>
            <Checkbox
              checked={checked}
              onChange={(event) => {
                setChecked(event.target.checked);
              }}
              label="J'ai vérifié l'identité de la personne"
              hint={`Vérification faite par ${onSite.verifierName}, enregistrée dans la preuve.`}
            />
            <Button variant="outline" size="lg" loading={busy} onClick={() => void signInPerson()}>
              Signer sans code
            </Button>
          </div>
        )}
        {errorBox}
        <Button
          variant="ghost"
          onClick={() => {
            setScreen("trace");
            setError(null);
          }}
        >
          Refaire la signature
        </Button>
      </CardContent>
    </Card>
  );
}
