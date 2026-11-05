import { inflateSync } from "node:zlib";
import { DomainError } from "../errors";

/**
 * Checks a drawn signature before it is stored: a real PNG (8-bit RGBA, as a
 * canvas produces), bounded in size, and an actual trace, neither empty nor
 * a dot (enough inked pixels over a wide enough box). Pure.
 */

export const SIGNATURE_MAX_BYTES = 500 * 1024;
export const SIGNATURE_MAX_SIZE = { width: 1600, height: 800 };
const MIN_INKED_PIXELS = 150;
const MIN_TRACE_WIDTH = 60;

const invalid = (message: string) => new DomainError("SIGNATURE_INVALID", message);

function paeth(a: number, b: number, c: number) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export interface TraceInfo {
  width: number;
  height: number;
  inked: number;
  box: { width: number; height: number };
}

export function inspectSignaturePng(bytes: Uint8Array): TraceInfo {
  const buf = Buffer.from(bytes);
  if (buf.length > SIGNATURE_MAX_BYTES) throw invalid("La signature est trop lourde.");
  const magic = "89504e470d0a1a0a";
  if (buf.subarray(0, 8).toString("hex") !== magic)
    throw invalid("La signature n'est pas une image PNG.");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[9] !== 6 || data[12] !== 0) {
        throw invalid("Format de signature non pris en charge.");
      }
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (width < 1 || height < 1 || idat.length === 0) throw invalid("Image de signature illisible.");
  if (width > SIGNATURE_MAX_SIZE.width || height > SIGNATURE_MAX_SIZE.height) {
    throw invalid("Image de signature trop grande.");
  }
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    throw invalid("Image de signature illisible.");
  }
  const stride = width * 4;
  if (raw.length < (stride + 1) * height) throw invalid("Image de signature illisible.");
  const prev = Buffer.alloc(stride);
  const line = Buffer.alloc(stride);
  let inked = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    const start = y * (stride + 1);
    const filter = raw[start] ?? 0;
    for (let i = 0; i < stride; i += 1) {
      const x = raw[start + 1 + i] ?? 0;
      const a = i >= 4 ? (line[i - 4] ?? 0) : 0;
      const b = prev[i] ?? 0;
      const c = i >= 4 ? (prev[i - 4] ?? 0) : 0;
      const value =
        filter === 1
          ? x + a
          : filter === 2
            ? x + b
            : filter === 3
              ? x + ((a + b) >> 1)
              : filter === 4
                ? x + paeth(a, b, c)
                : x;
      line[i] = value & 0xff;
    }
    for (let px = 0; px < width; px += 1) {
      if ((line[px * 4 + 3] ?? 0) > 16) {
        inked += 1;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    line.copy(prev);
  }
  return {
    width,
    height,
    inked,
    box: { width: maxX >= minX ? maxX - minX + 1 : 0, height: maxY >= minY ? maxY - minY + 1 : 0 },
  };
}

/** Throws a clear error for an empty or too short trace. */
export function checkSignaturePng(bytes: Uint8Array): TraceInfo {
  const info = inspectSignaturePng(bytes);
  if (info.inked === 0) throw invalid("La signature est vide : trace-la dans le cadre.");
  if (info.inked < MIN_INKED_PIXELS || info.box.width < MIN_TRACE_WIDTH) {
    throw invalid("La signature est trop courte : trace ta signature en entier.");
  }
  return info;
}

/** A typed signature: a real name, not a mark. */
export function checkTypedSignature(name: string, expected: string): string {
  const clean = name.replace(/\s+/g, " ").trim();
  const key = (s: string) =>
    s
      .toLowerCase()
      .replace(/[łŀ]/g, "l")
      .replace(/ø/g, "o")
      .replace(/đ/g, "d")
      .replace(/ß/g, "ss")
      .replace(/æ/g, "ae")
      .replace(/œ/g, "oe")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\p{L}]/gu, "")
      .toLowerCase();
  if (clean.length < 3) throw invalid("Saisis ton nom complet pour signer.");
  if (key(clean) !== key(expected)) {
    throw invalid(`Saisis exactement ton nom complet : ${expected}.`);
  }
  return clean;
}
