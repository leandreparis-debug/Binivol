"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import type { Profile } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { CopyField } from "@/components/ui/CopyField";
import { Field, Input } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/dates";
import { PROFILE_LABELS } from "@/lib/labels";
import { USERNAME_HINT } from "@/lib/username";
import type { ActionResult } from "@/server/actions/defineAction";
import {
  inviteAccountAction,
  issueAccessLinkAction,
  setAccountActiveAction,
  updateProfilesAction,
} from "./actions";

const PROFILES: Profile[] = ["TOPAZE", "ACTION", "LASER", "FORMAT", "FORMAT_GP", "DIAMANT"];

export interface AccountItem {
  id: string;
  email: string;
  name: string;
  username: string | null;
  hasPassword: boolean;
  active: boolean;
  lastLoginAt: string | null;
  profiles: Profile[];
}

/** A link just issued: shown once, to be copied (only its hash is stored). */
export interface IssuedLinkView {
  url: string;
  expiresAt: string;
  purpose: "INVITE" | "RESET";
  mailed: boolean;
  mailError: string | null;
}

/** The link to hand over, with its expiry and whether it was e-mailed. */
function IssuedLink({ link, to }: { link: IssuedLinkView; to: string }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-inner border border-line bg-canvas p-4"
      data-testid="issued-link"
    >
      <p className="text-small font-medium text-ink">
        {link.purpose === "INVITE" ? "Lien d'invitation" : "Lien de nouveau mot de passe"} : à usage
        unique, valable jusqu'au{" "}
        <span className="font-mono text-mono">{formatDateTime(link.expiresAt)}</span>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code
          className="min-w-0 flex-1 rounded-inner bg-surface px-3 py-2 font-mono text-mono break-all text-ink"
          data-testid="issued-link-url"
        >
          {link.url}
        </code>
        <CopyField label="le lien" text={link.url} />
      </div>
      <p className="text-small text-muted">
        {link.mailed
          ? `Envoyé par e-mail à ${to}.`
          : (link.mailError ??
            "Transmettez-le vous-même à la personne : il n'est pas envoyé par e-mail.")}{" "}
        Il ne sera plus affiché : le lien précédent, s'il y en avait un, ne fonctionne plus.
      </p>
    </div>
  );
}

interface Feedback {
  tone: "ok" | "danger";
  text: string;
}

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const run = (call: () => Promise<ActionResult<unknown>>, success: string) => {
    startTransition(async () => {
      const result = await call();
      setFeedback(
        result.ok ? { tone: "ok", text: success } : { tone: "danger", text: result.error },
      );
      if (result.ok) router.refresh();
    });
  };
  return { pending, feedback, run };
}

function FeedbackLine({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return (
    <p
      role={feedback.tone === "danger" ? "alert" : "status"}
      className={
        feedback.tone === "danger"
          ? "text-small font-medium text-danger-ink"
          : "text-small font-medium text-ok-ink"
      }
    >
      {feedback.text}
    </p>
  );
}

function ProfileChoices({
  name,
  value,
  onChange,
  disabled,
}: {
  name: string;
  value: Profile[];
  onChange: (next: Profile[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
      {PROFILES.map((profile) => (
        <Checkbox
          key={profile}
          name={name}
          value={profile}
          checked={value.includes(profile)}
          disabled={disabled}
          onChange={(event) => {
            onChange(
              event.target.checked ? [...value, profile] : value.filter((p) => p !== profile),
            );
          }}
          label={profile.replace("_", " ")}
          hint={PROFILE_LABELS[profile].split(" · ")[1]}
        />
      ))}
    </div>
  );
}

function NewAccountForm() {
  const { pending, feedback, run } = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [issued, setIssued] = useState<{ link: IssuedLinkView; to: string } | null>(null);
  const legendId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inviter un responsable</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setIssued(null);
            run(async () => {
              const result = await inviteAccountAction({ email, name, username, profiles });
              if (result.ok) {
                setIssued({ link: result.data.link, to: result.data.email });
                setEmail("");
                setName("");
                setUsername("");
                setProfiles([]);
              }
              return result;
            }, `Compte ${email.trim().toLowerCase()} créé. Transmettez-lui le lien d'invitation.`);
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Adresse e-mail" hint="Pour le contact et l'envoi du lien." required>
              <Input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
              />
            </Field>
            <Field label="Nom affiché" hint="Prénom et nom du responsable.">
              <Input
                autoComplete="off"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            </Field>
            <Field
              label="Identifiant (facultatif)"
              hint={`Vide : la personne le choisit. ${USERNAME_HINT}`}
            >
              <Input
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                }}
              />
            </Field>
          </div>
          <fieldset aria-labelledby={legendId}>
            <legend id={legendId} className="mb-1 text-small font-medium text-ink">
              Profils
            </legend>
            <ProfileChoices name="new-profiles" value={profiles} onChange={setProfiles} />
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending} leftIcon={<UserPlus className="size-4" />}>
              Inviter
            </Button>
            <FeedbackLine feedback={feedback} />
          </div>
        </form>
        {issued && <IssuedLink link={issued.link} to={issued.to} />}
      </CardContent>
    </Card>
  );
}

function AccountRow({ account, isSelf }: { account: AccountItem; isSelf: boolean }) {
  const { pending, feedback, run } = useAction();
  const [profiles, setProfiles] = useState<Profile[]>(account.profiles);
  const [issued, setIssued] = useState<IssuedLinkView | null>(null);
  const changed = [...profiles].sort().join() !== [...account.profiles].sort().join();
  const legendId = useId();
  return (
    <li
      className="flex flex-col gap-4 border-t border-line py-5 first:border-t-0 first:pt-0"
      data-testid="account-row"
      data-email={account.email}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-section text-ink">
            {account.name}
            {isSelf && <span className="text-small font-normal text-muted"> (vous)</span>}
          </p>
          <p className="text-small break-all text-muted">{account.email}</p>
          <p className="text-small text-muted">
            Identifiant :{" "}
            <span className="font-mono text-mono text-ink">
              {account.username ?? "à choisir par la personne"}
            </span>
          </p>
          <p className="mt-1 text-small text-muted">
            Dernière connexion :{" "}
            <span className="font-mono text-mono">{formatDateTime(account.lastLoginAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={account.active ? "ok" : "neutral"}>
            {account.active ? "Actif" : "Désactivé"}
          </Chip>
          {!account.hasPassword && <Chip tone="warn">Invitation en attente</Chip>}
          {account.profiles.map((p) => (
            <Chip key={p} tone="ink">
              {p.replace("_", " ")}
            </Chip>
          ))}
        </div>
      </div>
      <fieldset aria-labelledby={legendId}>
        <legend id={legendId} className="mb-1 text-small font-medium text-ink">
          Profils de {account.name}
        </legend>
        <ProfileChoices
          name={`profiles-${account.id}`}
          value={profiles}
          onChange={setProfiles}
          disabled={pending}
        />
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={!changed}
          loading={pending}
          onClick={() => {
            run(
              () => updateProfilesAction({ userId: account.id, profiles }),
              "Profils enregistrés.",
            );
          }}
        >
          Enregistrer les profils
        </Button>
        <Button
          variant="outline"
          loading={pending}
          onClick={() => {
            run(
              () => setAccountActiveAction({ userId: account.id, active: !account.active }),
              account.active ? "Compte désactivé, ses sessions sont fermées." : "Compte réactivé.",
            );
          }}
        >
          {account.active ? "Désactiver" : "Réactiver"}
        </Button>
        {account.active && (
          <Button
            variant="outline"
            loading={pending}
            leftIcon={<KeyRound className="size-4" />}
            onClick={() => {
              setIssued(null);
              run(
                async () => {
                  const result = await issueAccessLinkAction({ userId: account.id });
                  if (result.ok) setIssued(result.data);
                  return result;
                },
                account.hasPassword
                  ? "Nouveau lien créé. Le mot de passe actuel reste valable jusqu'à son utilisation."
                  : "Nouveau lien d'invitation créé.",
              );
            }}
          >
            {account.hasPassword ? "Lien de nouveau mot de passe" : "Nouveau lien d'invitation"}
          </Button>
        )}
        <FeedbackLine feedback={feedback} />
      </div>
      {issued && <IssuedLink link={issued} to={account.email} />}
    </li>
  );
}

/** Account management screen (TOPAZE). */
export function AccountsManager({
  accounts,
  currentUserId,
}: {
  accounts: AccountItem[];
  currentUserId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <NewAccountForm />
      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>Comptes ({accounts.length})</CardTitle>
          <p className="text-small text-muted">
            Un compte n'est jamais supprimé : on le désactive. Le dernier compte TOPAZE actif ne
            peut être ni désactivé ni privé de TOPAZE.
          </p>
        </CardHeader>
        <CardContent>
          <ul aria-label="Comptes">
            {accounts.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                isSelf={account.id === currentUserId}
              />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
