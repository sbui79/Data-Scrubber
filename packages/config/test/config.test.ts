import { describe, expect, it } from "vitest";
import { loadEnv } from "../src";

const ok = { DATABASE_URL: "postgresql://x", HASH_PEPPER: "0123456789abcdef" };

describe("loadEnv", () => {
  it("applies defaults with safe feature flags off", () => {
    const env = loadEnv(ok);
    expect(env.FEATURE_FAMILY_MANAGER).toBe(false);
    expect(env.FEATURE_EMAIL_SENDING).toBe(false);
  });
  it("reports variable names but never values", () => {
    try { loadEnv({ DATABASE_URL: "postgresql://secret-value", HASH_PEPPER: "short" }); expect.unreachable(); }
    catch (e) { expect(String(e)).toContain("HASH_PEPPER"); expect(String(e)).not.toContain("short"); }
  });
  it("forbids the mock KMS key in production", () => {
    expect(() => loadEnv({ ...ok, NODE_ENV: "production", MOCK_KMS_MASTER_KEY: "x" })).toThrow("MOCK_KMS_MASTER_KEY");
  });
  it("forbids mock auth in production", () => {
    expect(() => loadEnv({ ...ok, NODE_ENV: "production" })).toThrow("AUTH_MODE");
  });
  it("clerk mode needs a verification key, and authorized parties in production", () => {
    expect(() => loadEnv({ ...ok, AUTH_MODE: "clerk" })).toThrow("CLERK_SECRET_KEY");
    expect(loadEnv({ ...ok, AUTH_MODE: "clerk", CLERK_JWT_KEY: "pem" }).AUTH_MODE).toBe("clerk");
    expect(() => loadEnv({ ...ok, AUTH_MODE: "clerk", CLERK_JWT_KEY: "pem", NODE_ENV: "production" })).toThrow("CLERK_AUTHORIZED_PARTIES");
    expect(loadEnv({ ...ok, AUTH_MODE: "clerk", CLERK_JWT_KEY: "pem", NODE_ENV: "production", CLERK_AUTHORIZED_PARTIES: "https://app.example.test" }).NODE_ENV).toBe("production");
  });
});
