import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  createAndSendLink,
  createCandidate,
  expectNoSeriousViolation,
  fictitious,
  fillAdultSteps,
  next,
  phone,
} from "./dossierFlow";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Electronic signature (step 8): the candidate signs on a phone with a code
 * read in /admin/courriels (log driver), the guardian of a minor signs with
 * her own code, a responsible countersigns and downloads the charte.
 */

const signingTitle = (page: Page) => page.getByTestId("signing-title");

/** TOPAZE reads the latest signature code sent to `email`. */
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
  return /Ton code de signature : (\d{6})/.exec(text)?.[1] ?? "";
}

async function drawSignature(page: Page) {
  const canvas = page.getByTestId("signature-canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error("canvas");
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 0; i <= 40; i += 1) {
    await page.mouse.move(
      box.x + 20 + (i * (box.width - 40)) / 40,
      box.y + box.height / 2 + Math.sin(i / 3) * (box.height / 5),
    );
  }
  await page.mouse.up();
}

/** A candidate fills and sends the dossier on a phone; returns the phone page. */
async function sentDossier(
  browser: Browser,
  page: Page,
  who: ReturnType<typeof fictitious>,
  minor = false,
) {
  await loginAs(page, "diamant");
  const ref = await createCandidate(page, who);
  const url = await createAndSendLink(page);
  const candidate = await phone(browser);
  await candidate.page.goto(url);
  let birth = "1995-04-12";
  if (minor) {
    const fifteen = new Date();
    fifteen.setUTCFullYear(fifteen.getUTCFullYear() - 15);
    fifteen.setUTCDate(fifteen.getUTCDate() - 30);
    birth = fifteen.toISOString().slice(0, 10);
  }
  await fillAdultSteps(candidate.page, birth);
  if (minor) {
    await next(candidate.page, "Représentant légal");
    await candidate.page.locator("#dossier-guardian-lastName").fill(who.lastName);
    await candidate.page.locator("#dossier-guardian-firstName").fill("Dominique");
    await candidate.page.locator("#dossier-guardian-quality").selectOption("Mère");
    await candidate.page.locator("#dossier-guardian-phone").fill("06 39 98 00 03");
    await candidate.page.locator("#dossier-guardian-email").fill(`parent.${who.email}`);
    await next(candidate.page, "Pièces jointes");
    await candidate.page.locator("#dossier-file-PARENTAL_AUTH").setInputFiles({
      name: "autorisation-fictive.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4\n% Fictif\n%%EOF\n"),
    });
    await expect(candidate.page.getByText("autorisation-fictive.pdf")).toBeVisible();
  } else {
    await next(candidate.page, "Pièces jointes");
  }
  await next(candidate.page, "Relecture et envoi");
  await candidate.page.getByText(/J'ai lu l'information/).click();
  await candidate.page.getByRole("button", { name: "Envoyer mon dossier" }).click();
  // Sent: the link now opens the signature screens only.
  await expect(signingTitle(candidate.page)).toHaveText("Signature de ton dossier");
  return { ref, candidate };
}

/** One signer: trace (or typed name), code from the mail log, « Signer ». */
async function sign(
  browser: Browser,
  page: Page,
  email: string,
  options: { typedName?: string } = {},
) {
  await page
    .getByRole("button", {
      name: /^(Commencer la signature|Signer en tant que représentant légal)$/,
    })
    .click();
  await expect(signingTitle(page)).toHaveText(/signature/i);
  await expectNoSeriousViolation(page);
  if (options.typedName) {
    await page.getByRole("button", { name: "Signer en saisissant mon nom" }).click();
    await page.locator("#signature-typed").fill(options.typedName);
  } else {
    await drawSignature(page);
  }
  await page.getByTestId("signature-validate").click();
  await expect(signingTitle(page)).toHaveText("Ton code");
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText(/Code envoyé à/)).toBeVisible();
  await expectNoSeriousViolation(page);
  const code = await codeFromMailLog(browser, email);
  expect(code).toMatch(/^\d{6}$/);
  await page.locator("#signing-code").fill(code);
  await page.getByRole("button", { name: "Signer", exact: true }).click();
}

test.describe("Signature électronique (mobile 390 px)", () => {
  test.describe.configure({ timeout: 180_000 });
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Parcours candidat sur téléphone : projet mobile.");
  });

  test("le candidat signe au doigt avec le code reçu, le responsable contresigne et télécharge la charte", async ({
    page,
    browser,
  }) => {
    const who = fictitious("Signe");
    const { ref, candidate } = await sentDossier(browser, page, who);
    await expect(signingTitle(candidate.page)).toHaveText("Signature de ton dossier");
    // Preview of each document before signature, generated on the fly.
    const preview = await candidate.page.request.get("/dossier/apercu/charte");
    expect(preview.headers()["content-type"]).toBe("application/pdf");
    expect(preview.headers()["cache-control"]).toContain("no-store");
    expect((await preview.body()).subarray(0, 5).toString()).toBe("%PDF-");
    await expectNoSeriousViolation(candidate.page);

    await sign(browser, candidate.page, who.email);
    // Signed: the link is used, the page says so.
    await expect(candidate.page.getByTestId("dossier-step-title")).toHaveText(
      "Votre dossier est signé",
    );
    await expectNoSeriousViolation(candidate.page);
    await candidate.context.close();

    // The responsible countersigns (desktop).
    const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const responsible = await desk.newPage();
    await loginAs(responsible, "diamant");
    await responsible.goto(`/benevoles/${ref}?onglet=integration`);
    await expect(responsible.getByTestId("dossier-signature-state")).toContainText(
      "À contresigner",
    );
    await responsible.getByRole("link", { name: "Contresigner" }).click();
    await expect(responsible.getByRole("heading", { level: 1 })).toContainText("Contresigner");
    await expectNoSeriousViolation(responsible);
    await drawSignature(responsible);
    await responsible.getByTestId("signature-validate").click();
    await expect(responsible.getByTestId("countersign-done")).toBeVisible({ timeout: 60_000 });
    await expect(responsible.getByText(/L'e-mail avec les documents/)).toBeVisible();
    await expectNoSeriousViolation(responsible);

    // The charte in the Documents tab: download with the official name (filename*).
    await responsible.goto(`/benevoles/${ref}?onglet=documents`);
    const charte = responsible.getByRole("link", { name: /Charte/ }).first();
    const href = await charte.getAttribute("href");
    const file = await responsible.request.get(href ?? "");
    expect(file.status()).toBe(200);
    expect(file.headers()["content-disposition"]).toMatch(
      /filename\*=UTF-8''[^;]*_Charte-du-B%C3%A9n%C3%A9volat\.pdf/,
    );
    expect((await file.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // The final e-mail: 5 attachments listed by name and size.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await loginAs(adminPage, "topaze");
    await adminPage.goto("/admin/courriels");
    const finalMail = adminPage
      .getByRole("listitem")
      .filter({ hasText: who.email })
      .filter({ hasText: "dossier de bénévole est complet" })
      .first();
    await expect(finalMail.getByTestId("mail-attachments")).toContainText("Pièces jointes (5)");
    await expect(finalMail).toContainText("Règlement du bénévolat.pdf");
    await admin.close();
    await desk.close();
  });

  test("un mineur : le représentant légal signe avec son propre code, au clavier", async ({
    page,
    browser,
  }) => {
    const who = fictitious("Mineur8");
    const { candidate } = await sentDossier(browser, page, who, true);
    await sign(browser, candidate.page, who.email);
    await expect(signingTitle(candidate.page)).toHaveText("Au tour de ton représentant légal");
    await expect(
      candidate.page.getByText("La signature du bénévole est enregistrée."),
    ).toBeVisible();
    await expectNoSeriousViolation(candidate.page);
    // Keyboard alternative: the name typed, shown in a handwriting font.
    await sign(browser, candidate.page, `parent.${who.email}`, {
      typedName: `Dominique ${who.lastName}`,
    });
    await expect(candidate.page.getByTestId("dossier-step-title")).toHaveText(
      "Votre dossier est signé",
    );
    await candidate.context.close();
  });

  test("l'alternative clavier : un nom différent est refusé, le bon nom signe", async ({
    page,
    browser,
  }) => {
    const who = fictitious("Clavier");
    const { candidate } = await sentDossier(browser, page, who);
    await candidate.page.getByRole("button", { name: "Commencer la signature" }).click();
    await candidate.page.getByRole("button", { name: "Signer en saisissant mon nom" }).click();
    await expectNoSeriousViolation(candidate.page);
    await candidate.page.locator("#signature-typed").fill(`${who.firstName} ${who.lastName}`);
    await candidate.page.getByTestId("signature-validate").click();
    await candidate.page.getByRole("button", { name: "Recevoir mon code" }).click();
    const code = await codeFromMailLog(browser, who.email);
    await candidate.page.locator("#signing-code").fill(code === "000000" ? "111111" : "000000");
    await candidate.page.getByRole("button", { name: "Signer", exact: true }).click();
    await expect(candidate.page.getByText(/Code incorrect\. Il te reste 4 essais/)).toBeVisible();
    await candidate.page.locator("#signing-code").fill(code);
    await candidate.page.getByRole("button", { name: "Signer", exact: true }).click();
    await expect(candidate.page.getByTestId("dossier-step-title")).toHaveText(
      "Votre dossier est signé",
    );
    await candidate.context.close();
  });
});
