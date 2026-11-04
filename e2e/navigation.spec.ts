import { expect, test } from "@playwright/test";

const SECTIONS = [
  { href: "/benevoles", label: "Bénévoles" },
  { href: "/candidats", label: "Candidats" },
  { href: "/formations", label: "Formations" },
  { href: "/rappels", label: "Rappels" },
  { href: "/", label: "Accueil" },
];

test.describe("Navigation", () => {
  test("chaque section est accessible et aria-current suit", async ({ page }, testInfo) => {
    const isMobile = testInfo.project.name.includes("mobile");
    await page.goto("/");
    const nav = isMobile
      ? page.getByRole("navigation", { name: "Navigation principale (mobile)" })
      : page
          .getByRole("navigation", { name: "Navigation principale" })
          .locator("visible=true")
          .first();

    for (const section of SECTIONS) {
      await nav.getByRole("link", { name: section.label }).click();
      await expect(page).toHaveURL(new RegExp(`${section.href === "/" ? "/" : section.href}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const current = nav.locator("a[aria-current='page']");
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(section.label);
    }
  });

  test("la barre basse est visible sous 640 px", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.includes("mobile"), "Mobile uniquement");
    await page.goto("/");
    const bottomNav = page.getByTestId("bottom-nav");
    await expect(bottomNav).toBeVisible();
    await expect(bottomNav.getByRole("link")).toHaveCount(5);
    await expect(
      page.getByRole("navigation", { name: "Navigation principale", exact: true }),
    ).toBeHidden();
  });

  test("la nav en pilules est visible sur bureau", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "Bureau uniquement");
    await page.goto("/");
    await expect(page.getByTestId("bottom-nav")).toBeHidden();
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }).first(),
    ).toBeVisible();
  });

  test("une route inconnue mène à la 404 personnalisée", async ({ page }) => {
    const response = await page.goto("/cette-page-n-existe-pas");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Retour à l'accueil" })).toBeVisible();
  });

  test("une erreur dans une page affiche error.tsx sans pile technique", async ({ page }) => {
    await page.goto("/design/erreur");
    const alert = page.getByTestId("error-boundary");
    await expect(alert).toContainText("Une erreur est survenue");
    await expect(alert).not.toContainText("Erreur de démonstration");
    await expect(page.locator("body")).not.toContainText(/\bat \w+ \(/);
  });
});
