/**
 * Generates the icons of the logo « Point » (ADR-065) from the shared
 * geometry: `src/app/icon.svg` (favicon), `src/app/apple-icon.png` (180),
 * `public/icons/icon-192.png` and `icon-512.png` (web manifest) and
 * `public/brand/binivol-email.png` (wordmark for HTML e-mails, 2× for
 * sharp screens). Run with `pnpm icons` after changing the logo.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { markShape, shapeToSvg, wordmarkShape } from "../src/components/brand/logoGeometry";

const root = path.resolve(import.meta.dirname, "..");

async function png(svg: string, width: number, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const buffer = await sharp(Buffer.from(svg)).resize({ width }).png().toBuffer();
  await writeFile(target, buffer);
}

async function main() {
  const mark = markShape();
  await writeFile(path.join(root, "src/app/icon.svg"), `${shapeToSvg(mark, 64)}\n`, "utf8");
  await png(shapeToSvg(mark, 180), 180, path.join(root, "src/app/apple-icon.png"));
  for (const size of [192, 512]) {
    await png(
      shapeToSvg(mark, size),
      size,
      path.join(root, `public/icons/icon-${String(size)}.png`),
    );
  }
  await png(
    shapeToSvg(wordmarkShape("ink"), 320),
    320,
    path.join(root, "public/brand/binivol-email.png"),
  );
  process.stdout.write(
    "Icônes générées : icon.svg, apple-icon.png, icons/icon-192.png, icons/icon-512.png, brand/binivol-email.png\n",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
