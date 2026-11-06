import { describe, expect, it } from "vitest";
import { parseGuide } from "../guideMarkdown";

describe("guide markdown", () => {
  it("titles, paragraphs, lists with continuation lines, bold; images left out", () => {
    const blocks = parseGuide(
      "# Titre\n\n![image](x.png)\n\nUn **mot** fort.\n\n## Tâches\n\n1. Premier\n   suite\n2. Second\n\n- puce",
    );
    expect(blocks).toEqual([
      { type: "h1", content: [{ text: "Titre", bold: false }] },
      {
        type: "p",
        content: [
          { text: "Un ", bold: false },
          { text: "mot", bold: true },
          { text: " fort.", bold: false },
        ],
      },
      { type: "h2", content: [{ text: "Tâches", bold: false }] },
      {
        type: "ol",
        items: [[{ text: "Premier suite", bold: false }], [{ text: "Second", bold: false }]],
      },
      { type: "ul", items: [[{ text: "puce", bold: false }]] },
    ]);
  });
});
