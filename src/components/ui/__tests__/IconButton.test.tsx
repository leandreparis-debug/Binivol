import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IconButton } from "@/components/ui/IconButton";

describe("IconButton", () => {
  it("renders a 44 px round button with its aria-label", () => {
    render(
      <IconButton aria-label="Rechercher" variant="ink">
        <svg />
      </IconButton>,
    );
    const button = screen.getByRole("button", { name: "Rechercher" });
    expect(button).toHaveClass("size-11", "rounded-control", "bg-ink");
  });
});
