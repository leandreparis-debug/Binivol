import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BinivolLogo } from "@/components/brand/BinivolLogo";
import { BinivolMark, type MarkVariant } from "@/components/brand/BinivolMark";

describe("BinivolMark", () => {
  it.each(["default", "inverse", "mono"] as MarkVariant[])("renders the %s variant", (variant) => {
    const { container } = render(<BinivolMark variant={variant} label="Binivol" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("data-variant", variant);
    expect(svg?.querySelectorAll("path").length).toBe(4);
    expect(svg?.querySelector("radialGradient") !== null).toBe(variant === "default");
  });

  it("is decorative without a label", () => {
    const { container } = render(<BinivolMark />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("is an image with a label", () => {
    render(<BinivolMark label="Logo Binivol" />);
    expect(screen.getByRole("img", { name: "Logo Binivol" })).toBeInTheDocument();
  });

  it("falls back to default for an unknown variant at runtime", () => {
    const unknown = "neon" as unknown as MarkVariant;
    const { container } = render(<BinivolMark variant={unknown} />);
    expect(container.querySelector("svg")).toHaveAttribute("data-variant", "default");
  });

  it("applies the size", () => {
    const { container } = render(<BinivolMark size={16} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "16");
  });
});

describe("BinivolLogo", () => {
  it("exposes one accessible name for the group", () => {
    render(<BinivolLogo />);
    expect(screen.getByRole("img", { name: "Binivol" })).toBeInTheDocument();
  });
});
