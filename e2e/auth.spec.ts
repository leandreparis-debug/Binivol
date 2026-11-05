import { expect, test } from "@playwright/test";
import { NAV_ITEMS } from "../src/components/layout/navigation";
import { canSome } from "../src/server/policy/can";
import { allowedActions } from "../src/server/policy/describe";
import { DEMO_ACCOUNTS, isMobileProject, loginAs, mainNav } from "./helpers";

test.describe("Connexion", () => {
  test("la page de connexion présente Google, le mode démonstration et la mention C3", async ({
    page,
  }) => {
    await page.goto("/connexion");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
    await expect(
      page.getByText("Espace réservé aux responsables de l'unité locale de Versailles."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeVisible();
    await expect(page.getByTestId("demo-banner")).toHaveText("Mode démonstration");
    const demoList = page.getByRole("list", { name: "Comptes de démonstration" });
    for (const account of DEMO_ACCOUNTS) await expect(demoList).toContainText(account.email);
    await expect(page.getByText("Données confidentielles (C3)")).toBeVisible();
  });
});

for (const [reason, message] of [
  ["domain", "Utilisez votre adresse @croix-rouge.fr."],
  ["unknown", "Ce compte n'a pas encore accès à Binivol. Demandez-le au DLUS."],
  ["inactive", "Ce compte est désactivé. Contactez le DLUS."],
  ["no_profile", "Ce compte est désactivé. Contactez le DLUS."],
] as const) {
  test(`/connexion affiche le refus « ${reason} » en clair`, async ({ page }) => {
    await page.goto(`/connexion?error=${reason}`);
    await expect(page.getByTestId("signin-error")).toHaveText(message);
  });
}

test.describe("Chaque compte de démonstration", () => {
  for (const account of DEMO_ACCOUNTS) {
    test(`${account.name} (${account.profiles.join(" + ")}) : menu et /moi conformes à la politique`, async ({
      page,
    }, testInfo) => {
      await loginAs(page, account.key);
      const actor = { profiles: new Set(account.profiles) };

      const expectedNav = NAV_ITEMS.filter(
        (item) => item.action === null || canSome(actor, item.action),
      ).map((i) => i.label);
      const nav = mainNav(page, testInfo);
      // A menu entry may carry a badge (overdue follow-ups on « Candidats »).
      await expect(nav.getByRole("link")).toHaveText(
        expectedNav.map((label) => new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))),
      );

      await page.goto("/moi");
      await expect(page.getByRole("list", { name: "Mes profils" }).first()).toContainText(
        account.profiles[0]?.replace("_", " ") ?? "",
      );
      const expectedActions = allowedActions(actor).map((a) => a.action);
      const shown = await page
        .getByTestId("allowed-actions")
        .locator("li")
        .evaluateAll((items) => items.map((li) => li.getAttribute("data-action")));
      expect(shown).toEqual(expectedActions);

      const admin = await page.goto("/admin/comptes");
      expect(admin?.status()).toBe(account.profiles.includes("TOPAZE") ? 200 : 403);
      if (!account.profiles.includes("TOPAZE")) {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(
          "Vous n'avez pas accès à cette page",
        );
      }
    });
  }
});

test("la déconnexion ferme la session", async ({ page }) => {
  await loginAs(page, "laser");
  await page.getByRole("button", { name: /Menu du compte/ }).click();
  await page.getByRole("menuitem", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/connexion$/);
  await page.goto("/moi");
  await expect(page).toHaveURL(/\/connexion$/);
});

test.describe("Gestion des comptes (TOPAZE)", () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(
      isMobileProject(testInfo) || browserName !== "chromium",
      "Crée et modifie de vrais comptes en base : exécuté une seule fois, sur le projet bureau.",
    );
  });

  test("ajoute un compte, change ses profils, le désactive puis le réactive", async ({ page }) => {
    const email = `e2e.${Date.now()}@binivol.test`;
    await loginAs(page, "topaze");
    await page.goto("/admin/comptes");

    await page.getByLabel("Adresse e-mail").fill(email);
    await page.getByLabel("Nom affiché").fill("Compte E2E fictif");
    const newForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Ajouter le compte" }) });
    await newForm.getByText("ACTION", { exact: true }).click();
    await page.getByRole("button", { name: "Ajouter le compte" }).click();
    await expect(page.getByRole("status")).toContainText(`Compte ${email} ajouté.`);

    const row = page.locator(`[data-testid="account-row"][data-email="${email}"]`);
    await expect(row).toContainText("Compte E2E fictif");
    await row.getByText("LASER", { exact: true }).click();
    await row.getByRole("button", { name: "Enregistrer les profils" }).click();
    await expect(row.getByRole("status")).toHaveText("Profils enregistrés.");
    await expect(row.locator("span", { hasText: /^LASER$/ }).first()).toBeVisible();

    await row.getByRole("button", { name: "Désactiver" }).click();
    await expect(row.getByRole("status")).toHaveText(
      "Compte désactivé, ses sessions sont fermées.",
    );
    await expect(row).toContainText("Désactivé");
    await row.getByRole("button", { name: "Réactiver" }).click();
    await expect(row).toContainText("Actif");
  });

  test("refuse un domaine non autorisé et protège le dernier TOPAZE", async ({ page }) => {
    await loginAs(page, "topaze");
    await page.goto("/admin/comptes");
    await page.getByLabel("Adresse e-mail").fill("quelquun@gmail.com");
    const newForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Ajouter le compte" }) });
    await newForm.getByText("ACTION", { exact: true }).click();
    await page.getByRole("button", { name: "Ajouter le compte" }).click();
    await expect(newForm.getByRole("alert")).toContainText("L'adresse doit appartenir au domaine");

    const self = page.locator('[data-testid="account-row"][data-email="demo.topaze@binivol.test"]');
    await self.getByRole("button", { name: "Désactiver" }).click();
    await expect(self.getByRole("alert")).toHaveText(
      /Vous ne pouvez pas désactiver votre propre compte|dernier compte TOPAZE/,
    );
  });
});
