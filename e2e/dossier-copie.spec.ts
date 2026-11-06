import { expect, test } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Step 16: copy the received dossier, field by field, by section or all of
 * it. Read only (seed dossier of P-00059, complete). Nothing is copyable
 * before the journaled « Afficher le dossier ».
 */

test.describe("Copier le dossier reçu", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Écran de bureau.");
  });

  test("un champ, une section, tout ; rien tant que le dossier est masqué", async ({
    browser,
    baseURL,
  }) => {
    const context = await browser.newContext({
      baseURL,
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await loginAs(page, "topaze");
    await page.goto("/benevoles/P-00059/dossier");
    const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

    // Masked at first: no copy button, no value.
    await expect(page.getByRole("button", { name: "Afficher le dossier" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Copier/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tout copier" })).toHaveCount(0);

    await page.getByRole("button", { name: "Afficher le dossier" }).click();

    // One field: the last name, in capitals.
    const lastName = page.getByTestId("review-lastName");
    await lastName.getByRole("button", { name: "Copier Nom" }).click();
    await expect(lastName.getByText("Copié", { exact: true })).toBeVisible();
    const copiedName = await clipboard();
    expect(copiedName).toBe(copiedName.toLocaleUpperCase("fr-FR"));
    expect(copiedName.length).toBeGreaterThan(1);

    // Birth date (sensitive, shown on demand): JJ/MM/AAAA.
    await page
      .getByTestId("review-birthDate")
      .getByRole("button", { name: /^Copier/ })
      .click();
    expect(await clipboard()).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    // Phones without spaces, remembered in the browser.
    await page.getByLabel("Téléphones copiés").selectOption("compact");
    await page
      .getByTestId("review-phone")
      .getByRole("button", { name: /^Copier/ })
      .click();
    expect(await clipboard()).toMatch(/^0\d{9}$/);

    // A section: « Champ<TAB>Valeur » lines.
    await page.getByRole("button", { name: "Copier la section Identité et coordonnées" }).click();
    const section = await clipboard();
    expect(section.split("\n").length).toBeGreaterThan(3);
    expect(section.split("\n").every((l) => l.includes("\t"))).toBe(true);

    // Everything, the address in one line.
    await page.getByLabel("Adresse copiée").selectOption("oneLine");
    await page.getByRole("button", { name: "Tout copier" }).click();
    const all = await clipboard();
    expect(all).toMatch(/^Adresse\t.+, \d{5} .+/m);
    expect(all.split("\n").length).toBeGreaterThan(section.split("\n").length);

    await page.reload();
    await page.getByRole("button", { name: "Afficher le dossier" }).click();
    await expect(page.getByLabel("Téléphones copiés")).toHaveValue("compact");
    await context.close();
  });
});
