import { formatDate } from "@/lib/dates";

/**
 * Cells of the competence matrix (step 13), from the single state of step 10
 * (`src/server/qualification.ts`). A symbol for the eye, a complete label for
 * assistive technologies (never the symbol alone).
 */

export type MatrixState =
  | "VALID"
  | "VALID_UNDATED"
  | "EXPIRING"
  | "EXPIRED"
  | "REGISTERED"
  | "TO_CONFIRM"
  | "FUNCTION_ACTIVE"
  | "FUNCTION_ENDED"
  | "NONE";

export interface MatrixCell {
  symbol: string;
  label: string;
  tone: "ok" | "warn" | "danger" | "accent" | "none";
}

/** Text and background classes of a cell, by tone (table, cards, dialog). */
export const MATRIX_TONE: Record<MatrixCell["tone"], string> = {
  ok: "text-ok-ink",
  warn: "bg-warn-soft text-warn-ink",
  danger: "bg-danger-soft text-danger-ink",
  accent: "text-accent-ink",
  none: "text-muted",
};

const short = (d: Date) => formatDate(d).slice(0, 5);

export function matrixCell(
  state: { status: MatrixState; expiresAt: Date | null; registeredAt?: Date | null },
  code: string,
): MatrixCell {
  switch (state.status) {
    case "VALID":
    case "FUNCTION_ACTIVE":
      return {
        symbol: "✔",
        label: `${code} : valide${state.expiresAt ? ` jusqu'au ${formatDate(state.expiresAt)}` : ""}`,
        tone: "ok",
      };
    case "VALID_UNDATED":
      return { symbol: "✔?", label: `${code} : valide, date d'obtention inconnue`, tone: "ok" };
    case "EXPIRING":
      return state.expiresAt
        ? {
            symbol: `Exp. ${short(state.expiresAt)}`,
            label: `${code} : expire le ${formatDate(state.expiresAt)}`,
            tone: "warn",
          }
        : { symbol: "Exp.", label: `${code} : expire bientôt`, tone: "warn" };
    case "EXPIRED":
      return {
        symbol: "Expirée",
        label: `${code} : expirée${state.expiresAt ? ` depuis le ${formatDate(state.expiresAt)}` : ""}`,
        tone: "danger",
      };
    case "REGISTERED":
      return state.registeredAt
        ? {
            symbol: `Inscrit(e) ${short(state.registeredAt)}`,
            label: `${code} : inscrit(e) le ${formatDate(state.registeredAt)}`,
            tone: "accent",
          }
        : { symbol: "Inscrit(e)", label: `${code} : inscrit(e)`, tone: "accent" };
    default:
      return { symbol: "", label: `${code} : aucune`, tone: "none" };
  }
}
