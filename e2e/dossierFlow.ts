import AxeBuilder from "@axe-core/playwright";
import { expect, type Browser, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, loginAs } from "./helpers";

/*
 * Shared steps of the online dossier tests (steps 7 and 8): candidate,
 * link, e-mail read in /admin/courriels, the phone, the form.
 */

export async function expectNoSeriousViolation(page: Page) {
  // Next streams the metadata after the content: wait for the title.
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

export function fictitious(tag: string) {
  const n = `${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 90 + 10))}`;
  return {
    firstName: `Dossier${tag}`,
    lastName: `Fictif${n}`,
    email: `e2e.dossier.${tag.toLowerCase()}.${n}@exemple.test`,
  };
}

/** DIAMANT creates a candidate and returns the ref of the page. */
export async function createCandidate(
  page: Page,
  who: ReturnType<typeof fictitious>,
): Promise<string> {
  await page.goto("/candidats");
  await page.getByRole("button", { name: "Nouveau candidat" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau candidat" });
  await dialog.locator("#nc-first").fill(who.firstName);
  await dialog.locator("#nc-last").fill(who.lastName);
  await dialog.locator("#nc-email").fill(who.email);
  await dialog.getByRole("button", { name: "Enregistrer le candidat" }).click();
  await page.waitForURL(/\/benevoles\/P-\d+\?onglet=integration/);
  return /\/benevoles\/(P-\d+)/.exec(page.url())?.[1] ?? "";
}

/** Creates a link from the Intégration tab, e-mails it, returns the link shown once. */
export async function createAndSendLink(page: Page): Promise<string> {
  await page.getByRole("button", { name: /Créer un (nouveau )?lien/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Créer le lien" }).click();
  const url = await dialog.locator("#dossier-link-url").inputValue();
  expect(url).toMatch(/\/dossier\/ouvrir#[A-Za-z0-9_-]{43}$/);
  await dialog.getByRole("button", { name: "Envoyer par e-mail" }).click();
  await expect(dialog.getByText(/Lien envoyé à/)).toBeVisible();
  await page.keyboard.press("Escape");
  return url;
}

/** TOPAZE reads the link of the latest e-mail sent to `email` (log driver). */
export async function linkFromMailLog(browser: Browser, email: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, "topaze");
  await page.goto("/admin/courriels");
  const mail = page.getByRole("listitem").filter({ hasText: email }).first();
  const href = await mail.getByTestId("mail-link").getAttribute("href");
  await context.close();
  return href ?? "";
}

export async function phone(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  return { context, page: await context.newPage() };
}

export const title = (page: Page) => page.getByTestId("dossier-step-title");

/** Picks a pill radio (the input is visually hidden: its label is clicked). */
export async function choose(page: Page, id: string) {
  await page.locator(`label:has(#${id})`).click();
}

export async function next(page: Page, expected: string) {
  await page.getByRole("button", { name: /^(Commencer|Continuer|Reprendre)$/ }).click();
  await expect(title(page)).toHaveText(expected);
  await expectNoSeriousViolation(page);
}

export async function fillAdultSteps(page: Page, birthDate: string) {
  await next(page, "Identité");
  // Fields at 16 px at least (no zoom on iOS), no horizontal scroll.
  const controls = page.locator("main input:not([type=radio]), main select");
  for (let i = 0; i < (await controls.count()); i += 1) {
    const size = await controls.nth(i).evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  }
  await expectNoHorizontalScroll(page);
  await page.getByText("Madame", { exact: true }).click();
  await page.locator("#dossier-identity-birthDate").fill(birthDate);
  await page.locator("#dossier-identity-birthCity").fill("Versailles");
  await page.locator("#dossier-identity-birthCountry").fill("France");
  await page.locator("#dossier-identity-birthDepartment").fill("78");
  await next(page, "Coordonnées");
  await page.locator("#dossier-contact-street").fill("1 rue des Exemples");
  await page.locator("#dossier-contact-postalCode").fill("78000");
  await page.locator("#dossier-contact-city").fill("Versailles");
  await page.locator("#dossier-contact-country").fill("France");
  await page.locator("#dossier-contact-phone").fill("06 39 98 00 01");
  await next(page, "Croix-Rouge");
  await choose(page, "dossier-crf-alreadyVolunteer-1");
  await choose(page, "dossier-crf-hasNivol");
  await page.locator("#dossier-crf-nivol").fill("00012345678A");
  await choose(page, "dossier-crf-hasCrfEmail-1");
  await page.getByText("Formation grand public").click();
  await next(page, "Personne à prévenir");
  await page.locator("#dossier-emergency-lastName").fill("Exemple");
  await page.locator("#dossier-emergency-firstName").fill("Dominique");
  await page.locator("#dossier-emergency-relationship").fill("Sœur");
  await page.locator("#dossier-emergency-phone1").fill("06 39 98 00 02");
  await next(page, "Profil");
  await page.locator("#dossier-profile-profession").fill("Comptable");
  await page.getByRole("button", { name: "Ajouter une compétence" }).click();
  await page.locator("#dossier-skill-0").fill("Informatique");
  await page.locator("#dossier-skill-0-level").selectOption("CONFIRMED");
  await page.getByText("Permis B", { exact: true }).click();
  await expect(page.getByTestId("dossier-save-status")).toContainText("Enregistré", {
    timeout: 15_000,
  });
}
