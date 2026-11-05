import { headers } from "next/headers";
import type { RequestMeta } from "./service";

/**
 * Browser and IP address of the request, for the proof of signature. The IP
 * is only ever kept as an HMAC (`hashIp`); behind a proxy, the first address
 * of `X-Forwarded-For` is the client's.
 */
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    userAgent: h.get("user-agent"),
    ip: forwarded === undefined || forwarded === "" ? h.get("x-real-ip") : forwarded,
  };
}
