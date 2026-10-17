import { execSync } from "node:child_process";

const TEST_DB = "postgresql://stevenbui@localhost:5432/privatepath_test";

/** Resets the TEST database (never dev) and seeds fictional demo sources. */
export default function setup() {
  execSync(`psql -h localhost -d privatepath_test -q -c 'TRUNCATE "User","AuditEvent","Source","AdminAccessGrant" RESTART IDENTITY CASCADE'`, { stdio: "inherit" });
  execSync("pnpm seed", { stdio: "inherit", env: { ...process.env, DATABASE_URL: TEST_DB } });
}
