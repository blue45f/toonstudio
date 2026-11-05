import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const webRoot = path.resolve(repositoryRoot, "apps/web");
const reviewEntries = ["e2e/feedback-community.html", "e2e/community-replies.html"];
const reviewHarnesses = ["/e2e/feedback-community-harness.tsx", "/e2e/community-replies-harness.tsx"];

const reviewReadiness: import("vite").Plugin = {
  name: "feedback-review-readiness",
  apply: "serve",
  configureServer(server) {
    let readiness: Promise<void> | undefined;
    server.middlewares.use(async (request, response, next) => {
      if (request.url !== "/__feedback-review-ready") return next();
      try {
        readiness ??= (async () => {
          const environment = server.environments.client;
          if (!environment) throw new Error("피드백 검증 client 환경을 찾지 못했습니다.");
          for (const entry of reviewHarnesses) {
            if (!await environment.transformRequest(entry)) throw new Error(`피드백 검증 진입점을 처리하지 못했습니다: ${entry}`);
          }
          // Vite의 experimental API는 이 검증 서버의 초기 정적 import 준비에만 사용한다.
          await environment.waitForRequestsIdle();
          const optimizer = environment.depsOptimizer;
          await optimizer?.scanProcessing;
          await Promise.all(optimizer?.metadata.depInfoList.map((dependency) => dependency.processing) ?? []);
        })();
        await readiness;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.end("ready");
      } catch (error) {
        next(error);
      }
    });
  },
};


export default defineConfig({
  root: repositoryRoot,
  base: "./",
  publicDir: false,
  cacheDir: path.resolve(repositoryRoot, ".qa/feedback-vite-cache"),
  plugins: [react(), reviewReadiness],
  resolve: {
    alias: { "@": path.resolve(webRoot, "src") },
  },
  // 댓글 진입점도 선탐색해 첫 검사 중 의존성 재최적화가 화면을 재시작하지 않게 한다.
  optimizeDeps: { entries: reviewEntries },
  server: { warmup: { clientFiles: reviewEntries } },
  build: {
    outDir: "dist-feedback-review",
    rolldownOptions: { input: reviewEntries },
  },
});
