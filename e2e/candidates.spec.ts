import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

async function expectNoSeriousViolation(page: Page) {
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

/** Unique fictitious identity for this run (retries included). */
function fictitious(tag: string) {
  const n = `${String(Date.now()).slice(-7)}${String(Math.floor(Math.random() * 90 + 10))}`;
  return {
    firstName: `Test${tag}`,
    lastName: `Fictif${n}`,
    email: `e2e.${tag.toLowerCase()}.${n}@exemple.test`,
    nivol: `00098${n.slice(-6)}E`,
  };
}

async function createCandidate(page: Page, who: ReturnType<typeof fictitious>) {
  await page.goto("/candidats");
  await page.getByRole("button", { name: "Nouveau candidat" }).click();
  const dialog = page.getByRole("dialog", { name: "Nouveau candidat" });
  await dialog.locator("#nc-first").fill(who.firstName);
  await dialog.locator("#nc-last").fill(who.lastName);
  await dialog.locator("#nc-email").fill(who.email);
  await dialog.getByRole("button", { name: "Enregistrer le candidat" }).click();
  await page.waitForURL(/\/benevoles\/P-\d+\?onglet=integration/);
}

async function move(page: Page, button: string, note?: string) {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog", { name: button });
  if (note) await dialog.getByLabel(/^Note/).fill(note);
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("Candidats (mobile 390 px)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Parcours de saisie sur téléphone : projet mobile.");
  });

  test("DIAMANT crée un candidat, le mène jusqu'à Gaia, le finalise et lui attribue un parrain", async ({
    page,
  }) => {
    const who = fictitious("Mobile");
    await loginAs(page, "diamant");
    await createCandidate(page, who);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      `${who.firstName} ${who.lastName}`,
    );
    await expect(page.getByText("Étape 1 sur 6")).toBeVisible();
    await move(page, "Passer à « Engagement confirmé »");
    await move(page, "Passer à « Dossier »");
    await move(page, "Passer à « Création Gaia »");
    await expect(page.getByText("Étape 5 sur 6")).toBeVisible();

    await page.getByRole("button", { name: "Finaliser l'intégration" }).click();
    const finalize = page.getByRole("dialog", { name: "Finaliser l'intégration" });
    await finalize.getByLabel("NIVOL").fill(` ${who.nivol.slice(0, 5)} ${who.nivol.slice(5)} `);
    await finalize.getByRole("button", { name: "Finaliser" }).click();
    await expect(page.getByText(/Intégration finalisée/)).toBeVisible();
    await expect(page.getByText("Actif", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Attribuer un parrain" }).first().click();
    const mentor = page.getByRole("dialog", { name: "Attribuer un parrain" });
    await mentor.getByRole("button", { name: "Attribuer" }).click();
    await expect(mentor).toBeHidden();
    await expect(page.getByText("En cours ·")).toBeVisible();

    await page.goto(`${page.url().split("?")[0] ?? ""}?onglet=suivi`);
    await expect(page.getByText("Point à 3 mois")).toBeVisible();
  });
});

test.describe("Candidats (bureau)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Parcours bureau ; la saisie mobile a son propre test.");
  });

  test("ACTION reçoit un 403 sur /candidats", async ({ page }) => {
    await loginAs(page, "action");
    expect((await page.goto("/candidats"))?.status()).toBe(403);
  });

  test("le doublon est détecté, « Créer quand même » est possible", async ({ page }) => {
    const who = fictitious("Doublon");
    await loginAs(page, "diamant");
    await createCandidate(page, who);
    await page.goto("/candidats");
    await page.getByRole("button", { name: "Nouveau candidat" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau candidat" });
    await dialog.locator("#nc-first").fill(who.firstName.toUpperCase());
    await dialog.locator("#nc-last").fill(who.lastName);
    await dialog.locator("#nc-email").fill(`autre.${who.email}`);
    await dialog.getByRole("button", { name: "Enregistrer le candidat" }).click();
    const duplicates = page.getByRole("dialog", { name: "Personnes déjà connues" });
    await expect(duplicates.getByText(`${who.firstName} ${who.lastName}`)).toBeVisible();
    await expect(duplicates.getByText(/même nom et prénom/)).toBeVisible();
    await expect(
      duplicates.getByText("Une candidature est déjà en cours pour cette personne."),
    ).toBeVisible();
    await expectNoSeriousViolation(page);
    await duplicates.getByRole("button", { name: "Créer quand même" }).click();
    await page.waitForURL(/onglet=integration/);
  });

  test("une personne partie est réengagée depuis la détection des doublons", async ({ page }) => {
    await loginAs(page, "diamant");
    await page.goto("/benevoles?statut=LEFT");
    const emails = await page
      .getByRole("table", { name: "Annuaire des bénévoles" })
      .locator("a[href^='mailto:']")
      .evaluateAll((links) =>
        links.map((a) => (a.getAttribute("href") ?? "").replace("mailto:", "")),
      );
    let reengaged = false;
    for (const email of emails) {
      await page.goto("/candidats");
      await page.getByRole("button", { name: "Nouveau candidat" }).click();
      const dialog = page.getByRole("dialog", { name: "Nouveau candidat" });
      await dialog.locator("#nc-first").fill("Retour");
      await dialog.locator("#nc-last").fill("Fictif");
      await dialog.locator("#nc-email").fill(email);
      await dialog.getByRole("button", { name: "Enregistrer le candidat" }).click();
      const button = page.getByRole("button", { name: "C'est la même personne : réengager" });
      await expect(page.getByRole("dialog", { name: "Personnes déjà connues" })).toBeVisible();
      if ((await button.count()) === 0) continue;
      await button.first().click();
      await page.waitForURL(/onglet=integration/);
      await expect(page.getByText("Parti(e)").first()).toBeVisible();
      await expect(page.getByText("Candidature en cours")).toBeVisible();
      reengaged = true;
      break;
    }
    expect(reengaged).toBe(true);
  });

  test("abandon puis reprise d'une candidature", async ({ page }) => {
    const who = fictitious("Abandon");
    await loginAs(page, "diamant");
    await createCandidate(page, who);
    await move(page, "Passer à « Rencontre »");
    await page.getByRole("button", { name: "Abandonner" }).click();
    const dialog = page.getByRole("dialog", { name: "Abandonner" });
    await expectNoSeriousViolation(page);
    await dialog.getByRole("button", { name: "Abandonner la candidature" }).click();
    await expect(dialog.getByText("Le motif d'abandon est obligatoire.")).toBeVisible();
    await dialog.getByLabel("Motif d'abandon").selectOption("NO_RESPONSE");
    await dialog.getByRole("button", { name: "Abandonner la candidature" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Ne répond plus")).toBeVisible();
    await page.getByRole("button", { name: "Reprendre à « Rencontre »" }).click();
    await page
      .getByRole("dialog", { name: "Reprendre à « Rencontre »" })
      .getByRole("button", { name: "Enregistrer" })
      .click();
    await expect(page.getByText("Étape 2 sur 6")).toBeVisible();
    await expect(page.getByText("Abandon → Rencontre")).toBeVisible();
  });

  test("axe : /candidats, l'onglet Intégration et ses boîtes de dialogue", async ({ page }) => {
    await loginAs(page, "diamant");
    await page.goto("/candidats?responsable=tous");
    await expectNoSeriousViolation(page);
    await page.getByRole("button", { name: "Nouveau candidat" }).click();
    await expectNoSeriousViolation(page);
    await page.keyboard.press("Escape");
    const card = page.getByRole("region", { name: "Création Gaia" }).locator("a").first();
    await card.click();
    await page.waitForURL(/onglet=integration/);
    await expectNoSeriousViolation(page);
    await page.getByRole("button", { name: "Finaliser l'intégration" }).click();
    await expectNoSeriousViolation(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Modifier le suivi" }).click();
    await expectNoSeriousViolation(page);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Attribuer un parrain" }).click();
    await expectNoSeriousViolation(page);
  });
});
