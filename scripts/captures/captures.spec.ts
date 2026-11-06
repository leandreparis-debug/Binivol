import { expect, test, type Browser, type Page } from "@playwright/test";
import { createCandidate, fictitious, fillAdultSteps, next } from "../../e2e/dossierFlow";
import { loginAs } from "../../e2e/helpers";

/*
 * Screenshots of docs/captures/ (direction « Suisse »), each at 1440, 834
 * and 390 px: `<écran>-<largeur>.png`. Fictitious data only, the « Données
 * fictives » banner is visible on every staff screen.
 */

const DIR = "docs/captures";
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
];

async function shoot(page: Page, name: string, prepare?: () => Promise<void>) {
  const original = page.viewportSize() ?? { width: 1440, height: 900 };
  for (const size of WIDTHS) {
    await page.setViewportSize(size);
    if (prepare) await prepare();
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${DIR}/${name}-${String(size.width)}.png` });
  }
  await page.setViewportSize(original);
}

async function as(browser: Browser, key: string): Promise<Page> {
  const context = await browser.newContext({
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await loginAs(page, key);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  return page;
}

async function visit(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
}

test("captures", async ({ browser }) => {
  // -- Signed out ------------------------------------------------------------------
  const anonymous = await (await browser.newContext({ reducedMotion: "reduce" })).newPage();
  await anonymous.goto("/connexion");
  await shoot(anonymous, "connexion");
  await anonymous.goto("/connexion?error=AccessDenied");
  await shoot(anonymous, "connexion-erreur");
  await anonymous.goto("/confidentialite");
  await shoot(anonymous, "confidentialite");
  await anonymous.goto("/dossier/lien-invalide");
  await shoot(anonymous, "dossier-lien-invalide");

  // -- TOPAZE ----------------------------------------------------------------------
  const topaze = await as(browser, "topaze");
  await shoot(topaze, "accueil");
  await shoot(topaze, "accueil-topaze");
  for (const [url, name] of [
    ["/benevoles", "annuaire"],
    ["/candidats/suivi", "suivi-liste"],
    ["/alertes", "alertes"],
    ["/rappels", "rappels"],
    ["/admin/reglages", "reglages"],
    ["/admin/parametres", "parametres"],
    ["/admin/journaux", "journaux"],
    ["/admin/purge", "purge"],
    ["/admin/exports", "exports"],
    ["/admin/comptes", "admin-comptes"],
    ["/aide", "aide"],
    ["/a-faire", "a-faire"],
    ["/a-faire/confiees", "a-faire-confiees"],
    ["/a-faire/projets", "a-faire-projets"],
    ["/a-faire/projets/seed_tp_forum", "a-faire-projet"],
    ["/a-faire?tache=seed_todo_shared", "a-faire-panneau"],
    ["/moi", "moi"],
    ["/design", "design"],
  ] as const) {
    await visit(topaze, url);
    await shoot(topaze, name);
  }
  await visit(topaze, "/benevoles?statut=ACTIVE");
  const href =
    (await topaze.locator('a[href^="/benevoles/P-"]').first().getAttribute("href")) ?? "";
  const person = href.split("?")[0] ?? "";
  for (const [tab, name] of [
    ["", "fiche"],
    ["?onglet=formations", "fiche-formations"],
    ["?onglet=suivi", "fiche-suivi"],
    ["?onglet=historique", "fiche-historique"],
  ] as const) {
    await visit(topaze, `${person}${tab}`);
    await shoot(topaze, name);
  }
  await visit(topaze, person);
  await shoot(topaze, "depart", async () => {
    await topaze.keyboard.press("Escape");
    await topaze.getByRole("button", { name: "Changer le statut" }).click();
    await topaze.getByRole("dialog").locator("#status-choice").selectOption("LEFT");
  });
  await topaze.keyboard.press("Escape");
  await visit(topaze, "/");
  await shoot(topaze, "cloche", async () => {
    await topaze.keyboard.press("Escape");
    await topaze.getByTestId("bell").click();
    await expect(topaze.getByRole("menu")).toBeVisible();
  });
  await topaze.keyboard.press("Escape");

  // -- Other profiles ----------------------------------------------------------------
  for (const key of ["action", "laser", "format", "format-gp", "diamant"]) {
    const page = await as(browser, key);
    await shoot(page, `accueil-${key}`);
    if (key === "format") {
      for (const [url, name] of [
        ["/formations/sessions", "formations-sessions"],
        ["/formations/saisie", "formations-saisie"],
        ["/formations/matrice?categorie=TRONC_COMMUN", "matrice"],
      ] as const) {
        await visit(page, url);
        await shoot(page, name);
      }
    }
    if (key === "action") {
      await visit(page, "/formations/trouver?c1=PSE&c2=PSC");
      await shoot(page, "formations-trouver");
      const response = await page.goto("/admin/comptes");
      expect(response?.status()).toBe(403);
      await shoot(page, "403");
    }
    if (key === "diamant") {
      await visit(page, "/candidats");
      await shoot(page, "candidats");
      await visit(page, "/candidats?gaia=1");
      await shoot(page, "candidats-gaia");
      // The candidate at « Création Gaia » of the seed: the Gaia block.
      const gaiaHref = await page
        .locator("main article")
        .first()
        .locator('a[href^="/benevoles/P-"]')
        .first()
        .getAttribute("href");
      await visit(page, `${(gaiaHref ?? "").split("?")[0] ?? ""}?onglet=integration`);
      await shoot(page, "gaia-fiche");
    }
  }

  // -- The candidate's online dossier --------------------------------------------------
  const diamant = await as(browser, "diamant");
  const who = fictitious("Capture");
  const ref = await createCandidate(diamant, who);
  await shoot(diamant, "fiche-integration");
  await diamant.getByRole("button", { name: /Créer un (nouveau )?lien/ }).click();
  const dialog = diamant.getByRole("dialog");
  await dialog.getByRole("button", { name: "Créer le lien" }).click();
  const url = await dialog.locator("#dossier-link-url").inputValue();
  await shoot(diamant, "dossier-lien");
  await diamant.keyboard.press("Escape");

  const candidateContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    reducedMotion: "reduce",
  });
  const candidate = await candidateContext.newPage();
  await candidate.goto(url);
  await expect(candidate.getByTestId("dossier-step-title")).toBeVisible();
  await shoot(candidate, "dossier-accueil");
  await next(candidate, "Identité");
  await shoot(candidate, "dossier-identite");
  await candidate.getByRole("button", { name: "Continuer" }).click();
  await shoot(candidate, "dossier-identite-erreurs");
  await candidate.goto("/dossier");
  await fillAdultSteps(candidate, "1995-04-12");
  await shoot(candidate, "dossier-profil");
  await next(candidate, "Pièces jointes");
  await next(candidate, "Relecture et envoi");
  await shoot(candidate, "dossier-relecture");
  await candidate.getByText(/J'ai lu l'information/).click();
  await candidate.getByRole("button", { name: "Envoyer mon dossier" }).click();
  await expect(candidate.getByTestId("signing-title")).toHaveText("Signature de ton dossier");
  await shoot(candidate, "signature-documents");

  await visit(diamant, `/benevoles/${ref}?onglet=integration`);
  await shoot(diamant, "dossier-bloc");
  await visit(diamant, `/benevoles/${ref}/dossier`);
  await shoot(diamant, "dossier-revue");

  // Signature with the typed name, then the code received by e-mail.
  await candidate.getByRole("button", { name: "Commencer la signature" }).click();
  await candidate.getByRole("button", { name: "Signer en saisissant mon nom" }).click();
  await candidate.locator("#signature-typed").fill(`${who.firstName} ${who.lastName}`);
  await shoot(candidate, "signature-clavier");
  await candidate.getByTestId("signature-validate").click();
  await candidate.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(candidate.getByText(/Code envoyé à/)).toBeVisible();
  await shoot(candidate, "signature-code");
  await visit(topaze, "/admin/courriels");
  await shoot(topaze, "courriels-code");
  const mail = topaze
    .getByRole("listitem")
    .filter({ hasText: who.email })
    .filter({ hasText: "Ton code de signature" })
    .first();
  const code = /Ton code de signature : (\d{6})/.exec((await mail.textContent()) ?? "")?.[1] ?? "";
  await candidate.locator("#signing-code").fill(code);
  await candidate.getByRole("button", { name: "Signer", exact: true }).click();
  await expect(candidate.getByTestId("dossier-step-title")).toHaveText("Votre dossier est signé");
  await shoot(candidate, "signature-signe");

  // The responsible countersigns (typed name).
  await visit(diamant, `/benevoles/${ref}?onglet=integration`);
  await shoot(diamant, "signature-bloc-acontresigner");
  await diamant.getByRole("link", { name: "Contresigner" }).click();
  await expect(diamant.getByRole("heading", { level: 1 })).toContainText("Contresigner");
  await shoot(diamant, "contresignature");
  await diamant.getByRole("button", { name: /saisissant mon nom/ }).click();
  await diamant.locator("#signature-typed").fill("Maé Démo");
  await diamant.getByTestId("signature-validate").click();
  await expect(diamant.getByTestId("countersign-done")).toBeVisible({ timeout: 60_000 });
  await shoot(diamant, "contresignature-faite");
});
