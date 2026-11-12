import { defineConfig } from "@playwright/test";

/** 관리자 브라우저 fixture이며 실제 SQL 동작은 별도 Postgres suite가 검증한다. */
export default defineConfig({
  testDir: "tests",
  testMatch: ["operation-policy.e2e.ts", "ci-quality.e2e.ts"],
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:4184",
    browserName: "chromium",
    headless: true,
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
  },
  outputDir: "../../artifacts/operation-policy-browser",
  webServer: {
    command: "pnpm exec vite --config vite.config.ts --host 127.0.0.1 --port 4184 --strictPort",
    url: "http://127.0.0.1:4184",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
