import { defineConfig } from "@playwright/test";

const TEST_DB = "postgresql://stevenbui@localhost:5432/privatepath_test";
const PORT = 3200;

export default defineConfig({
  testDir: "apps/web/e2e",
  globalSetup: "./apps/web/e2e/global-setup.ts",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, permissions: ["clipboard-read", "clipboard-write"], trace: "retain-on-failure" },
  webServer: {
    command: `pnpm --filter @privatepath/web exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/v1/health`,
    env: { DATABASE_URL: TEST_DB },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
