import { expect, test } from "@playwright/test";
import { isMobileProject, loginAs } from "../helpers";

/*
 * Step 15, the life of a volunteer on one person: pause with a planned
 * return, resume, departure. (Group entry, Trouver and appointments:
 * formations.spec.ts; follow-up point: suivi.spec.ts.) Runs late.
 */

test("pause, reprise puis départ d'un même bénévole", async ({ page }, testInfo) => {
  test.skip(isMobileProject(testInfo), "Parcours de bureau.");
  await loginAs(page, "topaze");
  await page.goto("/benevoles?statut=ACTIVE");
  const href = (await page.locator('a[href^="/benevoles/P-"]').last().getAttribute("href")) ?? "";
  await page.goto(href);
  const header = page.locator("header").filter({ has: page.getByRole("heading", { level: 1 }) });

  const change = async (status: string, fill?: () => Promise<void>) => {
    await page.getByRole("button", { name: "Changer le statut" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#status-choice").selectOption(status);
    if (fill) await fill();
    await dialog.getByRole("button", { name: "Enregistrer le statut" }).click();
    await expect(dialog).toBeHidden();
  };

  const inThreeWeeks = new Date(Date.now() + 21 * 86_400_000).toISOString().slice(0, 10);
  await change("PAUSED", async () => {
    await page.getByRole("dialog").getByLabel("Reprise prévue").fill(inThreeWeeks);
    await page.getByRole("dialog").getByLabel("Motif").fill("Examens (fictif)");
  });
  await expect(header.getByText("En pause").first()).toBeVisible();

  await change("ACTIVE");
  await expect(header.getByText("Actif").first()).toBeVisible();

  await change("LEFT", async () => {
    const dialog = page.getByRole("dialog");
    await dialog.locator("#left-at").fill(new Date().toISOString().slice(0, 10));
    await dialog.locator("#left-reason").selectOption("MOVED");
  });
  await expect(header.getByText("Parti(e)").first()).toBeVisible();
  await page.goto(`${href.split("?")[0] ?? ""}?onglet=historique`);
  await expect(page.getByText(/pause/i).first()).toBeVisible();
});
