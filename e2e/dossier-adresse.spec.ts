import { expect, test } from "@playwright/test";
import {
  createAndSendLink,
  createCandidate,
  expectNoSeriousViolation,
  fictitious,
  next,
  phone,
  title,
} from "./dossierFlow";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Online dossier, step 16: addresses proposed while typing. The e2e server
 * runs `ADDRESS_PROVIDER=fake` (synthetic streets, no network); postal codes
 * and communes come from the local La Poste file.
 */

test("sans cookie de dossier, la route des adresses répond 401", async ({ request }) => {
  const response = await request.post("/dossier/adresse", {
    data: { kind: "address", q: "10 rue de la Paroisse" },
  });
  expect(response.status()).toBe(401);
});

test.describe("Adresses proposées (téléphone 390 px)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Parcours téléphone.");
  });

  test("choisir une adresse préremplit voie, code postal, ville et pays ; le code postal propose ses communes", async ({
    page,
    browser,
  }) => {
    const who = fictitious("Adresse");
    await loginAs(page, "diamant");
    await createCandidate(page, who);
    const url = await createAndSendLink(page);

    const candidate = await phone(browser);
    const requests: string[] = [];
    candidate.page.on("request", (r) => {
      requests.push(r.url());
    });
    await candidate.page.goto(url);
    await expect(title(candidate.page)).toHaveText("Accueil");
    await next(candidate.page, "Identité");
    await candidate.page.getByText("Madame", { exact: true }).click();
    await candidate.page.locator("#dossier-identity-birthDate").fill("1990-05-04");
    await candidate.page.locator("#dossier-identity-birthCity").fill("Versailles");
    await candidate.page.locator("#dossier-identity-birthCountry").fill("France");
    await candidate.page.locator("#dossier-identity-birthDepartment").fill("78");
    await next(candidate.page, "Coordonnées");

    const street = candidate.page.locator("#dossier-contact-street");
    await expect(street).toHaveAttribute("role", "combobox");
    await expect(street).toHaveAttribute("autocomplete", "street-address");
    await street.fill("12 rue");
    const list = candidate.page.getByRole("listbox", { name: "Adresses proposées" });
    await expect(list).toBeVisible();
    await expect(list.getByRole("option")).toHaveCount(3); // 2 suggestions + « Je ne trouve pas… »
    await expect(candidate.page.getByText("2 propositions, flèches pour choisir.")).toBeAttached();
    const option = list.getByRole("option").first();
    expect((await option.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expectNoSeriousViolation(candidate.page);
    await street.press("ArrowDown");
    await street.press("Enter");
    await expect(street).toHaveValue("12 Rue des Essais (fictive)");
    await expect(candidate.page.locator("#dossier-contact-postalCode")).toHaveValue("78000");
    await expect(candidate.page.locator("#dossier-contact-city")).toHaveValue("Ville fictive");
    await expect(candidate.page.locator("#dossier-contact-country")).toHaveValue("France");

    // A postal code typed alone proposes its communes (local file).
    const postal = candidate.page.locator("#dossier-contact-postalCode");
    await postal.fill("78120");
    const communes = candidate.page.getByRole("listbox", { name: "Communes proposées" });
    await expect(communes.getByRole("option", { name: "78120 Rambouillet" })).toBeVisible();
    await communes.getByRole("option", { name: "78120 Rambouillet" }).click();
    await expect(candidate.page.locator("#dossier-contact-city")).toHaveValue("Rambouillet");

    // « Je ne trouve pas mon adresse » leaves free typing, Échap closes the list.
    await street.fill("Lieu-dit les Essarts");
    await expect(list).toBeVisible();
    await list.getByRole("option", { name: /Je ne trouve pas mon adresse/ }).click();
    await expect(list).toBeHidden();
    await expect(street).toHaveValue("Lieu-dit les Essarts");

    // The browser never calls a third party: only our own server.
    const origin = new URL(url).origin;
    expect(requests.filter((r) => !r.startsWith(origin) && !r.startsWith("data:"))).toEqual([]);
    await candidate.context.close();
  });
});
