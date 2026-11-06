import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Relative luminance (WCAG 2.1). */
function luminance(hex: string): number {
  const channels = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colours (WCAG 2.1). */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** Tokens read from `src/app/globals.css` (`:root`): the test follows the real values. */
function tokens(): Record<string, string> {
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  return Object.fromEntries(
    [...root.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map((m) => [m[1] ?? "", m[2] ?? ""]),
  );
}

const raw = tokens();
const T = {
  canvas: raw.canvas ?? "",
  surface: raw.surface ?? "",
  veil: raw.veil ?? "",
  ink: raw.ink ?? "",
  muted: raw.muted ?? "",
  accent: raw.accent ?? "",
  accentSoft: raw["accent-soft"] ?? "",
  accentInk: raw["accent-ink"] ?? "",
  okSoft: raw["ok-soft"] ?? "",
  okInk: raw["ok-ink"] ?? "",
  warnSoft: raw["warn-soft"] ?? "",
  warnInk: raw["warn-ink"] ?? "",
  dangerSoft: raw["danger-soft"] ?? "",
  dangerInk: raw["danger-ink"] ?? "",
  danger: raw.danger ?? "",
  white: "#ffffff",
};

describe("colour contrast (WCAG AA, 4.5:1 for normal text)", () => {
  it("reads the Swiss palette from globals.css", () => {
    expect(T).toMatchObject({ canvas: "#f4f4f2", ink: "#0f0f0f", accent: "#1f5bff" });
  });

  it.each([
    ["white on accent", T.white, T.accent],
    ["accent on surface", T.accent, T.surface],
    ["accent on canvas", T.accent, T.canvas],
    ["accent-ink on accent-soft", T.accentInk, T.accentSoft],
    ["accent-ink on surface (badge of the highlight StatCard)", T.accentInk, T.surface],
    ["muted on surface", T.muted, T.surface],
    ["muted on canvas", T.muted, T.canvas],
    ["muted on veil", T.muted, T.veil],
    ["warn-ink on warn-soft", T.warnInk, T.warnSoft],
    ["ok-ink on ok-soft", T.okInk, T.okSoft],
    ["danger-ink on danger-soft", T.dangerInk, T.dangerSoft],
    ["white on ink", T.white, T.ink],
    ["ink on canvas", T.ink, T.canvas],
    ["white on danger", T.white, T.danger],
  ])("%s ≥ 4.5:1", (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("documents why text on accent-soft is accent-ink, never accent", () => {
    expect(contrast(T.accent, T.accentSoft)).toBeLessThan(4.5);
  });
});
