import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";

describe("Field", () => {
  it("links the label to the control", () => {
    render(
      <Field label="Prénom">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("Prénom")).toBeInstanceOf(HTMLInputElement);
  });

  it("describes the control by its hint", () => {
    render(
      <Field label="Prénom" hint="Comme sur la pièce d'identité">
        <Input />
      </Field>,
    );
    const input = screen.getByLabelText("Prénom");
    expect(input).toHaveAccessibleDescription("Comme sur la pièce d'identité");
    expect(input).not.toHaveAttribute("aria-invalid");
  });

  it("marks the control invalid and describes it by the error", () => {
    render(
      <Field label="E-mail" hint="Adresse personnelle" error="Adresse invalide">
        <Input type="email" />
      </Field>,
    );
    const input = screen.getByLabelText("E-mail");
    expect(input).toHaveAttribute("aria-invalid", "true");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    const errorId = screen.getByRole("alert").id;
    expect(describedBy.split(" ")).toContain(errorId);
    expect(input).toHaveAccessibleDescription("Adresse invalide Adresse personnelle");
  });

  it("works with Textarea and Select", () => {
    render(
      <>
        <Field label="Commentaire" error="Trop long">
          <Textarea />
        </Field>
        <Field label="Activité" required>
          <Select>
            <option>Secours</option>
          </Select>
        </Field>
      </>,
    );
    expect(screen.getByLabelText("Commentaire")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/Activité/)).toBeRequired();
  });
});
