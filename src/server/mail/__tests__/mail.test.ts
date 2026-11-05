// @vitest-environment node
import { describe, expect, it } from "vitest";
import { openMail, sealMail } from "../sealed";
import { dossierLinkMail } from "../templates";

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
