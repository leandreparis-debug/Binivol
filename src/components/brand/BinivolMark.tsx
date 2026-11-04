import { useId } from "react";
import { cn } from "@/lib/cn";
import { MARK_PATHS, MARK_STROKE, MARK_VIEWBOX } from "./markGeometry";

export const MARK_VARIANTS = ["default", "inverse", "mono"] as const;
export type MarkVariant = (typeof MARK_VARIANTS)[number];

export interface BinivolMarkProps extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  /** Rendered size in pixels (width = height). Default 32. */
  size?: number;
  /**
   * `default`: gradient disc (accent-2 → accent) and white glyph.
   * `inverse`: white disc and accent glyph (for dark or accent backgrounds).
   * `mono`: ink disc and white glyph.
   * An unknown value received at runtime falls back to `default`.
   */
  variant?: MarkVariant;
  /**
   * Accessible name. When provided the SVG gets `role="img"` and `aria-label`;
   * otherwise it is decorative (`aria-hidden`).
   */
  label?: string;
}

function isMarkVariant(value: unknown): value is MarkVariant {
  return typeof value === "string" && (MARK_VARIANTS as readonly string[]).includes(value);
}

/**
 * The Binivol symbol: a filled disc with a white lowercase « b » whose bowl
 * ends in an arrow rising to the upper right.
 */
export function BinivolMark({ size = 32, variant, label, className, ...rest }: BinivolMarkProps) {
  const gradientId = useId();
  const safeVariant: MarkVariant = isMarkVariant(variant) ? variant : "default";

  const disc =
    safeVariant === "default"
      ? `url(#${gradientId})`
      : safeVariant === "inverse"
        ? "var(--surface)"
        : "var(--ink)";
  const glyph = safeVariant === "inverse" ? "var(--accent)" : "var(--surface)";

  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      className={cn("shrink-0", className)}
      data-variant={safeVariant}
      focusable="false"
      {...a11y}
      {...rest}
    >
      {safeVariant === "default" && (
        <defs>
          <radialGradient id={gradientId} cx="30%" cy="22%" r="85%">
            <stop offset="0" stopColor="var(--accent-2)" />
            <stop offset="1" stopColor="var(--accent)" />
          </radialGradient>
        </defs>
      )}
      <circle cx={MARK_VIEWBOX / 2} cy={MARK_VIEWBOX / 2} r={MARK_VIEWBOX / 2} fill={disc} />
      {MARK_PATHS.map((d) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke={glyph}
          strokeWidth={MARK_STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
