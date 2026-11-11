import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../playwright.config";
import { isMobileProject, loginAs } from "./helpers";

/**
 * Invitation by link and identifier + password sign-in (ADR-070). Synthetic
 * accounts only (`@exemple.org`); run once, on the desktop project, because
 * they create real accounts in the e2e database.
 */
const PASSWORD = "cheval agrafe batterie fictive";

test.beforeEach(({ browserName }, testInfo) => {
  test.skip(
    isMobileProject(testInfo) || browserName !== "chromium",
    "Crée de vrais comptes en base : exécuté une seule fois, sur le projet bureau.",
  );
});

async function invite(page: Page, suffix: string, username = ""): Promise<string> {
  await loginAs(page, "topaze");
  await page.goto("/admin/comptes");
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Inviter" }) });
  await form.getByLabel("Adresse e-mail").fill(`e2e.${suffix}@exemple.org`);
  await form.getByLabel("Nom affiché").fill(`Invité fictif ${suffix}`);
  await form.getByLabel("Identifiant (facultatif)").fill(username);
  await form.getByText("ACTION", { exact: true }).click();
  await form.getByRole("button", { name: "Inviter" }).click();
  const url = await page.getByTestId("issued-link-url").textContent();
  expect(url).toMatch(/\/acces#[A-Za-z0-9_-]{43}$/);
  return url ?? "";
}

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/connexion");
  await page.getByLabel(/^Identifiant( \*)?$/).fill(username);
  await page.getByLabel(/^Mot de passe( \*)?$/).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test("un TOPAZE invite, l'invité choisit ses identifiants et se connecte ; le lien ne sert qu'une fois", async ({
  page,
  browser,
}) => {
  const suffix = String(Date.now());
  const url = await invite(page, suffix);
  const username = `e2e.${suffix}`;

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(url);
  // The token leaves the address bar at once.
  await expect(guestPage).toHaveURL(/\/acces$/);
  await expect(guestPage.getByText(`Bonjour Invité fictif ${suffix}.`)).toBeVisible();

  // A weak password is refused and does not burn the link.
  await guestPage.getByLabel(/^Identifiant( \*)?$/).fill(username);
  await guestPage.getByLabel("Nouveau mot de passe").fill("court");
  await guestPage.getByLabel("Confirmer le mot de passe").fill("court");
  await guestPage.getByRole("button", { name: "Activer mon accès" }).click();
  await expect(guestPage.locator("form").getByRole("alert")).toHaveText(/au moins 12 caractères/);

  await guestPage.getByLabel("Nouveau mot de passe").fill(PASSWORD);
  await guestPage.getByLabel("Confirmer le mot de passe").fill(PASSWORD);
  await guestPage.getByRole("button", { name: "Activer mon accès" }).click();
  await expect(guestPage).toHaveURL(/\/connexion\?acces=ok$/);
  await expect(guestPage.getByTestId("signin-notice")).toContainText("Mot de passe enregistré");

  // Wrong password: one generic message, the field is emptied.
  await signIn(guestPage, username, "mauvais mot de passe");
  await expect(guestPage.getByTestId("signin-error")).toHaveText(
    "Identifiant ou mot de passe incorrect.",
  );
  await expect(guestPage.getByLabel(/^Mot de passe( \*)?$/)).toHaveValue("");

  // Right password, identifier typed in capitals: signed in.
  await signIn(guestPage, username.toUpperCase(), PASSWORD);
  await guestPage.waitForURL((u) => !u.pathname.startsWith("/connexion"));
  await guestPage.goto("/moi");
  await expect(guestPage.getByRole("list", { name: "Mes profils" }).first()).toContainText(
    "ACTION",
  );

  // The link has been used: it no longer works.
  const again = await browser.newContext();
  const againPage = await again.newPage();
  await againPage.goto(url);
  await expect(againPage.getByTestId("access-invalid")).toBeVisible();
  await guest.close();
  await again.close();
});

test("un lien expiré ou remplacé est refusé ; un nouveau lien remplace le mot de passe", async ({
  page,
  browser,
}) => {
  const suffix = `${String(Date.now())}b`;
  const username = `fixe.${suffix}`;
  const first = await invite(page, suffix, username);

  // A new link replaces the invitation: the first one stops working.
  const row = page.locator(`[data-testid="account-row"][data-email="e2e.${suffix}@exemple.org"]`);
  await expect(row).toContainText("Invitation en attente");
  await row.getByRole("button", { name: "Nouveau lien d'invitation" }).click();
  const second = (await row.getByTestId("issued-link-url").textContent()) ?? "";
  expect(second).not.toBe(first);

  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await guestPage.goto(first);
  await expect(guestPage.getByTestId("access-invalid")).toBeVisible();

  // The second link, with the identifier fixed by TOPAZE.
  await guestPage.goto("about:blank");
  await guestPage.goto(second);
  await expect(guestPage.getByTestId("access-username")).toHaveText(username);
  await guestPage.getByLabel("Nouveau mot de passe").fill(PASSWORD);
  await guestPage.getByLabel("Confirmer le mot de passe").fill(PASSWORD);
  await guestPage.getByRole("button", { name: "Activer mon accès" }).click();
  await expect(guestPage).toHaveURL(/\/connexion\?acces=ok$/);

  // TOPAZE issues a new-password link, which then expires before use.
  await page.reload();
  await row.getByRole("button", { name: "Lien de nouveau mot de passe" }).click();
  const reset = (await row.getByTestId("issued-link-url").textContent()) ?? "";
  // Ages the open link by two days (synthetic e2e database only).
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      `UPDATE account_tokens SET created_at = now() - interval '48 hours',
              expires_at = now() - interval '47 hours'
        WHERE used_at IS NULL AND revoked_at IS NULL
          AND user_id = (SELECT id FROM users WHERE username = $1)`,
      [username],
    );
    expect(result.rowCount).toBe(1);
  } finally {
    await client.end();
  }
  await guestPage.goto("about:blank");
  await guestPage.goto(reset);
  await expect(guestPage.getByTestId("access-invalid")).toBeVisible();

  // The password chosen with the invitation still works.
  await signIn(guestPage, username, PASSWORD);
  await guestPage.waitForURL((u) => !u.pathname.startsWith("/connexion"));
  await guest.close();
});
