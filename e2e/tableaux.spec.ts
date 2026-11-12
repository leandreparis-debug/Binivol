import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/* Step 13: home blocks per profile, the competence matrix, the préfecture export. */

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

test("un compte FORMAT + DIAMANT voit les blocs de ses deux profils, sans autre", async ({
  page,
}) => {
  await loginAs(page, "format-diamant");
  await expect(page.getByTestId("dashboard-FORMAT")).toBeVisible();
  await expect(page.getByTestId("dashboard-DIAMANT")).toBeVisible();
  await expect(page.getByTestId("dashboard-TOPAZE")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-ACTION")).toHaveCount(0);
  await expect(page.locator("[data-variant='highlight']")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Entonnoir de recrutement" })).toBeVisible();
  await expectNoSeriousViolation(page);
});

test("la matrice se parcourt au clavier", async ({ page }, testInfo) => {
  await loginAs(page, "format");
  await page.goto("/formations/matrice");
  await expectNoSeriousViolation(page);
  if (isMobileProject(testInfo)) {
    await expect(page.getByTestId("matrix-mobile").getByRole("listitem").first()).toBeVisible();
    return;
  }
  const matrix = page.getByTestId("matrix");
  await matrix.focus();
  await expect(matrix).toBeFocused();
  const before = await matrix.evaluate((el) => el.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => matrix.evaluate((el) => el.scrollLeft)).toBeGreaterThan(before);
  // Every cell carries a complete label (on the cell, or on its button when editable).
  const cell = matrix.locator("td").first();
  const label = await cell.getAttribute("aria-label");
  if (label === null) await expect(cell.getByRole("button")).toHaveAccessibleName(/^[A-Z_]+ : /);
  else expect(label).toMatch(/^[A-Z_]+ : /);
  await page.getByRole("link", { name: "Tronc commun" }).click();
  await expect(page).toHaveURL(/categorie=TRONC_COMMUN/);
});

test("TOPAZE télécharge l'export préfecture", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Téléchargement testé sur bureau.");
  await loginAs(page, "topaze");
  await page.goto("/admin/exports");
  await expect(page.getByText("À vérifier dans Pegass avant envoi")).toBeVisible();
  await expectNoSeriousViolation(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: /Télécharger l'export préfecture/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^binivol-prefecture-\d{4}-\d{2}-\d{2}\.csv$/);
});
