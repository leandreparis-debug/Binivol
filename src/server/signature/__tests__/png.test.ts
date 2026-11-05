// @vitest-environment node
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { signaturePng } from "@/test/pdf/helpers";
import { assertSignatureImage, inspectSignaturePng } from "../png";

describe("signature image", () => {
  it("measures the ink of a canvas PNG", () => {
    const info = inspectSignaturePng(signaturePng(300, 100));
    expect(info.width).toBe(300);
    expect(info.height).toBe(100);
    expect(info.inkPixels).toBeGreaterThan(500);
    expect(info.span.width).toBeGreaterThan(250);
    expect(() => assertSignatureImage(signaturePng(300, 100))).not.toThrow();
  });

  it("refuses an empty or too short trace", () => {
    expect(() => assertSignatureImage(signaturePng(300, 100, false))).toThrow(/vide/);
    const dot = signaturePng(20, 10);
    expect(() => assertSignatureImage(dot)).toThrow(/trop courte/);
  });

  it("refuses what is not an RGBA PNG, too large or too heavy", () => {
    expect(() => assertSignatureImage(Buffer.from("%PDF-1.4 pas une image"))).toThrow(/PNG/);
    expect(() => assertSignatureImage(signaturePng(2000, 100))).toThrow(/trop grande/);
    expect(() => assertSignatureImage(Buffer.alloc(300 * 1024))).toThrow(/trop lourde/);
    // An RGB (colour type 2) PNG: not what a canvas produces.
    const rgb = Buffer.from(signaturePng(300, 100));
    rgb[25] = 2;
    expect(() => assertSignatureImage(rgb)).toThrow(/non pris en charge/);
  });

  it("decodes the PNG filters (Sub, Up, Average, Paeth)", () => {
    // One row per filter type over an all-opaque image: every row must decode to 64 ink pixels.
    const width = 64;
    // Build real filtered data from an all-opaque image.
    const pixels = Buffer.alloc(width * 4);
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
    const out: Buffer[] = [];
    let prev = Buffer.alloc(width * 4);
    for (const filter of [0, 1, 2, 3, 4]) {
      const row = Buffer.alloc(width * 4 + 1);
      row[0] = filter;
      for (let i = 0; i < pixels.length; i++) {
        const a = i >= 4 ? (pixels[i - 4] ?? 0) : 0;
        const b = prev[i] ?? 0;
        const c = i >= 4 ? (prev[i - 4] ?? 0) : 0;
        const p = a + b - c;
        const pred =
          filter === 0
            ? 0
            : filter === 1
              ? a
              : filter === 2
                ? b
                : filter === 3
                  ? Math.floor((a + b) / 2)
                  : Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
                    ? a
                    : Math.abs(p - b) <= Math.abs(p - c)
                      ? b
                      : c;
        row[i + 1] = ((pixels[i] ?? 0) - pred) & 0xff;
      }
      out.push(row);
      prev = pixels;
    }
    const base = signaturePng(width, 5, false);
    // Replace IDAT: rebuild a PNG with the same header and our filtered rows.
    const header = base.subarray(0, 33);
    const idat = deflateSync(Buffer.concat(out));
    const len = Buffer.alloc(4);
    len.writeUInt32BE(idat.length);
    const chunk = Buffer.concat([len, Buffer.from("IDAT"), idat, Buffer.alloc(4)]);
    const iend = base.subarray(base.length - 12);
    const png = Buffer.concat([header, chunk, iend]);
    expect(inspectSignaturePng(png).inkPixels).toBe(5 * width);
  });
});
