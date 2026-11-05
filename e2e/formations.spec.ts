import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Step 10: group entry with a warning accepted (FORMAT), Trouver (ACTION),
 * an appointment (LASER). Runs late: entries change perimeters.
 */

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

test.describe("Formations (bureau)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Écrans de bureau.");
  });

  test("FORMAT : saisie de groupe de 5 personnes, un avertissement accepté", async ({ page }) => {
    await loginAs(page, "format");
    await page.goto("/formations");
    await expect(page).toHaveURL(/\/formations\/sessions$/);
    await expectNoSeriousViolation(page);
    await page.getByRole("link", { name: "Saisie de groupe" }).click();
    await page.locator("#ge-ref").selectOption({ label: "GQS — Gestes qui sauvent" });
    // A date in the future: a warning, never a block.
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await page.locator("#ge-date").fill(future);
    const boxes = page.getByTestId("group-people").getByRole("checkbox");
    for (let i = 0; i < 5; i += 1) await boxes.nth(i).check({ force: true });
    await expectNoSeriousViolation(page);
    await page.getByRole("button", { name: "Vérifier et enregistrer" }).click();
    const warnings = page.getByTestId("warnings");
    await expect(warnings).toContainText("dans le futur");
    await expectNoSeriousViolation(page);
    await warnings.getByRole("button", { name: "Enregistrer quand même" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "5 lignes enregistrées." }),
    ).toBeVisible();

    for (const tab of ["Listes d'attente", "Référentiel", "Trouver", "Sessions"]) {
      await page.getByRole("link", { name: tab, exact: true }).click();
      await expectNoSeriousViolation(page);
    }
    await page
      .getByRole("link")
      .filter({ hasText: /^PSE — / })
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /PSE — / })).toBeVisible();
    await expectNoSeriousViolation(page);
  });

  test("ACTION trouve une équipe PSE + PSC et copie les e-mails", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAs(page, "action");
    await page.goto("/formations");
    await expect(page).toHaveURL(/\/formations\/trouver$/);
    await page.getByLabel("Compétence 1").selectOption("PSE");
    await page.getByLabel("Compétence 2").selectOption("PSC");
    await page.getByRole("button", { name: "Trouver", exact: true }).click();
    await expect(page).toHaveURL(/c1=PSE&c2=PSC/);
    const team = page.getByTestId("team");
    await expect(team.getByRole("listitem").first()).toBeVisible();
    await expect(team.locator('a[href^="mailto:"]').first()).toBeVisible();
    await expectNoSeriousViolation(page);
    await page.getByRole("button", { name: "Copier les e-mails" }).click();
    await expect(page.getByText(/e-mails? copiés?\./)).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toMatch(/@/);
    expect(copied.split(";").length).toBe(await team.locator('a[href^="mailto:"]').count());
  });

  test("LASER nomme un CI depuis l'onglet Fonctions", async ({ page }) => {
    await loginAs(page, "laser");
    await page.goto("/benevoles?perimetre=LASER&statut=ACTIVE");
    const href = await page.locator('a[href^="/benevoles/P-"]').first().getAttribute("href");
    expect(href).toMatch(/^\/benevoles\/P-\d+/);
    await page.goto(`${(href ?? "").split("?")[0] ?? ""}?onglet=fonctions`);
    await page.getByRole("button", { name: "Nommer" }).click();
    const dialog = page.getByRole("dialog", { name: "Nommer à une fonction" });
    await dialog
      .getByLabel("Fonction")
      .selectOption({ label: "CI — Chef d'intervention (fonction)" });
    await expectNoSeriousViolation(page);
    await dialog.getByRole("button", { name: "Nommer" }).click();
    // No « autorisée par »: a warning, then « Enregistrer quand même ».
    await expect(dialog.getByTestId("warnings")).toContainText("qui l'a autorisée");
    await dialog.getByRole("button", { name: "Enregistrer quand même" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(/^CI — Chef d'intervention/).first()).toBeVisible();
  });
});
