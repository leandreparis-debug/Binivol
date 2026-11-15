import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DemoDataBanner } from "@/components/layout/DemoDataBanner";

describe("DemoDataBanner", () => {
  it("shows « Données fictives » in demonstration mode", () => {
    render(<DemoDataBanner demo />);
    expect(screen.getByTestId("fake-data")).toHaveTextContent("Données fictives");
  });

  it("shows nothing on a server without demonstration data", () => {
    const { container } = render(<DemoDataBanner demo={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("fake-data")).toBeNull();
  });
});
