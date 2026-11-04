import type { Prisma } from "@/generated/prisma/client";
import type { ReferenceKind } from "@/generated/prisma/enums";
import type { DbOrTx } from "../db";

export interface ReferenceListParams {
  kind?: ReferenceKind;
  /** Default: only active items. Pass `null` to get all. */
  active?: boolean | null;
}

export const referenceItemSelect = {
  id: true,
  code: true,
  label: true,
  category: true,
  kind: true,
  sortOrder: true,
  validityMonths: true,
  expiresEndOfYear: true,
  forbiddenForMinors: true,
  perimeters: true,
  active: true,
  note: true,
} satisfies Prisma.ReferenceItemSelect;

export type ReferenceItemSummary = Prisma.ReferenceItemGetPayload<{
  select: typeof referenceItemSelect;
}>;

/** Read access to the reference list (trainings and functions). */
export function referenceRepository(db: DbOrTx) {
  return {
    /** Lists items in display order (`sortOrder`, then code). */
    async list(params: ReferenceListParams = {}): Promise<ReferenceItemSummary[]> {
      const active = params.active === undefined ? true : params.active;
      return db.referenceItem.findMany({
        where: {
          ...(params.kind ? { kind: params.kind } : {}),
          ...(active === null ? {} : { active }),
        },
        orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
        select: referenceItemSelect,
      });
    },

    /** Finds an item by code (case-insensitive input, codes are stored upper-case). */
    async findByCode(code: string): Promise<ReferenceItemSummary | null> {
      return db.referenceItem.findUnique({
        where: { code: code.trim().toUpperCase() },
        select: referenceItemSelect,
      });
    },
  };
}

export type ReferenceRepository = ReturnType<typeof referenceRepository>;
