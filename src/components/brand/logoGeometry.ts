import { LETTER_B, WORDMARK } from "./logoPaths";

/**
 * Geometry of the logo « Point » (ADR-065): the wordmark « binivol » in
 * Inter Tight 700 followed by a solid blue square (side 0.22 × the text
 * size, on the baseline, 0.07 em away); the icon is an ink square (radius 8
 * on 48) with a white « b » and a small blue square at its bottom right.
 * Shared by `Logo.tsx` (React) and `scripts/generate-icons.ts` (files).
 */

export const LOGO_INK = "#0F0F0F";
export const LOGO_BLUE = "#1F5BFF";
export const LOGO_WHITE = "#FFFFFF";

export interface LogoShape {
  viewBox: string;
  width: number;
  height: number;
  /** Background rounded square (icon only). */
  background?: { size: number; radius: number; fill: string };
  glyphs: { d: string; fill: string; transform?: string };
  square: { x: number; y: number; size: number; fill: string };
}

const SQUARE = 22; // 0.22 em
const GAP = 7; // 0.07 em

/** The wordmark, ink (default) or white on an ink background. */
export function wordmarkShape(tone: "ink" | "white" = "ink"): LogoShape {
  const pad = 2;
  const x0 = WORDMARK.minX - pad;
  const y0 = WORDMARK.top - pad;
  const squareX = WORDMARK.maxX + GAP;
  const width = squareX + SQUARE + pad - x0;
  const height = WORDMARK.bottom + pad - y0;
  return {
    viewBox: `${fmt(x0)} ${fmt(y0)} ${fmt(width)} ${fmt(height)}`,
    width,
    height,
    glyphs: { d: WORDMARK.d, fill: tone === "ink" ? LOGO_INK : LOGO_WHITE },
    square: { x: squareX, y: -SQUARE, size: SQUARE, fill: LOGO_BLUE },
  };
}

/** The icon: 48 × 48 ink square, white « b », small blue square. */
export function markShape(): LogoShape {
  const size = 48;
  const scale = 0.36;
  const bWidth = (LETTER_B.maxX - LETTER_B.minX) * scale;
  const square = SQUARE * scale;
  const gap = GAP * scale;
  const total = bWidth + gap + square;
  const left = (size - total) / 2;
  const capHeight = -LETTER_B.top * scale;
  const baseline = (size + capHeight) / 2;
  const tx = left - LETTER_B.minX * scale;
  return {
    viewBox: `0 0 ${String(size)} ${String(size)}`,
    width: size,
    height: size,
    background: { size, radius: 8, fill: LOGO_INK },
    glyphs: {
      d: LETTER_B.d,
      fill: LOGO_WHITE,
      transform: `translate(${fmt(tx)} ${fmt(baseline)}) scale(${String(scale)})`,
    },
    square: { x: left + bWidth + gap, y: baseline - square, size: square, fill: LOGO_BLUE },
  };
}

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/** The shape as a standalone SVG document (favicon, PNG generation). */
export function shapeToSvg(shape: LogoShape, pixelWidth: number): string {
  const pixelHeight = Math.round((pixelWidth * shape.height) / shape.width);
  const bg = shape.background
    ? `<rect width="${String(shape.background.size)}" height="${String(shape.background.size)}" rx="${String(shape.background.radius)}" fill="${shape.background.fill}"/>`
    : "";
  const transform = shape.glyphs.transform ? ` transform="${shape.glyphs.transform}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${String(pixelWidth)}" height="${String(pixelHeight)}" viewBox="${shape.viewBox}">${bg}<path d="${shape.glyphs.d}" fill="${shape.glyphs.fill}"${transform}/><rect x="${fmt(shape.square.x)}" y="${fmt(shape.square.y)}" width="${fmt(shape.square.size)}" height="${fmt(shape.square.size)}" fill="${shape.square.fill}"/></svg>`;
}
