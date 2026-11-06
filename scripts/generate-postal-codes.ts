import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `pnpm geo:postal-codes <laposte_hexasmal.csv>`: turns La Poste's « Base
 * officielle des codes postaux » (data.gouv.fr, Licence Ouverte 2.0, file
 * `laposte_hexasmal.csv`, ISO-8859-1, `;`) into the compact file read by
 * `src/server/geo/postalCodes.ts`: one line per (postal code, commune),
 * `CP;COMMUNE;INSEE`, sorted. The downloaded file itself is not kept.
 */
const source = process.argv[2];
if (!source) {
  console.error("Usage : pnpm geo:postal-codes <laposte_hexasmal.csv>");
  process.exit(1);
}
const text = new TextDecoder("latin1").decode(readFileSync(source));
const seen = new Set<string>();
const rows: string[] = [];
for (const line of text.split(/\r?\n/)) {
  if (!line || line.startsWith("#")) continue;
  const [insee = "", commune = "", postalCode = ""] = line.split(";");
  if (!/^\d{5}$/.test(postalCode) || !commune.trim()) continue;
  const row = `${postalCode};${commune.trim()};${insee.trim()}`;
  if (seen.has(row)) continue;
  seen.add(row);
  rows.push(row);
}
rows.sort();
const out = join(process.cwd(), "src", "server", "geo", "postal-codes.txt");
writeFileSync(out, `${rows.join("\n")}\n`, "utf8");
process.stdout.write(`${String(rows.length)} lignes écrites dans ${out}\n`);
