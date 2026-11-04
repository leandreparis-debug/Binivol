import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "@/components/ui/StatCard";

describe("StatCard", () => {
  it("renders the default variant on veil", () => {
    render(
      <StatCard label="Bénévoles" value="128" delta="+4" deltaTone="up" footer="sur 30 jours" />,
    );
    expect(screen.getByText("128")).toHaveClass("tabular-nums");
    expect(screen.getByText("Bénévoles").closest("[data-variant]")).toHaveAttribute(
      "data-variant",
      "default",
    );
    expect(screen.getByText("+4")).toHaveClass("bg-ok-soft");
  });

  it("renders the highlight variant with the accent gradient", () => {
    render(<StatCard variant="highlight" label="Taux" value="92 %" />);
    const card = screen.getByText("Taux").closest("[data-variant]");
    expect(card).toHaveAttribute("data-variant", "highlight");
    expect(card).toHaveClass("bg-accent-gradient", "text-white");
  });

  it("renders the dark variant on ink", () => {
    render(<StatCard variant="dark" label="Échéances" value="7" />);
    expect(screen.getByText("Échéances").closest("[data-variant]")).toHaveClass("bg-ink");
  });
});
