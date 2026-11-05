import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The official PDF templates of `assets/modeles/` and the fonts of
 * `assets/fonts/`. Each file's SHA-256 is frozen here: a modified template
 * blocks the generation with a clear message (ADR-044), never a silent
 * misplaced field.
 */

export type TemplateKind = "DOSSIER" | "CHARTE" | "APTITUDE";
export type AttachmentTemplate = "REGLEMENT" | "CODE_CONDUITE";

interface AssetFile {
  file: string;
  sha256: string;
}

export const TEMPLATES: Record<TemplateKind | AttachmentTemplate, AssetFile> = {
  DOSSIER: {
    file: "modeles/NOM_Prénom_Dossier-Bénévole.pdf",
    sha256: "4813fed602a898df7194bc08a199d69f9995495090a25087f66edc24ad2f0173",
  },
  CHARTE: {
    file: "modeles/NOM_Prénom_Charte-du-Bénévolat.pdf",
    sha256: "b033ceab3beca60e0eb1c7e9b03233149f35adcf52993359fc025d0244f28d1c",
  },
  APTITUDE: {
    file: "modeles/NOM_Prénom_Attestation-d_Aptitude.pdf",
    sha256: "98696a3559dcf42117de35498993bbecb3eaec1756020b1fd342ec218279c235",
  },
  REGLEMENT: {
    file: "modeles/Règlement du bénévolat.pdf",
    sha256: "688da6ddcf1f2b19ac84cd8f2e2646d2ec6b31fc389a0bfb4a8c78ccd2a36f22",
  },
  CODE_CONDUITE: {
    file: "modeles/Code de conduite (déc. 2024).pdf",
    sha256: "2f0a7fb121545f67d676ee954c9b86779db43979085842cbfa9e0ef690645e63",
  },
};

/** File names of the two documents sent as they are (règlement, code de conduite). */
export const ATTACHMENT_NAMES: Record<AttachmentTemplate, string> = {
  REGLEMENT: "Règlement du bénévolat.pdf",
  CODE_CONDUITE: "Code de conduite (déc. 2024).pdf",
};

export const FONTS = {
  /** Unicode sans serif (accents, cédilles, Central European letters): field values. */
  TEXT: {
    file: "fonts/Geist-Regular.ttf",
    sha256: "6bfbc2254860844f82844999b63c2977b08781daecdda9870ad0feef3bc1b3f5",
  },
  /** Handwriting font: the full name typed as a signature (keyboard, screen readers). */
  HANDWRITING: {
    file: "fonts/Caveat-Regular.ttf",
    sha256: "7af58d70e539c9195cc328617a68c9961ed804a4404b0b818989ba7c013e8776",
  },
} satisfies Record<string, AssetFile>;

/** A template (or font) differs from the frozen one. The message is for TOPAZE. */
export class TemplateIntegrityError extends Error {
  constructor(file: string) {
    super(
      `Le modèle « ${path.basename(file)} » a été modifié (empreinte différente) : la génération des documents est bloquée. Remets le modèle officiel dans assets/, ou mets à jour son empreinte dans le code après vérification de ses champs.`,
    );
    this.name = "TemplateIntegrityError";
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Folder of the assets: `<cwd>/assets` (development, standalone server, Docker). */
export function assetsDir(): string {
  return path.join(process.cwd(), "assets");
}

const cache = new Map<string, Uint8Array>();

/** Reads an asset and checks its frozen SHA-256. @throws {TemplateIntegrityError} */
export async function readAsset(asset: AssetFile, dir = assetsDir()): Promise<Uint8Array> {
  const key = `${dir}|${asset.file}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const bytes = new Uint8Array(await readFile(path.join(dir, asset.file)));
  if (sha256(bytes) !== asset.sha256) throw new TemplateIntegrityError(asset.file);
  cache.set(key, bytes);
  return bytes;
}

/** Checks every template and font; returns the files that differ (start-up check, admin). */
export async function checkAssets(dir = assetsDir()): Promise<string[]> {
  const all: AssetFile[] = [...Object.values(TEMPLATES), ...Object.values(FONTS)];
  const bad: string[] = [];
  for (const asset of all) {
    try {
      const bytes = new Uint8Array(await readFile(path.join(dir, asset.file)));
      if (sha256(bytes) !== asset.sha256) bad.push(asset.file);
    } catch {
      bad.push(asset.file);
    }
  }
  return bad;
}
