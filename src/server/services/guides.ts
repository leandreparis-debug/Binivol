import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Profile } from "@/generated/prisma/enums";
import { parseGuide, type GuideBlock } from "@/lib/guideMarkdown";
import { PROFILE_ORDER } from "./accounts";

/** The guides of docs/guides shown on /aide (step 15): those of the user's profiles. */
const FILES: Record<Profile, string> = {
  TOPAZE: "topaze.md",
  ACTION: "action.md",
  LASER: "laser.md",
  FORMAT: "format.md",
  FORMAT_GP: "format-gp.md",
  DIAMANT: "diamant.md",
};

/** Guides every responsible gets, after those of her profiles (« À faire », step 16). */
const COMMON_FILES = ["a-faire.md"] as const;

async function readGuide(file: string): Promise<GuideBlock[]> {
  try {
    return parseGuide(await readFile(join(process.cwd(), "docs", "guides", file), "utf8"));
  } catch {
    return [{ type: "p" as const, content: [{ text: "Guide indisponible.", bold: false }] }];
  }
}

export async function guidesFor(
  profiles: ReadonlySet<Profile>,
): Promise<{ key: string; profile: Profile | null; blocks: GuideBlock[] }[]> {
  const out = [];
  for (const profile of PROFILE_ORDER) {
    if (!profiles.has(profile)) continue;
    out.push({ key: profile, profile, blocks: await readGuide(FILES[profile]) });
  }
  for (const file of COMMON_FILES) {
    out.push({ key: file, profile: null, blocks: await readGuide(file) });
  }
  return out;
}
