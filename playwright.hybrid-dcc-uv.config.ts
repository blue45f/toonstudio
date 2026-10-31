import { defineConfig } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const origin = "http://127.0.0.1:5359";

/** 실제 제품 화면과 기본 Worker를 검사하는 로컬 GPU 회귀. 배포 빌드 검증은 별도다. */
export default defineConfig({
  testDir: "./apps/web/tools/browser-tests",
  testMatch: "**/hybrid-dcc-uv-workflow.browser.ts",
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  maxFailures: 1,
  timeout: 240_000,
  globalTimeout: 360_000,
  expect: { timeout: 20_000 },
  outputDir: ".qa/hybrid-dcc-uv-browser/results",
  reporter: [["list"], ["json", { outputFile: process.env.STUDIO_UV_BROWSER_REPORT ?? ".qa/hybrid-dcc-uv-browser/results.json" }]],
  use: {
    baseURL: origin,
    browserName: "chromium",
    ...(executablePath ? { launchOptions: { executablePath, args: [] } } : { channel: "chrome", launchOptions: { args: [] } }),
    headless: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
    serviceWorkers: "allow",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5359 --strictPort",
    url: `${origin}/studio/3d/dcc/model`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
