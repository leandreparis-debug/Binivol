import { expect, type Page } from "@playwright/test";

/** Fails when the document is wider than the viewport. */
export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, "scrollWidth must not exceed the viewport").toBeLessThanOrEqual(innerWidth);
}
