import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DataTable } from "@/components/ui/DataTable";

const rows = [
  { id: "1", name: "Camille Démo", nivol: "00012345678A" },
  { id: "2", name: "Noa Exemple", nivol: "00012345679B" },
];

describe("DataTable", () => {
  it("renders headers, cells and the mobile card list", () => {
    render(
      <DataTable
        caption="Bénévoles"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: "name", header: "Nom" },
          { key: "nivol", header: "NIVOL", mono: true },
        ]}
      />,
    );
    expect(screen.getByRole("table", { name: "Bénévoles" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "NIVOL" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "00012345678A" })).toHaveClass("font-mono");
    expect(screen.getByRole("list", { name: "Bénévoles" })).toBeInTheDocument();
  });

  it("toggles selection with accessible checkboxes", async () => {
    const onChange = vi.fn();
    render(
      <DataTable
        caption="Bénévoles"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[{ key: "name", header: "Nom" }]}
        selectable
        onSelectedKeysChange={onChange}
      />,
    );
    const first = screen.getAllByRole("checkbox", { name: "Sélectionner 1" })[0];
    expect(first).toBeDefined();
    if (!first) return;
    await userEvent.click(first);
    expect(onChange).toHaveBeenCalledWith(["1"]);
    expect(screen.getAllByRole("row")[1]).toHaveAttribute("aria-selected", "true");
  });

  it("shows the empty message", () => {
    render(
      <DataTable
        caption="Vide"
        rows={[]}
        rowKey={(r: { id: string }) => r.id}
        columns={[{ key: "id", header: "Id" }]}
      />,
    );
    expect(screen.getAllByText("Aucune ligne").length).toBeGreaterThan(0);
  });
});
