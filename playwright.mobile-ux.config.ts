import { defineConfig } from "@playwright/test";

/** 메뉴 분리의 실제 브라우저 동선과 모바일·PC 접근성을 같은 앱에서 검사한다. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "mobile-menu-journey.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: ".qa/mobile-ux-browser/artifacts",
  reporter: [["list"], ["json", { outputFile: ".qa/mobile-ux-browser/results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5213",
    locale: "ko-KR",
    serviceWorkers: "block",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { browserName: "chromium", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: "pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port 5213 --strictPort",
    url: "http://127.0.0.1:5213",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
