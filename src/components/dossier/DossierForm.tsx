"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CircleCheck, RotateCw, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";
import type { DossierAttachmentKind } from "@/lib/dossierForms";
import {
  dossierAge,
  DOSSIER_STEP_LABELS,
  submissionIssues,
  visibleSteps,
  type DossierDraft,
  type DossierIssue,
  type DossierStep,
} from "@/lib/dossierSchema";
import type { ActionResult } from "@/server/actions/defineAction";
import type { DossierFormView, DossierSubmitResult } from "@/server/services/dossierForm";
import { STEP_FIELDS, type TextSection } from "./config";
import { DeclaredField } from "./fields";
import { AttachmentsStep, CrfStep, ProfileStep, ReviewStep, type AttachmentView } from "./steps";

/** The Server Actions behind the form: public (`/dossier`) or on-site. */
export interface DossierFormActions {
  save: (input: {
    personId?: string;
    data: DossierDraft;
  }) => Promise<ActionResult<{ savedAt: string }>>;
  addAttachment: (form: FormData) => Promise<ActionResult<AttachmentView>>;
  removeAttachment: (input: {
    personId?: string;
    attachmentId: string;
  }) => Promise<ActionResult<null>>;
  submit: (input: {
    personId?: string;
    data: DossierDraft;
  }) => Promise<ActionResult<DossierSubmitResult>>;
}

export interface DossierFormProps {
  view: DossierFormView;
  actions: DossierFormActions;
  /** On-site mode: the person (the actions check `dossier.manage` on her). */
  personId?: string;
  /** On-site mode: where « Rendre l'appareil au responsable » leads. */
  exitHref?: string;
}

type SaveState =
  | { status: "saved"; at: string }
  | { status: "saving" }
  | { status: "error"; message: string }
  | { status: "expired"; message: string };

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
});

const OFFLINE = "Connexion perdue : vos réponses seront enregistrées dès le retour du réseau.";

/**
 * The volunteer dossier, step by step, phone first. Every change is saved a
 * second later (and on each step change); the candidate can stop and resume
 * with the same link until submission. The rules of a complete dossier are
 * the server's (`submissionIssues`), shown here as the candidate goes.
 */
export function DossierForm({ view, actions, personId, exitHref }: DossierFormProps) {
  const router = useRouter();
  const today = useMemo(() => new Date(`${view.today}T00:00:00Z`), [view.today]);
  const scope = useMemo(() => (personId ? { personId } : {}), [personId]);
  const [draft, setDraft] = useState<DossierDraft>(view.data);
  const [attachments, setAttachments] = useState<AttachmentView[]>(view.attachments);
  const [step, setStep] = useState<DossierStep>("accueil");
  const [attempted, setAttempted] = useState<ReadonlySet<DossierStep>>(new Set());
  const [blockedStep, setBlockedStep] = useState<DossierStep | null>(null);
  const [save, setSave] = useState<SaveState>({ status: "saved", at: view.savedAt });
  const [serverIssues, setServerIssues] = useState<DossierIssue[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const steps = visibleSteps(draft, today);
  const current = steps.includes(step) ? step : "relecture";
  const index = steps.indexOf(current);
  const age = dossierAge(draft, today);
  const clientIssues = useMemo(
    () => submissionIssues(draft, { day: today, attachmentKinds: attachments.map((a) => a.kind) }),
    [draft, today, attachments],
  );
  const issues = serverIssues ?? clientIssues;
  const stepIssues = issues.filter((i) => i.step === current);
  // A draft already worked on resumes at its first incomplete step.
  const started = Boolean(
    draft.identity?.birthDate ??
    draft.contact?.street ??
    draft.crf ??
    draft.emergency ??
    draft.profile,
  );
  const resumeStep: DossierStep =
    steps.find((s) => s !== "accueil" && clientIssues.some((i) => i.step === s)) ?? "relecture";
  const errorOf = (field: string) =>
    attempted.has(current) ? stepIssues.find((i) => i.field === field)?.message : undefined;

  // --- Autosave -----------------------------------------------------------
  const draftRef = useRef(draft);
  const dirty = useRef(false);
  const expired = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const flush = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    while (inFlight.current) await inFlight.current;
    if (!dirty.current || expired.current) return;
    dirty.current = false;
    setSave({ status: "saving" });
    const run = (async () => {
      try {
        const result = await actions.save({ ...scope, data: draftRef.current });
        if (result.ok) setSave({ status: "saved", at: result.data.savedAt });
        else if (result.code === "DOSSIER_SESSION_EXPIRED") {
          expired.current = true;
          dirty.current = true;
          setSave({ status: "expired", message: result.error });
        } else {
          dirty.current = true;
          setSave({ status: "error", message: result.error });
        }
      } catch {
        dirty.current = true;
        setSave({ status: "error", message: OFFLINE });
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [actions, scope]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    const onOnline = () => void flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("online", onOnline);
      window.clearTimeout(timer.current);
    };
  }, [flush]);

  const change = (next: DossierDraft) => {
    draftRef.current = next;
    setDraft(next);
    setServerIssues(null);
    setBlockedStep(null);
    dirty.current = true;
    if (!expired.current) setSave({ status: "saving" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), 1000);
  };
  const patch = <K extends keyof DossierDraft>(
    section: K,
    value: Partial<NonNullable<DossierDraft[K]>>,
  ) => {
    const before = (draftRef.current[section] ?? {}) as object;
    change({ ...draftRef.current, [section]: { ...before, ...value } });
  };
  const setText = (section: TextSection, name: string, value: string) => {
    patch(section, { [name]: value } as Partial<NonNullable<DossierDraft[TextSection]>>);
  };

  const retry = () => {
    expired.current = false;
    dirty.current = true;
    void flush();
  };

  // --- Navigation ---------------------------------------------------------
  const goTo = (target: DossierStep) => {
    void flush();
    setStep(target);
    setBlockedStep(null);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0 });
      headingRef.current?.focus();
    });
  };
  const next = (force = false) => {
    if (current === "accueil" && started) {
      goTo(resumeStep);
      return;
    }
    const target = steps[index + 1];
    if (!target) return;
    if (!force && current !== "accueil" && stepIssues.length > 0) {
      setAttempted((s) => new Set(s).add(current));
      setBlockedStep(current);
      return;
    }
    goTo(target);
  };
  const previous = () => {
    const target = steps[index - 1];
    if (target) goTo(target);
  };

  // --- Attachments --------------------------------------------------------
  const addAttachment = async (kind: DossierAttachmentKind, file: File) => {
    const form = new FormData();
    if (personId) form.set("personId", personId);
    form.set("kind", kind);
    form.set("file", file);
    try {
      const result = await actions.addAttachment(form);
      if (!result.ok) return result.error;
      setAttachments((list) => [...list, result.data]);
      setServerIssues(null);
      return null;
    } catch {
      return "L'envoi du fichier a échoué. Vérifiez votre connexion et réessayez.";
    }
  };
  const removeAttachment = async (attachmentId: string) => {
    try {
      const result = await actions.removeAttachment({ ...scope, attachmentId });
      if (!result.ok) return result.error;
      setAttachments((list) => list.filter((a) => a.id !== attachmentId));
      setServerIssues(null);
      return null;
    } catch {
      return "La pièce n'a pas pu être retirée. Réessayez.";
    }
  };

  // --- Submission ---------------------------------------------------------
  const submit = async () => {
    setAttempted(new Set(steps));
    setSubmitError(null);
    if (clientIssues.length > 0) {
      setSubmitError("Le dossier est incomplet : complétez les points ci-dessus.");
      return;
    }
    setSubmitting(true);
    window.clearTimeout(timer.current);
    while (inFlight.current) await inFlight.current;
    dirty.current = false;
    try {
      const result = await actions.submit({ ...scope, data: draftRef.current });
      if (!result.ok) {
        dirty.current = true;
        setSubmitError(result.error);
      } else if (result.data.submitted) {
        setSubmitted(true);
        window.scrollTo({ top: 0 });
      } else {
        setServerIssues(result.data.issues);
        setSubmitError("Le dossier est incomplet : complétez les points ci-dessus.");
      }
    } catch {
      dirty.current = true;
      setSubmitError(OFFLINE);
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <DossierSubmitted
        exitHref={exitHref}
        onContinue={() => {
          router.refresh();
        }}
      />
    );
  }

  const fields = STEP_FIELDS[current];
  const attachmentKinds: DossierAttachmentKind[] =
    age !== null && age < 18 ? ["PARENTAL_AUTH", "ADHESION"] : ["ADHESION"];

  return (
    <div className="flex flex-col gap-4">
      <ProgressBar
        value={index + 1}
        max={steps.length}
        label="Avancement du dossier"
        valueText={`Étape ${String(index + 1)} sur ${String(steps.length)}`}
        showValue
      />
      {save.status === "expired" && (
        <div role="alert" className="flex flex-col gap-2 rounded-inner bg-danger-soft p-4">
          <p className="text-small font-medium text-danger-ink">{save.message}</p>
          <Button
            type="button"
            variant="outline"
            leftIcon={<RotateCw className="size-4" />}
            onClick={retry}
            className="self-start"
          >
            Réessayer d&apos;enregistrer
          </Button>
        </div>
      )}
      <Card>
        <CardContent className="flex flex-col gap-5 pt-6">
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="text-title text-ink outline-none"
            data-testid="dossier-step-title"
          >
            {current === "relecture" ? "Relecture et envoi" : DOSSIER_STEP_LABELS[current]}
          </h2>

          {current === "accueil" && (
            <Welcome
              firstName={draft.identity?.firstName}
              ulName={view.ulName}
              hasWarnings={view.warnings.length > 0}
              onSite={view.mode === "ON_SITE"}
            />
          )}

          {fields && (
            <div className="flex flex-col gap-4">
              {current === "representant" && (
                <p className="text-small text-muted">
                  Vous avez moins de 18 ans : indiquez la personne qui exerce l&apos;autorité
                  parentale.
                </p>
              )}
              {fields.map((def) => (
                <DeclaredField
                  key={`${def.section}.${def.name}`}
                  def={def}
                  draft={draft}
                  today={view.today}
                  error={errorOf(def.name)}
                  onChange={(value) => {
                    setText(def.section, def.name, value);
                  }}
                />
              ))}
            </div>
          )}

          {current === "croix-rouge" && (
            <CrfStep
              ulName={view.ulName}
              draft={draft}
              errorOf={errorOf}
              onChange={(value) => {
                patch("crf", value);
              }}
            />
          )}
          {current === "profil" && (
            <ProfileStep
              draft={draft}
              errorOf={errorOf}
              onChange={(value) => {
                patch("profile", value);
              }}
            />
          )}
          {current === "pieces" && (
            <AttachmentsStep
              kinds={attachmentKinds}
              requiredKinds={age !== null && age < 16 ? ["PARENTAL_AUTH"] : []}
              attachments={attachments}
              onAdd={addAttachment}
              onRemove={removeAttachment}
              errorOf={errorOf}
              enabled={view.attachmentsEnabled}
            />
          )}
          {current === "relecture" && (
            <ReviewStep
              steps={steps}
              draft={draft}
              attachments={attachments}
              issues={attempted.has("relecture") ? issues : clientIssues}
              rgpdNotice={view.rgpdNotice}
              onGoTo={goTo}
              onConsent={(value) => {
                patch("consent", { rgpd: value });
              }}
              consentError={errorOf("rgpd")}
            />
          )}

          {blockedStep === current && (
            <div role="alert" className="flex flex-col gap-2 rounded-inner bg-warn-soft p-4">
              <p className="text-small font-medium text-warn-ink">
                Certains champs sont à compléter ou à corriger. Vous pouvez aussi continuer et y
                revenir plus tard : vos réponses sont enregistrées.
              </p>
              <Button
                type="button"
                variant="outline"
                className="self-start"
                onClick={() => {
                  next(true);
                }}
              >
                Continuer sans compléter
              </Button>
            </div>
          )}

          {submitError && current === "relecture" && (
            <p role="alert" className="text-small font-medium text-danger-ink">
              {submitError}
            </p>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
            {index > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                leftIcon={<ArrowLeft className="size-4" />}
                onClick={previous}
              >
                Précédent
              </Button>
            ) : (
              <span />
            )}
            {current === "relecture" ? (
              <Button
                type="button"
                size="lg"
                leftIcon={<Send className="size-4" />}
                loading={submitting}
                onClick={() => void submit()}
              >
                Envoyer mon dossier
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                rightIcon={<ArrowRight className="size-4" />}
                onClick={() => {
                  next();
                }}
              >
                {current === "accueil" ? (started ? "Reprendre" : "Commencer") : "Continuer"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      <SaveStatus state={save} onRetry={retry} />
    </div>
  );
}

function SaveStatus({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 text-center text-small",
        state.status === "error" ? "text-danger-ink" : "text-muted",
      )}
      data-testid="dossier-save-status"
    >
      {state.status === "saved" && <>Enregistré à {timeFormatter.format(new Date(state.at))}</>}
      {state.status === "saving" && <>Enregistrement…</>}
      {state.status === "error" && (
        <>
          <span>{state.message}</span>
          <button
            type="button"
            className="min-h-11 rounded-pill px-2 font-medium text-ink underline focus-ring"
            onClick={onRetry}
          >
            Réessayer
          </button>
        </>
      )}
    </div>
  );
}

function Welcome({
  firstName,
  ulName,
  hasWarnings,
  onSite,
}: {
  firstName: string | undefined;
  ulName: string;
  hasWarnings: boolean;
  onSite: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 text-body text-ink-2">
      <p>
        Bonjour{firstName ? ` ${firstName}` : ""}, ce dossier prépare votre engagement de bénévole à
        la Croix-Rouge française, {ulName}.
      </p>
      <p>
        Comptez 10 à 15 minutes.{" "}
        {onSite
          ? "Vos réponses sont enregistrées au fur et à mesure."
          : "Vos réponses sont enregistrées au fur et à mesure : vous pouvez vous arrêter et reprendre plus tard avec le même lien, jusqu'à l'envoi."}
      </p>
      <div>
        <p className="font-medium text-ink">À avoir sous la main :</p>
        <ul className="mt-1 list-disc pl-5">
          <li>votre adresse et votre date de naissance ;</li>
          <li>les coordonnées d&apos;une personne à prévenir en cas d&apos;urgence ;</li>
          <li>la liste de vos diplômes (sans copie : ils sont vérifiés dans Pegass) ;</li>
          <li>avant 16 ans, l&apos;autorisation parentale signée.</li>
        </ul>
      </div>
      <p className="text-small text-muted">
        L&apos;unité locale relira votre dossier avant de l&apos;enregistrer. Les documents à signer
        vous seront proposés ensuite.
      </p>
      {hasWarnings && (
        <p role="status" className="rounded-inner bg-warn-soft p-3 text-small text-warn-ink">
          Une partie de vos réponses précédentes n&apos;a pas pu être reprise : vérifiez chaque
          étape.
        </p>
      )}
    </div>
  );
}

/**
 * Confirmation once the dossier is sent (the signature follows), or once it
 * is signed (the page of a used link).
 */
export function DossierSubmitted({
  exitHref,
  signed = false,
  onContinue,
}: {
  exitHref?: string;
  signed?: boolean;
  onContinue?: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-4 pt-6">
        <CircleCheck className="size-10 text-ok" aria-hidden="true" />
        <h2 className="text-title text-ink" data-testid="dossier-step-title">
          {signed ? "Votre dossier est signé" : "Votre dossier a bien été envoyé"}
        </h2>
        <p className="text-body text-ink-2">
          {signed
            ? "Merci. L'unité locale contresigne la charte, puis vous recevrez vos documents par e-mail."
            : "Merci. Il reste une étape : signer les documents, avec un code reçu par e-mail."}
        </p>
        {!signed && (
          <p className="text-small text-muted">
            Le dossier ne se modifie plus. Pour une correction, contactez l&apos;unité locale.
          </p>
        )}
        {onContinue && (
          <Button size="lg" onClick={onContinue}>
            Signer mon dossier
          </Button>
        )}
        {exitHref && !onContinue && (
          <Button asChild size="lg">
            <Link href={exitHref}>Rendre l&apos;appareil au responsable</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
