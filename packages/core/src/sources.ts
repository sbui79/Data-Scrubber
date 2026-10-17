import { z } from "zod";
import type { Prisma, Role } from "@privatepath/db";
import type { Deps, RequestContext } from "./deps";
import type { Session } from "./auth";
import { writeAudit } from "./audit";
import { AppError } from "./errors";
import { requireRole } from "./users";
import { validateOfficialUrl } from "./urls";

const ADMIN_ROLES: Role[] = ["COMPLIANCE_ADMIN", "SYSTEM_ADMIN"];
const PUBLIC_STATUSES = ["AVAILABLE", "UNAVAILABLE", "MANUAL_ONLY"] as const;

const SourceFields = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(60),
  officialOptOutUrl: z.string().max(2048),
  instructionsMarkdown: z.string().max(20_000),
  verificationMethod: z.string().trim().min(1).max(200),
  difficulty: z.number().int().min(1).max(5),
  sourceStatus: z.enum(PUBLIC_STATUSES),
  lastReviewedAt: z.coerce.date(),
});
export const CreateSourceInput = SourceFields.extend({
  domain: z.string().regex(/^(?=.{4,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/, "lowercase domain"),
});
export const UpdateSourceInput = SourceFields.partial().refine((v) => Object.keys(v).length > 0);

type Snapshot = z.infer<typeof SourceFields> & { domain: string };

const publicView = (s: { id: string; name: string; domain: string; category: string; officialOptOutUrl: string;
  instructionsMarkdown: string; verificationMethod: string; difficulty: number; sourceStatus: string;
  lastReviewedAt: Date | null; version: number; isDemo: boolean }) => ({
  id: s.id, name: s.name, domain: s.domain, category: s.category, officialOptOutUrl: s.officialOptOutUrl,
  instructionsMarkdown: s.instructionsMarkdown, verificationMethod: s.verificationMethod, difficulty: s.difficulty,
  status: s.sourceStatus, optOutProcessExists: s.sourceStatus !== "UNAVAILABLE", lastReviewedAt: s.lastReviewedAt,
  version: s.version,
  isDemo: s.isDemo,
  notice: s.isDemo ? "Example entry for demonstration. Instructions are not verified as current." : undefined,
});

// ---- User-facing catalog (only reviewed, published sources) ----

export async function listSources(deps: Deps, session: Session) {
  await import("./users").then((m) => m.requireUser(deps, session));
  const rows = await deps.db.source.findMany({
    where: { publishedAt: { not: null }, sourceStatus: { in: [...PUBLIC_STATUSES] } },
    orderBy: { name: "asc" },
  });
  return rows.map(publicView);
}

export async function getSource(deps: Deps, session: Session, id: string) {
  await import("./users").then((m) => m.requireUser(deps, session));
  const s = await deps.db.source.findFirst({ where: { id, publishedAt: { not: null }, sourceStatus: { in: [...PUBLIC_STATUSES] } } });
  if (!s) throw new AppError(404, "source_not_found", "Source not found.");
  return publicView(s);
}

// ---- Admin workflow: propose -> second reviewer approves ----

export async function adminCreateSource(deps: Deps, session: Session, raw: unknown, ctx: RequestContext = {}) {
  const admin = await requireRole(deps, session, ADMIN_ROLES);
  const input = CreateSourceInput.parse(raw);
  const officialOptOutUrl = validateOfficialUrl(input.officialOptOutUrl, input.domain);
  if (await deps.db.source.findUnique({ where: { domain: input.domain } })) {
    throw new AppError(409, "source_exists", "A source with this domain already exists.");
  }
  const snapshot: Snapshot = { ...input, officialOptOutUrl };
  return deps.db.$transaction(async (tx) => {
    const s = await tx.source.create({
      data: {
        name: input.name, domain: input.domain, category: input.category, officialOptOutUrl,
        instructionsMarkdown: input.instructionsMarkdown, verificationMethod: input.verificationMethod,
        difficulty: input.difficulty, sourceStatus: "PENDING_REVIEW", isDemo: true, createdByAdminId: admin.id,
        versions: { create: { version: 1, snapshot: snapshot as unknown as Prisma.InputJsonValue, createdByAdminId: admin.id } },
      },
    });
    await writeAudit(tx, deps, ctx, { actorUserId: admin.id, targetUserId: null, eventType: "SOURCE_PROPOSED",
      entityType: "Source", entityId: s.id, metadata: { sourceId: s.id, count: 1 } });
    return { id: s.id, version: 1, status: "PENDING_REVIEW" };
  });
}

/** A change never touches the live entry; it becomes a new pending version awaiting a second reviewer. */
export async function adminProposeUpdate(deps: Deps, session: Session, sourceId: string, raw: unknown, ctx: RequestContext = {}) {
  const admin = await requireRole(deps, session, ADMIN_ROLES);
  const patch = UpdateSourceInput.parse(raw);
  const source = await deps.db.source.findUnique({ where: { id: sourceId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!source || !source.versions[0]) throw new AppError(404, "source_not_found", "Source not found.");
  const latest = source.versions[0];
  const next: Snapshot = { ...(latest.snapshot as unknown as Snapshot), ...patch };
  next.officialOptOutUrl = validateOfficialUrl(next.officialOptOutUrl, source.domain);
  const version = latest.version + 1;
  await deps.db.$transaction(async (tx) => {
    await tx.sourceVersion.create({ data: { sourceId, version, snapshot: next as unknown as Prisma.InputJsonValue, createdByAdminId: admin.id } });
    await writeAudit(tx, deps, ctx, { actorUserId: admin.id, targetUserId: null, eventType: "SOURCE_UPDATE_PROPOSED",
      entityType: "Source", entityId: sourceId, metadata: { sourceId, count: version } });
  });
  return { id: sourceId, version, status: "PENDING_REVIEW" };
}

export async function adminApproveVersion(deps: Deps, session: Session, sourceId: string, version: number, ctx: RequestContext = {}) {
  const reviewer = await requireRole(deps, session, ["COMPLIANCE_ADMIN"]);
  const v = await deps.db.sourceVersion.findUnique({ where: { sourceId_version: { sourceId, version } }, include: { source: true } });
  if (!v) throw new AppError(404, "version_not_found", "Version not found.");
  if (v.approvedByAdminId) throw new AppError(409, "already_approved", "This version is already approved.");
  if (v.createdByAdminId === reviewer.id) {
    throw new AppError(403, "second_reviewer_required", "A different reviewer must approve this change.");
  }
  if (v.source.publishedAt && version <= v.source.version) throw new AppError(409, "superseded", "A newer version is already live.");
  const snap = v.snapshot as unknown as Snapshot;
  const now = new Date();
  await deps.db.$transaction(async (tx) => {
    await tx.sourceVersion.update({ where: { id: v.id }, data: { approvedByAdminId: reviewer.id } });
    await tx.source.update({
      where: { id: sourceId },
      data: {
        name: snap.name, category: snap.category, officialOptOutUrl: snap.officialOptOutUrl,
        instructionsMarkdown: snap.instructionsMarkdown, verificationMethod: snap.verificationMethod,
        difficulty: snap.difficulty, sourceStatus: snap.sourceStatus, lastReviewedAt: new Date(snap.lastReviewedAt),
        version, publishedAt: now, createdByAdminId: v.createdByAdminId, approvedByAdminId: reviewer.id,
      },
    });
    await writeAudit(tx, deps, ctx, { actorUserId: reviewer.id, targetUserId: null, eventType: "SOURCE_APPROVED",
      entityType: "Source", entityId: sourceId, metadata: { sourceId, count: version } });
  });
  return { id: sourceId, version, status: snap.sourceStatus };
}

export async function adminListSources(deps: Deps, session: Session) {
  const viewer = await requireRole(deps, session, ADMIN_ROLES);
  const rows = await deps.db.source.findMany({ orderBy: { name: "asc" }, include: { versions: { orderBy: { version: "asc" } } } });
  return rows.map((s) => ({
    ...publicView(s), published: s.publishedAt !== null,
    versions: s.versions.map((v) => ({ version: v.version, approved: v.approvedByAdminId !== null })),
    // Changes awaiting a second reviewer. Catalog content only, no personal data.
    pending: s.versions.filter((v) => v.approvedByAdminId === null).map((v) => {
      const snap = v.snapshot as unknown as Snapshot;
      return { version: v.version, proposedByYou: v.createdByAdminId === viewer.id,
        snapshot: { name: snap.name, category: snap.category, officialOptOutUrl: snap.officialOptOutUrl, instructionsMarkdown: snap.instructionsMarkdown,
          verificationMethod: snap.verificationMethod, difficulty: snap.difficulty, sourceStatus: snap.sourceStatus } };
    }),
  }));
}
