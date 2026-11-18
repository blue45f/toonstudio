import { defineConfig } from "@playwright/test";

const external = process.env.STUDIO_3D_V31_URL;
const port = 5_261;
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";
const SOFTWARE_GPU_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

/**
 * V30~V31 8대 장르 확장·세부 히어로 소품·19개 서랍 한글 초성 검색·GLB 바이너리 사전 가드
 * 실브라우저 UX·반응형·접근성(axe-core) 전용 Playwright 설정.
 * 로컬 터미널: `pnpm exec playwright test --config playwright.studio-3d-v31.config.ts`
 * CI 번들 Chromium: `PLAYWRIGHT_CHANNEL="" pnpm exec playwright test --config playwright.studio-3d-v31.config.ts`
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-3d-v31-genre-choseong-ux.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 25_000 },
  reporter: "list",
  outputDir: "test-results/studio-3d-v31-ux",
  use: {
    baseURL: external ?? `http://127.0.0.1:${port}`,
    headless: true,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 960 },
    ...(executablePath
      ? { launchOptions: { executablePath, args: SOFTWARE_GPU_ARGS } }
      : {
          ...(channel ? { channel } : {}),
          launchOptions: { args: SOFTWARE_GPU_ARGS },
        }),
  },
  webServer: external
    ? undefined
    : {
        command: `pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}/studio/3d/dcc/model`,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
