import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Step 11: DIAMANT completes a 3-month point, TOPAZE records a departure.
 * Runs late (a departure changes the directory counts) and serially (the
 * board loses the person who left).
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

test.describe("Suivi des bénévoles", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Parcours de bureau (la liste est testée par axe).");
  });

  test("DIAMANT complète un point à 3 mois ; le point annuel suivant est planifié", async ({
    page,
  }) => {
    await loginAs(page, "diamant");
    await page.goto("/candidats");
    await page.getByRole("link", { name: "Suivi des bénévoles" }).click();
    await expect(page).toHaveURL(/\/candidats\/suivi$/);
    const board = page.getByTestId("follow-up-board");
    await expect(board).toContainText("En retard");
    await expect(page.getByText("Fin proposée").first()).toBeVisible();
    await expectNoSeriousViolation(page);

    const item = board.getByRole("listitem").filter({ hasText: "Point à 3 mois" }).first();
    await item.getByRole("link").click();
    await expect(page).toHaveURL(/onglet=suivi/);
    await expectNoSeriousViolation(page);

    await page.getByRole("button", { name: "Compléter le point" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Compte rendu").fill("Point fictif : tout se passe bien.");
    await expectNoSeriousViolation(page);
    await dialog.getByRole("button", { name: "Enregistrer le point" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Point fictif : tout se passe bien.")).toBeVisible();
    await expect(page.getByText("Point annuel").first()).toBeVisible();
  });

  test("TOPAZE enregistre un départ : nominations et parrainages clos", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/candidats/suivi");
    const item = page
      .getByTestId("follow-up-board")
      .getByRole("listitem")
      .filter({ hasText: "Point annuel" })
      .first();
    await item.getByRole("link").click();
    await expect(page).toHaveURL(/onglet=suivi/);

    await page.getByRole("button", { name: "Changer le statut" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#status-choice").selectOption("LEFT");
    await dialog.locator("#left-at").fill(new Date().toISOString().slice(0, 10));
    await dialog.locator("#left-reason").selectOption("MOVED");
    await expect(
      dialog.getByRole("checkbox", { name: "Terminer les nominations en cours à cette date" }),
    ).toBeChecked();
    await expect(
      dialog.getByRole("checkbox", { name: "Clore les parrainages en cours à cette date" }),
    ).toBeChecked();
    await expectNoSeriousViolation(page);
    await dialog.getByRole("button", { name: "Enregistrer le statut" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Parti(e)").first()).toBeVisible();
    await expect(page.getByText(/Départ le .*(Déménagement)/)).toBeVisible();
  });
});
