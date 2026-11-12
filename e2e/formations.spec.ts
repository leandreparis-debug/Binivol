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

  test("TOPAZE ajoute, modifie puis supprime une formation depuis une case de la matrice", async ({
    page,
  }) => {
    await loginAs(page, "topaze");
    await page.goto("/formations/matrice?categorie=FORMATION_IS");
    const matrix = page.getByTestId("matrix");
    const empty = matrix.getByRole("button", { name: /^[A-Z_]+ : aucune — / }).first();
    const key = await empty.getAttribute("data-cell");
    expect(key).toMatch(/^P-\d+:[A-Z_]+$/);
    const cell = matrix.locator(`[data-cell="${key ?? ""}"]`);
    // While the dialog is open, the page behind it is hidden from assistive
    // technologies (aria-hidden): read the cell's label text instead.
    const cellLabel = cell.locator(".sr-only");
    await cell.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Aucune ligne pour cette formation.")).toBeVisible();
    await expectNoSeriousViolation(page);

    // Add: a pass (warnings accepted if any).
    await dialog.getByLabel("Lieu").fill("Versailles");
    await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
    const warnings = dialog.getByTestId("warnings");
    const line = dialog.getByTestId("matrix-line");
    await expect(line.or(warnings).first()).toBeVisible();
    if (await warnings.isVisible()) {
      await warnings.getByRole("button", { name: "Enregistrer quand même" }).click();
    }
    await expect(line).toHaveCount(1);
    await expect(line).toContainText("Validé");
    await expect(line).toContainText("Versailles");
    await expect(cellLabel).toHaveText(/: valide/);

    // Change: the result.
    await line.getByRole("button", { name: /^Modifier la ligne/ }).click();
    await line.getByLabel("Résultat").selectOption("FAILED");
    await line.getByRole("button", { name: "Enregistrer la modification" }).click();
    await expect(line).toContainText("Non validé");
    await expect(cellLabel).toHaveText(/: aucune/);

    // Remove: cancelled with a reason (kept in the history).
    await line.getByRole("button", { name: /^Supprimer la ligne/ }).click();
    const confirm = line.getByRole("button", { name: "Supprimer la ligne", exact: true });
    await confirm.click();
    await expect(line.getByText("Le motif est obligatoire.")).toBeVisible();
    await line.getByLabel("Motif de la suppression").fill("Saisie de test");
    await confirm.click();
    await expect(dialog.getByText("Aucune ligne pour cette formation.")).toBeVisible();
    await dialog.getByRole("button", { name: "Fermer" }).last().click();
    await expect(dialog).toBeHidden();
    await expect(cell).toHaveAccessibleName(/: aucune — /);
  });

  test("ACTION voit la matrice en lecture seule", async ({ page }) => {
    await loginAs(page, "action");
    await page.goto("/formations/matrice");
    const matrix = page.getByTestId("matrix");
    await expect(matrix.locator("td").first()).toHaveAttribute("aria-label", /^[A-Z_]+ : /);
    await expect(matrix.getByRole("button")).toHaveCount(0);
  });
});
