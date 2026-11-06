// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isServerActionFile, isTestFile, sourceFiles } from "./sourceFiles";

const files = sourceFiles();

describe("architecture: server actions", () => {
  const actionFiles = files.filter((f) => isServerActionFile(f.content));

  it("finds the server action files", () => {
    expect(actionFiles.length).toBeGreaterThan(0);
  });

  it("every export of a 'use server' file goes through defineAction or definePublicAction", () => {
    const offenders: string[] = [];
    for (const { file, content } of actionFiles) {
      for (const match of content.matchAll(/^export\s+(?!type\b|interface\b)(.*)$/gm)) {
        const line = match[1] ?? "";
        const wrapped = /^const\s+\w+\s*=\s*(defineAction|definePublicAction)\(/.test(line);
        if (!wrapped) offenders.push(`${file}: export ${line.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the public actions (no session required) are exactly the expected closed list", () => {
    const publicActions = actionFiles
      .flatMap(({ file, content }) =>
        [...content.matchAll(/^export\s+const\s+(\w+)\s*=\s*definePublicAction\(/gm)].map(
          (m) => `${file}#${m[1] ?? ""}`,
        ),
      )
      .sort();
    // Adding a public action must be a deliberate change of this list.
    expect(publicActions).toEqual([
      "src/app/(app)/actions.ts#signOutAction",
      "src/app/(auth)/connexion/actions.ts#demoSignInAction",
      "src/app/(auth)/connexion/actions.ts#googleSignInAction",
      "src/app/(public)/dossier/actions.ts#addDossierAttachmentAction",
      "src/app/(public)/dossier/actions.ts#openDossierLinkAction",
      "src/app/(public)/dossier/actions.ts#removeDossierAttachmentAction",
      "src/app/(public)/dossier/actions.ts#requestSignatureCodeAction",
      "src/app/(public)/dossier/actions.ts#saveDossierAction",
      "src/app/(public)/dossier/actions.ts#signDossierAction",
      "src/app/(public)/dossier/actions.ts#submitDossierAction",
    ]);
  });

  it("no server action is defined inline in a component", () => {
    const inline = files.filter(
      ({ file, content }) =>
        !isServerActionFile(content) &&
        /^\s*["']use server["'];?\s*$/m.test(content) &&
        !isTestFile(file),
    );
    expect(inline.map((f) => f.file)).toEqual([]);
  });
});

describe("architecture: sensitive data", () => {
  // The only sensitive modules: sensitive.ts, the dossier store (step 7) and the
  // signature of the dossier (step 8: codes, signatures, final documents).
  const ALLOWED = new Set([
    "src/server/sensitive.ts",
    "src/server/dossier/store.ts",
    "src/server/dossier/signing.ts",
  ]);
  const DELEGATE =
    /\.(personSensitive|emergencyContact|document|dossierSubmission|dossierAttachment|signature|otpChallenge)\s*\.\s*\w+\s*\(/;
  const RELATION =
    /\b(sensitive|emergencyContacts|documents|submissions|attachments)\s*:\s*(true|\{)/;

  it("sensitive tables (and dossier drafts) are only queried in sensitive.ts and the dossier store", () => {
    const offenders = files
      .filter(({ file }) => !ALLOWED.has(file) && !isTestFile(file))
      .flatMap(({ file, content }) =>
        content
          .split("\n")
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => DELEGATE.test(line) || RELATION.test(line))
          .map(({ line, i }) => `${file}:${i + 1}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });

  it("the guard really detects a forbidden access", () => {
    expect(DELEGATE.test("await db.personSensitive.findMany()")).toBe(true);
    expect(DELEGATE.test("tx.document.findUnique({")).toBe(true);
    expect(RELATION.test("include: { sensitive: true }")).toBe(true);
    expect(DELEGATE.test('entity: "PersonSensitive"')).toBe(false);
    expect(DELEGATE.test("await tx.dossierSubmission.update({")).toBe(true);
    expect(DELEGATE.test("db.dossierAttachment.findMany()")).toBe(true);
    expect(RELATION.test("include: { attachments: { where } }")).toBe(true);
    expect(DELEGATE.test("tx.signature.create({")).toBe(true);
    expect(DELEGATE.test("db.otpChallenge.update({")).toBe(true);
  });
});

describe("architecture: sensitive modules", () => {
  it("the dossier tables are touched only by the dossier store and the signature module", () => {
    const touching = files
      .filter(({ file }) => !isTestFile(file))
      .filter(({ content }) =>
        /\.(dossierSubmission|dossierAttachment|signature|otpChallenge)\s*\.\s*\w+\s*\(/.test(
          content,
        ),
      )
      .map((f) => f.file)
      .sort();
    expect(touching).toEqual(["src/server/dossier/signing.ts", "src/server/dossier/store.ts"]);
  });
});

describe("architecture: database access", () => {
  it("components and pages never import the Prisma client", () => {
    const offenders = files
      .filter(
        ({ file }) =>
          (file.startsWith("src/app/") || file.startsWith("src/components/")) && !isTestFile(file),
      )
      .filter(({ content }) => /from\s+["']@\/generated\/prisma\/client["']/.test(content))
      .map((f) => f.file);
    expect(offenders).toEqual([]);
  });
});

describe("architecture: page guards", () => {
  // Pages of the signed-in area check their own access (the middleware is not a
  // security). The design-system showcase only shows fictitious components: the
  // (app) layout's sign-in check is enough there.
  const GUARDS = /\b(requirePageAccess|authorizePage|requireActor|requireDossierPage)\(/;
  const EXEMPT = new Set(["src/app/(app)/design/page.tsx", "src/app/(app)/design/erreur/page.tsx"]);
  const pages = files.filter(
    ({ file }) => /^src\/app\/\((app|onsite)\)\/.*page\.tsx$/.test(file) && !EXEMPT.has(file),
  );

  it("finds the pages", () => {
    expect(pages.length).toBeGreaterThan(20);
  });

  it("every signed-in page calls a page guard", () => {
    expect(pages.filter(({ content }) => !GUARDS.test(content)).map((p) => p.file)).toEqual([]);
  });
});
