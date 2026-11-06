import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Step 12: TOPAZE opens /alertes and reaches the right person page; the bell;
 * the settings screen. Runs late: it marks notifications as read and saves a
 * setting.
 */

test.describe.configure({ mode: "serial" });

async function expectNoSeriousViolation(page: Page) {
  await expect(page).toHaveTitle(/.+/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    blocking.map((v) => `${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test.describe("Alertes, rappels et réglages", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Parcours de bureau.");
  });

  test("TOPAZE clique une alerte Haute et arrive sur la bonne fiche, au bon onglet", async ({
    page,
  }) => {
    await loginAs(page, "topaze");
    await page.goto("/rappels");
    await page.getByRole("link", { name: "Alertes", exact: true }).click();
    await expect(page).toHaveURL(/\/alertes$/);
    const high = page.getByTestId("alerts-high");
    await expect(high).toBeVisible();
    await expectNoSeriousViolation(page);

    const item = high.getByRole("listitem").filter({ hasText: "Formation expirée" }).first();
    const link = item.getByRole("link");
    const name = (await link.textContent()) ?? "";
    const href = (await link.getAttribute("href")) ?? "";
    expect(href).toMatch(/^\/benevoles\/P-\d+\?onglet=formations$/);
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${href.replace("?", "\\?")}$`));
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await expect(page.getByTestId("person-alerts")).toBeVisible();

    // Filter by priority.
    await page.goto("/alertes");
    await page.getByLabel("Priorité").selectOption("LOW");
    await page.getByRole("button", { name: "Filtrer" }).click();
    await expect(page).toHaveURL(/priorite=LOW/);
    await expect(page.getByTestId("alerts-high")).toHaveCount(0);
    await expect(page.getByTestId("alerts-low")).toBeVisible();
  });

  test("la cloche : rappels non lus, puis tout marquer comme lu", async ({ page }) => {
    await loginAs(page, "diamant");
    const bell = page.getByTestId("bell");
    await expect(bell).toHaveAccessibleName(/Notifications, [1-9]\d* non lues?/);
    await bell.click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem").first()).toBeVisible();
    await expectNoSeriousViolation(page);
    await menu.getByRole("menuitem", { name: "Tout marquer comme lu" }).click();
    await expect(bell).toHaveAccessibleName("Notifications, 0 non lue");
    await page.goto("/rappels");
    await expect(page.getByTestId("notifications")).toBeVisible();
    await expectNoSeriousViolation(page);
  });

  test("TOPAZE règle le récapitulatif et une règle de rappel", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/admin/reglages");
    await expect(page.getByRole("heading", { level: 1, name: "Réglages" })).toBeVisible();
    await expectNoSeriousViolation(page);
    await page.getByLabel("Récapitulatif des alertes").selectOption("WEEKLY");
    await page
      .getByLabel("Récapitulatif des alertes")
      .locator("xpath=ancestor::form")
      .getByRole("button", { name: "Enregistrer" })
      .click();
    await expect(page.getByText("Fréquence enregistrée.")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Récapitulatif des alertes")).toHaveValue("WEEKLY");

    const rule = page.getByRole("form", { name: /Point de suivi à faire/ });
    await rule.getByLabel("Délai (jours)").fill("3");
    await rule.getByRole("button", { name: "Enregistrer" }).click();
    await expect(rule.getByText("Règle enregistrée.")).toBeVisible();
  });
});
