import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProgressBar, clampProgress } from "@/components/ui/ProgressBar";

describe("ProgressBar", () => {
  it("exposes the value through aria attributes", () => {
    render(<ProgressBar value={42} label="Avancement" />);
    const bar = screen.getByRole("progressbar", { name: "Avancement" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("handles the bounds 0 and 100", () => {
    const { rerender } = render(<ProgressBar value={0} label="Vide" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    rerender(<ProgressBar value={100} label="Plein" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("clamps values outside the bounds", () => {
    const { rerender } = render(<ProgressBar value={140} label="Trop" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<ProgressBar value={-5} label="Négatif" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(clampProgress(Number.NaN, 100)).toBe(0);
    expect(clampProgress(7, 3)).toBe(3);
  });

  it("supports a custom max and value text", () => {
    render(<ProgressBar value={2} max={3} label="Dossier" valueText="Étape 2 sur 3" showValue />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    expect(bar).toHaveAttribute("aria-valuetext", "Étape 2 sur 3");
    expect(screen.getByText("Étape 2 sur 3")).toBeInTheDocument();
  });
});
