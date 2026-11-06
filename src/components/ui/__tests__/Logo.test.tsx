import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { markShape, shapeToSvg, wordmarkShape } from "@/components/brand/logoGeometry";
import { Logo } from "../Logo";

describe("Logo « Point »", () => {
  it("is named Binivol, or hidden when decorative", () => {
    const { rerender } = render(<Logo />);
    expect(screen.getByRole("img", { name: "Binivol" })).toBeInTheDocument();
    rerender(<Logo decorative />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("wordmark: ink glyphs and a blue square on the baseline, 0.22 em, 0.07 em away", () => {
    const shape = wordmarkShape();
    expect(shape.glyphs.fill).toBe("#0F0F0F");
    expect(shape.square).toMatchObject({ size: 22, y: -22, fill: "#1F5BFF" });
    expect(wordmarkShape("white").glyphs.fill).toBe("#FFFFFF");
  });

  it("mark: 48 ink square, radius 8, white b, blue square inside the icon", () => {
    const shape = markShape();
    expect(shape.background).toEqual({ size: 48, radius: 8, fill: "#0F0F0F" });
    expect(shape.glyphs.fill).toBe("#FFFFFF");
    expect(shape.square.x + shape.square.size).toBeLessThan(48);
    expect(shapeToSvg(shape, 64)).toMatch(
      /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="64" height="64"/,
    );
  });

  it("never a red cross", () => {
    const svg = shapeToSvg(wordmarkShape(), 200) + shapeToSvg(markShape(), 48);
    expect(svg.toLowerCase()).not.toMatch(/#(e3|d9|ff0000|c00)/);
  });
});
