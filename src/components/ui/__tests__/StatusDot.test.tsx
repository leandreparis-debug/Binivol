import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusDot } from "@/components/ui/StatusDot";
import { STATUSES, STATUS_KEYS } from "@/lib/status";

describe("StatusDot", () => {
  it.each(STATUS_KEYS)("always shows the label for %s", (status) => {
    render(<StatusDot status={status} />);
    expect(screen.getByText(STATUSES[status].label)).toBeInTheDocument();
  });

  it("renders the dot as decorative", () => {
    const { container } = render(<StatusDot status="active" />);
    const dot = container.querySelector("[aria-hidden='true']");
    expect(dot).toHaveClass("bg-ok");
  });
});
