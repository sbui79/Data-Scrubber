import { z } from "zod";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { requireUser } from "./users";

/**
 * Educational content only. PrivatePath never submits DROP requests, never collects state identity
 * credentials, and never links this to the user's account beyond a self-reported checklist.
 * FLAGGED FOR ATTORNEY REVIEW before production. Details last checked against the official page on 2026-10-17.
 */
export const CALIFORNIA_INFO = {
  title: "California Privacy Center",
  externalProcessNotice:
    "DROP is an official California government service with its own terms and eligibility rules. PrivatePath is not affiliated with it, does not submit requests for you, and never asks for your state or government login details.",
  summary:
    "California residents can use the state's Delete Request and Opt-out Platform (DROP) to send one deletion request to data brokers registered in California. You complete it directly on the official site.",
  officialLinks: [
    { label: "About DROP (California Privacy Protection Agency)", url: "https://privacy.ca.gov/drop/" },
    { label: "Start a request on the official DROP platform", url: "https://consumer.drop.privacy.ca.gov" },
  ],
  checklist: [
    { step: 1, title: "Confirm you are a California resident", detail: "DROP is only for California residents." },
    { step: 2, title: "Complete identity verification on the official platform", detail: "Verification happens entirely on the state's site. Never enter those details anywhere else, including here." },
    { step: 3, title: "Submit the request on the official platform", detail: "Submit directly through DROP. PrivatePath cannot do this for you." },
    { step: 4, title: "Come back and mark this task complete", detail: "This only records your own progress here." },
    { step: 5, title: "Set a reminder to review status later", detail: "Brokers process requests over time. Set a reminder to check on the official site." },
  ],
  limits: [
    "DROP covers data brokers registered with California. It does not cover every website that shows personal information.",
    "Timelines and eligibility are set by the state. Check the official page for current details.",
    "Removal is never guaranteed, and some information may be exempt from deletion.",
  ],
  lastReviewed: "2026-10-17",
  needsLegalReview: true,
} as const;

const STEPS = CALIFORNIA_INFO.checklist.map((c) => c.step);
export const ProgressInput = z.object({ step: z.number().int().refine((n) => (STEPS as number[]).includes(n)), done: z.boolean() });

export async function getCaliforniaInfo(deps: Deps, session: Session) {
  const user = await requireUser(deps, session);
  const p = await deps.db.californiaProgress.findUnique({ where: { userId: user.id } });
  return { ...CALIFORNIA_INFO, completedSteps: [...(p?.completedSteps ?? [])].sort((a, b) => a - b) };
}

export async function setCaliforniaStep(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const { step, done } = ProgressInput.parse(raw);
  const user = await requireUser(deps, session);
  await deps.db.$transaction(async (tx) => {
    const cur = (await tx.californiaProgress.findUnique({ where: { userId: user.id } }))?.completedSteps ?? [];
    const next = done ? [...new Set([...cur, step])] : cur.filter((s) => s !== step);
    await tx.californiaProgress.upsert({ where: { userId: user.id }, create: { userId: user.id, completedSteps: next }, update: { completedSteps: next } });
    await writeAudit(tx, deps, ctx, { actorUserId: user.id, targetUserId: user.id, eventType: "CALIFORNIA_STEP_UPDATED", entityType: "CaliforniaProgress", entityId: user.id, metadata: { count: step } });
  });
  return getCaliforniaInfo(deps, session);
}
