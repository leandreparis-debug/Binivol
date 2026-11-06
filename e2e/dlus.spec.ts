import { expect, test } from "@playwright/test";
import { expectNoSeriousViolation } from "./dossierFlow";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Step 16: the DLUS dashboard on TOPAZE's home page. Each figure opens the
 * directory filtered on the people it counts: same total.
 */

test("le DLUS voit les trois zones ; « Bénurs » ouvre la bonne liste", async ({
  page,
}, testInfo) => {
  await loginAs(page, "topaze");
  await page.goto("/");
  const dashboard = page.getByTestId("dlus-dashboard");
  await expect(dashboard.getByRole("heading", { name: "Effectifs opérationnels" })).toBeVisible();
  await expect(dashboard.getByRole("heading", { name: "Arrivées", exact: true })).toBeVisible();
  await expect(
    dashboard.getByRole("heading", { name: "Dernières inscriptions en formation" }),
  ).toBeVisible();
  // One highlighted figure on the screen: « Secouristes ».
  await expect(page.locator('[data-variant="highlight"]')).toHaveCount(1);
  await expect(page.locator('[data-variant="highlight"]')).toContainText("Secouristes");
  if (!isMobileProject(testInfo)) await expectNoSeriousViolation(page);

  const benurs = page.getByTestId("indicator-BENURS");
  const value = (await benurs.locator("p.font-display").innerText()).trim();
  expect(Number(value)).toBeGreaterThan(0);
  await benurs.click();
  await expect(page).toHaveURL(/\/benevoles\?indicateur=BENURS$/);
  await expect(page.getByText("Indicateur du tableau de bord : Bénurs")).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: /personnes?$/ })).toHaveText(
    `${value} ${Number(value) > 1 ? "personnes" : "personne"}`,
  );

  // The period selector of « Arrivées ».
  await page.goto("/?periode=precedente");
  await expect(page.getByRole("link", { name: "Année précédente" })).toHaveAttribute(
    "aria-current",
    "true",
  );
});

test("un autre profil garde ses blocs, sans le tableau DLUS", async ({ page }) => {
  await loginAs(page, "diamant");
  await page.goto("/");
  await expect(page.getByTestId("dlus-dashboard")).toHaveCount(0);
  await expect(page.getByTestId("dashboard-DIAMANT")).toBeVisible();
});
