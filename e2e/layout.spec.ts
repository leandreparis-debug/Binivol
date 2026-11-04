import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, isMobileProject, loginAs } from "./helpers";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
];

const PAGES = [
  "/",
  "/benevoles",
  "/design",
  "/moi",
  "/admin/comptes",
  "/dossier/demo",
  "/connexion",
];

test.describe("Mise en page", () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      isMobileProject(testInfo) || browserName !== "chromium",
      "Les quatre largeurs sont fixées par le test : un seul projet (bureau) suffit.",
    );
  });

  for (const viewport of VIEWPORTS) {
    test(`aucun défilement horizontal à ${viewport.width} × ${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto("/connexion");
      await expectNoHorizontalScroll(page);
      await loginAs(page, "topaze");
      for (const path of PAGES.filter((p) => p !== "/connexion")) {
        await page.goto(path);
        await expectNoHorizontalScroll(page);
      }
    });
  }
});

test.describe("Dossier candidat (mobile)", () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      !isMobileProject(testInfo) || browserName !== "chromium",
      "Parcours candidat sur téléphone : vérifié sur le projet mobile (390 px) uniquement.",
    );
  });

  test("/dossier/demo s'affiche sans session, sans débordement, avec des champs d'au moins 16 px", async ({
    page,
  }) => {
    await page.goto("/dossier/demo");
    await expect(page.getByRole("heading", { level: 1, name: "Votre dossier" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    const controls = page.locator("input, select, textarea");
    const count = await controls.count();
    expect(count).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < count; i += 1) {
      const fontSize = await controls
        .nth(i)
        .evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      expect(fontSize, `champ ${i} : taille de police`).toBeGreaterThanOrEqual(16);
    }
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
});
