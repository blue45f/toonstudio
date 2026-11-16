import { defineConfig } from "@playwright/test";

/** 검증 UI helper의 분기와 실패 전파만 확인하므로 앱 빌드·API 서버는 필요하지 않다. */
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["studio-qa-interactions.spec.mts", "studio-qa-shell-interactions.spec.mts"],
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 20_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  outputDir: "artifacts/studio-qa-helpers",
  use: {
    browserName: "chromium",
    headless: true,
    locale: "ko-KR",
    actionTimeout: 10_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
