import { defineConfig, devices } from "@playwright/test";

/**
 * 로컬 풀스택 인증 브라우저 스모크 전용 설정(opt-in).
 *
 * - 서버를 직접 띄우지 않는다(webServer 없음). `node scripts/local-fullstack/cli.mjs up` 으로 만든
 *   로컬 스택(임베디드 PostgreSQL + API + Vite)이 이미 떠 있어야 하고, 실행은 같은 CLI 의 `e2e` 명령을 쓴다.
 * - 기본 CI(`playwright.config.ts`)와 분리된 설정이며, 스펙도 TOONSTUDIO_LOCAL_FULLSTACK_E2E=1 일 때만 실행된다.
 *
 * 브라우저 선택 순서(playwright.config.ts 와 같은 규칙, 마지막 폴백만 다르다):
 *   1. PLAYWRIGHT_EXECUTABLE_PATH — 이미지에 고정된 Chromium 실행 파일
 *   2. PLAYWRIGHT_CHANNEL — 예: chrome (빈 문자열이면 Playwright 번들 Chromium)
 *   3. 폴백: Playwright 번들 Chromium(`pnpm exec playwright install chromium` 필요)
 */
const webOrigin = process.env.TOONSTUDIO_LOCAL_WEB_ORIGIN ?? "http://127.0.0.1:5273";
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH?.trim();
const channel = process.env.PLAYWRIGHT_CHANNEL?.trim();

export default defineConfig({
  testDir: "./e2e",
  testMatch: "local-fullstack-auth.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // 첫 요청에서 Vite 의존성 최적화가 끝날 때까지 오래 걸릴 수 있다.
  timeout: 300_000,
  expect: { timeout: 60_000 },
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: webOrigin,
    locale: "ko-KR",
    viewport: { width: 1280, height: 900 },
    headless: true,
    trace: "off",
    screenshot: "only-on-failure",
    ...(executablePath
      ? { launchOptions: { executablePath } }
      : channel
        ? { channel }
        : {}),
  },
});
