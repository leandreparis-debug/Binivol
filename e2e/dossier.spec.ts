import { expect, test, type Page } from "@playwright/test";
import {
  createAndSendLink,
  createCandidate,
  expectNoSeriousViolation,
  fictitious,
  fillAdultSteps,
  linkFromMailLog,
  next,
  phone,
  title,
} from "./dossierFlow";
import { isMobileProject, loginAs } from "./helpers";

/*
 * Online dossier (step 7): link created by DIAMANT, e-mailed (log driver,
 * read in /admin/courriels by TOPAZE), filled on a phone by the candidate in
 * a separate session, then reviewed and reported. Fictitious data only.
 */

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
    // No request address ever holds the token (it is in the fragment); only the
    // POST of the exchange action carries it, in its body.
    const seen: { url: string; method: string; body: string }[] = [];
    candidate.page.on("request", (r) => {
      seen.push({ url: r.url(), method: r.method(), body: r.postData() ?? "" });
    });
    await candidate.page.goto(url);
    // The token is exchanged for a cookie: it leaves the address bar.
    await expect(candidate.page).toHaveURL(/\/dossier$/);
    expect(candidate.page.url()).not.toContain(token);
    expect(seen.filter((r) => r.url.includes(token))).toEqual([]);
    const carriers = seen.filter((r) => r.body.includes(token));
    expect(carriers.map((r) => [r.method, new URL(r.url).pathname])).toEqual([
      ["POST", "/dossier/ouvrir"],
    ]);
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
    // Sent: the page goes straight to the signature screens (step 8).
    await expect(again.page.getByTestId("signing-title")).toHaveText("Signature de ton dossier");
    await expectNoSeriousViolation(again.page);

    // Sent, not signed yet: the same link now opens the signature screens only.
    await again.page.goto(url);
    await expect(again.page.getByTestId("signing-title")).toHaveText("Signature de ton dossier");
    await expect(again.page.getByRole("button", { name: "Envoyer mon dossier" })).toHaveCount(0);
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
    await expect(candidate.page.getByTestId("signing-title")).toHaveText(
      "Signature de ton dossier",
    );
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
