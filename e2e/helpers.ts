import { expect, type Page, type TestInfo } from "@playwright/test";
import type { Profile } from "../src/generated/prisma/enums";
import { seedUserEmail, USERS } from "../prisma/seed/index";

/** Fails when the document is wider than the viewport. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, "scrollWidth must not exceed the viewport").toBeLessThanOrEqual(innerWidth);
}

export interface DemoAccount {
  key: string;
  name: string;
  email: string;
  profiles: Profile[];
}

/** The seven synthetic accounts of the seed. */
export const DEMO_ACCOUNTS: DemoAccount[] = USERS.map((u) => ({
  ...u,
  email: seedUserEmail(u.key),
}));

export function demoAccount(key: string): DemoAccount {
  const account = DEMO_ACCOUNTS.find((a) => a.key === key);
  if (!account) throw new Error(`Compte de démonstration inconnu : ${key}`);
  return account;
}

/** Signs in with a demo account from /connexion. */
export async function loginAs(page: Page, key = "topaze"): Promise<DemoAccount> {
  const account = demoAccount(key);
  await page.goto("/connexion");
  const escaped = account.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page.getByRole("button", { name: new RegExp(escaped) }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"));
  return account;
}

export const isMobileProject = (testInfo: TestInfo) => testInfo.project.name.includes("mobile");

/** The main navigation of the current viewport (pills on desktop, bottom bar on mobile). */
export function mainNav(page: Page, testInfo: TestInfo) {
  return isMobileProject(testInfo)
    ? page.getByRole("navigation", { name: "Navigation principale (mobile)" })
    : page
        .getByRole("navigation", { name: "Navigation principale", exact: true })
        .locator("visible=true")
        .first();
}
