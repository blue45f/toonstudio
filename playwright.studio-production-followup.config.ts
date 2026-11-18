import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

// 목록 확인은 브라우저·서버를 시작하지 않는다. 실제 실행에는 production 빌드를 요구한다.
if (!process.argv.includes("--list") && !existsSync("dist/index.html")) throw new Error("정확한 SHA의 production build가 먼저 필요합니다.");

/** 원래 두 시각 검사의 임계값·timeout을 유지하고 서버만 production preview로 고정한다. */
export default defineConfig({
  ...baseConfig,
  testMatch: "studio-3d-visual-verification.spec.ts",
  grep: /3D 웹툰 제작의 구도·컷·출력과 실제 선화·바닥 충돌이 동작한다|3D 캐릭터가 렌더되고 포즈가 캔버스에 붙는다/u,
  reporter: [["list"], ["json"]],
  retries: 0,
  workers: 1,
  webServer: {
    command: "pnpm exec vite preview --config apps/web/vite.config.ts --host 127.0.0.1 --port 5199 --strictPort",
    url: "http://127.0.0.1:5199/",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
