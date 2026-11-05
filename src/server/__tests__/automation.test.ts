import { describe, expect, it } from "vitest";
import { anniversaryOn, digestDue, engagementYears } from "../automationRules";
import { checkCronAuthorization } from "../cron";
import {
  anniversaryMail,
  birthdayMail,
  digestMail,
  dossierReminderMail,
  fillTemplate,
  urgenceNoticeMail,
} from "../mail/automatedTexts";
import { ANNIVERSARY_TEXT_DEFAULT, BIRTHDAY_TEXT_DEFAULT } from "../automationSettings";
import { calendarRuleDue, lastActivity } from "../reminders/engine";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const SECRET = "s".repeat(40);

describe("cron authorization", () => {
  it("refuses everything without a configured secret", () => {
    expect(checkCronAuthorization(`Bearer ${SECRET}`, undefined)).toBe("no-secret");
    expect(checkCronAuthorization(null, "")).toBe("no-secret");
  });
  it("accepts the exact bearer only", () => {
    expect(checkCronAuthorization(`Bearer ${SECRET}`, SECRET)).toBe("ok");
    expect(checkCronAuthorization(`Bearer ${SECRET}x`, SECRET)).toBe("denied");
    expect(checkCronAuthorization(SECRET, SECRET)).toBe("denied");
    expect(checkCronAuthorization(null, SECRET)).toBe("denied");
    expect(checkCronAuthorization("Bearer ", SECRET)).toBe("denied");
  });
});

describe("calendar rules", () => {
  it("digest: the 1st of the month, or Monday, or never", () => {
    expect(digestDue("MONTHLY", d("2026-12-01"))).toBe(true);
    expect(digestDue("MONTHLY", d("2026-12-02"))).toBe(false);
    expect(digestDue("WEEKLY", d("2026-11-09"))).toBe(true); // Monday
    expect(digestDue("WEEKLY", d("2026-11-10"))).toBe(false);
    expect(digestDue("OFF", d("2026-12-01"))).toBe(false);
  });
  it("29 February is celebrated on 28 February in a non-leap year", () => {
    expect(anniversaryOn(d("2004-02-29"), d("2027-02-28"))).toBe(true);
    expect(anniversaryOn(d("2004-02-29"), d("2028-02-28"))).toBe(false);
    expect(anniversaryOn(d("2004-02-29"), d("2028-02-29"))).toBe(true);
    expect(anniversaryOn(d("2004-03-15"), d("2026-03-15"))).toBe(true);
    expect(engagementYears(d("2020-03-15"), d("2026-03-15"))).toBe(6);
  });
  it("B3 reminder in January, greetings review on 31/12", () => {
    expect(calendarRuleDue("B3_ANNUAL", d("2027-01-05"))).toBe(true);
    expect(calendarRuleDue("B3_ANNUAL", d("2026-11-05"))).toBe(false);
    expect(calendarRuleDue("GREETINGS_REVIEW", d("2026-12-31"))).toBe(true);
    expect(calendarRuleDue("GREETINGS_REVIEW", d("2026-12-30"))).toBe(false);
    expect(calendarRuleDue("FOLLOWUP_DUE", d("2026-12-30"))).toBe(true);
  });
  it("last activity: the latest known date", () => {
    expect(lastActivity([null, d("2026-01-01"), d("2025-01-01")])).toEqual(d("2026-01-01"));
    expect(lastActivity([null])).toBeNull();
  });
});

describe("automatic e-mails", () => {
  const all = [
    birthdayMail({ firstName: "Alix", template: BIRTHDAY_TEXT_DEFAULT, ulName: "UL test" }),
    anniversaryMail({
      firstName: "Alix",
      years: 3,
      template: ANNIVERSARY_TEXT_DEFAULT,
      ulName: "UL test",
    }),
    dossierReminderMail({ firstName: "Alix", ulName: "UL test", sentAt: d("2026-11-01") }),
    digestMail({
      name: "Alex",
      total: 1,
      counts: [{ label: "Haute", count: 1 }],
      lines: [
        { priority: "Haute", subject: "Alix Exemple", label: "Formation expirée", message: "PSE." },
      ],
      appUrl: "https://exemple.test",
    }),
    urgenceNoticeMail({
      code: "TCAU",
      label: "Tronc commun",
      result: "PASSED",
      date: d("2026-11-01"),
      people: ["Alix Exemple", "Bo Exemple"],
      author: "Alex",
    }),
  ];

  it("no em dash, no age, tutoiement", () => {
    for (const m of all) {
      expect(m.text).not.toContain("—");
      expect(m.subject).not.toContain("—");
      expect(m.text).not.toMatch(/\bvous\b/i);
    }
    // The only « N ans » is the length of the engagement: no function receives an age.
    for (const m of [all[0], all[2], all[3], all[4]]) expect(m?.text).not.toMatch(/\d+ ans/);
    expect(all[0]?.text).toContain("Bonjour Alix,");
    expect(all[0]?.text).toContain("L'équipe Cadre");
    expect(all[1]?.text).toContain("Il y a 3 ans aujourd'hui");
  });

  it("the dossier reminder never contains a link", () => {
    expect(all[2]?.text).not.toMatch(/https?:\/\//);
    expect(all[2]?.text).toContain("nous t'en enverrons un nouveau");
  });

  it("one urgence e-mail lists the whole group", () => {
    expect(all[4]?.subject).toBe("TCAU : session validée (2)");
    expect(all[4]?.text).toContain("- Alix Exemple\n- Bo Exemple");
  });

  it("templates: placeholders filled, unknown ones kept, HTML escaped", () => {
    expect(fillTemplate("{prenom} {x}", { prenom: "A" })).toBe("A {x}");
    expect(birthdayMail({ firstName: "<b>", template: "Bonjour {prenom},", ulName: "" }).html).toBe(
      "<p>Bonjour &#60;b&#62;,</p>",
    );
  });
});
