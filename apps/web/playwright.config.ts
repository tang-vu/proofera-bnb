import { defineConfig, devices } from "@playwright/test";

const requestedPort = process.env.PROOFERA_E2E_PORT ?? "3217";
if (!/^[1-9]\d{0,4}$/u.test(requestedPort)) {
  throw new Error("PROOFERA_E2E_PORT_INVALID");
}
const e2ePort = Number.parseInt(requestedPort, 10);
if (e2ePort > 65_535) {
  throw new Error("PROOFERA_E2E_PORT_INVALID");
}
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;
process.env.PROOFERA_NEXT_DIST_DIR = `.tmp/next-e2e-${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Keep the single Next.js development server responsive during form-heavy
  // desktop and mobile journeys, regardless of host CPU count.
  workers: 4,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: e2eOrigin,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    command: `pnpm dev --hostname 127.0.0.1 --port ${e2ePort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    url: `${e2eOrigin}/api/health`
  }
});
