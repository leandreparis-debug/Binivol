import { headers } from "next/headers";
import type { SignFormData } from "@/lib/signatureForms";
import type { Db } from "../db";
import {
  sendSignatureCode,
  signAsParty,
  type SignerParty,
  type SigningState,
} from "../dossier/signing";
import { getMail } from "../mail";
import type { Actor } from "../policy/types";
import { getStorage } from "../storage";

/**
 * The signature actions of both entry points (candidate's link, on-site
 * mode). The caller resolved the dossier; this module never reads a cookie.
 */

async function client(): Promise<{ userAgent: string | null; ip: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded !== undefined && forwarded !== "" ? forwarded : h.get("x-real-ip");
  return { userAgent: h.get("user-agent"), ip };
}

export function requestSignatureCode(
  db: Db,
  submissionId: string,
  role: SignerParty,
): Promise<SigningState> {
  return sendSignatureCode(db, getMail(db), { submissionId, role });
}

export async function submitSignature(
  db: Db,
  submissionId: string,
  input: SignFormData,
  responsible?: Actor,
): Promise<SigningState> {
  const { userAgent, ip } = await client();
  return signAsParty(db, getStorage(), {
    submissionId,
    role: input.role,
    verification:
      input.verification === "in-person" && responsible
        ? { kind: "in-person", actor: responsible, confirmed: input.confirmed }
        : { kind: "code", code: input.code ?? "" },
    signature:
      input.kind === "drawn" && input.png
        ? { kind: "drawn", png: new Uint8Array(await input.png.arrayBuffer()) }
        : { kind: "typed", name: input.typedName ?? "" },
    userAgent,
    ip,
  });
}
