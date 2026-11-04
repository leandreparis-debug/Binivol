// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  cellText,
  excelSerialToDay,
  isSensitiveJournalField,
  journalHash,
  maskJournalRow,
  normalizePhone,
  parisWallClock,
  parseAptitude,
  parseCancellation,
  parseDay,
  parseInstant,
  parseResult,
  parseStage,
  parseStatus,
  parseYesNo,
  type JournalRow,
} from "@/server/import/values";

const iso = (d: Date | null) => d?.toISOString() ?? null;
const day = (y: number, m: number, dd: number) => new Date(Date.UTC(y, m - 1, dd));

describe("parseYesNo", () => {
  it.each([
    ["OUI", true],
    ["oui", true],
    [" Non ", false],
    ["NON", false],
  ] as const)("reads %s", (input, expected) => {
    expect(parseYesNo(input)).toEqual({ value: expected });
  });
  it("treats an empty cell as unknown, not false", () => {
    expect(parseYesNo(null)).toEqual({ value: null });
    expect(parseYesNo("   ")).toEqual({ value: null });
  });
  it("warns on anything else", () => {
    expect(parseYesNo("peut-être")).toMatchObject({
      value: null,
      warning: expect.stringContaining("illisible") as string,
    });
  });
});

describe("parseDay", () => {
  it("reads an Excel date (UTC wall clock) as the calendar day", () => {
    expect(iso(parseDay(new Date(Date.UTC(2024, 2, 15))).value)).toBe("2024-03-15T00:00:00.000Z");
  });
  it("reads an Excel serial number", () => {
    expect(iso(parseDay(45366).value)).toBe("2024-03-15T00:00:00.000Z");
    expect(iso(excelSerialToDay(1))).toBe("1899-12-31T00:00:00.000Z");
  });
  it("reads JJ/MM/AAAA text, and AAAA-MM-JJ", () => {
    expect(iso(parseDay("05/09/2020").value)).toBe("2020-09-05T00:00:00.000Z");
    expect(iso(parseDay("2020-09-05").value)).toBe("2020-09-05T00:00:00.000Z");
  });
  it.each(["32/13/2024", "31/02/2023", "bientôt", "15-03-2024"])(
    "warns and returns null for « %s »",
    (text) => {
      expect(parseDay(text)).toMatchObject({
        value: null,
        warning: expect.stringContaining("illisible") as string,
      });
    },
  );
  it("returns null without warning for an empty cell", () => {
    expect(parseDay(null)).toEqual({ value: null });
  });
});

describe("parseInstant (Paris wall clock)", () => {
  it("converts winter and summer times to the right instant", () => {
    expect(iso(parisWallClock(2025, 1, 10, 14, 5))).toBe("2025-01-10T13:05:00.000Z");
    expect(iso(parisWallClock(2025, 7, 10, 14, 5))).toBe("2025-07-10T12:05:00.000Z");
  });
  it("reads text with time, an Excel date-time and a serial with fraction", () => {
    expect(iso(parseInstant("12/03/2025 14:05").value)).toBe("2025-03-12T13:05:00.000Z");
    expect(iso(parseInstant(new Date(Date.UTC(2025, 6, 10, 14, 5))).value)).toBe(
      "2025-07-10T12:05:00.000Z",
    );
    expect(iso(parseInstant(45366.5).value)).toBe("2024-03-15T11:00:00.000Z");
  });
  it("warns on unreadable text", () => {
    expect(parseInstant("hier soir").warning).toMatch(/illisible/);
  });
});

describe("value lists", () => {
  it("maps statuses", () => {
    expect(
      ["Candidat", "Actif", "Suspendu", "Inactif", "Parti(e)"].map((s) => parseStatus(s).value),
    ).toEqual(["CANDIDATE", "ACTIVE", "SUSPENDED", "INACTIVE", "LEFT"]);
    expect(parseStatus("En pause").warning).toMatch(/Statut inconnu/);
  });
  it("maps aptitudes, results and stages, accent- and case-insensitive", () => {
    expect(
      ["Apte", "Non apte", "Retiré(e)", "à vérifier"].map((s) => parseAptitude(s).value),
    ).toEqual(["FIT", "UNFIT", "WITHDRAWN", "TO_CHECK"]);
    expect(
      ["Validé", "Inscrit(e)", "À confirmer", "Non validé", "Absent"].map(
        (s) => parseResult(s).value,
      ),
    ).toEqual(["PASSED", "REGISTERED", "TO_CONFIRM", "FAILED", "ABSENT"]);
    expect(parseStage("Premier contact").value).toBe("FIRST_CONTACT");
    expect(parseStage("dossier en cours").value).toBe("FILE");
    expect(parseStage("Rencontre prévue").value).toBeNull();
  });
  it("keeps phones as written, spaces normalised", () => {
    expect(normalizePhone("  06 39  98 00 00 ")).toBe("06 39 98 00 00");
    expect(cellText("   ")).toBeNull();
  });
});

describe("parseCancellation (« Annulée »)", () => {
  const today = day(2026, 11, 4);
  it("is empty for an active appointment", () => {
    expect(parseCancellation(null, today)).toEqual({ value: null });
  });
  it("splits « JJ/MM/AAAA par <email> : <motif> »", () => {
    const parsed = parseCancellation(
      "12/05/2025 par Editeur@Exemple.test : erreur de saisie",
      today,
    );
    expect(parsed.warning).toBeUndefined();
    expect(parsed.value).toEqual({
      at: new Date("2025-05-11T22:00:00.000Z"),
      email: "editeur@exemple.test",
      reason: "erreur de saisie",
    });
  });
  it("keeps a free-format text as reason, dated of the import, with a warning", () => {
    const parsed = parseCancellation("annulée à la demande du DLUS", today);
    expect(parsed.value).toEqual({
      at: new Date("2026-11-03T23:00:00.000Z"),
      email: null,
      reason: "annulée à la demande du DLUS",
    });
    expect(parsed.warning).toMatch(/format libre/);
  });
});

describe("journal masking and hash", () => {
  const row: JournalRow = {
    at: "2025-03-12T13:05:00.000Z",
    user: "editeur@exemple.test",
    action: "Modification",
    table: "Benevoles",
    key: "00099000001B",
    field: "Date de naissance",
    oldValue: "01/01/1990",
    newValue: "02/01/1990",
  };

  it("detects sensitive fields", () => {
    for (const f of [
      "Date de naissance",
      "Date vérif. B3",
      "Autorisation parentale",
      "Date autorisation",
      "Adresse postale",
    ]) {
      expect(isSensitiveJournalField(f), f).toBe(true);
    }
    expect(isSensitiveJournalField("Téléphone")).toBe(false);
    expect(isSensitiveJournalField(null)).toBe(false);
  });

  it("masks sensitive values and keeps the others", () => {
    expect(maskJournalRow(row)).toMatchObject({ oldValue: "[sensible]", newValue: "[sensible]" });
    expect(maskJournalRow({ ...row, field: "Téléphone" }).oldValue).toBe("01/01/1990");
    expect(maskJournalRow({ ...row, oldValue: null }).oldValue).toBeNull();
  });

  it("hashes the masked row: stable, sensitive values out of the hash", () => {
    expect(journalHash(row)).toMatch(/^[0-9a-f]{64}$/);
    expect(journalHash(row)).toBe(journalHash({ ...row }));
    expect(journalHash(row)).toBe(journalHash({ ...row, oldValue: "03/03/1993" }));
    expect(journalHash(row)).not.toBe(journalHash({ ...row, key: "00099000002C" }));
    expect(journalHash({ ...row, field: "Téléphone" })).not.toBe(
      journalHash({ ...row, field: "Téléphone", oldValue: "x" }),
    );
  });
});
