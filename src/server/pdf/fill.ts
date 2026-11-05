import fontkit from "@pdf-lib/fontkit";
import {
  PDFCheckBox,
  PDFDocument,
  PDFNull,
  PDFRef,
  PDFTextField,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import {
  MAPPINGS,
  SECOND_WIDGET_DATES,
  SIGNATURE_FIELDS,
  STRUCTURE_SPLIT,
  templateValues,
  type PdfInput,
  type SignatureSlot,
} from "./mappings";
import { readAsset, FONTS, TEMPLATES, type TemplateKind } from "./templates";
import { fitText, parisDateParts, parisDayText, splitOverTwo } from "./text";

/**
 * Fills an official template (AcroForm) from the dossier, lays the signature
 * images in their fields' rectangles, then **flattens** it: the result has
 * no field left. Text uses an embedded Unicode font (Geist), fitted to each
 * field (smaller size, then cut with « … », never overflowing).
 */

export interface SignatureImage {
  /** PNG of the drawn (or typed) signature, transparent background. */
  png: Uint8Array;
  signedAt: Date;
}

export type PdfSignatures = Partial<Record<SignatureSlot, SignatureImage>>;

export interface FillOptions {
  /** A preview (before signing): a light « Aperçu » mark on each page, never stored. */
  preview?: boolean;
}

const PADDING = 2;
const MAX_SIZE = 9;
const MIN_SIZE = 6;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function widgetPage(doc: PDFDocument, pageRef: PDFRef | undefined): PDFPage | undefined {
  return doc.getPages().find((p) => p.ref === pageRef) ?? doc.getPages()[0];
}

/** Draws a signature image in a rectangle (proportions kept), with its date line under it. */
function drawSignature(
  page: PDFPage,
  rect: Rect,
  image: Awaited<ReturnType<PDFDocument["embedPng"]>>,
  signedAt: Date,
  font: PDFFont,
): void {
  const caption = `Signé électroniquement le ${parisDayText(signedAt)}`;
  const captionSize = Math.min(6, rect.height / 6);
  const captionHeight = captionSize + 2;
  const boxHeight = rect.height - captionHeight;
  const scale = Math.min(rect.width / image.width, boxHeight / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  page.drawImage(image, {
    x: rect.x + (rect.width - w) / 2,
    y: rect.y + captionHeight + (boxHeight - h) / 2,
    width: w,
    height: h,
  });
  const fitted = fitText(caption, rect.width, (t, size) => font.widthOfTextAtSize(t, size), {
    max: captionSize,
    min: Math.min(4, captionSize),
  });
  page.drawText(fitted.text, {
    x: rect.x + (rect.width - font.widthOfTextAtSize(fitted.text, fitted.size)) / 2,
    y: rect.y + 1,
    size: fitted.size,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });
}

export async function fillTemplate(
  kind: TemplateKind,
  input: PdfInput,
  signatures: PdfSignatures = {},
  options: FillOptions = {},
): Promise<Uint8Array> {
  const [templateBytes, fontBytes] = await Promise.all([
    readAsset(TEMPLATES[kind]),
    readAsset(FONTS.TEXT),
  ]);
  const doc = await PDFDocument.load(templateBytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const measure = (t: string, size: number) => font.widthOfTextAtSize(t, size);
  const form = doc.getForm();
  const values = templateValues(kind, input);

  // 1. Aptitude certificate: the second widget of the birth-date fields is the
  //    « Date » line. Detach it before filling, draw the signature date there.
  const dateLines: { rect: Rect; page: PDFPage | undefined; part: "day" | "month" | "year" }[] = [];
  if (kind === "APTITUDE") {
    for (const [name, part] of Object.entries(SECOND_WIDGET_DATES)) {
      const field = form.getTextField(name);
      const widgets = field.acroField.getWidgets();
      const second = widgets[1];
      if (!second) continue;
      const kids = field.acroField.Kids();
      const ref = kids?.get(1);
      const page = widgetPage(doc, second.P());
      dateLines.push({ rect: second.getRectangle(), page, part });
      field.acroField.removeWidget(1);
      if (ref instanceof PDFRef) page?.node.removeAnnot(ref);
    }
  }

  // 2. Text fields and check boxes.
  for (const [name, value] of Object.entries(values)) {
    const field = form.getField(name);
    if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
      else field.uncheck();
    } else if (field instanceof PDFTextField) {
      const text = typeof value === "string" ? value : "";
      const width = (field.acroField.getWidgets()[0]?.getRectangle().width ?? 100) - 2 * PADDING;
      const fitted = fitText(text, width, measure, { max: MAX_SIZE, min: MIN_SIZE });
      field.setFontSize(fitted.size);
      field.setText(fitted.text);
    }
  }

  // 3. Charter: the structure over its two fields.
  if (kind === "CHARTE") {
    const [firstName, secondName] = STRUCTURE_SPLIT;
    const first = form.getTextField(firstName);
    const second = form.getTextField(secondName);
    const w1 = (first.acroField.getWidgets()[0]?.getRectangle().width ?? 100) - 2 * PADDING;
    const w2 = (second.acroField.getWidgets()[0]?.getRectangle().width ?? 200) - 2 * PADDING;
    const structure = input.representative ? input.structure : "";
    const [a, b] = splitOverTwo(structure, w1, measure, MAX_SIZE);
    for (const [field, text, width] of [
      [first, a, w1],
      [second, b, w2],
    ] as const) {
      const fitted = fitText(text, width, measure, { max: MAX_SIZE, min: MIN_SIZE });
      field.setFontSize(fitted.size);
      field.setText(fitted.text);
    }
  }

  // 4. Signature fields: emptied (flattened as blank), their rectangles kept;
  //    the images are drawn after flattening.
  const signatureSpots: { rect: Rect; page: PDFPage | undefined; signature: SignatureImage }[] = [];
  for (const [slot, fieldName] of Object.entries(SIGNATURE_FIELDS[kind]) as [
    SignatureSlot,
    string,
  ][]) {
    const field = form.getTextField(fieldName);
    const widget = field.acroField.getWidgets()[0];
    const signature = signatures[slot];
    if (widget && signature) {
      signatureSpots.push({
        rect: widget.getRectangle(),
        page: widgetPage(doc, widget.P()),
        signature,
      });
    }
    field.setText("");
  }

  // 5. Flatten: no editable field remains. Flattening deletes the fields and
  //    widgets, but a tagged template still points to them (structure tree):
  //    each deleted object becomes `null`, so the cross-reference table stays
  //    complete (a dangling reference is a null object for the PDF spec anyway).
  const formRefs = form.getFields().flatMap((field) => {
    const kids = field.acroField.Kids();
    const refs: unknown[] = [field.ref];
    for (let i = 0; i < (kids?.size() ?? 0); i++) refs.push(kids?.get(i));
    return refs.filter((r): r is PDFRef => r instanceof PDFRef);
  });
  form.updateFieldAppearances(font);
  form.flatten();
  for (const ref of formRefs) {
    if (!doc.context.lookup(ref)) doc.context.assign(ref, PDFNull);
  }
  for (const spot of signatureSpots) {
    if (!spot.page) continue;
    const image = await doc.embedPng(spot.signature.png);
    drawSignature(spot.page, spot.rect, image, spot.signature.signedAt, font);
  }

  // 6. The « Date » line of the aptitude certificate.
  const signedOn = input.signedOn ? parisDateParts(input.signedOn) : null;
  for (const line of dateLines) {
    if (!signedOn || !line.page) continue;
    const text = signedOn[line.part];
    line.page.drawText(text, {
      x: line.rect.x + PADDING,
      y: line.rect.y + (line.rect.height - MAX_SIZE) / 2 + 1,
      size: Math.min(MAX_SIZE, line.rect.height - 2),
      font,
      color: rgb(0, 0, 1),
    });
  }

  if (options.preview) {
    for (const page of doc.getPages()) {
      page.drawText("Aperçu avant signature : document non signé", {
        x: 24,
        y: 8,
        size: 8,
        font,
        color: rgb(0.75, 0.1, 0.1),
      });
    }
  }

  doc.setTitle(
    kind === "DOSSIER"
      ? "Dossier bénévole"
      : kind === "CHARTE"
        ? "Charte du bénévolat"
        : "Attestation d'aptitude",
  );
  doc.setProducer("Binivol");
  doc.setCreator("Binivol");
  return doc.save({ useObjectStreams: false });
}

/** Field names of a template, with their kind (tests, documentation). */
export async function templateFields(
  kind: TemplateKind,
): Promise<{ name: string; type: "text" | "checkbox" | "other" }[]> {
  const doc = await PDFDocument.load(await readAsset(TEMPLATES[kind]));
  return doc
    .getForm()
    .getFields()
    .map((f) => ({
      name: f.getName(),
      type: f instanceof PDFTextField ? "text" : f instanceof PDFCheckBox ? "checkbox" : "other",
    }));
}

export { MAPPINGS };
