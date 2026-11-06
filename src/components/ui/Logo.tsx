import { cn } from "@/lib/cn";
import { markShape, wordmarkShape } from "@/components/brand/logoGeometry";

export interface LogoProps extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  /** `full`: the wordmark « binivol » and its blue square; `mark`: the square icon. */
  variant?: "full" | "mark";
  /** `ink` (default) or `white`, for the wordmark on an ink background. */
  tone?: "ink" | "white";
  /** Height in pixels. Default 24 (full) or 32 (mark). */
  size?: number;
  /** Inside a link or a button that already names it: hidden from assistive technologies. */
  decorative?: boolean;
}

/**
 * The Binivol logo (piste A « Point », ADR-065), inline SVG from the glyph
 * paths of Inter Tight 700: it never depends on a font being loaded. Never a
 * red cross.
 *
 * @example
 * <Logo />                     // wordmark, 24 px high
 * <Logo variant="mark" size={40} />
 */
export function Logo({
  variant = "full",
  tone = "ink",
  size,
  decorative = false,
  className,
  ...rest
}: LogoProps) {
  const shape = variant === "mark" ? markShape() : wordmarkShape(tone);
  const height = size ?? (variant === "mark" ? 32 : 24);
  const width = Math.round((height * shape.width) / shape.height);
  return (
    <svg
      viewBox={shape.viewBox}
      width={width}
      height={height}
      className={cn("shrink-0", className)}
      {...(decorative
        ? { "aria-hidden": true, focusable: false }
        : { role: "img", "aria-label": "Binivol" })}
      {...rest}
    >
      {shape.background && (
        <rect
          width={shape.background.size}
          height={shape.background.size}
          rx={shape.background.radius}
          fill={shape.background.fill}
        />
      )}
      <path d={shape.glyphs.d} fill={shape.glyphs.fill} transform={shape.glyphs.transform} />
      <rect
        x={shape.square.x}
        y={shape.square.y}
        width={shape.square.size}
        height={shape.square.size}
        fill={shape.square.fill}
      />
    </svg>
  );
}
