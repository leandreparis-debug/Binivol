"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import type { Profile } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Chip } from "@/components/ui/Chip";
import { Field, Input } from "@/components/ui/Field";
import { formatDateTime } from "@/lib/dates";
import { PROFILE_LABELS } from "@/lib/labels";
import type { ActionResult } from "@/server/actions/defineAction";
import { createAccountAction, setAccountActiveAction, updateProfilesAction } from "./actions";

const PROFILES: Profile[] = ["TOPAZE", "ACTION", "LASER", "FORMAT", "FORMAT_GP", "DIAMANT"];

export interface AccountItem {
  id: string;
  email: string;
  name: string;
  active: boolean;
  lastLoginAt: string | null;
  profiles: Profile[];
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

function NewAccountForm({ domains }: { domains: string[] }) {
  const { pending, feedback, run } = useAction();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const legendId = useId();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajouter un compte</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const result = await createAccountAction({ email, name, profiles });
              if (result.ok) {
                setEmail("");
                setName("");
                setProfiles([]);
              }
              return result;
            }, `Compte ${email.trim().toLowerCase()} ajouté.`);
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Adresse e-mail"
              hint={`Adresse ${domains.map((d) => `@${d}`).join(" ou ")}.`}
              required
            >
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
          </div>
          <fieldset aria-labelledby={legendId}>
            <legend id={legendId} className="mb-1 text-small font-medium text-ink">
              Profils
            </legend>
            <ProfileChoices name="new-profiles" value={profiles} onChange={setProfiles} />
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending} leftIcon={<UserPlus className="size-4" />}>
              Ajouter le compte
            </Button>
            <FeedbackLine feedback={feedback} />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountRow({ account, isSelf }: { account: AccountItem; isSelf: boolean }) {
  const { pending, feedback, run } = useAction();
  const [profiles, setProfiles] = useState<Profile[]>(account.profiles);
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
          <p className="mt-1 text-small text-muted">
            Dernière connexion :{" "}
            <span className="font-mono text-mono">{formatDateTime(account.lastLoginAt)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={account.active ? "ok" : "neutral"}>
            {account.active ? "Actif" : "Désactivé"}
          </Chip>
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
        <FeedbackLine feedback={feedback} />
      </div>
    </li>
  );
}

/** Account management screen (TOPAZE). */
export function AccountsManager({
  accounts,
  currentUserId,
  domains,
}: {
  accounts: AccountItem[];
  currentUserId: string;
  domains: string[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <NewAccountForm domains={domains} />
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
