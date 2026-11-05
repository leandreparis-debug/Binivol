"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { CircleCheck, FileText, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Field, Input } from "@/components/ui/Field";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { ActionResult } from "@/server/actions/defineAction";
import type { SigningState, SignerParty } from "@/server/dossier/signing";
import { SignaturePad, type SignatureValue } from "./SignaturePad";

export interface SigningActions {
  requestCode: (input: {
    personId?: string;
    role: SignerParty;
  }) => Promise<ActionResult<SigningState>>;
  sign: (form: FormData) => Promise<ActionResult<SigningState>>;
}

export interface SigningFlowProps {
  initial: SigningState;
  actions: SigningActions;
  /** Base address of the previews: `<base><dossier|charte|aptitude>`. */
  previewBase: string;
  /** On-site mode: the person, the responsible who may check the identity, the way back. */
  onSite?: { personId: string; responsibleName: string; exitHref: string };
}

type Step = "overview" | "trace" | "code" | "done";
const STEPS: Step[] = ["overview", "trace", "code", "done"];

/**
 * Signature of the dossier after its submission: the documents (previews),
 * the trace, the code (or, on site, the identity checked in person), then the
 * confirmation. For a minor, the legal guardian follows with her own code.
 */
export function SigningFlow({ initial, actions, previewBase, onSite }: SigningFlowProps) {
  const [state, setState] = useState<SigningState>(initial);
  const [step, setStep] = useState<Step>(initial.next ? "overview" : "done");
  const [signature, setSignature] = useState<SignatureValue | null>(null);
  const [code, setCode] = useState("");
  const [inPerson, setInPerson] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [sent, setSent] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [handover, setHandover] = useState(false);
  const [wait, setWait] = useState(initial.code?.resendInSeconds ?? 0);
  const [pending, start] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scope = onSite ? { personId: onSite.personId } : {};

  useEffect(() => {
    if (wait <= 0) return;
    const t = window.setTimeout(() => {
      setWait((w) => w - 1);
    }, 1000);
    return () => {
      window.clearTimeout(t);
    };
  }, [wait]);

  const go = (next: Step) => {
    setStep(next);
    setMessage(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      headingRef.current?.focus();
    });
  };

  const role = state.next;
  const parentTurn = role === "PARENT";
  const signer = state.nextSigner;

  const requestCode = () => {
    if (!role) return;
    setMessage(null);
    start(async () => {
      const result = await actions.requestCode({ ...scope, role });
      if (!result.ok) {
        setMessage({ tone: "danger", text: result.error });
        return;
      }
      setState(result.data);
      setSent(true);
      setWait(60);
      setMessage({ tone: "ok", text: `Code envoyé à ${signer?.maskedEmail ?? "ton e-mail"}.` });
    });
  };

  const sign = () => {
    if (!role || !signature) return;
    const form = new FormData();
    if (onSite) form.set("personId", onSite.personId);
    form.set("role", role);
    form.set("verification", inPerson ? "in-person" : "code");
    form.set("code", code);
    form.set("confirmed", confirmed ? "1" : "0");
    form.set("kind", signature.kind);
    if (signature.kind === "drawn") form.set("png", signature.png, "signature.png");
    else form.set("typedName", signature.name);
    setMessage(null);
    start(async () => {
      const result = await actions.sign(form);
      if (!result.ok) {
        setMessage({ tone: "danger", text: result.error });
        if (result.code === "SIGNATURE_INVALID") go("trace");
        return;
      }
      setState(result.data);
      setSignature(null);
      setCode("");
      setSent(false);
      setConfirmed(false);
      setInPerson(false);
      if (result.data.next === "PARENT") {
        setHandover(true);
        go("overview");
      } else go("done");
    });
  };

  const titles: Record<Step, string> = {
    overview: parentTurn ? "Au tour de ton représentant légal" : "Signature de ton dossier",
    trace: parentTurn ? "Signature du représentant légal" : "Ta signature",
    code: onSite ? "Vérification" : "Ton code",
    done: "C'est signé !",
  };

  return (
    <div className="flex flex-col gap-4">
      {step !== "done" && (
        <ProgressBar
          value={STEPS.indexOf(step) + 1}
          max={3}
          label="Avancement de la signature"
          valueText={`Étape ${String(STEPS.indexOf(step) + 1)} sur 3`}
          showValue
        />
      )}
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-title text-ink outline-none"
            data-testid="signing-title"
          >
            {titles[step]}
          </h2>

          {step === "overview" && (
            <>
              {handover && (
                <p role="status" className="rounded-inner bg-ok-soft p-3 text-small text-ok-ink">
                  Merci, ta signature est enregistrée.
                </p>
              )}
              <p className="text-body text-ink-2">
                {parentTurn
                  ? `${signer?.fullName ?? "Le représentant légal"} signe à son tour la charte, avec un code reçu sur son propre e-mail${onSite ? " (ou une vérification en présence)" : ""}.`
                  : "Ton dossier est envoyé. Il reste à le signer : tu traces ta signature, puis tu confirmes avec un code reçu par e-mail."}
              </p>
              <section aria-labelledby="signing-docs" className="flex flex-col gap-2">
                <h3 id="signing-docs" className="text-body font-semibold text-ink">
                  Les documents signés
                </h3>
                <ul className="flex flex-col gap-2">
                  {state.documents.map((d) => (
                    <li key={d.key}>
                      <a
                        href={`${previewBase}${d.key}`}
                        target="_blank"
                        rel="noopener"
                        className="flex min-h-11 items-center gap-2 rounded-inner bg-veil px-3 py-2 text-body text-ink focus-ring hover:bg-line"
                      >
                        <FileText className="size-5 shrink-0" aria-hidden="true" />
                        <span className="flex flex-col">
                          <span>{d.label}</span>
                          <span className="text-small text-muted">Voir l&apos;aperçu (PDF)</span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-small text-muted">
                  L&apos;aperçu montre les documents tels qu&apos;ils seront signés. Les versions
                  finales te seront envoyées par e-mail, avec le règlement et le code de conduite.
                </p>
              </section>
              <Button
                type="button"
                size="lg"
                onClick={() => {
                  setHandover(false);
                  go("trace");
                }}
              >
                {parentTurn ? "Signer en tant que représentant légal" : "Commencer la signature"}
              </Button>
            </>
          )}

          {step === "trace" && signer && (
            <>
              <p className="text-small text-muted">Signataire : {signer.fullName}</p>
              {message && (
                <p role="alert" className="text-small font-medium text-danger-ink">
                  {message.text}
                </p>
              )}
              <SignaturePad
                signerName={signer.fullName}
                submitLabel="Valider ma signature"
                onValidate={(value) => {
                  setSignature(value);
                  go("code");
                }}
              />
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  go("overview");
                }}
              >
                Revenir aux documents
              </Button>
            </>
          )}

          {step === "code" && signer && (
            <>
              {onSite && (
                <fieldset className="flex flex-col gap-1">
                  <legend className="mb-1 text-small font-medium text-ink">
                    Comment vérifier l&apos;identité ?
                  </legend>
                  <Checkbox
                    label="Vérification en présence (pas de code)"
                    hint={`Par ${onSite.responsibleName}, responsable connecté.`}
                    checked={inPerson}
                    onChange={(e) => {
                      setInPerson(e.target.checked);
                      setMessage(null);
                    }}
                  />
                </fieldset>
              )}
              {inPerson && onSite ? (
                <Checkbox
                  id="signing-confirmed"
                  label={`J'ai vérifié l'identité de la personne (${onSite.responsibleName})`}
                  checked={confirmed}
                  onChange={(e) => {
                    setConfirmed(e.target.checked);
                  }}
                />
              ) : (
                <>
                  <p className="flex items-start gap-2 text-body text-ink-2">
                    <Mail className="mt-1 size-5 shrink-0" aria-hidden="true" />
                    <span>
                      Un code à 6 chiffres est envoyé à{" "}
                      <strong className="text-ink">{signer.maskedEmail}</strong>. Il est valable 10
                      minutes.
                    </span>
                  </p>
                  {!sent && !state.code ? (
                    <Button type="button" size="lg" loading={pending} onClick={requestCode}>
                      Recevoir mon code
                    </Button>
                  ) : (
                    <>
                      <Field label="Code reçu par e-mail" htmlFor="signing-code" hint="6 chiffres.">
                        <Input
                          value={code}
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          pattern="[0-9]*"
                          onChange={(e) => {
                            setCode(e.target.value.replace(/\D/g, ""));
                          }}
                        />
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={wait > 0 || pending}
                        onClick={requestCode}
                        className="self-start"
                      >
                        {wait > 0
                          ? `Renvoyer un code (dans ${String(wait)} s)`
                          : "Renvoyer un code"}
                      </Button>
                    </>
                  )}
                </>
              )}
              {message && (
                <p
                  role={message.tone === "danger" ? "alert" : "status"}
                  className={
                    message.tone === "danger"
                      ? "text-small font-medium text-danger-ink"
                      : "text-small font-medium text-ok-ink"
                  }
                >
                  {message.text}
                </p>
              )}
              {(sent || state.code !== null || inPerson) && (
                <Button
                  type="button"
                  size="lg"
                  leftIcon={<ShieldCheck aria-hidden="true" />}
                  loading={pending}
                  disabled={inPerson ? !confirmed : code.length !== 6}
                  onClick={sign}
                >
                  Signer
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  go("trace");
                }}
              >
                Refaire ma signature
              </Button>
            </>
          )}

          {step === "done" && (
            <div className="flex flex-col items-start gap-4">
              <CircleCheck className="size-10 text-ok" aria-hidden="true" />
              <p className="text-body text-ink-2">
                Merci ! Ton dossier est signé. L&apos;unité locale va contresigner la charte, puis
                tu recevras tes documents par e-mail, avec le règlement du bénévolat et le code de
                conduite.
              </p>
              {onSite && (
                <Button asChild size="lg">
                  <Link href={onSite.exitHref}>Rendre l&apos;appareil au responsable</Link>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
