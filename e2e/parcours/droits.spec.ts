import { expect, test, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "../helpers";

/*
 * Step 15: what each profile sees and what it is refused (403, or 404 for a
 * person it cannot see in the directory), on the main pages.
 */

const PAGES = [
  "/candidats",
  "/formations/saisie",
  "/formations/matrice",
  "/alertes",
  "/admin/comptes",
  "/admin/reglages",
  "/admin/purge",
  "/admin/journaux",
] as const;
type Path = (typeof PAGES)[number];

const ALLOWED: Record<string, Path[]> = {
  topaze: [...PAGES],
  diamant: ["/candidats", "/formations/matrice", "/alertes"],
  action: ["/formations/matrice", "/alertes"],
  laser: ["/formations/matrice", "/alertes"],
  format: ["/formations/saisie", "/formations/matrice", "/alertes"],
  "format-gp": ["/formations/matrice", "/alertes"],
  "format-diamant": ["/candidats", "/formations/saisie", "/formations/matrice", "/alertes"],
};

async function status(page: Page, path: string): Promise<number> {
  const response = await page.goto(path);
  return response?.status() ?? 0;
}

test.describe.configure({ mode: "serial" });

test.describe("Droits par profil", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Mêmes règles sur mobile : vérifiées une fois.");
  });

  let candidateRef = "";

  test("TOPAZE repère un candidat (pour les refus 404)", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/benevoles?statut=CANDIDATE");
    const href = await page.locator('a[href^="/benevoles/P-"]').first().getAttribute("href");
    candidateRef = (href ?? "").replace("/benevoles/", "").split("?")[0] ?? "";
    expect(candidateRef).toMatch(/^P-\d+$/);
  });

  for (const [key, allowed] of Object.entries(ALLOWED)) {
    test(`${key} : pages permises et refusées`, async ({ page }) => {
      await loginAs(page, key);
      for (const path of PAGES) {
        const expected = allowed.includes(path) ? 200 : 403;
        expect(await status(page, path), `${key} ${path}`).toBe(expected);
      }
      if (candidateRef && (key === "action" || key === "laser" || key === "format-gp")) {
        // A candidate is not in their directory: not found, not forbidden.
        expect(await status(page, `/benevoles/${candidateRef}`), `${key} candidat`).toBe(404);
      }
    });
  }
});
