import { describe, expect, it } from "vitest";
import { isDemoLoginEnabled, isGoogleConfigured, isHostedDemo, parseEnv } from "@/lib/env";

describe("parseEnv: storage", () => {
  it("defaults to the local driver in ./storage", () => {
    const env = parseEnv({});
    expect(env.STORAGE_DRIVER).toBe("local");
    expect(env.STORAGE_LOCAL_DIR).toBe("./storage");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
  });

  it("requires the five S3 values with the s3 driver, naming each one without its value", () => {
    expect(() => parseEnv({ STORAGE_DRIVER: "s3", S3_SECRET_ACCESS_KEY: "secret-fictif" })).toThrow(
      /S3_ENDPOINT[\s\S]*S3_REGION[\s\S]*S3_BUCKET[\s\S]*S3_ACCESS_KEY_ID/,
    );
    expect(() =>
      parseEnv({ STORAGE_DRIVER: "s3", S3_SECRET_ACCESS_KEY: "secret-fictif" }),
    ).not.toThrow(/secret-fictif/);
    const env = parseEnv({
      STORAGE_DRIVER: "s3",
      S3_ENDPOINT: "https://exemple.supabase.co/storage/v1/s3",
      S3_REGION: "eu-west-3",
      S3_BUCKET: "binivol-documents",
      S3_ACCESS_KEY_ID: "id-fictif",
      S3_SECRET_ACCESS_KEY: "secret-fictif",
      S3_FORCE_PATH_STYLE: "false",
    });
    expect(env).toMatchObject({ STORAGE_DRIVER: "s3", S3_FORCE_PATH_STYLE: false });
  });

  it("refuses an unknown driver", () => {
    expect(() => parseEnv({ STORAGE_DRIVER: "ftp" })).toThrow(/STORAGE_DRIVER/);
  });
});

describe("parseEnv", () => {
  it("applies defaults when variables are absent", () => {
    const env = parseEnv({});
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("Binivol");
    expect(env.APP_URL).toBeUndefined();
    expect(env.ENABLE_DESIGN_PAGE).toBe(false);
  });

  it("treats empty strings as absent", () => {
    expect(parseEnv({ APP_URL: "", NEXT_PUBLIC_APP_NAME: "  " }).APP_URL).toBeUndefined();
  });

  it("reads valid values", () => {
    const env = parseEnv({
      NEXT_PUBLIC_APP_NAME: "Binivol test",
      APP_URL: "https://binivol.example.org",
      ENABLE_DESIGN_PAGE: "true",
    });
    expect(env.NEXT_PUBLIC_APP_NAME).toBe("Binivol test");
    expect(env.APP_URL).toBe("https://binivol.example.org");
    expect(env.ENABLE_DESIGN_PAGE).toBe(true);
  });

  it("throws an explicit error naming the variable, without its value", () => {
    const secret = "pas-une-url-secrete";
    expect(() => parseEnv({ APP_URL: secret })).toThrow(/APP_URL/);
    expect(() => parseEnv({ APP_URL: secret })).not.toThrow(new RegExp(secret));
  });

  it("accepts PostgreSQL URLs for DATABASE_URL and DIRECT_URL", () => {
    const env = parseEnv({
      DATABASE_URL: "postgresql://u:p@pooler.example.org:6543/postgres?pgbouncer=true",
      DIRECT_URL: "postgres://u:p@db.example.org:5432/postgres",
    });
    expect(env.DATABASE_URL).toContain(":6543/");
    expect(env.DIRECT_URL).toContain(":5432/");
  });

  it("leaves DATABASE_URL undefined when absent (checked lazily by db.ts)", () => {
    expect(parseEnv({}).DATABASE_URL).toBeUndefined();
  });

  it("rejects a non PostgreSQL DATABASE_URL without echoing it", () => {
    const value = "mysql://secret-user:secret-pass@host/db";
    expect(() => parseEnv({ DATABASE_URL: value })).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ DATABASE_URL: value })).not.toThrow(/secret-pass/);
  });

  it("defaults the authentication settings", () => {
    const env = parseEnv({});
    expect(env.AUTH_ALLOWED_DOMAIN).toBe("croix-rouge.fr");
    expect(env.AUTH_DEMO_LOGIN).toBe(false);
    expect(isDemoLoginEnabled(env)).toBe(false);
    expect(isGoogleConfigured(env)).toBe(false);
  });

  it("enables the demo sign-in outside Vercel", () => {
    const env = parseEnv({ AUTH_DEMO_LOGIN: "true" });
    expect(isDemoLoginEnabled(env)).toBe(true);
  });

  it.each(["production", "preview", "development"])(
    "refuses the demo sign-in when VERCEL_ENV=%s",
    (vercelEnv) => {
      expect(() => parseEnv({ AUTH_DEMO_LOGIN: "true", VERCEL_ENV: vercelEnv })).toThrow(
        /AUTH_DEMO_LOGIN.*interdite sur Vercel/,
      );
      expect(
        isDemoLoginEnabled(parseEnv({ AUTH_DEMO_LOGIN: "false", VERCEL_ENV: vercelEnv })),
      ).toBe(false);
    },
  );

  it("requires the Google id and secret together, and a long enough secret", () => {
    expect(() => parseEnv({ AUTH_GOOGLE_ID: "id" })).toThrow(/AUTH_GOOGLE_SECRET/);
    expect(isGoogleConfigured(parseEnv({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" }))).toBe(
      true,
    );
    expect(() => parseEnv({ AUTH_SECRET: "court" })).toThrow(/AUTH_SECRET/);
  });

  it("normalises the allowed domain and rejects a malformed one", () => {
    expect(parseEnv({ AUTH_ALLOWED_DOMAIN: "Croix-Rouge.FR" }).AUTH_ALLOWED_DOMAIN).toBe(
      "croix-rouge.fr",
    );
    expect(() => parseEnv({ AUTH_ALLOWED_DOMAIN: "@croix-rouge.fr" })).toThrow(
      /AUTH_ALLOWED_DOMAIN/,
    );
  });

  it("rejects an unexpected ENABLE_DESIGN_PAGE value", () => {
    expect(() => parseEnv({ ENABLE_DESIGN_PAGE: "oui" })).toThrow(/ENABLE_DESIGN_PAGE/);
  });
});

describe("demo sign-in on Vercel (ADR-035)", () => {
  it("is refused on Vercel without the explicit exception", () => {
    expect(() => parseEnv({ AUTH_DEMO_LOGIN: "true", VERCEL_ENV: "production" })).toThrow(
      /AUTH_DEMO_LOGIN/,
    );
  });

  it("is allowed with AUTH_DEMO_ON_VERCEL=true, which also marks a hosted demo", () => {
    const env = parseEnv({
      AUTH_DEMO_LOGIN: "true",
      AUTH_DEMO_ON_VERCEL: "true",
      VERCEL_ENV: "production",
    });
    expect(isDemoLoginEnabled(env)).toBe(true);
    expect(isHostedDemo(env)).toBe(true);
  });

  it("is not a hosted demo locally, nor on Vercel without the demo", () => {
    expect(isHostedDemo(parseEnv({ AUTH_DEMO_LOGIN: "true" }))).toBe(false);
    expect(isHostedDemo(parseEnv({ AUTH_DEMO_ON_VERCEL: "true", VERCEL_ENV: "production" }))).toBe(
      false,
    );
    expect(
      isDemoLoginEnabled(parseEnv({ AUTH_DEMO_ON_VERCEL: "true", VERCEL_ENV: "production" })),
    ).toBe(false);
  });
});
