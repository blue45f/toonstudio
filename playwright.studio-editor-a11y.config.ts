import { defineConfig, devices } from "@playwright/test";

/**
 * 열린 편집기(/studio/canvas, 로그인 없는 게스트·오프라인 흐름) 접근성 점검 전용 설정.
 * 실행: pnpm run test:a11y:editor
 *
 * 브라우저는 playwright.config.ts 와 같은 우선순위로 고른다.
 *   1. PLAYWRIGHT_EXECUTABLE_PATH — 이미지가 고정해 둔 Chromium(샌드박스·에이전트 이미지).
 *   2. PLAYWRIGHT_CHANNEL — 비어 있으면 Playwright 가 내려받은 번들 Chromium(CI).
 * 개발 서버는 기본으로 새로 띄운다(CI 와 같은 콜드 스타트). 로컬에서 서버를 재사용하려면
 * TOONSTUDIO_A11Y_EDITOR_REUSE_SERVER=1 과 TOONSTUDIO_A11Y_EDITOR_PORT 를 함께 준다.
 */
const EDITOR_A11Y_PORT = Number(process.env.TOONSTUDIO_A11Y_EDITOR_PORT ?? "5233");
const baseURL = `http://127.0.0.1:${EDITOR_A11Y_PORT}`;

// 편집기는 WebGL 캔버스를 만든다. GPU 가 없는 러너에서도 같은 소프트웨어 렌더러로 뜨게 한다.
const SOFTWARE_GPU_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const channel = process.env.PLAYWRIGHT_CHANNEL ?? "";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "studio-editor-a11y.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // 결정적인 위반은 두 번 다 실패하므로 가려지지 않고, 한 번 실패 뒤 통과하면 보고서가 flaky 로 표시한다.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // 패널 9개를 차례로 열며 axe·접근성 트리를 읽는 시험은 부하가 큰 러너에서 몇 분이 걸린다.
  // 콜드 스타트 비용은 시험 파일의 beforeAll 워밍업이 따로 치른다.
  timeout: 480_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    locale: "ko-KR",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...(executablePath
      ? { launchOptions: { executablePath, args: SOFTWARE_GPU_ARGS } }
      : {
          ...(channel ? { channel } : {}),
          launchOptions: { args: SOFTWARE_GPU_ARGS },
        }),
  },
  webServer: {
    command: `pnpm exec vite --config apps/web/vite.config.ts --host 127.0.0.1 --port ${EDITOR_A11Y_PORT} --strictPort`,
    url: baseURL,
    reuseExistingServer: process.env.TOONSTUDIO_A11Y_EDITOR_REUSE_SERVER === "1",
    timeout: 180_000,
  },
});
