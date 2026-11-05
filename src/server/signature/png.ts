import { inflateSync } from "node:zlib";
import { DomainError } from "../errors";

/**
 * Server-side check of a signature image (step 8). The browser draws the
 * trace (or the typed name) on a canvas and sends a PNG; the server never
 * trusts it: binary signature, bounded size and dimensions, then the pixels
 * are decoded to refuse an empty or too short trace.
 *
 * Only what a canvas produces is accepted: 8-bit RGBA, not interlaced.
 */

export const SIGNATURE_MAX_BYTES = 200 * 1024;
export const SIGNATURE_MAX_WIDTH = 1600;
export const SIGNATURE_MAX_HEIGHT = 800;
/** A trace shorter than this (ink pixels, or width of the ink) is refused. */
export const SIGNATURE_MIN_INK = 120;
export const SIGNATURE_MIN_SPAN = 40;

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export interface SignatureImageInfo {
  width: number;
  height: number;
  inkPixels: number;
  /** Width × height of the box holding the ink. */
  span: { width: number; height: number };
}

function refuse(message: string): never {
  throw new DomainError("SIGNATURE_REFUSED", message);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decodes a canvas PNG and measures its ink. @throws {DomainError} SIGNATURE_REFUSED */
export function inspectSignaturePng(bytes: Uint8Array): SignatureImageInfo {
  const buf = Buffer.from(bytes);
  if (buf.length > SIGNATURE_MAX_BYTES) refuse("L'image de la signature est trop lourde.");
  if (buf.length < 60 || !buf.subarray(0, 8).equals(SIGNATURE)) {
    refuse("La signature doit être une image PNG.");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || colour !== 6 || interlace !== 0) {
        refuse("Format d'image de signature non pris en charge.");
      }
    } else if (type === "IDAT") {
      data.push(body);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (width === 0 || height === 0) refuse("La signature doit être une image PNG.");
  if (width > SIGNATURE_MAX_WIDTH || height > SIGNATURE_MAX_HEIGHT) {
    refuse("L'image de la signature est trop grande.");
  }
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(data));
  } catch {
    refuse("L'image de la signature est illisible.");
  }
  const stride = width * 4;
  if (raw.length < (stride + 1) * height) refuse("L'image de la signature est illisible.");

  const previous = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let ink = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start] ?? 0;
    for (let i = 0; i < stride; i++) {
      const x = raw[start + 1 + i] ?? 0;
      const a = i >= 4 ? (line[i - 4] ?? 0) : 0;
      const b = previous[i] ?? 0;
      const c = i >= 4 ? (previous[i - 4] ?? 0) : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + Math.floor((a + b) / 2);
          break;
        case 4:
          value = x + paeth(a, b, c);
          break;
        default:
          refuse("L'image de la signature est illisible.");
      }
      line[i] = value & 0xff;
    }
    for (let px = 0; px < width; px++) {
      if ((line[px * 4 + 3] ?? 0) > 32) {
        ink++;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    line.copy(previous);
  }
  return {
    width,
    height,
    inkPixels: ink,
    span: { width: maxX >= minX ? maxX - minX + 1 : 0, height: maxY >= minY ? maxY - minY + 1 : 0 },
  };
}

/** Refuses an empty or too short trace. @throws {DomainError} SIGNATURE_REFUSED */
export function assertSignatureImage(bytes: Uint8Array): SignatureImageInfo {
  const info = inspectSignaturePng(bytes);
  if (info.inkPixels === 0) refuse("La signature est vide : trace-la, ou saisis ton nom.");
  if (info.inkPixels < SIGNATURE_MIN_INK || info.span.width < SIGNATURE_MIN_SPAN) {
    refuse("La signature est trop courte : trace-la en entier, ou saisis ton nom.");
  }
  return info;
}
