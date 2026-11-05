import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DomainError } from "../errors";

/**
 * The official templates (`assets/modeles/`) and their SHA-256, frozen in the
 * code (ADR-047). A template whose bytes differ blocks the generation: an
 * official document is never produced from a file nobody checked.
 */

export const TEMPLATE_DIR = path.join(process.cwd(), "assets", "modeles");
export const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
export const FONT_PATH = path.join(FONT_DIR, "Geist-Regular.ttf");

export const TEMPLATES = {
  dossier: {
    file: "NOM_Prénom_Dossier-Bénévole.pdf",
    suffix: "Dossier-Bénévole",
    label: "Dossier bénévole",
    sha256: "4813fed602a898df7194bc08a199d69f9995495090a25087f66edc24ad2f0173",
  },
  charte: {
    file: "NOM_Prénom_Charte-du-Bénévolat.pdf",
    suffix: "Charte-du-Bénévolat",
    label: "Charte du bénévolat",
    sha256: "b033ceab3beca60e0eb1c7e9b03233149f35adcf52993359fc025d0244f28d1c",
  },
  aptitude: {
    file: "NOM_Prénom_Attestation-d_Aptitude.pdf",
    suffix: "Attestation-d_Aptitude",
    label: "Attestation d'aptitude",
    sha256: "98696a3559dcf42117de35498993bbecb3eaec1756020b1fd342ec218279c235",
  },
} as const;

/** The two documents sent as they are with the signed ones. */
export const ENCLOSURES = {
  reglement: {
    file: "Règlement du bénévolat.pdf",
    label: "Règlement du bénévolat",
    sha256: "688da6ddcf1f2b19ac84cd8f2e2646d2ec6b31fc389a0bfb4a8c78ccd2a36f22",
  },
  conduite: {
    file: "Code de conduite (déc. 2024).pdf",
    label: "Code de conduite",
    sha256: "2f0a7fb121545f67d676ee954c9b86779db43979085842cbfa9e0ef690645e63",
  },
} as const;

export const FONT_SHA256 = "6bfbc2254860844f82844999b63c2977b08781daecdda9870ad0feef3bc1b3f5";

/** Handwriting font of typed signatures (Caveat, OFL): Latin and Latin Extended subsets. */
export const HANDWRITING_FONTS = [
  {
    file: "Caveat-latin.woff",
    sha256: "38b98dbeb922a14a74dfb41f83fc24e0e645e2eed9ce72145fefbdae8828cbfb",
  },
  {
    file: "Caveat-latin-ext.woff",
    sha256: "36561f75f8e73d1f2b4ff8e2e25c9872a690eb28a6c470ffc1cd03f4411650af",
  },
] as const;

export type TemplateKey = keyof typeof TEMPLATES;
export type EnclosureKey = keyof typeof ENCLOSURES;

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Thrown when a template on disk is not the expected one. */
export class TemplateModifiedError extends DomainError {
  constructor(label: string) {
    super(
      "TEMPLATE_MODIFIED",
      `Le modèle « ${label} » ne correspond pas à l'empreinte attendue : la génération des documents est bloquée. TOPAZE doit remettre le modèle officiel dans assets/modeles/.`,
    );
  }
}

/** The bytes when their SHA-256 is the expected one; throws otherwise. */
export function assertIntact(bytes: Uint8Array, expected: string, label: string): Uint8Array {
  if (sha256(bytes) !== expected) throw new TemplateModifiedError(label);
  return bytes;
}

async function readChecked(file: string, expected: string, label: string): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(path.join(TEMPLATE_DIR, file)));
  } catch {
    throw new TemplateModifiedError(label);
  }
  return assertIntact(bytes, expected, label);
}

export function loadTemplate(key: TemplateKey): Promise<Uint8Array> {
  const t = TEMPLATES[key];
  return readChecked(t.file, t.sha256, t.label);
}

export function loadEnclosure(key: EnclosureKey): Promise<Uint8Array> {
  const t = ENCLOSURES[key];
  return readChecked(t.file, t.sha256, t.label);
}

export async function loadFont(): Promise<Uint8Array> {
  const bytes = new Uint8Array(await readFile(FONT_PATH));
  if (sha256(bytes) !== FONT_SHA256) throw new TemplateModifiedError("police Geist");
  return bytes;
}

export async function loadHandwriting(): Promise<Uint8Array[]> {
  const fonts: Uint8Array[] = [];
  for (const f of HANDWRITING_FONTS) {
    const bytes = new Uint8Array(await readFile(path.join(FONT_DIR, f.file)));
    fonts.push(assertIntact(bytes, f.sha256, `police ${f.file}`));
  }
  return fonts;
}

/** Checks every template, enclosure and font (generation, health check). */
export async function verifyTemplates(): Promise<void> {
  for (const key of Object.keys(TEMPLATES) as TemplateKey[]) await loadTemplate(key);
  for (const key of Object.keys(ENCLOSURES) as EnclosureKey[]) await loadEnclosure(key);
  await loadFont();
  await loadHandwriting();
}
