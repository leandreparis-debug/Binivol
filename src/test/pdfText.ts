import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** The text of every page of a PDF (tests only), joined with spaces. */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  await doc.destroy();
  return pages.join(" ").replace(/\s+/g, " ");
}
