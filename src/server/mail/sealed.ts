import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { derivedKey } from "../secrets";

/**
 * AES-256-GCM sealing of the e-mails kept by the `log` driver: a dossier link
 * (which carries a token) is never stored in clear in the database.
 */
export function sealMail(content: { text: string; html?: string }): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("sealed-mail"), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(content), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString("base64url")).join(".");
}

export function openMail(payload: string): { text: string; html?: string } | null {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64url"));
  if (!iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", derivedKey("sealed-mail"), iv);
    decipher.setAuthTag(tag);
    const clear = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    return JSON.parse(clear) as { text: string; html?: string };
  } catch {
    return null;
  }
}
