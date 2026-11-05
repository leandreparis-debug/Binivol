import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

const FIXTURE = "tests/fixtures/classeur-v03-fictif.xlsx";

test("un compte non TOPAZE reçoit un 403 sur /admin/import", async ({ page }) => {
  await loginAs(page, "action");
  const response = await page.goto("/admin/import");
  expect(response?.status()).toBe(403);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Vous n'avez pas accès à cette page",
  );
});

test.describe("Import du classeur (TOPAZE)", () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      isMobileProject(testInfo) || browserName !== "chromium",
      "Importe réellement la fixture dans la base e2e : exécuté une seule fois, sur le projet bureau.",
    );
  });

  test("dépose la fixture, simule, importe, puis télécharge le rapport CSV", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/admin/import");
    await expect(page.getByTestId("file-not-kept")).toHaveText(
      "Le fichier n'est pas conservé. Seul le rapport est gardé.",
    );
    await expect(page.getByRole("button", { name: "Importer" })).toBeDisabled();

    await page.getByLabel("Classeur exporté en .xlsx (5 Mo au plus)").setInputFiles(FIXTURE);
    await page.getByRole("button", { name: "Lancer la simulation" }).click();
    const report = page.getByTestId("import-report");
    await expect(report.getByRole("heading", { name: "Résultat de la simulation" })).toBeVisible();
    const benevoles = report
      .getByRole("table", { name: "Compteurs par onglet" })
      .getByRole("row", { name: /Bénévoles/ });
    await expect(benevoles).toContainText("20");
    await expect(
      report.getByRole("table", { name: "Rejets, conflits et avertissements" }),
    ).toContainText("NIVOL invalide");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => v.id),
    ).toEqual([]);

    await page.getByRole("button", { name: "Importer" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirmer l'import réel" });
    await expect(dialog).toContainText(
      "Vous allez importer 24 personnes. L'accord du DPO a-t-il été donné ?",
    );
    await dialog.getByRole("button", { name: /importer/ }).click();
    await expect(page.getByTestId("import-done")).toBeVisible();
    await expect(report.getByRole("heading", { name: "Résultat de l'import" })).toBeVisible();

    const history = page.getByRole("list", { name: "Historique des imports" });
    await expect(history.getByTestId("import-run").first()).toContainText("Import réel");
    const download = page.waitForEvent("download");
    await history
      .getByTestId("import-run")
      .first()
      .getByRole("link", { name: "Rapport CSV" })
      .click();
    const file = await (await download).path();
    const csv = readFileSync(file, "utf8");
    expect(csv).toContain("Rapport d'import Binivol");
    expect(csv).toContain("Bénévoles;20;0;0;0;2;4");
    expect(csv).toContain("NIVOL invalide");

    // Filter of the issues table.
    await page.getByLabel("Niveau").selectOption("rejected");
    await expect(report.getByText(/5 ligne\(s\)/)).toBeVisible();
  });
});
