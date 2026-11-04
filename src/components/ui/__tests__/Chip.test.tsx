import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Chip, chipToneClasses } from "@/components/ui/Chip";
import type { Tone } from "@/lib/status";

describe("Chip", () => {
  it.each(Object.keys(chipToneClasses) as Tone[])("renders the %s tone", (tone) => {
    render(<Chip tone={tone}>Libellé</Chip>);
    const chip = screen.getByText("Libellé");
    for (const cls of chipToneClasses[tone].split(" ")) expect(chip).toHaveClass(cls);
  });
});
