import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button, buttonVariantClasses, type ButtonVariant } from "@/components/ui/Button";

describe("Button", () => {
  it.each(Object.keys(buttonVariantClasses) as ButtonVariant[])(
    "renders the %s variant",
    (variant) => {
      render(<Button variant={variant}>Action</Button>);
      const button = screen.getByRole("button", { name: "Action" });
      expect(button).toHaveClass("rounded-pill");
      for (const cls of buttonVariantClasses[variant].split(" ")) {
        expect(button).toHaveClass(cls);
      }
    },
  );

  it("defaults to type=button", () => {
    render(<Button>Action</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("is disabled and aria-busy while loading", () => {
    render(<Button loading>Enregistrer</Button>);
    const button = screen.getByRole("button", { name: "Enregistrer" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector("svg")).not.toBeNull();
  });

  it("renders left and right icons", () => {
    render(
      <Button leftIcon={<span data-testid="left" />} rightIcon={<span data-testid="right" />}>
        Texte
      </Button>,
    );
    expect(screen.getByTestId("left")).toBeInTheDocument();
    expect(screen.getByTestId("right")).toBeInTheDocument();
  });

  it("renders the child element with asChild", () => {
    render(
      <Button asChild variant="accent">
        <a href="https://exemple.test/aide">Voir les bénévoles</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Voir les bénévoles" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveClass("bg-accent");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
