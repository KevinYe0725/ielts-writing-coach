import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3201";
const serverURL = new URL(baseURL);
const serverPort = serverURL.port || "3201";
const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE ?? "true";
process.env.NEXT_PUBLIC_DEMO_MODE = demoMode;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `pnpm --filter @iwc/web exec next dev --hostname 127.0.0.1 --port ${serverPort}`,
    env: { NEXT_PUBLIC_DEMO_MODE: demoMode },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: `${baseURL}/api/v1/health/live`,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 14"] } },
  ],
});
