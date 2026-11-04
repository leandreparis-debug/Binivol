// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  SECURE_SESSION_COOKIE,
  sessionCookie,
  shouldUseSecureCookies,
} from "@/server/auth/cookies";
import { checkStartupEnv } from "@/server/startup";

describe("session cookie", () => {
  it("is HttpOnly and SameSite=Lax, Secure and prefixed over HTTPS", () => {
    expect(sessionCookie(true)).toEqual({
      name: SECURE_SESSION_COOKIE,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: true },
    });
    expect(sessionCookie(false).name).toBe("authjs.session-token");
  });

  it("is Secure in production unless AUTH_URL is explicitly http", () => {
    expect(shouldUseSecureCookies({ NODE_ENV: "production" })).toBe(true);
    expect(
      shouldUseSecureCookies({ NODE_ENV: "production", AUTH_URL: "https://binivol.exemple.org" }),
    ).toBe(true);
    expect(
      shouldUseSecureCookies({ NODE_ENV: "production", AUTH_URL: "http://127.0.0.1:3000" }),
    ).toBe(false);
    expect(shouldUseSecureCookies({ NODE_ENV: "development" })).toBe(false);
  });
});

describe("startup checks", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/binivol",
    AUTH_SECRET: "x".repeat(32),
  };

  it("refuses to start with the demo sign-in on Vercel", () => {
    const result = checkStartupEnv({ ...base, AUTH_DEMO_LOGIN: "true", VERCEL_ENV: "preview" });
    expect(result.fatal).toMatch(/AUTH_DEMO_LOGIN.*interdite sur Vercel/);
  });

  it("starts with the demo sign-in outside Vercel, with a warning", () => {
    const result = checkStartupEnv({ ...base, AUTH_DEMO_LOGIN: "true" });
    expect(result.fatal).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/démonstration ACTIVE/);
  });

  it("starts on Vercel without the demo sign-in", () => {
    expect(checkStartupEnv({ ...base, VERCEL_ENV: "production" }).fatal).toBeNull();
  });

  it("warns about a missing database or secret", () => {
    const result = checkStartupEnv({ NODE_ENV: "production" });
    expect(result.fatal).toBeNull();
    expect(result.warnings.join(" ")).toMatch(/DATABASE_URL/);
    expect(result.warnings.join(" ")).toMatch(/AUTH_SECRET/);
  });
});
