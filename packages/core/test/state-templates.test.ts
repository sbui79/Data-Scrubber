import { describe, expect, it } from "vitest";
import { buildDraft, canTransition, DRAFTABLE, last4, renderTemplate, USER_SETTABLE } from "../src";

describe("state machine", () => {
  it("allows the happy path", () => {
    const path = ["NOT_STARTED", "LISTING_FOUND", "DRAFT_READY", "AWAITING_USER_ACTION", "SUBMITTED_BY_USER", "IN_PROGRESS", "COMPLETED", "ARCHIVED"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
  });
  it("blocks skipping the approval step and leaving ARCHIVED", () => {
    expect(canTransition("DRAFT_READY", "SUBMITTED_BY_USER")).toBe(false);
    expect(canTransition("LISTING_FOUND", "SUBMITTED_BY_USER")).toBe(false);
    expect(canTransition("NOT_STARTED", "COMPLETED")).toBe(false);
    expect(canTransition("ARCHIVED", "LISTING_FOUND")).toBe(false);
  });
  it("keeps guarded statuses out of the directly-settable list", () => {
    for (const guarded of ["DRAFT_READY", "AWAITING_USER_ACTION", "SUBMITTED_BY_USER", "NOT_STARTED"] as const) {
      expect(USER_SETTABLE).not.toContain(guarded);
    }
    expect(DRAFTABLE).not.toContain("SUBMITTED_BY_USER");
  });
});

describe("templates", () => {
  it("renders known tokens and rejects unknown ones", () => {
    expect(renderTemplate("Hi {{ full_name }}", { full_name: "Sam Sample" })).toBe("Hi Sam Sample");
    expect(() => renderTemplate("{{ssn}}", {})).toThrow();
  });
  it("does not re-expand tokens smuggled inside values", () => {
    expect(renderTemplate("{{full_name}}", { full_name: "{{user_email}}", user_email: "leak@example.test" })).toBe("{{user_email}}");
  });
  it("omits optional personal details unless opted in", () => {
    const d = buildDraft({ requestType: "SUPPRESSION", dataCategories: [], fullName: "Sam Sample", listingUrl: "https://x.test/p/1", now: new Date("2026-10-17T10:00:00Z") });
    expect(d.body).toContain("Sam Sample");
    expect(d.body).toContain("https://x.test/p/1");
    expect(d.body).toContain("Date: 2026-10-17");
    expect(d.body).not.toMatch(/@|Phone/);
    expect(d.subject).toBe("Request to Remove My Personal Information");
  });
  it("includes email and last 4 digits only when provided, and lists chosen categories", () => {
    const d = buildDraft({ requestType: "DELETION", dataCategories: ["old_addresses", "phone"], fullName: "S S", email: "a@example.test", phoneLast4: last4("(555) 010-0199") });
    expect(d.body).toContain("a@example.test");
    expect(d.body).toContain("Phone ending in 0199");
    expect(d.body).not.toContain("555");
    expect(d.body).toContain("my current and previous addresses, my phone number");
  });
  it("strips newlines from values so they cannot forge extra lines", () => {
    const d = buildDraft({ requestType: "OPT_OUT", dataCategories: [], fullName: "Sam\n\nBCC: attacker@evil.test" });
    expect(d.body.split("\n").some((l) => l.startsWith("BCC:"))).toBe(false);
  });
});
