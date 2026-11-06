import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Step 14: TOPAZE purges a fictitious eligible record, exports a person,
 * reads the logs. Runs late and serially: the purge removes a person.
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

test.describe("RGPD et administration", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Écrans d'administration sur bureau.");
  });

  test("TOPAZE exporte les données d'une personne", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/benevoles");
    await page.locator('a[href^="/benevoles/P-"]').first().click();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Exporter les données (RGPD)" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^binivol-rgpd-P-\d+-\d{4}-\d{2}-\d{2}\.zip$/);
  });

  test("TOPAZE purge une fiche éligible après confirmation", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/admin/purge");
    await expect(page.getByRole("heading", { level: 1, name: "Purge RGPD" })).toBeVisible();
    await expectNoSeriousViolation(page);
    const list = page.getByTestId("purge-list");
    const before = await list.getByRole("listitem").count();
    expect(before).toBeGreaterThan(0);
    // Without the typed confirmation, nothing happens.
    await page.getByRole("button", { name: /^Purger \d+ fiches?$/ }).click();
    await expect(page.getByText("Tapez PURGER pour confirmer.").first()).toBeVisible();
    await page.getByLabel("Confirmation").first().fill("PURGER");
    await page.getByRole("button", { name: /^Purger \d+ fiches?$/ }).click();
    await expect(page.getByText("Purge effectuée.")).toBeVisible();
    await expect(page.getByText("Aucune fiche à purger")).toBeVisible();
  });

  test("TOPAZE consulte les journaux et les paramètres", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/admin/journaux?action=PURGE");
    await expect(page.getByTestId("audit-log")).toContainText("Purge");
    await expectNoSeriousViolation(page);
    await page.getByRole("link", { name: "Consultations sensibles" }).click();
    await expect(page.getByTestId("access-log")).toBeVisible();
    await expectNoSeriousViolation(page);
    await page.goto("/admin/parametres");
    await expect(page.getByRole("heading", { name: "Délais et conservation" })).toBeVisible();
    await expectNoSeriousViolation(page);
    const form = page.getByRole("form", { name: "Alerte avant échéance (jours)" });
    await form.getByLabel("Alerte avant échéance (jours)").fill("45");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByText("Enregistré.")).toBeVisible();
    await form.getByLabel("Alerte avant échéance (jours)").fill("60");
    await form.getByRole("button", { name: "Enregistrer" }).click();
    await expect(form.getByText("Enregistré.")).toBeVisible();
  });
});

test("la page de confidentialité est publique", async ({ page }) => {
  await page.goto("/confidentialite");
  await expect(page.getByRole("heading", { level: 1, name: /Confidentialité/ })).toBeVisible();
  await expect(page.getByText(/BROUILLON/)).toBeVisible();
  await expectNoSeriousViolation(page);
});
