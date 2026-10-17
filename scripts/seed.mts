/**
 * Seeds LOCAL DEVELOPMENT data only: fictional demo sources on reserved .test domains, two fictional
 * compliance admins (so the four-eyes workflow can be exercised), and one fictional demo user.
 * Run: pnpm seed   (reads .env; mock auth identities only work with AUTH_MODE=mock)
 */
import { loadEnv } from "@privatepath/config";
import { MockKms } from "@privatepath/crypto";
import { createPrisma } from "@privatepath/db";
import { adminApproveVersion, adminCreateSource, completeSignup, type Deps, type Session } from "@privatepath/core";

const env = loadEnv();
if (env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
const db = createPrisma(env.DATABASE_URL);
const deps: Deps = { db, kms: new MockKms(Buffer.from(env.MOCK_KMS_MASTER_KEY!, "base64")), hashPepper: env.HASH_PEPPER };

const who = (n: string): Session => ({ authProviderId: `mock_${n}`, email: `${n}@example.test` });
const adminA = who("seed-admin-a"), adminB = who("seed-admin-b"), demo = who("demo-user");

async function ensureUser(s: Session, name: string, role?: "COMPLIANCE_ADMIN") {
  if (!(await db.user.findUnique({ where: { authProviderId: s.authProviderId } }))) {
    await completeSignup(deps, s, { displayName: name, acceptTerms: true, acceptPrivacy: true, authorizeOwnData: true });
  }
  if (role) await db.user.update({ where: { authProviderId: s.authProviderId }, data: { role } });
}

const CATALOG = [
  ["Example People Finder", "People search", "Email confirmation", 2, "AVAILABLE"],
  ["Sample Records Lookup", "Public records aggregator", "Account-free web form", 1, "AVAILABLE"],
  ["Demo Data Directory", "Data broker", "Phone verification", 4, "AVAILABLE"],
  ["Placeholder Background Index", "Background check", "Email confirmation and ID review", 5, "MANUAL_ONLY"],
  ["Mock Address Archive", "Property references", "Web form with CAPTCHA (user completes)", 3, "AVAILABLE"],
  ["Fictional Social Aggregator", "Public profile aggregator", "Email confirmation", 2, "AVAILABLE"],
  ["Test Marketing List", "Marketing data", "Mailed request", 4, "MANUAL_ONLY"],
  ["Imaginary Contact Finder", "Phone and email lookup", "Web form", 1, "AVAILABLE"],
  ["Pretend Relatives Graph", "Relationship data", "Email confirmation", 3, "AVAILABLE"],
  ["Retired Demo Service", "People search", "None (no opt-out process)", 3, "UNAVAILABLE"],
] as const;

await ensureUser(adminA, "Seed Admin A", "COMPLIANCE_ADMIN");
await ensureUser(adminB, "Seed Admin B", "COMPLIANCE_ADMIN");
await ensureUser(demo, "Demo User");

let created = 0;
for (const [name, category, verificationMethod, difficulty, sourceStatus] of CATALOG) {
  const domain = name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".test";
  if (await db.source.findUnique({ where: { domain } })) continue;
  const s = await adminCreateSource(deps, adminA, {
    name, domain, category, verificationMethod, difficulty, sourceStatus,
    officialOptOutUrl: `https://${domain}/opt-out`,
    instructionsMarkdown: "Demo entry. This is a fictional example, not a real service. Instructions are placeholders and are not verified as current.",
    lastReviewedAt: new Date().toISOString(),
  });
  await adminApproveVersion(deps, adminB, s.id, 1);
  created++;
}
console.log(`Seed complete: ${created} demo sources added. Mock identities: demo-user, seed-admin-a, seed-admin-b.`);
await db.$disconnect();
