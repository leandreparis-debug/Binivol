import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

/*
 * Step 15: axe on every page of the application, listed from src/app (so a
 * new page is audited without touching this file), on desktop and at 390 px
 * (both projects). Dynamic segments are filled from the seed.
 */

function pageRoutes(dir = "src/app", prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) {
      if (entry === "page.tsx") out.push(prefix || "/");
      continue;
    }
    if (entry === "api" || entry.startsWith("_")) continue;
    const segment = /^\(.*\)$/.test(entry) ? "" : `/${entry}`;
    out.push(...pageRoutes(path, `${prefix}${segment}`));
  }
  return out;
}

/**
 * Pages not audited here, with the reason: the candidate's pages need a
 * dossier link (audited by dossier.spec.ts and signature.spec.ts), the
 * dossier review pages need a submitted dossier (candidates.spec.ts).
 */
const COVERED_ELSEWHERE = new Set([
  "/dossier",
  "/dossier/ouvrir",
  "/dossier/apercu/[document]",
  "/benevoles/[ref]/dossier",
  "/benevoles/[ref]/dossier/contresigner",
  "/benevoles/[ref]/dossier/sur-place",
]);

async function expectNoSeriousViolation(page: Page, route: string) {
  await expect(page).toHaveTitle(/.+/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    blocking.map((v) => `${route} ${v.id} : ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

test("axe : toutes les pages de l'application", async ({ page, browser, baseURL }) => {
  test.setTimeout(240_000);
  const routes = pageRoutes().filter((r) => !COVERED_ELSEWHERE.has(r));
  expect(routes.length).toBeGreaterThan(25);
  await loginAs(page, "topaze");
  await page.goto("/benevoles?statut=ACTIVE");
  const personHref =
    (await page.locator('a[href^="/benevoles/P-"]').first().getAttribute("href")) ?? "";
  await page.goto("/formations/sessions");
  const sessionHref =
    (await page.locator('a[href^="/formations/sessions/"]').first().getAttribute("href")) ?? "";
  for (const route of routes) {
    const url = route
      .replace("/benevoles/[ref]", personHref.split("?")[0] ?? "")
      .replace("/formations/sessions/[id]", sessionHref);
    expect(url, route).not.toContain("[");
    if (route === "/connexion") {
      // The sign-in page is audited signed out.
      const context = await browser.newContext({ baseURL });
      const fresh = await context.newPage();
      await fresh.goto("/connexion");
      await expectNoSeriousViolation(fresh, route);
      await context.close();
      continue;
    }
    await page.goto(url);
    await expectNoSeriousViolation(page, route);
  }
});
