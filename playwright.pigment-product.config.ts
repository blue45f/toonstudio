import { resolve } from "node:path";

import { defineConfig } from "@playwright/test";

import studioConfig from "./playwright.config";

// 기존 실제 앱 Vite/Chromium 설정을 재사용하며 실행 저장소를 이 설정의 위치로 고정한다.
if (!studioConfig.webServer || Array.isArray(studioConfig.webServer)) {
  throw new Error("기준 Studio 설정의 단일 webServer 계약을 다시 확인해야 합니다.");
}
const root = __dirname;
const output = resolve(root, ".qa/mixbox-internalization/product-workflow");
export default defineConfig({
  ...studioConfig,
  testDir: resolve(root, "e2e"),
  testMatch: "studio-pigment-product-workflow.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  globalTimeout: 540_000,
  outputDir: `${output}/artifacts`,
  reporter: [["list"], ["json", { outputFile: `${output}/playwright.json` }]],
  use: {
    ...studioConfig.use,
    locale: "ko-KR",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
    // 새 context 생성 전 DOM snapshot·HAR 관측만 선택 분리한다. 실패 화면·실제 PNG·픽셀 검증은 유지한다.
    trace: {
      mode: "retain-on-failure", screenshots: false,
      snapshots: process.env.TOONSTUDIO_CAPTURE_WITHOUT_DOM_SNAPSHOTS !== "1", sources: true,
    },
    screenshot: "only-on-failure",
    acceptDownloads: true,
  },
  projects: studioConfig.projects?.map((project) => ({
    ...project,
    use: { ...project.use, viewport: { width: 1440, height: 1000 } },
  })),
  webServer: { ...studioConfig.webServer, cwd: root, reuseExistingServer: false },
});
