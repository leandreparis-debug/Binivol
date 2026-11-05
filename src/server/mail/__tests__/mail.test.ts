// @vitest-environment node
import { describe, expect, it } from "vitest";
import { openMail, sealMail } from "../sealed";
import {
  DEFAULT_SIGNED_DOSSIER_MAIL,
  dossierLinkMail,
  signatureCodeMail,
  signedDossierMail,
} from "../templates";

describe("dossier link e-mail", () => {
  const message = dossierLinkMail({
    firstName: "Camille",
    url: "https://binivol.exemple.test/dossier/TOKEN",
    ulName: "Unité locale de Versailles",
    expiresAt: new Date("2026-11-12T10:00:00.000Z"),
  });

  it("holds the first name, the link and the expiry date, in French", () => {
    expect(message.subject).toBe("Unité locale de Versailles : votre dossier bénévole");
    expect(message.text).toContain("Bonjour Camille,");
    expect(message.text).toContain("https://binivol.exemple.test/dossier/TOKEN");
    expect(message.text).toContain("12/11/2026");
    expect(message.html).toContain('href="https://binivol.exemple.test/dossier/TOKEN"');
  });

  it("holds no other personal data than the first name", () => {
    const all = `${message.subject}\n${message.text}\n${message.html}`;
    expect(all).not.toMatch(/@/);
    expect(all).not.toMatch(/\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}/);
  });

  it("escapes the HTML", () => {
    const html = dossierLinkMail({
      firstName: "<b>Camille</b>",
      url: "https://x.test/dossier/a",
      ulName: "UL",
      expiresAt: new Date(),
    }).html;
    expect(html).not.toContain("<b>");
  });
});

describe("signature code e-mail", () => {
  const message = signatureCodeMail({
    firstName: "Camille",
    code: "042137",
    ulName: "Unité locale de Versailles",
  });

  it("holds the code and the first name, with the UL's tone", () => {
    expect(message.subject).toBe("Ton code de signature");
    expect(message.text).toContain("Bonjour Camille,");
    expect(message.text).toContain("042137");
    expect(message.text).toContain("valable 10 minutes");
    expect(message.text).toMatch(/\bton\b|\btu\b/i);
    expect(message.text).not.toMatch(/\bvous\b|\bvotre\b/i);
  });

  it("holds no other personal data, and no em dash", () => {
    const all = `${message.subject}\n${message.text}\n${message.html}`;
    expect(all).not.toMatch(/@/);
    expect(all).not.toMatch(/\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}[ .]?\d{2}/);
    expect(all).not.toContain("\u2014");
    const parent = signatureCodeMail({
      firstName: "Dominique",
      code: "000001",
      ulName: "UL",
      forGuardian: true,
    });
    expect(parent.text).toContain("représentant légal");
    expect(parent.subject).toBe("Ton code de signature");
  });
});

describe("signed documents e-mail", () => {
  const message = signedDossierMail({
    template: DEFAULT_SIGNED_DOSSIER_MAIL,
    firstName: "Camille",
    ulName: "Unité locale de Versailles",
    attachments: ["EXEMPLE_Camille_Dossier-Bénévole.pdf", "Règlement du bénévolat.pdf"],
  });

  it("is warm, says what comes next and lists the attachments", () => {
    expect(message.subject).toBe("Ton dossier de bénévole est complet");
    expect(message.text).toContain("Bonjour Camille,");
    expect(message.text).toContain("NIVOL");
    expect(message.text).toContain("- EXEMPLE_Camille_Dossier-Bénévole.pdf");
    expect(message.text).toContain("- Règlement du bénévolat.pdf");
    expect(message.text).toContain("Unité locale de Versailles");
    expect(message.text).not.toMatch(/\{\w+\}/);
    expect(`${message.subject}${message.text}`).not.toContain("\u2014");
    expect(message.html).toContain("<p>Bonjour Camille,</p>");
  });

  it("uses the text of the setting, without ever sending an em dash", () => {
    const custom = signedDossierMail({
      template: { subject: "Bienvenue {prenom}", body: "Salut {prenom} \u2014 {structure}" },
      firstName: "Lou",
      ulName: "UL",
      attachments: [],
    });
    expect(custom.subject).toBe("Bienvenue Lou");
    expect(custom.text).toBe("Salut Lou , UL");
  });
});

describe("sealed mail (log driver)", () => {
  it("encrypts the content and opens it back", () => {
    const payload = sealMail({ text: "https://x.test/dossier/SECRET" });
    expect(payload).not.toContain("SECRET");
    expect(sealMail({ text: "a" })).not.toBe(sealMail({ text: "a" }));
    expect(openMail(payload)).toEqual({ text: "https://x.test/dossier/SECRET" });
  });

  it("refuses a tampered payload", () => {
    const [iv, tag, data = ""] = sealMail({ text: "abc" }).split(".");
    expect(openMail(`${iv ?? ""}.${tag ?? ""}.${data.slice(0, -2)}AA`)).toBeNull();
    expect(openMail("garbage")).toBeNull();
  });
});
