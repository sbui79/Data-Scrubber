import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { MemoryEmail } from "@privatepath/adapters";
import { MockKms } from "@privatepath/crypto";
import { createPrisma } from "@privatepath/db";
import {
  adminApproveVersion, adminCreateSource, approveRequest, completeSignup, createProfile, createReminder, createRequest,
  deleteReminder, generateDraft, listNotifications, listReminders, markNotificationRead, markSubmitted, patchRequest,
  processDueReminders, updateReminder, type Deps, type Session,
} from "../src";

const db = createPrisma(process.env.TEST_DATABASE_URL ?? "postgresql://stevenbui@localhost:5432/privatepath_test");
const email = new MemoryEmail();
const deps: Deps = { db, kms: new MockKms(randomBytes(32)), hashPepper: "test-pepper-0123456789", email, appUrl: "https://app.example.test" };
const mk = (n: string): Session => ({ authProviderId: `mock_${n}`, email: `${n}@example.test` });
const [adminA, adminB, alice, bob] = ["adminA", "adminB", "alice", "bob"].map(mk) as [Session, Session, Session, Session];
const consents = (n: string) => ({ displayName: n, acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true });
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

let sourceId: string;
beforeEach(async () => {
  await db.$executeRawUnsafe('TRUNCATE "User","AuditEvent","Source" RESTART IDENTITY CASCADE');
  email.outbox.length = 0;
  for (const s of [adminA, adminB, alice, bob]) await completeSignup(deps, s, consents(s.authProviderId));
  await db.user.updateMany({ where: { authProviderId: { in: ["mock_adminA", "mock_adminB"] } }, data: { role: "COMPLIANCE_ADMIN" } });
  const s = await adminCreateSource(deps, adminA, { name: "Example Broker One", domain: "example-broker-one.test", category: "c",
    officialOptOutUrl: "https://example-broker-one.test/o", instructionsMarkdown: "x", verificationMethod: "v", difficulty: 1, sourceStatus: "AVAILABLE", lastReviewedAt: "2026-10-01" });
  await adminApproveVersion(deps, adminB, s.id, 1);
  sourceId = s.id;
  await createProfile(deps, alice, { legalFirstName: "Alexandra", legalLastName: "Demoperson" });
});
afterAll(() => db.$disconnect());

async function submittedRequest() {
  let r = await createRequest(deps, alice, { sourceId, requestType: "OPT_OUT" });
  r = await patchRequest(deps, alice, r.id, { status: "LISTING_FOUND" });
  const d = await generateDraft(deps, alice, r.id, { confirmOwnData: true });
  await approveRequest(deps, alice, r.id, { confirmOwnData: true, draftHash: d.draftHash });
  return markSubmitted(deps, alice, r.id, { method: "web_form" });
}

describe("creating reminders", () => {
  it("submission creates a default 30-day in-app follow-up", async () => {
    const r = await submittedRequest();
    const list = await listReminders(deps, alice);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: "FOLLOWUP_30", channel: "IN_APP", removalRequestId: r.id });
  });
  it("offers 7/14/60/90-day follow-ups relative to the submission date", async () => {
    const r = await submittedRequest();
    const rem = await createReminder(deps, alice, { type: "FOLLOWUP_90", removalRequestId: r.id });
    expect(Math.round((rem.scheduledFor.getTime() - r.userSubmittedAt!.getTime()) / DAY)).toBe(90);
  });
  it("requires a submitted request, and forbids custom dates on fixed types", async () => {
    const draft = await createRequest(deps, alice, { sourceId, requestType: "OPT_OUT" });
    await expect(createReminder(deps, alice, { type: "FOLLOWUP_14", removalRequestId: draft.id })).rejects.toMatchObject({ code: "not_submitted" });
    const r = await submittedRequest();
    await expect(createReminder(deps, alice, { type: "FOLLOWUP_14", removalRequestId: r.id, scheduledFor: days(3) })).rejects.toMatchObject({ status: 400 });
  });
  it("rejects dates in the past or beyond two years, and duplicates", async () => {
    await expect(createReminder(deps, alice, { type: "CUSTOM", scheduledFor: days(-1) })).rejects.toMatchObject({ code: "reminder_in_past" });
    await expect(createReminder(deps, alice, { type: "CUSTOM", scheduledFor: days(900) })).rejects.toMatchObject({ status: 400 });
    await createReminder(deps, alice, { type: "CALIFORNIA_DROP", scheduledFor: days(30) });
    await expect(createReminder(deps, alice, { type: "CALIFORNIA_DROP", scheduledFor: days(40) })).rejects.toMatchObject({ code: "reminder_exists" });
  });
  it("supports 6 and 12 month re-checks without a request", async () => {
    const a = await createReminder(deps, alice, { type: "RECHECK_6M" });
    const b = await createReminder(deps, alice, { type: "RECHECK_12M" });
    expect(Math.round((a.scheduledFor.getTime() - Date.now()) / DAY)).toBe(182);
    expect(Math.round((b.scheduledFor.getTime() - Date.now()) / DAY)).toBe(365);
  });
  it("cannot attach to another user's request", async () => {
    const r = await submittedRequest();
    await expect(createReminder(deps, bob, { type: "FOLLOWUP_7", removalRequestId: r.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe("managing reminders", () => {
  it("mutes, reschedules and deletes; others cannot touch them", async () => {
    const r = await createReminder(deps, alice, { type: "CUSTOM", scheduledFor: days(5) });
    expect((await updateReminder(deps, alice, r.id, { status: "MUTED" })).status).toBe("MUTED");
    const moved = await updateReminder(deps, alice, r.id, { status: "SCHEDULED", scheduledFor: days(10) });
    expect(moved.status).toBe("SCHEDULED");
    await expect(updateReminder(deps, bob, r.id, { status: "MUTED" })).rejects.toMatchObject({ status: 404 });
    await expect(deleteReminder(deps, bob, r.id)).rejects.toMatchObject({ status: 404 });
    await deleteReminder(deps, alice, r.id);
    expect(await listReminders(deps, alice)).toEqual([]);
  });
  it("enforces the active reminder limit", async () => {
    const u = await db.user.findFirstOrThrow({ where: { authProviderId: "mock_alice" } });
    await db.reminder.createMany({ data: Array.from({ length: 50 }, (_, i) => ({ userId: u.id, type: "CUSTOM", channel: "IN_APP", scheduledFor: days(i + 1) })) });
    await expect(createReminder(deps, alice, { type: "CUSTOM", scheduledFor: days(99) })).rejects.toMatchObject({ code: "too_many_reminders" });
  });
});

describe("delivery", () => {
  const dueReminder = async (type: string, channel: "IN_APP" | "EMAIL", removalRequestId?: string) => {
    const u = await db.user.findFirstOrThrow({ where: { authProviderId: "mock_alice" } });
    return db.reminder.create({ data: { userId: u.id, type, channel, removalRequestId: removalRequestId ?? null, scheduledFor: new Date(Date.now() - 1000) } });
  };
  it("sends due reminders once as a generic in-app notification, ignoring future and muted ones", async () => {
    await dueReminder("CUSTOM", "IN_APP");
    await createReminder(deps, alice, { type: "CALIFORNIA_DROP", scheduledFor: days(3) });
    const muted = await dueReminder("RECHECK_6M", "IN_APP");
    await db.reminder.update({ where: { id: muted.id }, data: { status: "MUTED" } });
    expect(await processDueReminders(deps)).toEqual({ sent: 1, failed: 0 });
    expect(await processDueReminders(deps)).toEqual({ sent: 0, failed: 0 });
    const n = await listNotifications(deps, alice);
    expect(n).toHaveLength(1);
    await markNotificationRead(deps, alice, n[0]!.id);
    expect((await listNotifications(deps, alice))[0]!.read).toBe(true);
    await expect(markNotificationRead(deps, bob, n[0]!.id)).rejects.toMatchObject({ status: 404 });
    expect(await listNotifications(deps, bob)).toEqual([]);
  });
  it("email reminders carry no personal data and link only to the app", async () => {
    const r = await submittedRequest();
    await dueReminder("FOLLOWUP_14", "EMAIL", r.id);
    await processDueReminders(deps);
    expect(email.outbox).toHaveLength(1);
    const m = email.outbox[0]!;
    expect(m.to).toBe("alice@example.test");
    const body = m.subject + m.text;
    expect(body).not.toMatch(/Alexandra|Demoperson|Example Broker|example-broker/);
    expect(m.text).toContain("https://app.example.test/reminders");
  });
  it("marks a submitted request FOLLOW_UP_DUE when its follow-up fires", async () => {
    const r = await submittedRequest();
    await db.reminder.updateMany({ where: { removalRequestId: r.id }, data: { scheduledFor: new Date(Date.now() - 1000) } });
    await processDueReminders(deps);
    expect((await db.removalRequest.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("FOLLOW_UP_DUE");
    const ev = await db.auditEvent.findFirstOrThrow({ where: { eventType: "REQUEST_STATUS_CHANGED", actorUserId: null } });
    expect(ev.metadataRedactedJson).toMatchObject({ toStatus: "FOLLOW_UP_DUE" });
  });
  it("leaves the reminder scheduled for retry when email delivery fails", async () => {
    const rem = await dueReminder("CUSTOM", "EMAIL");
    email.failNext = true;
    expect(await processDueReminders(deps)).toEqual({ sent: 0, failed: 1 });
    expect((await db.reminder.findUniqueOrThrow({ where: { id: rem.id } })).status).toBe("SCHEDULED");
    expect(await db.notification.count()).toBe(0);
    expect(await processDueReminders(deps)).toEqual({ sent: 1, failed: 0 });
  });
  it("never double-sends under concurrent runners", async () => {
    for (let i = 0; i < 5; i++) await dueReminder(`CUSTOM`, "EMAIL");
    await Promise.all([processDueReminders(deps), processDueReminders(deps), processDueReminders(deps)]);
    expect(email.outbox).toHaveLength(5);
    expect(await db.notification.count()).toBe(5);
  });
  it("re-check reminders recur", async () => {
    await dueReminder("RECHECK_6M", "IN_APP");
    await processDueReminders(deps);
    const next = await db.reminder.findMany({ where: { type: "RECHECK_6M", status: "SCHEDULED" } });
    expect(next).toHaveLength(1);
    expect(Math.round((next[0]!.scheduledFor.getTime() - Date.now()) / DAY)).toBe(182);
  });
  it("recovers a reminder stuck mid-delivery after a crash", async () => {
    const rem = await dueReminder("CUSTOM", "IN_APP");
    await db.reminder.update({ where: { id: rem.id }, data: { status: "SENDING", sentAt: new Date(Date.now() - 30 * 60_000) } });
    expect(await processDueReminders(deps)).toEqual({ sent: 1, failed: 0 });
  });
});
