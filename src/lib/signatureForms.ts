import { z } from "zod";

/** Inputs of the signature actions (public `/dossier` and on-site mode). Client-safe. */

const personId = z.string().min(1).max(40).optional();
export const signerParty = z.enum(["VOLUNTEER", "PARENT"]);

export const requestCodeInput = z.object({ personId, role: signerParty });

const fields = z.object({
  personId,
  role: signerParty,
  verification: z.enum(["code", "in-person"]),
  code: z.string().max(12).optional(),
  confirmed: z.boolean(),
  kind: z.enum(["drawn", "typed"]),
  png: z.instanceof(File).optional(),
  typedName: z.string().max(120).optional(),
});

/** The signature form (FormData): who signs, how she is verified, the signature. */
export const signFormInput = z.instanceof(FormData).transform((form, ctx) => {
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" && v !== "" ? v : undefined;
  };
  const file = form.get("png");
  const parsed = fields.safeParse({
    personId: text("personId"),
    role: text("role"),
    verification: text("verification"),
    code: text("code"),
    confirmed: text("confirmed") === "1",
    kind: text("kind"),
    png: file instanceof File ? file : undefined,
    typedName: text("typedName"),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    return z.NEVER;
  }
  if (parsed.data.kind === "drawn" && !parsed.data.png) {
    ctx.addIssue({ code: "custom", path: ["png"], message: "La signature est vide." });
    return z.NEVER;
  }
  return parsed.data;
});

export type SignFormData = z.output<typeof signFormInput>;

export const countersignInput = z.instanceof(FormData).transform((form, ctx) => {
  const text = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const file = form.get("png");
  const parsed = z
    .object({
      personId: z.string().min(1).max(40),
      quality: z.string().max(80),
      kind: z.enum(["drawn", "typed"]),
      png: z.instanceof(File).optional(),
      typedName: z.string().max(120).optional(),
    })
    .safeParse({
      personId: text("personId"),
      quality: text("quality"),
      kind: text("kind"),
      png: file instanceof File ? file : undefined,
      typedName: text("typedName") || undefined,
    });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    return z.NEVER;
  }
  return parsed.data;
});
