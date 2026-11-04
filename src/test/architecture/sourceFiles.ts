import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Every .ts/.tsx file under `src/`, as repo-relative paths with their content. */
export function sourceFiles(root = "src"): { file: string; content: string }[] {
  const out: { file: string; content: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "generated" || entry.name === "node_modules") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        out.push({ file: full.split(path.sep).join("/"), content: readFileSync(full, "utf8") });
      }
    }
  };
  walk(root);
  return out;
}

export const isTestFile = (file: string) =>
  /\.(test|db\.test)\.tsx?$/.test(file) || file.startsWith("src/test/");

/** True when the file starts with the `"use server"` directive (comments aside). */
export function isServerActionFile(content: string): boolean {
  const code = content.replace(/^\s*(\/\*[\s\S]*?\*\/|\/\/[^\n]*\n|\s)*/, "");
  return /^["']use server["']/.test(code);
}
