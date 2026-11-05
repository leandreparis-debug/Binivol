import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, isMobileProject, loginAs } from "./helpers";

/*
 * Online dossier (step 7): link created by DIAMANT, e-mailed (log driver,
 * read in /admin/courriels by TOPAZE), filled on a phone by the candidate in
 * a separate session, then reviewed and reported. Fictitious data only.
 */

async function expectNoSeriousViolation(page: Page) {
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

function fictitious(tag: string) {
  const n = `${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 90 + 10))}`;
  return {
    firstName: `Dossier${tag}`,
    lastName: `Fictif${n}`,
    email: `e2e.dossier.${tag.toLowerCase()}.${n}@exemple.test`,
  };
}

/** DIAMANT creates a candidate and returns the ref of the page. */
async function createCandidate(page: Page, who: ReturnType<typeof fictitious>): Promise<string> {
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
async function createAndSendLink(page: Page): Promise<string> {
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
async function linkFromMailLog(browser: Browser, email: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, "topaze");
  await page.goto("/admin/courriels");
  const mail = page.getByRole("listitem").filter({ hasText: email }).first();
  const href = await mail.getByTestId("mail-link").getAttribute("href");
  await context.close();
  return href ?? "";
}

/** TOPAZE reads the signature code of the latest code e-mail sent to `email` (log driver). */
async function codeFromMailLog(browser: Browser, email: string): Promise<string> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, "topaze");
  await page.goto("/admin/courriels");
  const mail = page
    .getByRole("listitem")
    .filter({ hasText: email })
    .filter({ hasText: "Ton code de signature" })
    .first();
  const text = (await mail.textContent()) ?? "";
  await context.close();
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  expect(code, "code de signature dans /admin/courriels").toBeTruthy();
  return code ?? "";
}

/** Draws a fictitious signature in the pad (pointer events, as a finger would). */
async function drawSignature(page: Page) {
  const canvas = page.getByTestId("signature-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas");
  await page.mouse.move(box.x + 20, box.y + box.height * 0.7);
  await page.mouse.down();
  for (let i = 1; i <= 24; i += 1) {
    const x = box.x + 20 + (i * (box.width - 40)) / 24;
    const y = box.y + box.height * (0.5 + 0.25 * Math.sin(i / 2));
    await page.mouse.move(x, y);
  }
  await page.mouse.up();
}

const signatureTitle = (page: Page) => page.getByTestId("signature-step-title");

/** Trace (or typed name), then the e-mailed code: one signer of the flow. */
async function signWithCode(
  browser: Browser,
  page: Page,
  email: string,
  how: "draw" | "type" = "draw",
) {
  await expect(page.getByTestId("signature-canvas")).toBeVisible();
  await expectNoSeriousViolation(page);
  if (how === "draw") {
    // An empty trace is refused.
    await page.getByRole("button", { name: "Valider la signature" }).click();
    await expect(page.getByText(/La signature est vide/)).toBeVisible();
    await drawSignature(page);
  } else {
    // Keyboard alternative: the full name, rendered in a handwriting font.
    await page.getByRole("button", { name: "Saisir mon nom" }).click();
    await expect(page.getByLabel("Ton nom complet")).not.toHaveValue("");
    await expectNoSeriousViolation(page);
  }
  await page.getByRole("button", { name: "Valider la signature" }).click();
  await expect(page.getByRole("button", { name: "Recevoir mon code" })).toBeVisible();
  await expectNoSeriousViolation(page);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText(/est envoyé par e-mail à/)).toBeVisible();
  const code = await codeFromMailLog(browser, email);
  await page.getByLabel("Code reçu par e-mail").fill(code);
  await expectNoSeriousViolation(page);
  await page.getByRole("button", { name: "Signer", exact: true }).click();
}

async function phone(browser: Browser) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
  });
  return { context, page: await context.newPage() };
}

const title = (page: Page) => page.getByTestId("dossier-step-title");

/** Picks a pill radio (the input is visually hidden: its label is clicked). */
async function choose(page: Page, id: string) {
  await page.locator(`label:has(#${id})`).click();
}

async function next(page: Page, expected: string) {
  await page.getByRole("button", { name: /^(Commencer|Continuer|Reprendre)$/ }).click();
  await expect(title(page)).toHaveText(expected);
  await expectNoSeriousViolation(page);
}

async function fillAdultSteps(page: Page, birthDate: string) {
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

test.describe("Dossier en ligne (mobile 390 px)", () => {
  // Long flows (two or three sessions, axe on every step).
  test.describe.configure({ timeout: 120_000 });
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Parcours candidat sur téléphone : projet mobile.");
  });

  test("lien envoyé par e-mail, dossier rempli sur téléphone, relu puis reporté", async ({
    page,
    browser,
  }) => {
    const who = fictitious("Majeur");
    await loginAs(page, "diamant");
    const ref = await createCandidate(page, who);
    const shown = await createAndSendLink(page);
    await expect(page.getByTestId("dossier-link").first()).toContainText("Actif");

    const url = await linkFromMailLog(browser, who.email);
    expect(url).toBe(shown);

    const candidate = await phone(browser);
    const token = url.split("#").at(-1) ?? "";
    const addresses: string[] = [];
    candidate.page.on("request", (request) => addresses.push(request.url()));
    await candidate.page.goto(url);
    // The token is exchanged for a cookie: it leaves the address bar.
    await expect(candidate.page).toHaveURL(/\/dossier$/);
    expect(candidate.page.url()).not.toContain(token);
    // The token is after `#`: no address received by the server holds it (ADR-043).
    expect(addresses.some((a) => a.includes("/dossier/ouvrir"))).toBe(true);
    expect(addresses.filter((a) => a.includes(token))).toEqual([]);
    await expect(title(candidate.page)).toHaveText("Accueil");
    await expectNoSeriousViolation(candidate.page);

    await fillAdultSteps(candidate.page, "1995-04-12");
    await candidate.context.close();

    // Second time: the browser was closed, the link opens the same draft again.
    const again = await phone(browser);
    await again.page.goto(url);
    await expect(again.page).toHaveURL(/\/dossier$/);
    await expect(again.page.getByRole("button", { name: "Reprendre" })).toBeVisible();
    await next(again.page, "Relecture et envoi");
    await expect(again.page.getByText("Comptable")).toBeVisible();
    await again.page.getByRole("button", { name: "Envoyer mon dossier" }).click();
    await expect(again.page.getByText(/Cochez la case/)).toBeVisible();
    await again.page.getByText(/J'ai lu l'information/).click();
    await again.page.getByRole("button", { name: "Envoyer mon dossier" }).click();
    // Sent: the page goes straight to the signature screens.
    await expect(signatureTitle(again.page)).toHaveText("Signature");
    await expectNoSeriousViolation(again.page);

    // Sent, not signed: the link only opens the signature screens (ADR-045).
    await again.page.goto(url);
    await expect(again.page).toHaveURL(/\/dossier$/);
    await expect(signatureTitle(again.page)).toHaveText("Signature");
    await expect(again.page.getByRole("link", { name: /Charte du bénévolat/ })).toBeVisible();
    await expectNoSeriousViolation(again.page);
    await expectNoHorizontalScroll(again.page);
    // Preview before signing: a PDF generated on the fly.
    const preview = await again.page.request.get("/dossier/apercu/charte");
    expect(preview.status()).toBe(200);
    expect(preview.headers()["content-type"]).toBe("application/pdf");
    await again.page.getByRole("button", { name: "Je signe" }).click();
    await signWithCode(browser, again.page, who.email);
    await expect(signatureTitle(again.page)).toHaveText("Ton dossier est signé");
    await expectNoSeriousViolation(again.page);

    // Consumed once signed: the same link now gets the neutral page.
    await again.page.goto(url);
    await expect(again.page.getByRole("heading", { level: 1 })).toHaveText(
      "Ce lien n'est plus valable.",
    );
    await again.context.close();

    // Review: page empty → checked by default; NIVOL never reportable.
    await page.goto(`/benevoles/${ref}?onglet=integration`);
    await page.getByRole("link", { name: "Voir le dossier" }).click();
    await page.getByRole("button", { name: "Afficher le dossier" }).click();
    const street = page.getByTestId("review-street");
    await expect(street).toContainText("1 rue des Exemples");
    await expect(street.getByRole("checkbox")).toBeChecked();
    await expect(page.getByTestId("review-nivol")).toContainText("Non reporté");
    await expect(page.getByTestId("review-nivol").getByRole("checkbox")).toHaveCount(0);
    await expectNoSeriousViolation(page);
    await page.getByRole("button", { name: /Reporter dans la fiche/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Report effectué" })).toBeVisible();
    await expect(page.getByTestId("review-street")).toContainText("Identique");

    // The page now holds the reported values.
    await page.goto(`/benevoles/${ref}?onglet=apercu`);
    await expect(page.getByText("06 39 98 00 01")).toBeVisible();

    // Counter-signature (keyboard alternative: the name typed), then the charter downloaded.
    await page.goto(`/benevoles/${ref}?onglet=integration`);
    await expect(page.getByTestId("signature-state")).toContainText("À contresigner");
    await page.getByRole("button", { name: "Contresigner" }).click();
    const dialog = page.getByRole("dialog", { name: "Contresigner la charte" });
    await expect(dialog.getByLabel("Qualité")).toHaveValue(/DIAMANT/);
    await expectNoSeriousViolation(page);
    await dialog.getByRole("button", { name: "Saisir mon nom" }).click();
    await dialog.getByRole("button", { name: "Contresigner et envoyer" }).click();
    await expect(dialog.getByRole("status")).toContainText("Dossier complet", {
      timeout: 30_000,
    });
    await dialog.getByRole("button", { name: "Terminer" }).click();
    await expect(page.getByTestId("signature-state")).toContainText("Complet");
    await expect(page.getByTestId("signature-state")).toContainText("E-mail envoyé");

    await page.goto(`/benevoles/${ref}?onglet=documents`);
    const charter = page.getByRole("link", { name: /Télécharger Charte du bénévolat/ });
    const [download] = await Promise.all([page.waitForEvent("download"), charter.click()]);
    expect(await download.failure()).toBeNull();
    // The exact name travels in `filename*` (RFC 5987). The headless Chromium of the
    // tests does not decode a non-ASCII `filename*` (it says « download »): the header
    // itself is checked.
    const href = (await charter.getAttribute("href")) ?? "";
    const response = await page.request.get(href);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(response.headers()["content-disposition"]).toMatch(
      /filename\*=UTF-8''FICTIF\d+_Dossiermajeur_Charte-du-B%C3%A9n%C3%A9volat\.pdf$/,
    );
    await expect(page.getByText(/_Preuve-de-signature\.pdf$/)).toBeVisible();
  });

  test("un candidat de 15 ans : représentant légal et autorisation parentale", async ({
    page,
    browser,
  }) => {
    const who = fictitious("Mineur");
    await loginAs(page, "diamant");
    await createCandidate(page, who);
    const url = await createAndSendLink(page);
    const candidate = await phone(browser);
    await candidate.page.goto(url);
    const fifteen = new Date();
    fifteen.setUTCFullYear(fifteen.getUTCFullYear() - 15);
    fifteen.setUTCDate(fifteen.getUTCDate() - 30);
    await fillAdultSteps(candidate.page, fifteen.toISOString().slice(0, 10));
    await next(candidate.page, "Représentant légal");
    await candidate.page.locator("#dossier-guardian-lastName").fill("Exemple");
    await candidate.page.locator("#dossier-guardian-firstName").fill("Dominique");
    await candidate.page.locator("#dossier-guardian-quality").selectOption("Mère");
    await candidate.page.locator("#dossier-guardian-phone").fill("06 39 98 00 03");
    await candidate.page.locator("#dossier-guardian-email").fill(`parent.${who.email}`);
    await next(candidate.page, "Pièces jointes");
    await candidate.page.getByRole("button", { name: "Continuer" }).click();
    await expect(candidate.page.getByText(/autorisation parentale est obligatoire/)).toBeVisible();
    await candidate.page.locator("#dossier-file-PARENTAL_AUTH").setInputFiles({
      name: "autorisation-fictive.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% Fictif\n%%EOF\n"),
    });
    await expect(candidate.page.getByText("autorisation-fictive.pdf")).toBeVisible();
    await next(candidate.page, "Relecture et envoi");
    await candidate.page.getByText(/J'ai lu l'information/).click();
    await candidate.page.getByRole("button", { name: "Envoyer mon dossier" }).click();
    await expect(signatureTitle(candidate.page)).toHaveText("Signature");

    // The minor signs (keyboard alternative), then her legal guardian with her own code.
    await candidate.page.getByRole("button", { name: "Je signe" }).click();
    await signWithCode(browser, candidate.page, who.email, "type");
    await expect(signatureTitle(candidate.page)).toHaveText("Au tour de ton représentant légal");
    await expectNoSeriousViolation(candidate.page);
    await candidate.page.getByRole("button", { name: "Continuer" }).click();
    await signWithCode(browser, candidate.page, `parent.${who.email}`);
    await expect(signatureTitle(candidate.page)).toHaveText("Ton dossier est signé");
    await candidate.context.close();
  });

  test("un lien inconnu, révoqué ou sans session donne la même page neutre", async ({
    page,
    browser,
  }) => {
    const neutral = async (p: Page) => {
      await expect(p.getByRole("heading", { level: 1 })).toHaveText("Ce lien n'est plus valable.");
      await expect(p.getByText("Contactez l'unité locale.")).toBeVisible();
    };
    const visitor = await phone(browser);
    await visitor.page.goto("/dossier/ouvrir#" + "x".repeat(43));
    await expect(visitor.page).toHaveURL(/\/dossier\/lien-invalide$/);
    await neutral(visitor.page);
    await expectNoSeriousViolation(visitor.page);
    await visitor.page.goto("/dossier");
    await neutral(visitor.page);

    const who = fictitious("Revoque");
    await loginAs(page, "diamant");
    await createCandidate(page, who);
    const first = await createAndSendLink(page);
    // A new link revokes the previous one.
    await createAndSendLink(page);
    await visitor.page.goto(first);
    await neutral(visitor.page);
    await visitor.context.close();
  });

  test("mode sur place : sans navigation, bandeau et retour au responsable", async ({ page }) => {
    const who = fictitious("SurPlace");
    await loginAs(page, "diamant");
    const ref = await createCandidate(page, who);
    await page.getByRole("button", { name: "Remplir sur place" }).click();
    await page.waitForURL(new RegExp(`/benevoles/${ref}/dossier/sur-place$`));
    await expect(page.getByRole("region", { name: "Mode sur place" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: /Navigation principale/ })).toHaveCount(0);
    await next(page, "Identité");
    await page.locator("#dossier-identity-birthCity").fill("Versailles");
    await expect(page.getByTestId("dossier-save-status")).toContainText("Enregistré", {
      timeout: 15_000,
    });
    await page.getByRole("link", { name: "Rendre l'appareil au responsable" }).click();
    await page.waitForURL(new RegExp(`/benevoles/${ref}\\?onglet=integration`));
    await expect(page.getByTestId("dossier-link").first()).toContainText("Sur place");
  });
});
