import { describe, expect, it } from "vitest";
import { MemoryRateLimiter, MemoryStorage } from "../src";

describe("MemoryRateLimiter", () => {
  it("allows up to the limit, then blocks until the window resets", async () => {
    let t = 1_000_000;
    const rl = new MemoryRateLimiter(() => t);
    for (let i = 0; i < 3; i++) expect((await rl.hit("k", 3, 60_000)).allowed).toBe(true);
    const blocked = await rl.hit("k", 3, 60_000);
    expect(blocked).toMatchObject({ allowed: false });
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    t += 60_001;
    expect((await rl.hit("k", 3, 60_000)).allowed).toBe(true);
  });
  it("tracks keys independently", async () => {
    const rl = new MemoryRateLimiter();
    await rl.hit("a", 1, 60_000);
    expect((await rl.hit("a", 1, 60_000)).allowed).toBe(false);
    expect((await rl.hit("b", 1, 60_000)).allowed).toBe(true);
  });
});

describe("storage keys", () => {
  it("rejects path traversal and unsafe keys", async () => {
    const s = new MemoryStorage();
    for (const k of ["../etc/passwd", "a/b", "", "x".repeat(200), "short"]) await expect(s.put(k, Buffer.from("x"))).rejects.toThrow();
    await expect(s.put("0123456789-abcdef", Buffer.from("x"))).resolves.toBeUndefined();
  });
});
