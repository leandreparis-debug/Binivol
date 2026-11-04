/**
 * Geometry of the Binivol mark, shared by the React component and the icon
 * generation script (`scripts/generate-icons.ts`) so both stay identical.
 *
 * The glyph is a lowercase « b » whose bowl opens at the top right and turns
 * into an arrow rising to the upper right: the volunteer who progresses.
 * Drawn in a 64 × 64 box, stroke 7, round caps — still readable at 16 px.
 */
export const MARK_VIEWBOX = 64;
export const MARK_STROKE = 7;

/** Vertical stem of the « b ». */
export const MARK_STEM = "M17 12V48";
/** Bottom and right side of the bowl, leaving as the arrow shaft. */
export const MARK_BOWL = "M17 48C28 53 36.5 50 40 38L47 14";
/** Top-left of the bowl, meeting the shaft. */
export const MARK_BOWL_TOP = "M17 30C23 25 35 25 41.5 33";
/** Arrow head (↗). */
export const MARK_ARROW = "M40 17.9L47 14L50.9 21";

export const MARK_PATHS = [MARK_STEM, MARK_BOWL, MARK_BOWL_TOP, MARK_ARROW] as const;

/** Colours used by static renderings (favicon, apple icon). */
export const MARK_COLORS = {
  accent: "#1f6bff",
  accent2: "#5b93ff",
  ink: "#121212",
  white: "#ffffff",
} as const;

/**
 * Builds a self-contained SVG document of the mark (used for static icons).
 */
export function buildMarkSvg(options: {
  size: number;
  variant: "default" | "inverse" | "mono";
}): string {
  const { size, variant } = options;
  const fill =
    variant === "default"
      ? "url(#binivol-mark-gradient)"
      : variant === "inverse"
        ? MARK_COLORS.white
        : MARK_COLORS.ink;
  const stroke = variant === "inverse" ? MARK_COLORS.accent : MARK_COLORS.white;
  const paths = MARK_PATHS.map(
    (d) =>
      `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${MARK_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>`,
  ).join("");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}">` +
    `<defs><radialGradient id="binivol-mark-gradient" cx="30%" cy="22%" r="85%">` +
    `<stop offset="0" stop-color="${MARK_COLORS.accent2}"/><stop offset="1" stop-color="${MARK_COLORS.accent}"/>` +
    `</radialGradient></defs>` +
    `<circle cx="32" cy="32" r="32" fill="${fill}"/>${paths}</svg>`
  );
}
