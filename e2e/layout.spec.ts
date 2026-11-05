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
  "/dossier/lien-invalide",
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

  test("la page neutre du dossier s'affiche sans session, sans débordement ni navigation", async ({
    page,
  }) => {
    await page.goto("/dossier/lien-invalide");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ce lien n'est plus valable." }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expect(page.getByRole("navigation")).toHaveCount(0);
  });
});
