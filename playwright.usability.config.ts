import { defineConfig } from "@playwright/test";

const origin = process.env.STUDIO_USABILITY_BASE_URL ?? "http://127.0.0.1:5309";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(origin).hostname)) {
  throw new Error("사용성 회귀 검증은 로컬 미리보기 주소에서만 실행합니다.");
}

export default defineConfig({
  testDir: "./e2e",
  testMatch: "usability-first-session.spec.ts",
  outputDir: "artifacts/usability-browser",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["json", { outputFile: "artifacts/usability-browser-results.json" }]],
  use: {
    baseURL: origin,
    browserName: "chromium",
    channel: "chromium",
    locale: "ko-KR",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  webServer: process.env.STUDIO_USABILITY_BASE_URL ? undefined : {
    command: "pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5309 --strictPort",
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
