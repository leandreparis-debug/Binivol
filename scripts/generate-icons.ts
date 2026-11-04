/**
 * Generates `src/app/icon.svg` (favicon) and `src/app/apple-icon.png` (180 px)
 * from the shared mark geometry. Run with `pnpm icons` after changing the mark.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { buildMarkSvg } from "../src/components/brand/markGeometry";

const appDir = path.resolve(import.meta.dirname, "../src/app");

async function main() {
  await mkdir(appDir, { recursive: true });

  const favicon = buildMarkSvg({ size: 64, variant: "default" });
  await writeFile(path.join(appDir, "icon.svg"), `${favicon}\n`, "utf8");

  const apple = buildMarkSvg({ size: 180, variant: "default" });
  const png = await sharp(Buffer.from(apple)).resize(180, 180).png().toBuffer();
  await writeFile(path.join(appDir, "apple-icon.png"), png);

  process.stdout.write("Icônes générées : icon.svg, apple-icon.png\n");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
