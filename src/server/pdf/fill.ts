import fontkit from "@pdf-lib/fontkit";
import {
  degrees,
  PDFCheckBox,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFTextField,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFWidgetAnnotation,
} from "pdf-lib";
import type { SignerRole } from "@/generated/prisma/enums";
import type { TemplateMapping } from "./mappings";
import { fitText, parisDay } from "./text";

/**
 * Fills an official template (ADR-045): text with the embedded Unicode font
 * (ADR-046), fitted to each field; boxes /Oui or /Off; signature images in
 * the rectangle of their field, with « Signé électroniquement le … »; then
 * **flattened**: the final PDF has no field left.
 */

export interface SignatureImage {
  /** PNG of the drawn signature, transparent background. */
  png?: Uint8Array;
  /** Name typed as the signature (keyboard alternative): drawn in a handwriting font. */
  typedName?: string;
  signedAt: Date;
}

export interface RenderInput {
  template: Uint8Array;
  font: Uint8Array;
  mapping: TemplateMapping;
  images: Partial<Record<SignerRole, SignatureImage>>;
  title: string;
  /** Instant written in the PDF metadata. */
  producedAt: Date;
  /** Preview before signature: marked « Aperçu », never stored. */
  preview?: boolean;
  /** Handwriting font files (typed signatures), tried in order for each glyph. */
  handwriting?: Uint8Array[];
}

const MIN_SIZE = 6;
const CAPTION_SIZE = 6;
const INK = rgb(0, 0, 0);

interface Placed {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
}

function placeOf(doc: PDFDocument, widget: PDFWidgetAnnotation): Placed | null {
  const rect = widget.getRectangle();
  const ref = widget.P();
  const page =
    doc.getPages().find((p) => ref !== undefined && p.ref === ref) ??
    doc.getPages().find((p) => {
      const annots = p.node.Annots();
      return annots?.asArray().some((a) => doc.context.lookup(a) === widget.dict) ?? false;
    });
  return page ? { page, ...rect } : null;
}

/** Font size of the field's default appearance (`/Helv 9 Tf`), 9 by default. */
function daSize(field: PDFTextField): number {
  const da = field.acroField.getDefaultAppearance() ?? "";
  const m = /(\d+(?:\.\d+)?)\s+Tf/.exec(da);
  const size = m ? Number(m[1]) : 9;
  return size > 0 && size <= 12 ? size : 9;
}

/** Text colour of the field's default appearance (`0 0 1 rg`, `0 g`), black by default. */
function daColor(field: PDFTextField) {
  const da = field.acroField.getDefaultAppearance() ?? "";
  const rgbMatch = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da);
  if (rgbMatch) return rgb(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
  const grayMatch = /([\d.]+)\s+g(?:\s|$)/.exec(da);
  if (grayMatch) {
    const v = Number(grayMatch[1]);
    return rgb(v, v, v);
  }
  return INK;
}

/** Removes one widget of a field (from the field and from its page). */
function detachWidget(doc: PDFDocument, field: PDFTextField, index: number): Placed | null {
  const widgets = field.acroField.getWidgets();
  const widget = widgets[index];
  if (!widget) return null;
  const placed = placeOf(doc, widget);
  if (placed) {
    const annots = placed.page.node.Annots();
    const refs = annots?.asArray() ?? [];
    const position = refs.findIndex((a) => doc.context.lookup(a) === widget.dict);
    if (position >= 0) annots?.remove(position);
  }
  field.acroField.removeWidget(index);
  return placed;
}

function drawFitted(font: PDFFont, place: Placed, value: string, maxSize: number, color = INK) {
  if (value === "") return;
  const fitted = fitText(value, (t, size) => font.widthOfTextAtSize(t, size), {
    width: place.width - 4,
    maxSize,
    minSize: MIN_SIZE,
  });
  const y = place.y + Math.max(1, (place.height - fitted.size) / 2 + 1);
  place.page.drawText(fitted.text, { x: place.x + 2, y, size: fitted.size, font, color });
}

/**
 * After flattening, a page can still list widgets (a field with two widgets
 * on the Attestation) or references to removed objects: they are dropped, so
 * the file is clean for every reader.
 */
function removeDanglingWidgets(doc: PDFDocument) {
  for (const page of doc.getPages()) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i -= 1) {
      const entry = annots.get(i);
      const target = doc.context.lookup(entry);
      const subtype = target instanceof PDFDict ? target.get(PDFName.of("Subtype")) : undefined;
      if (!target || subtype === PDFName.of("Widget")) annots.remove(i);
    }
    if (annots.size() === 0) page.node.delete(PDFName.of("Annots"));
  }
}

interface Handwriting {
  font: PDFFont;
  has: (codePoint: number) => boolean;
}

async function embedHandwriting(doc: PDFDocument, files: Uint8Array[]): Promise<Handwriting[]> {
  const out: Handwriting[] = [];
  for (const bytes of files) {
    const parsed = fontkit.create(bytes) as { hasGlyphForCodePoint: (cp: number) => boolean };
    out.push({
      font: await doc.embedFont(bytes, { subset: true }),
      has: (cp) => parsed.hasGlyphForCodePoint(cp),
    });
  }
  return out;
}

/**
 * Draws a typed signature, centred in its box, as large as fits (up to 26 pt).
 * Each character uses the first handwriting font that has it (Latin, then
 * Latin Extended subsets).
 */
function drawHandwriting(
  fonts: Handwriting[],
  box: { text: string; x: number; y: number; width: number; height: number; page: PDFPage },
) {
  const fallback = fonts[0];
  if (!fallback) return;
  const runs: { font: PDFFont; text: string }[] = [];
  for (const char of box.text.trim()) {
    const cp = char.codePointAt(0) ?? 32;
    const font = (fonts.find((f) => f.has(cp)) ?? fallback).font;
    const last = runs.at(-1);
    if (last?.font === font) last.text += char;
    else runs.push({ font, text: char });
  }
  const widthAt = (size: number) =>
    runs.reduce((sum, r) => sum + r.font.widthOfTextAtSize(r.text, size), 0);
  let size = Math.min(26, box.height * 0.8);
  while (size > 8 && widthAt(size) > box.width) size -= 0.5;
  let x = box.x + Math.max(0, (box.width - widthAt(size)) / 2);
  const y = box.y + Math.max(0, (box.height - size) / 2);
  for (const run of runs) {
    box.page.drawText(run.text, { x, y, size, font: run.font, color: INK });
    x += run.font.widthOfTextAtSize(run.text, size);
  }
}

export async function renderTemplate(input: RenderInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input.template);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(input.font, { subset: true });
  const form = doc.getForm();
  const overrides: {
    place: Placed;
    value: string;
    size: number;
    color: ReturnType<typeof rgb>;
  }[] = [];

  // 1. Second widgets that mean something else: detached, drawn later.
  for (const o of input.mapping.widgetOverrides) {
    const field = form.getTextField(o.field);
    const size = daSize(field);
    const color = daColor(field);
    const place = detachWidget(doc, field, o.widget);
    if (place) overrides.push({ place, value: o.value, size, color });
  }

  // 2. Text and boxes.
  for (const [name, value] of Object.entries(input.mapping.fields)) {
    const field = form.getField(name);
    if (field instanceof PDFCheckBox) {
      if (value === true) field.check();
      else field.uncheck();
      // Some boxes of the templates have no « Off » appearance: rebuild both.
      field.updateAppearances();
      continue;
    }
    if (!(field instanceof PDFTextField)) continue;
    const text = typeof value === "string" ? value : "";
    const widths = field.acroField.getWidgets().map((w) => w.getRectangle().width);
    const fitted = fitText(text, (t, size) => font.widthOfTextAtSize(t, size), {
      width: Math.min(...widths) - 4,
      maxSize: daSize(field),
      minSize: MIN_SIZE,
    });
    field.setText(fitted.text);
    field.setFontSize(fitted.size);
    field.updateAppearances(font);
  }
  for (const name of Object.keys(input.mapping.empty)) {
    const field = form.getTextField(name);
    field.setText("");
    field.updateAppearances(font);
  }

  // 3. Signatures: image (or typed name) in the rectangle of the field, then the field goes.
  const handwriting = await embedHandwriting(doc, input.handwriting ?? []);
  for (const [name, role] of Object.entries(input.mapping.signatures)) {
    const field = form.getTextField(name);
    const image = input.images[role];
    for (const widget of field.acroField.getWidgets()) {
      const place = placeOf(doc, widget);
      if (!place || !image) continue;
      const box = { w: place.width - 4, h: place.height - CAPTION_SIZE - 4 };
      if (image.png) {
        const png = await doc.embedPng(image.png);
        const scale = Math.min(box.w / png.width, box.h / png.height, 1);
        const w = png.width * scale;
        const h = png.height * scale;
        place.page.drawImage(png, {
          x: place.x + (place.width - w) / 2,
          y: place.y + CAPTION_SIZE + 3 + (box.h - h) / 2,
          width: w,
          height: h,
        });
      } else if (image.typedName) {
        drawHandwriting(handwriting.length > 0 ? handwriting : [{ font, has: () => true }], {
          text: image.typedName,
          x: place.x + 2,
          y: place.y + CAPTION_SIZE + 3,
          width: box.w,
          height: box.h,
          page: place.page,
        });
      }
      const caption = `Signé électroniquement le ${parisDay(image.signedAt)}`;
      const size = Math.min(
        CAPTION_SIZE,
        ((place.width - 4) / font.widthOfTextAtSize(caption, CAPTION_SIZE)) * CAPTION_SIZE,
      );
      place.page.drawText(caption, { x: place.x + 2, y: place.y + 1.5, size, font, color: INK });
    }
    // `removeField` needs an appearance stream: give the empty field one first.
    field.setText("");
    field.updateAppearances(font);
    form.removeField(field);
  }

  // 4. Flatten: appearances become page content, no field is left.
  form.flatten({ updateFieldAppearances: false });
  for (const o of overrides) drawFitted(font, o.place, o.value, o.size, o.color);
  // No AcroForm left at all (some readers still show an empty form otherwise).
  doc.catalog.delete(PDFName.of("AcroForm"));
  removeDanglingWidgets(doc);

  if (input.preview) {
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      page.drawText("APERÇU, NON SIGNÉ", {
        x: width * 0.18,
        y: height * 0.35,
        size: 48,
        font,
        color: rgb(0.85, 0.1, 0.1),
        opacity: 0.18,
        rotate: degrees(35),
      });
    }
  }

  doc.setTitle(input.title, { showInWindowTitleBar: true });
  doc.setProducer("Binivol");
  doc.setCreator("Binivol");
  doc.setCreationDate(input.producedAt);
  doc.setModificationDate(input.producedAt);
  return doc.save({ useObjectStreams: false });
}
