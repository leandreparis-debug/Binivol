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

export async function guidesFor(
  profiles: ReadonlySet<Profile>,
): Promise<{ profile: Profile; blocks: GuideBlock[] }[]> {
  const out = [];
  for (const profile of PROFILE_ORDER) {
    if (!profiles.has(profile)) continue;
    try {
      const text = await readFile(join(process.cwd(), "docs", "guides", FILES[profile]), "utf8");
      out.push({ profile, blocks: parseGuide(text) });
    } catch {
      out.push({
        profile,
        blocks: [{ type: "p" as const, content: [{ text: "Guide indisponible.", bold: false }] }],
      });
    }
  }
  return out;
}
