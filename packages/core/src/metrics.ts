import type { Deps } from "./deps";
import type { Session } from "./auth";
import { requireRole } from "./users";

/** Counts below this are shown as "<5" so small groups can't be singled out. */
const MIN_GROUP = 5;
export const suppress = (n: number) => (n < MIN_GROUP ? "<5" : String(n));

/**
 * Aggregate, privacy-preserving numbers only. No per-user rows, no filters by personal attribute,
 * and no way to ask "which user". Anything under 5 is suppressed.
 */
export async function adminMetrics(deps: Deps, session: Session) {
  await requireRole(deps, session, ["SUPPORT", "COMPLIANCE_ADMIN", "SYSTEM_ADMIN"]);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [users, newUsers, byStatus, sources, openCases] = await Promise.all([
    deps.db.user.count(),
    deps.db.user.count({ where: { createdAt: { gte: since } } }),
    deps.db.removalRequest.groupBy({ by: ["status"], _count: { _all: true } }),
    deps.db.source.groupBy({ by: ["sourceStatus"], _count: { _all: true } }),
    deps.db.supportCase.count({ where: { status: { not: "RESOLVED" } } }),
  ]);
  const group = <T extends string>(rows: { _count: { _all: number } }[], keys: T[]) =>
    Object.fromEntries(rows.map((r, i) => [keys[i]!, suppress(r._count._all)]));
  return {
    note: "Counts under 5 are hidden to protect privacy.",
    accounts: { total: suppress(users), joinedLast30Days: suppress(newUsers) },
    requestsByStatus: group(byStatus, byStatus.map((r) => r.status)),
    sourcesByStatus: Object.fromEntries(sources.map((r) => [r.sourceStatus, r._count._all])), // catalog data, not personal
    openSupportCases: suppress(openCases),
  };
}
