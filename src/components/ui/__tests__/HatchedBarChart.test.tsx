import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HatchedBarChart, niceMax } from "@/components/ui/HatchedBarChart";

describe("HatchedBarChart", () => {
  it("exposes an accessible summary", () => {
    render(
      <HatchedBarChart
        title="Heures par mois"
        primaryLabel="Secours"
        secondaryLabel="Formations"
        data={[{ label: "Jan", primary: 10, secondary: 5 }]}
      />,
    );
    const figure = screen.getByRole("img", { name: /Heures par mois/ });
    expect(figure).toHaveAccessibleName("Heures par mois. Jan : Secours 10, Formations 5.");
  });

  it("rounds the axis to a nice maximum", () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(205)).toBe(250);
    expect(niceMax(7)).toBe(8);
    expect(niceMax(100)).toBe(100);
  });
});
