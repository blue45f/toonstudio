import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["readable-controls.spec.ts", "admin-navigation-accessibility.spec.ts", "capture-page-evidence.spec.ts", "beta-open-event-gate.spec.ts", "atelier-public-polish.spec.ts", "non-studio-experience.spec.ts", "non-studio-controls.spec.ts", "non-studio-search-layout.spec.ts", "creator-flagship.spec.ts", "open-creation.spec.ts", "engineering-story.spec.ts", "production-risk-intelligence.spec.ts", "studio-exact-resume.spec.ts", "learn.spec.ts", "learn-resilience.spec.ts", "learn-guided-lessons.spec.ts"],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/non-studio-results.json" }]],
  use: {
    baseURL: "http://127.0.0.1:5209",
    browserName: "chromium",
    // API 장애 fixture를 서비스워커 캐시가 우회하지 않게 한다. PWA는 별도 전용 suite에서 검증한다.
    serviceWorkers: "block",
    locale: "ko-KR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "pnpm exec vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 5209 --strictPort",
    url: "http://127.0.0.1:5209",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
