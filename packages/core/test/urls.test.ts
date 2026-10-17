import { describe, expect, it } from "vitest";
import { validateListingUrl } from "../src";

const D = "example-broker.test";
const bad = [
  "http://example-broker.test/p/1",                    // not https
  "https://evil.test/p/1",                             // other domain
  "https://example-broker.test.evil.test/p/1",         // suffix trick
  "https://evilexample-broker.test/p/1",               // lookalike prefix
  "https://example-broker.test@evil.test/p/1",         // userinfo trick
  "https://user:pw@example-broker.test/p/1",           // credentials
  "https://example-broker.test:8443/p/1",              // custom port
  "https://127.0.0.1/p/1", "https://[::1]/p/1", "https://localhost/p/1",
  "https://10.0.0.5/p/1",
  "javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "ftp://example-broker.test/x",
  "not a url", "", "   ",
  "https://example-broker.test/" + "a".repeat(2100),
];

describe("validateListingUrl", () => {
  it.each(bad)("rejects %s", (u) => {
    expect(() => validateListingUrl(u, D)).toThrow();
  });
  it("accepts the domain and its subdomains, strips fragments, lowercases host", () => {
    expect(validateListingUrl("https://Example-Broker.test/p/1#frag", D)).toBe("https://example-broker.test/p/1");
    expect(validateListingUrl("https://www.example-broker.test/profile?id=1", D)).toBe("https://www.example-broker.test/profile?id=1");
  });
  it("never echoes the submitted value in the error", () => {
    try { validateListingUrl("https://evil.test/secret-token-123", D); } catch (e) {
      expect(String(e)).not.toContain("secret-token-123");
      expect(String(e)).not.toContain("evil.test");
    }
  });
});
