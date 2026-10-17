import { describe, expect, it } from "vitest";
import { createSign, generateKeyPairSync } from "node:crypto";
import { verifyClerkToken } from "../src";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function sign(claims: Record<string, unknown>, key = privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "RS256", typ: "JWT", kid: "test" })}.${b64({ iat: now - 5, nbf: now - 5, exp: now + 300, sub: "user_123", ...claims })}`;
  const sig = createSign("RSA-SHA256").update(body).sign(key).toString("base64url");
  return `${body}.${sig}`;
}

describe("verifyClerkToken", () => {
  it("accepts a valid token and reads subject, email and MFA state", async () => {
    const id = await verifyClerkToken(sign({ email: "a@example.test", fva: [3, 1] }), { jwtKey: pem });
    expect(id).toEqual({ subject: "user_123", email: "a@example.test", mfa: true });
  });
  it("reports no MFA when the second factor is unverified or the claim is absent", async () => {
    expect((await verifyClerkToken(sign({ fva: [3, -1] }), { jwtKey: pem })).mfa).toBe(false);
    expect((await verifyClerkToken(sign({}), { jwtKey: pem })).mfa).toBe(false);
  });
  it("leaves email undefined when the session token isn't customized to include it", async () => {
    expect((await verifyClerkToken(sign({}), { jwtKey: pem })).email).toBeUndefined();
  });
  it("rejects expired tokens", async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    await expect(verifyClerkToken(sign({ iat: past - 60, nbf: past - 60, exp: past }), { jwtKey: pem })).rejects.toThrow();
  });
  it("rejects tampered payloads and tokens signed by another key", async () => {
    const t = sign({ sub: "user_123" });
    const [h, , s] = t.split(".");
    const forged = `${h}.${b64({ sub: "user_admin", exp: Math.floor(Date.now() / 1000) + 300 })}.${s}`;
    await expect(verifyClerkToken(forged, { jwtKey: pem })).rejects.toThrow();
    await expect(verifyClerkToken(sign({}, other.privateKey), { jwtKey: pem })).rejects.toThrow();
  });
  it("rejects garbage and the 'none' algorithm", async () => {
    await expect(verifyClerkToken("not.a.jwt", { jwtKey: pem })).rejects.toThrow();
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "user_123", exp: Math.floor(Date.now() / 1000) + 300 })}.`;
    await expect(verifyClerkToken(none, { jwtKey: pem })).rejects.toThrow();
  });
  it("enforces authorized parties when configured", async () => {
    await expect(verifyClerkToken(sign({ azp: "https://evil.example" }), { jwtKey: pem, authorizedParties: ["https://app.example.test"] })).rejects.toThrow();
    await expect(verifyClerkToken(sign({ azp: "https://app.example.test" }), { jwtKey: pem, authorizedParties: ["https://app.example.test"] })).resolves.toMatchObject({ subject: "user_123" });
  });
});
