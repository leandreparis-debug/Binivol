import { describe, expect, it } from "vitest";
import {
  ALERT_CODES,
  ALERT_RULES,
  personAlerts,
  referenceAlerts,
  sortAlerts,
  type AlertCode,
  type AlertConfig,
  type AlertPerson,
  type AlertRecord,
  type AlertReference,
} from "../rules";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = d("2026-11-06");

function ref(code: string, extra: Partial<AlertReference> = {}): AlertReference {
  return {
    id: `r_${code}`,
    code,
    label: code,
    kind: "TRAINING",
    active: true,
    forbiddenForMinors: false,
    validityMonths: null,
    expiresEndOfYear: true,
    prerequisiteIds: [],
    ...extra,
  };
}

const REFS = new Map(
  [
    ref("PSE", { prerequisiteIds: ["r_PSC"] }),
    ref("PSC"),
    ref("OPR"),
    ref("ECG"),
    ref("CRB"),
    ref("TCAU"),
    ref("TCAS"),
    ref("OLD", { active: false }),
    ref("CHEF", { kind: "FUNCTION", forbiddenForMinors: true }),
  ].map((r) => [r.id, r]),
);

const passed = (code: string, date: string | null, expires: string | null): AlertRecord => ({
  referenceId: `r_${code}`,
  result: "PASSED",
  date: date ? d(date) : null,
  expiresAt: expires ? d(expires) : null,
  cancelledAt: null,
  sessionStart: null,
});

const CORE_OK = [
  passed("CRB", "2026-01-10", "2027-12-31"),
  passed("TCAU", "2026-01-10", "2027-12-31"),
  passed("TCAS", "2026-01-10", "2027-12-31"),
];

/** A volunteer without any alert. */
function clean(extra: Partial<AlertPerson> = {}): AlertPerson {
  return {
    id: "p1",
    ref: "P-00001",
    firstName: "Alix",
    lastName: "Exemple",
    status: "ACTIVE",
    nivol: "00012345678A",
    email: "alix@exemple.test",
    regularMinorSupervisor: false,
    purgeEligibleAt: null,
    pauseUntil: null,
    age: 30,
    b3CheckedAt: null,
    parentalAuthorization: false,
    records: CORE_OK,
    appointments: [],
    candidacyFollowUpAt: null,
    plannedFollowUps: [],
    ...extra,
  };
}

const config = (extra: Partial<AlertConfig> = {}): AlertConfig => ({
  day,
  alertDays: 60,
  coreCodes: ["CRB", "TCAU", "TCAS"],
  companions: { PSE: ["OPR", "ECG"] },
  disabled: new Set(),
  ...extra,
});

const codes = (person: AlertPerson, cfg = config()) =>
  personAlerts(person, REFS, cfg).map((a) => a.code);

describe("alert rules", () => {
  it("a complete, up-to-date volunteer has no alert", () => {
    expect(codes(clean())).toEqual([]);
  });

  const cases: [AlertCode, Partial<AlertPerson>, Partial<AlertPerson>][] = [
    [
      "TRAINING_EXPIRED",
      { records: [...CORE_OK, passed("PSC", "2020-01-01", "2025-12-31")] },
      { records: [...CORE_OK, passed("PSC", "2026-01-01", "2027-12-31")] },
    ],
    [
      "MINOR_FORBIDDEN_FUNCTION",
      {
        age: 16,
        parentalAuthorization: true,
        appointments: [{ referenceId: "r_CHEF", startDate: d("2026-01-01"), endDate: null }],
      },
      {
        age: 19,
        appointments: [{ referenceId: "r_CHEF", startDate: d("2026-01-01"), endDate: null }],
      },
    ],
    ["NIVOL_INVALID", { nivol: null }, { status: "CANDIDATE", nivol: null, records: [] }],
    [
      "INACTIVE_REFERENCE",
      {
        records: [
          ...CORE_OK,
          { ...passed("OLD", null, null), result: "REGISTERED", sessionStart: d("2026-12-01") },
        ],
      },
      {
        records: [
          ...CORE_OK,
          { ...passed("PSC", null, null), result: "REGISTERED", sessionStart: d("2026-12-01") },
        ],
      },
    ],
    [
      "TRAINING_EXPIRING",
      { records: [...CORE_OK, passed("PSC", "2025-01-01", "2026-12-01")] },
      { records: [...CORE_OK, passed("PSC", "2026-01-01", "2027-12-31")] },
    ],
    [
      "PREREQUISITE_MISSING",
      {
        records: [
          ...CORE_OK,
          passed("PSE", "2026-01-01", "2027-12-31"),
          passed("OPR", "2026-01-01", "2027-12-31"),
          passed("ECG", "2026-01-01", "2027-12-31"),
        ],
      },
      {
        records: [
          ...CORE_OK,
          passed("PSE", "2026-01-01", "2027-12-31"),
          passed("PSC", "2026-01-01", "2027-12-31"),
          passed("OPR", "2026-01-01", "2027-12-31"),
          passed("ECG", "2026-01-01", "2027-12-31"),
        ],
      },
    ],
    ["MINOR_NO_PARENTAL_AUTH", { age: 16 }, { age: 16, parentalAuthorization: true }],
    [
      "B3_DUE",
      { regularMinorSupervisor: true, b3CheckedAt: d("2025-12-31") },
      { regularMinorSupervisor: true, b3CheckedAt: d("2026-01-02") },
    ],
    [
      "CORE_INCOMPLETE",
      { records: CORE_OK.slice(0, 2) },
      { status: "CANDIDATE", nivol: null, records: [] },
    ],
    [
      "COMPANION_MISSING",
      {
        records: [
          ...CORE_OK,
          passed("PSC", "2026-01-01", "2027-12-31"),
          passed("PSE", "2026-01-01", "2027-12-31"),
          passed("OPR", "2026-01-01", "2027-12-31"),
        ],
      },
      { records: [...CORE_OK, passed("OPR", "2026-01-01", "2027-12-31")] },
    ],
    [
      "PURGE_DUE",
      { status: "LEFT", purgeEligibleAt: d("2026-01-01") },
      { status: "LEFT", purgeEligibleAt: d("2027-01-01") },
    ],
    [
      "CANDIDACY_FOLLOW_UP_LATE",
      { candidacyFollowUpAt: d("2026-11-01") },
      { candidacyFollowUpAt: d("2026-11-06") },
    ],
    [
      "FOLLOW_UP_OVERDUE",
      { plannedFollowUps: [d("2026-10-01")] },
      { plannedFollowUps: [d("2026-12-01")] },
    ],
    [
      "PAUSE_RETURN_PASSED",
      { status: "PAUSED", pauseUntil: d("2026-11-01") },
      { status: "PAUSED", pauseUntil: d("2026-11-30") },
    ],
    [
      "RESULT_PENDING",
      {
        records: [
          ...CORE_OK,
          { ...passed("PSC", null, null), result: "REGISTERED", sessionStart: d("2026-10-01") },
        ],
      },
      {
        records: [
          ...CORE_OK,
          { ...passed("PSC", null, null), result: "REGISTERED", sessionStart: d("2026-12-01") },
        ],
      },
    ],
    ["PROFILE_INCOMPLETE", { email: null }, { email: "x@exemple.test" }],
  ];

  it.each(cases)("%s: raised on the positive case, not on the negative one", (code, yes, no) => {
    expect(codes(clean(yes))).toContain(code);
    expect(codes(clean(no))).not.toContain(code);
  });

  it("covers every person rule", () => {
    expect(new Set(cases.map((c) => c[0]))).toEqual(
      new Set(ALERT_CODES.filter((c) => c !== "REFERENCE_NO_VALIDITY")),
    );
  });

  it("a disabled rule raises nothing", () => {
    expect(
      codes(clean({ email: null }), config({ disabled: new Set(["PROFILE_INCOMPLETE"]) })),
    ).toEqual([]);
  });

  it("the tronc commun names the registration date", () => {
    const [alert] = personAlerts(
      clean({
        records: [
          ...CORE_OK.slice(0, 2),
          { ...passed("TCAS", null, null), result: "REGISTERED", sessionStart: d("2026-12-12") },
        ],
      }),
      REFS,
      config(),
    );
    expect(alert?.message).toBe("Manque : TCAS (inscrit(e) le 12/12/2026).");
  });

  it("an alert links to the right tab, no alert for a person who left without purge date", () => {
    const [alert] = personAlerts(clean({ plannedFollowUps: [d("2026-10-01")] }), REFS, config());
    expect(alert?.href).toBe("/benevoles/P-00001?onglet=suivi");
    expect(codes(clean({ status: "LEFT", nivol: null, email: null }))).toEqual([]);
  });

  it("reference alert: a training without validity nor 31/12 rule (INFO)", () => {
    const alerts = referenceAlerts(
      [
        ref("A", { expiresEndOfYear: false }),
        ref("B"),
        ref("C", { kind: "FUNCTION", expiresEndOfYear: false }),
      ],
      { disabled: new Set() },
    );
    expect(alerts.map((a) => [a.code, a.priority, a.subject])).toEqual([
      ["REFERENCE_NO_VALIDITY", "INFO", "A : A"],
    ]);
  });

  it("sorts by priority then subject; priorities are those of the specification", () => {
    const alerts = sortAlerts([
      ...personAlerts(clean({ email: null, nivol: null }), REFS, config()),
    ]);
    expect(alerts.map((a) => a.priority)).toEqual(["HIGH", "LOW"]);
    expect(ALERT_RULES.TRAINING_EXPIRED.priority).toBe("HIGH");
    expect(ALERT_RULES.CORE_INCOMPLETE.priority).toBe("MEDIUM");
    expect(ALERT_RULES.RESULT_PENDING.priority).toBe("LOW");
  });
});
