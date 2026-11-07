import { defineConfig, devices } from "@playwright/test";

const CHANNEL = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";
const DEFAULT_EXECUTABLE = process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? "/usr/bin/chromium";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-data-persistence-browser.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: [["list"]],
  use: {
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: DEFAULT_EXECUTABLE,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        },
        ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
          ? {}
          : CHANNEL
            ? { channel: CHANNEL }
            : {}),
      },
    },
  ],
});
