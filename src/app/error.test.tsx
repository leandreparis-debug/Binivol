import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GlobalError from "./error";

describe("error.tsx", () => {
  it("shows a French message and the digest, never the stack", () => {
    const error = Object.assign(new Error("Boom interne"), { digest: "abc123" });
    render(<GlobalError error={error} reset={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Une erreur est survenue");
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
    expect(screen.queryByText(/Boom interne/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/at \w+ \(/);
  });
});
