import { z } from "zod";

/**
 * Inputs of the signature actions (step 8). Client-safe. The image is the
 * canvas PNG as a data URL; the server decodes and checks it again.
 */

export const SIGNATURE_IMAGE_MAX_CHARS = 300_000;

const image = z
  .string({ error: "Signature manquante." })
  .max(SIGNATURE_IMAGE_MAX_CHARS, "L'image de la signature est trop lourde.")
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/, "La signature doit être une image PNG.");

const id = z.string().min(1).max(40);
const role = z.enum(["VOLUNTEER", "PARENT"]);
const inputKind = z.enum(["DRAWN", "TYPED"]);

export const requestCodeInput = z.object({ personId: id.optional(), role });

export const signWithCodeInput = z.object({
  personId: id.optional(),
  role,
  inputKind,
  image,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Le code compte 6 chiffres."),
});

export const signInPersonInput = z.object({
  personId: id,
  role,
  inputKind,
  image,
  identityChecked: z.literal(true, {
    error: "Coche « J'ai vérifié l'identité de la personne ».",
  }),
});

export const countersignInput = z.object({
  personId: id,
  inputKind,
  image,
  firstName: z.string().trim().min(1, "Le prénom est obligatoire.").max(50),
  lastName: z.string().trim().min(1, "Le nom est obligatoire.").max(50),
  quality: z.string().trim().min(1, "La qualité est obligatoire.").max(80),
});

export const resendSignedMailInput = z.object({ personId: id });

/** The bytes of a `data:image/png;base64,…` URL. */
export function pngFromDataUrl(dataUrl: string): Uint8Array {
  return new Uint8Array(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
}
