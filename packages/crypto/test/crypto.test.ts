import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptField, encryptField, fieldAad, generateDek, hmacHash, MockKms } from "../src";

const aad = fieldAad("UserProfile", "encryptedLegalFirstName", "row1");

describe("field encryption", () => {
  it("round-trips", () => {
    const dek = generateDek();
    expect(decryptField(dek, encryptField(dek, "Test User", aad), aad)).toBe("Test User");
  });
  it("uses a fresh nonce each time", () => {
    const dek = generateDek();
    expect(encryptField(dek, "x", aad).equals(encryptField(dek, "x", aad))).toBe(false);
  });
  it("rejects ciphertext moved to another row/column (AAD binding)", () => {
    const dek = generateDek();
    const blob = encryptField(dek, "secret", aad);
    expect(() => decryptField(dek, blob, fieldAad("UserProfile", "encryptedLegalFirstName", "row2"))).toThrow("Decryption failed");
  });
  it("rejects tampering and wrong keys without leaking data", () => {
    const dek = generateDek();
    const blob = encryptField(dek, "secret", aad);
    blob[blob.length - 20] = blob[blob.length - 20]! ^ 1;
    expect(() => decryptField(dek, blob, aad)).toThrow("Decryption failed");
    expect(() => decryptField(generateDek(), encryptField(dek, "secret", aad), aad)).toThrow("Decryption failed");
  });
  it("rejects bad key length", () => {
    expect(() => encryptField(Buffer.alloc(16), "x", aad)).toThrow("Invalid key length");
  });
});

describe("MockKms", () => {
  it("wraps and unwraps a DEK; fails after key id mismatch", async () => {
    const kms = new MockKms(randomBytes(32));
    const dek = generateDek();
    const { wrapped, keyId } = await kms.wrap(dek);
    expect((await kms.unwrap(wrapped, keyId)).equals(dek)).toBe(true);
    await expect(kms.unwrap(wrapped, "other")).rejects.toThrow();
  });
});

describe("hmacHash", () => {
  it("is deterministic per pepper and differs across peppers", () => {
    expect(hmacHash("1.2.3.4", "pepper-pepper-pepper")).toBe(hmacHash("1.2.3.4", "pepper-pepper-pepper"));
    expect(hmacHash("1.2.3.4", "pepper-pepper-pepper")).not.toBe(hmacHash("1.2.3.4", "other-other-other-"));
  });
});
