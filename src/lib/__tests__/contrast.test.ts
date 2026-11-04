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

/** Tokens as defined in `src/app/globals.css`. Keep in sync. */
const T = {
  canvas: "#ececea",
  surface: "#ffffff",
  veil: "#f5f5f3",
  ink: "#121212",
  muted: "#6a6a69",
  accent: "#1f6bff",
  accentSoft: "#e2ebff",
  accentInk: "#1748b8",
  okSoft: "#dff5ea",
  okInk: "#176b48",
  warnSoft: "#fff3d1",
  warnInk: "#8a6200",
  dangerSoft: "#fde3e5",
  dangerInk: "#a81e29",
  danger: "#d92d3a",
  white: "#ffffff",
};

describe("colour contrast (WCAG AA, 4.5:1 for normal text)", () => {
  it.each([
    ["white on accent", T.white, T.accent],
    ["accent-ink on accent-soft", T.accentInk, T.accentSoft],
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

  it("documents why muted was darkened from the spec value", () => {
    expect(contrast("#717170", T.canvas)).toBeLessThan(4.5);
    expect(contrast(T.muted, T.canvas)).toBeGreaterThanOrEqual(4.5);
  });
});
