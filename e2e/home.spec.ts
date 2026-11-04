import { expect, test } from "@playwright/test";

test.describe("Accueil", () => {
  test("affiche le titre et la mention « Données fictives »", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Bonjour Léandre" })).toBeVisible();
    await expect(page.getByTestId("fake-data")).toHaveText("Données fictives");
    await expect(page.getByText("Aucun rappel pour l'instant")).toBeVisible();
    await expect(page.locator("[data-variant='highlight']")).toHaveCount(1);
  });

  test("tous les liens et boutons visibles mesurent au moins 44 × 44 px", async ({ page }) => {
    await page.goto("/");
    const targets = page.locator("a:visible, button:visible");
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      const box = await targets.nth(i).boundingBox();
      const name = await targets
        .nth(i)
        .evaluate((e) => e.getAttribute("aria-label") ?? e.textContent);
      expect(box, `${name} doit être visible`).not.toBeNull();
      expect(box?.width ?? 0, `${name} : largeur`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `${name} : hauteur`).toBeGreaterThanOrEqual(44);
    }
  });

  test("renvoie les en-têtes de sécurité", async ({ request }) => {
    const response = await request.get("/");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["x-frame-options"]).toBe("DENY");
    expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers()["permissions-policy"]).toContain("camera=()");
    expect(response.headers()["x-powered-by"]).toBeUndefined();
  });
});

test("GET /api/health renvoie ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { status: string; version: string };
  expect(body.status).toBe("ok");
  expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
});
