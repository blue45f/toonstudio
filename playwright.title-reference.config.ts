import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "title-responsive-reference.spec.ts",
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5311",
    browserName: "chromium",
    serviceWorkers: "block",
    locale: "ko-KR",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5311 --strictPort",
    url: "http://127.0.0.1:5311",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
