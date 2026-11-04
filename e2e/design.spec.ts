import { expect, test } from "@playwright/test";

test("/design présente le design system avec le bandeau « Données fictives »", async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
  await expect(page.getByTestId("fake-data")).toHaveText("Données fictives");
  for (const id of [
    "logo",
    "couleurs",
    "typographie",
    "boutons",
    "cartes",
    "chips",
    "formulaires",
    "tableau",
    "visualisations",
  ]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  await expect(page.getByRole("progressbar")).toHaveCount(3);
});
