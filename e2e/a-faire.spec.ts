import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { isMobileProject, loginAs } from "./helpers";

/*
 * « À faire » (step 16): quick add on a phone, check and undo, a task
 * confided and a task shared between two accounts, a project with a comment,
 * a member removed, a hidden person link, the keyboard. Every test types its
 * own titles (a unique suffix), so they never step on each other's data.
 */

const unique = () => Math.random().toString(36).slice(2, 7);

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

async function asUser(browser: Browser, key: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, key);
  return page;
}

async function quickAdd(page: Page, text: string) {
  const input = page.getByLabel("Nouvelle tâche");
  await input.fill(text);
  await input.press("Enter");
  await expect(input).toHaveValue("");
}

const row = (page: Page, title: string) =>
  page.getByTestId("todo-row").filter({ hasText: title }).first();

test.describe("À faire (téléphone 390 px)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(!isMobileProject(testInfo), "Parcours téléphone.");
  });

  test("ajout rapide avec « demain » montré avant validation, puis cocher et annuler", async ({
    page,
  }) => {
    await loginAs(page, "laser");
    await page.goto("/a-faire");
    const title = `Acheter des piles ${unique()}`;
    const input = page.getByLabel("Nouvelle tâche");
    await input.fill(`${title} demain`);
    // The due day is shown, removable, before the task is saved.
    const preview = page.getByRole("list", { name: "Ce qui sera enregistré" });
    await expect(preview).toContainText("Échéance");
    await input.press("Enter");
    await expect(row(page, title)).toBeVisible();
    await expect(row(page, title)).not.toContainText("demain");
    // The 16 px field keeps iOS from zooming.
    expect(await input.evaluate((el) => getComputedStyle(el).fontSize)).toBe("16px");

    const check = page.getByRole("checkbox", { name: `Terminer : ${title}` });
    const box = await check.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await check.click();
    const toast = page.getByRole("status").filter({ hasText: "Tâche terminée." });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Annuler" }).click();
    await expect(page.getByRole("checkbox", { name: `Terminer : ${title}` })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expectNoSeriousViolation(page);
  });
});

test.describe("À faire (bureau)", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(isMobileProject(testInfo), "Parcours de bureau.");
  });

  test("une tâche confiée à un autre responsable arrive dans sa liste", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "topaze");
    await page.goto("/a-faire");
    const title = `Préparer le planning ${unique()}`;
    await quickAdd(page, `${title} @Sacha`);
    await page.getByRole("link", { name: "Confiées" }).click();
    await expect(row(page, title)).toBeVisible();

    const laser = await asUser(browser, "laser");
    await laser.goto("/a-faire");
    await expect(row(laser, title)).toContainText("Confiée par Alex Démo");
    await laser.goto("/rappels");
    await expect(laser.getByText("Alex Démo vous a confié une tâche").first()).toBeVisible();
  });

  test("une tâche partagée cochée par l'un est vue faite par l'autre", async ({
    page,
    browser,
  }) => {
    await loginAs(page, "topaze");
    await page.goto("/a-faire");
    const title = `Inventaire partagé ${unique()}`;
    await quickAdd(page, `${title} @Camille @Noa`);

    const action = await asUser(browser, "action");
    await action.goto("/a-faire");
    await action.getByRole("checkbox", { name: `Terminer : ${title}` }).click();
    await expect(action.getByRole("status").filter({ hasText: "Tâche terminée." })).toBeVisible();

    const format = await asUser(browser, "format");
    await format.goto("/a-faire");
    await format.getByText("Terminées").click();
    await expect(format.getByRole("checkbox", { name: `Rouvrir : ${title}` })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("un projet à deux, un commentaire, puis le membre retiré ne le voit plus", async ({
    page,
    browser,
  }) => {
    const suffix = unique();
    const name = `Projet ${suffix}`;
    await loginAs(page, "topaze");
    await page.goto("/a-faire/projets");
    await page.getByRole("button", { name: "Nouveau projet" }).click();
    const dialog = page.getByRole("dialog", { name: "Nouveau projet" });
    await dialog.getByLabel("Nom").fill(name);
    await dialog.getByText("Camille Démo", { exact: true }).click();
    await expect(dialog.getByLabel("Camille Démo")).toBeChecked();
    await dialog.getByRole("button", { name: "Créer le projet" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const projectUrl = page.url();

    const title = `Tâche du projet ${suffix}`;
    await quickAdd(page, `${title} #projet${suffix}`);
    await expect(row(page, title)).toBeVisible();
    await row(page, title).getByRole("link", { name: title }).click();
    const panel = page.getByRole("dialog", { name: title });
    await panel.getByLabel("Ajouter un commentaire").fill("On en parle jeudi.");
    await panel.getByRole("button", { name: "Commenter" }).click();
    await expect(panel.getByText("On en parle jeudi.")).toBeVisible();
    await page.keyboard.press("Escape");

    const action = await asUser(browser, "action");
    await action.goto(projectUrl);
    await row(action, title).getByRole("link", { name: title }).click();
    await expect(action.getByRole("dialog", { name: title })).toContainText("On en parle jeudi.");

    await page.goto(projectUrl);
    await page.getByRole("button", { name: "Retirer Camille Démo du projet" }).click();
    await expect(page.getByRole("button", { name: "Retirer Camille Démo du projet" })).toHaveCount(
      0,
    );
    const response = await action.goto(projectUrl);
    expect(response?.status()).toBe(404);
  });

  test("le lien vers une fiche est masqué quand le profil ne la voit pas", async ({ page }) => {
    // Seed: DIAMANT linked a candidate and shared the task with ACTION (no candidates).
    await loginAs(page, "action");
    await page.goto("/a-faire?tache=seed_todo_hidden_person");
    const panel = page.getByRole("dialog", { name: "Proposer une date de rencontre" });
    await expect(panel).toContainText("Personne non accessible");
    await expect(panel.getByRole("link", { name: /benevoles/ })).toHaveCount(0);
  });

  test("navigation clavier : ajouter, cocher, déplacer", async ({ page }) => {
    await loginAs(page, "format-gp");
    await page.goto("/a-faire");
    const first = `Clavier A ${unique()}`;
    const second = `Clavier B ${unique()}`;
    const input = page.getByLabel("Nouvelle tâche");
    await input.focus();
    await page.keyboard.type(`${first} demain`);
    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("");
    await page.keyboard.type(`${second} demain`);
    await page.keyboard.press("Enter");
    await expect(row(page, first)).toBeVisible();
    await expect(row(page, second)).toBeVisible();

    // Newest first in the group: B, then A. Move B down with the keyboard.
    await page.getByRole("button", { name: `Déplacer : ${second}` }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Descendre" }).focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => {
        const titles = await page.getByTestId("todo-row").allTextContents();
        return (
          titles.findIndex((t) => t.includes(first)) < titles.findIndex((t) => t.includes(second))
        );
      })
      .toBe(true);

    await page.getByRole("checkbox", { name: `Terminer : ${first}` }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("status").filter({ hasText: "Tâche terminée." })).toBeVisible();
    await expectNoSeriousViolation(page);
  });
});
