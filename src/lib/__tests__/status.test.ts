import { describe, expect, it } from "vitest";
import { STATUSES, STATUS_KEYS, getStatus } from "@/lib/status";

describe("status registry", () => {
  it("lists the volunteer, deadline and dossier statuses", () => {
    expect(STATUS_KEYS).toEqual([
      "candidate",
      "active",
      "paused",
      "suspended",
      "inactive",
      "left",
      "ok",
      "soon",
      "expired",
      "link-active",
      "link-expired",
      "link-used",
      "link-revoked",
      "dossier-none",
      "dossier-draft",
      "dossier-submitted",
      "dossier-to-countersign",
      "dossier-complete",
      "mail-sent",
      "mail-failed",
      "qual-valid",
      "qual-valid_undated",
      "qual-expiring",
      "qual-expired",
      "qual-registered",
      "qual-to_confirm",
      "qual-function_active",
      "qual-function_ended",
      "qual-none",
      "alert-high",
      "alert-medium",
      "alert-low",
      "alert-info",
      "notif-unread",
      "notif-read",
      "todo-late",
      "todo-today",
      "enrol-registered",
      "enrol-waitlisted",
      "enrol-confirmed",
    ]);
  });

  it("gives every status a non-empty French label", () => {
    for (const key of STATUS_KEYS) {
      expect(getStatus(key).label.length).toBeGreaterThan(0);
      expect(STATUSES[key].tone).toBeTruthy();
    }
  });
});
