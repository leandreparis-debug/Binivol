import { expect, test } from "@playwright/test";
import { isMobileProject, loginAs, mainNav } from "./helpers";

const SECTIONS = [
  { href: "/benevoles", label: "Bénévoles" },
  { href: "/candidats", label: "Candidats" },
  { href: "/formations", label: "Formations" },
  { href: "/rappels", label: "Rappels" },
  { href: "/", label: "Accueil" },
];

test.describe("Navigation (TOPAZE)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "topaze");
  });

  test("chaque section est accessible et aria-current suit", async ({ page }, testInfo) => {
    const nav = mainNav(page, testInfo);
    for (const section of SECTIONS) {
      await nav.getByRole("link", { name: section.label }).click();
      // A section may open on one of its sub-pages (/formations → /formations/sessions).
      await expect(page).toHaveURL(
        new RegExp(section.href === "/" ? "/$" : `${section.href}(/[a-z-]+)?$`),
      );
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const current = nav.locator("a[aria-current='page']");
      await expect(current).toHaveCount(1);
      await expect(current).toContainText(section.label);
    }
  });

  test("la barre basse remplace les pilules sous 640 px", async ({ page }, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Ne concerne que la largeur 390 px du projet mobile.");
    const bottomNav = page.getByTestId("bottom-nav");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("link")).toHaveCount(6);
    await expect(
      page.getByRole("navigation", { name: "Navigation principale", exact: true }),
    ).toBeHidden();
  });

  test("les pilules sont visibles sur bureau, sans barre basse", async ({ page }, testInfo) => {
    test.skip(isMobileProject(testInfo), "Ne concerne que la largeur 1440 px du projet bureau.");
    await expect(page.getByTestId("bottom-nav")).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }).first(),
    ).toBeVisible();
  });

  test("une route inconnue mène à la 404 personnalisée", async ({ page }) => {
    const response = await page.goto("/cette-page-n-existe-pas");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
  });

  test("une erreur dans une page affiche error.tsx sans pile technique", async ({ page }) => {
    await page.goto("/design/erreur");
    const alert = page.getByTestId("error-boundary");
    await expect(alert).toContainText("Une erreur est survenue");
    await expect(alert).not.toContainText("Erreur de démonstration");
    await expect(page.locator("body")).not.toContainText(/\bat \w+ \(/);
  });
});

test("sans session, une page de l'app renvoie vers /connexion", async ({ page }) => {
  for (const path of ["/", "/benevoles", "/moi", "/admin/comptes"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/connexion$/);
  }
});
