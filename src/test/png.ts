import { crc32, deflateSync } from "node:zlib";

/**
 * Minimal RGBA PNG encoder for tests (a fake signature trace): `ink(x, y)`
 * says which pixels are black, the rest is transparent.
 */
export function makePng(
  width: number,
  height: number,
  ink: (x: number, y: number) => boolean,
): Buffer {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 4;
      const on = ink(x, y);
      raw[i] = 0;
      raw[i + 1] = 0;
      raw[i + 2] = 0;
      raw[i + 3] = on ? 255 : 0;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A wavy line across the image, like a signature. */
export function fakeSignature(width = 400, height = 150): Buffer {
  return makePng(width, height, (x, y) => {
    const curve = height / 2 + Math.sin(x / 18) * (height / 4) + Math.cos(x / 7) * 6;
    return Math.abs(y - curve) < 3 && x > 20 && x < width - 20;
  });
}
