/**
 * Translation of database errors into business errors with a French message.
 * Repositories wrap their writes with `translateDbError` so callers never see
 * a raw constraint name.
 */

export type DomainErrorCode =
  | "NIVOL_TAKEN"
  | "NIVOL_INVALID"
  | "NIVOL_REQUIRED"
  | "LEFT_DATE_REQUIRED"
  | "CANDIDACY_ALREADY_OPEN"
  | "CANDIDACY_STAGE_MISMATCH"
  | "TRAINING_WISH_ALREADY_OPEN"
  | "SELF_MENTORSHIP"
  | "APPOINTMENT_NOT_A_FUNCTION"
  | "EMAIL_TAKEN"
  | "INVALID_DATA"
  | "LAST_TOPAZE"
  | "SELF_TOPAZE_REMOVAL"
  | "SELF_DEACTIVATION"
  | "EMAIL_DOMAIN"
  | "NO_PROFILE"
  | "ACCOUNT_NOT_FOUND"
  | "DEMO_LOGIN_DISABLED"
  | "SIGN_IN_DENIED"
  | "IMPORT_BUSY"
  | "FILE_INVALID"
  | "FILE_TOO_LARGE"
  | "FILE_MISSING"
  | "STORAGE_UNAVAILABLE"
  | "TRANSITION_REFUSED"
  | "STALE_CANDIDACY"
  | "DUPLICATE_PERSON"
  | "MENTOR_INVALID"
  | "IMPORT_DISABLED"
  | "DOSSIER_SESSION_EXPIRED"
  | "DOSSIER_ALREADY_SIGNED"
  | "ALREADY_SIGNED"
  | "SIGNATURE_REFUSED"
  | "OTP_INVALID"
  | "OTP_RATE_LIMITED"
  | "TEMPLATE_MODIFIED"
  | "MAIL_UNAVAILABLE";

/** A rule of the domain was broken. `message` is safe to show to users. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DomainError";
    this.code = code;
  }
}

interface Rule {
  code: DomainErrorCode;
  message: string;
}

/** Constraint (or unique index) name → business rule. */
export const CONSTRAINT_RULES: Record<string, Rule> = {
  persons_nivol_key: {
    code: "NIVOL_TAKEN",
    message: "Ce NIVOL est déjà attribué à une autre personne.",
  },
  persons_nivol_format: {
    code: "NIVOL_INVALID",
    message: "Le NIVOL doit comporter 11 chiffres suivis d'une lettre (ex. 00012345678A).",
  },
  persons_nivol_required: {
    code: "NIVOL_REQUIRED",
    message: "Un NIVOL est obligatoire pour ce statut.",
  },
  persons_left_requires_date: {
    code: "LEFT_DATE_REQUIRED",
    message: "La date de départ est obligatoire pour une personne partie.",
  },
  candidacies_one_open: {
    code: "CANDIDACY_ALREADY_OPEN",
    message: "Cette personne a déjà une candidature en cours.",
  },
  candidacies_abandon_reason: {
    code: "INVALID_DATA",
    message: "Le motif d'abandon est obligatoire.",
  },
  candidacies_closed_matches_stage: {
    code: "CANDIDACY_STAGE_MISMATCH",
    message: "Une candidature est close si et seulement si elle est intégrée ou abandonnée.",
  },
  training_wishes_one_open: {
    code: "TRAINING_WISH_ALREADY_OPEN",
    message: "Un souhait est déjà ouvert pour cette formation.",
  },
  mentorships_not_self: {
    code: "SELF_MENTORSHIP",
    message: "Une personne ne peut pas être sa propre marraine ou son propre parrain.",
  },
  appointments_reference_is_function: {
    code: "APPOINTMENT_NOT_A_FUNCTION",
    message: "Une nomination doit porter sur une fonction du référentiel.",
  },
  signatures_submission_id_signer_role_key: {
    code: "ALREADY_SIGNED",
    message: "Cette signature a déjà été enregistrée : actualise la page.",
  },
  users_email_key: {
    code: "EMAIL_TAKEN",
    message: "Un compte existe déjà avec cette adresse e-mail.",
  },
};

/** Unique fields reported by Prisma (model + fields) → constraint name. */
const UNIQUE_FIELDS: Record<string, string> = {
  "Person:nivol": "persons_nivol_key",
  "User:email": "users_email_key",
  "Signature:submission_id,signer_role": "signatures_submission_id_signer_role_key",
  "Signature:submissionId,signerRole": "signatures_submission_id_signer_role_key",
  "Candidacy:person_id": "candidacies_one_open",
  "Candidacy:personId": "candidacies_one_open",
  "TrainingWish:person_id,reference_id": "training_wishes_one_open",
  "TrainingWish:personId,referenceId": "training_wishes_one_open",
};

/** Collects every string found in an error, its `meta` and its causes. */
function collectStrings(value: unknown, out: string[], depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === "string") {
    out.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    if (value instanceof Error) {
      out.push(value.message);
      collectStrings((value as { cause?: unknown }).cause, out, depth + 1);
    }
    for (const item of Object.values(value)) collectStrings(item, out, depth + 1);
  }
}

/** Extracts `model:fields` from a Prisma unique-constraint error, if any. */
function uniqueTarget(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const meta = (error as { meta?: Record<string, unknown> }).meta;
  if (!meta) return null;
  const model = typeof meta.modelName === "string" ? meta.modelName : "";
  const adapterError = meta.driverAdapterError as
    { cause?: { constraint?: { fields?: unknown } } } | undefined;
  const adapterCause = adapterError?.cause;
  const fields = adapterCause?.constraint?.fields ?? meta.target;
  if (!Array.isArray(fields)) return null;
  const names = fields
    .filter((f): f is string => typeof f === "string")
    .map((f) => f.replaceAll('"', ""));
  return `${model}:${names.join(",")}`;
}

/**
 * Finds the business rule behind a database error: by constraint name in the
 * error text, or by the model and fields of a unique violation.
 */
export function findConstraintRule(error: unknown): Rule | null {
  const target = uniqueTarget(error);
  if (target) {
    const name = UNIQUE_FIELDS[target];
    if (name) return CONSTRAINT_RULES[name] ?? null;
  }
  const texts: string[] = [];
  collectStrings(error, texts);
  const haystack = texts.join("\n");
  for (const [name, rule] of Object.entries(CONSTRAINT_RULES)) {
    if (haystack.includes(name)) return rule;
  }
  return null;
}

/**
 * Returns a `DomainError` when `error` violates a known constraint, the
 * original error otherwise. Meant for `catch (e) { throw translateDbError(e) }`.
 */
export function translateDbError(error: unknown): unknown {
  if (error instanceof DomainError) return error;
  const rule = findConstraintRule(error);
  return rule ? new DomainError(rule.code, rule.message, { cause: error }) : error;
}
