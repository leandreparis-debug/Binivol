import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, isMobileProject, loginAs } from "./helpers";

const ALL_STATUSES = "statut=ACTIVE,PAUSED,SUSPENDED,INACTIVE,LEFT,CANDIDATE";

/**
 * Directory of the seed (all statuses), account by account, as allowed by
 * docs/permissions.md: people visible in the directory, and person pages
 * that can be opened (`person.full.read`).
 */
const EXPECTED: Record<string, { visible: number; openable: number }> = {
  topaze: { visible: 60, openable: 60 },
  action: { visible: 54, openable: 54 },
  laser: { visible: 54, openable: 54 },
  format: { visible: 54, openable: 0 },
  "format-gp": { visible: 54, openable: 13 },
  diamant: { visible: 60, openable: 11 },
  "format-diamant": { visible: 60, openable: 11 },
};

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

/** Every person-page link of the directory, all pages followed. */
async function directoryLinks(page: Page, query: string): Promise<string[]> {
  await page.goto(`/benevoles?${query}`);
  const hrefs: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const table = page.getByRole("table", { name: "Annuaire des bénévoles" });
    hrefs.push(
      ...(await table
        .locator("a[href^='/benevoles/P-']")
        .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))),
    );
    const next = page.getByRole("link", { name: "Page suivante" });
    if ((await next.count()) === 0) break;
    await page.goto((await next.getAttribute("href")) ?? "/benevoles");
  }
  return hrefs;
}

test.describe("Annuaire et fiche (bureau)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Parcours bureau ; le mobile a son propre test (390 px).");
  });

  for (const [key, expected] of Object.entries(EXPECTED)) {
    test(`${key} : ${String(expected.visible)} personnes, ${String(expected.openable)} fiches ouvrables`, async ({
      page,
    }) => {
      await loginAs(page, key);
      await page.goto(`/benevoles?${ALL_STATUSES}`);
      await expect(page.getByRole("status").filter({ hasText: "personne" })).toHaveText(
        `${String(expected.visible)} personnes`,
      );
      const links = await directoryLinks(page, ALL_STATUSES);
      expect(new Set(links).size).toBe(expected.openable);
      if (links[0]) {
        const response = await page.goto(links[0]);
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("navigation", { name: "Sections de la fiche" })).toBeVisible();
      }
    });
  }

  test("une fiche hors périmètre répond 403, un candidat est introuvable (404) pour ACTION", async ({
    page,
  }) => {
    await loginAs(page, "topaze");
    const [candidate] = await directoryLinks(page, "statut=CANDIDATE");
    const [volunteer] = await directoryLinks(page, "statut=ACTIVE");
    expect(candidate).toBeTruthy();
    await page.context().clearCookies();

    await loginAs(page, "format");
    expect((await page.goto(volunteer ?? "/"))?.status()).toBe(403);
    await page.context().clearCookies();

    await loginAs(page, "action");
    const response = await page.goto(candidate ?? "/");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).not.toContainText("Démo");
  });

  test("TOPAZE passe une personne en Parti(e) et la voit dans l'historique", async ({ page }) => {
    await loginAs(page, "topaze");
    const [inactive] = await directoryLinks(page, "statut=INACTIVE");
    expect(inactive).toBeTruthy();
    await page.goto(inactive ?? "/");
    await page.getByRole("button", { name: "Changer le statut" }).click();
    const dialog = page.getByRole("dialog", { name: "Changer le statut" });
    await expectNoSeriousViolation(page);
    await dialog.getByLabel("Nouveau statut").selectOption("LEFT");
    // Required fields: refused field by field.
    await dialog.getByRole("button", { name: "Enregistrer le statut" }).click();
    await expect(dialog.getByText("La date de départ est obligatoire.")).toBeVisible();
    await dialog.getByLabel("Date de départ").fill("2026-10-31");
    await dialog.getByLabel("Motif de départ").selectOption("MOVED");
    await dialog.getByRole("button", { name: "Enregistrer le statut" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Parti(e)").first()).toBeVisible();
    await page.goto(`${inactive ?? ""}?onglet=historique`);
    await expect(page.getByText("Statut : Inactif → Parti(e)")).toBeVisible();
    await expect(page.getByText("Départ", { exact: true })).toBeVisible();
  });

  test("DIAMANT modifie le téléphone d'un nouveau bénévole", async ({ page }) => {
    await loginAs(page, "diamant");
    const links = await directoryLinks(page, "statut=ACTIVE");
    expect(links.length).toBeGreaterThan(0);
    await page.goto(links[0] ?? "/");
    await page.getByRole("button", { name: "Modifier", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Modifier l'identité et les coordonnées" });
    await expectNoSeriousViolation(page);
    await dialog.getByLabel("Téléphone", { exact: true }).fill("abc");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog.getByText(/Numéro invalide/)).toBeVisible();
    await dialog.getByLabel("Téléphone", { exact: true }).fill("+33 6 39 98 77 01");
    await dialog.getByRole("button", { name: "Enregistrer" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: "06 39 98 77 01" })).toBeVisible();
  });

  test("les données sensibles s'affichent à la demande, avec la mention de journalisation", async ({
    page,
  }) => {
    await loginAs(page, "topaze");
    const [first] = await directoryLinks(page, "statut=ACTIVE");
    await page.goto(first ?? "/");
    // Nothing sensitive in the page as rendered by the server.
    expect(await page.content()).not.toContain("Lieu de naissance");
    await page.getByRole("button", { name: "Afficher les données sensibles" }).click();
    await expect(page.getByText("Date de naissance")).toBeVisible();
    await expect(page.getByText("Personnes à prévenir")).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Cette consultation est enregistrée." }),
    ).toBeVisible();
    await expectNoSeriousViolation(page);
  });

  test("dépôt d'un PDF, puis téléchargement", async ({ page }) => {
    await loginAs(page, "topaze");
    const [first] = await directoryLinks(page, "statut=ACTIVE");
    await page.goto(`${first ?? ""}?onglet=documents`);
    const pdf = Buffer.from("%PDF-1.7\n% Document fictif (e2e)\n%%EOF\n");
    await page.getByLabel("Type de document").selectOption("DIPLOMA_COPY");
    await page.getByLabel("Fichier").setInputFiles({
      name: "attestation-fictive.pdf",
      mimeType: "application/pdf",
      buffer: pdf,
    });
    await page.getByRole("button", { name: "Déposer" }).click();
    await expect(page.getByText("Document déposé.")).toBeVisible();
    const download = page.waitForEvent("download");
    await page
      .getByRole("link", { name: /Télécharger Copie de diplôme.* attestation-fictive\.pdf/ })
      .first()
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("attestation-fictive.pdf");
    const stream = await file.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).equals(pdf)).toBe(true);

    // An .exe renamed .pdf is refused.
    await page.getByLabel("Fichier").setInputFiles({
      name: "facture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("MZ\x90\x00 fictif"),
    });
    await page.getByRole("button", { name: "Déposer" }).click();
    await expect(page.getByText(/Seuls les fichiers PDF, JPEG et PNG sont acceptés/)).toBeVisible();
  });

  test("axe : annuaire, chaque onglet de la fiche", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/benevoles");
    await expectNoSeriousViolation(page);
    const [first] = await directoryLinks(page, "statut=ACTIVE");
    for (const tab of ["", "formations", "fonctions", "suivi", "documents", "historique"]) {
      await page.goto(tab ? `${first ?? ""}?onglet=${tab}` : (first ?? "/"));
      await expectNoSeriousViolation(page);
    }
  });
});

test.describe("Annuaire et fiche (mobile 390 px)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Parcours mobile : vérifié sur le projet 390 px.");
  });

  test("liste en cartes, onglets de la fiche, sans défilement horizontal", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/benevoles");
    const cards = page.getByRole("list", { name: "Annuaire des bénévoles" });
    await expect(cards).toBeVisible();
    await expect(page.getByRole("table", { name: "Annuaire des bénévoles" })).toBeHidden();
    await expectNoHorizontalScroll(page);
    await cards.locator("a[href^='/benevoles/P-']").first().click();
    await page.waitForURL(/\/benevoles\/P-\d+/);
    const tabs = page.getByRole("navigation", { name: "Sections de la fiche" });
    await expect(tabs).toBeVisible();
    await tabs.getByRole("link", { name: "Historique" }).click();
    await page.waitForURL(/onglet=historique/);
    await expect(page.getByRole("heading", { name: "Historique" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectNoSeriousViolation(page);
  });
});
