import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

async function expectNoSeriousViolation(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    blocking.map(
      (v) => `${v.id} (${v.impact}) : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
    ),
  ).toEqual([]);
}

test.describe("Accessibilité (axe)", () => {
  test("aucune violation serious ou critical sur /connexion et /dossier/demo (sans session)", async ({
    page,
  }) => {
    for (const path of ["/connexion", "/connexion?error=unknown", "/dossier/demo"]) {
      await page.goto(path);
      await expectNoSeriousViolation(page);
    }
  });

  test("aucune violation serious ou critical sur les pages de TOPAZE", async ({ page }) => {
    await loginAs(page, "topaze");
    for (const path of ["/", "/benevoles", "/design", "/moi", "/admin/comptes"]) {
      await page.goto(path);
      await expectNoSeriousViolation(page);
    }
  });

  test("aucune violation serious ou critical sur la page 403", async ({ page }) => {
    await loginAs(page, "action");
    const response = await page.goto("/admin/comptes");
    expect(response?.status()).toBe(403);
    await expectNoSeriousViolation(page);
  });
});
