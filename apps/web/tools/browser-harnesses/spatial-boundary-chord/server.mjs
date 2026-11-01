/** 현재 저장소의 정상 Vite 설정을 쓴다. 제품 모듈·Worker·렌더러의 alias나 mock은 추가하지 않는다. */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const [rootInput, portInput, cacheInput] = process.argv.slice(2);
assert(rootInput && portInput && cacheInput, "root/port/소유 cache 경로가 필요합니다.");
const root = path.resolve(rootInput), qa = path.dirname(fileURLToPath(import.meta.url)), port = Number(portInput);
assert(Number.isSafeInteger(port) && port > 1024 && port < 65536);
assert(path.relative(root, qa) === path.join("apps", "web", "tools", "browser-harnesses", "spatial-boundary-chord"), "QA 폴더는 선택한 root 안에 있어야 합니다.");
const require = createRequire(path.join(root, "package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const html = readFileSync(path.join(qa, "spatial-boundary-chord-proof.html"), "utf8");
const entry = "/tools/browser-harnesses/spatial-boundary-chord/spatial-boundary-chord-proof.tsx";
const route = "/tools/browser-harnesses/spatial-boundary-chord-proof.html";
let preparedHtml;
const server = await createServer({ configFile: path.join(root, "apps/web/vite.config.ts"), envDir: false,
  cacheDir: path.resolve(cacheInput), server: { host: "127.0.0.1", port, strictPort: true, hmr: false, open: false },
  optimizeDeps: { include: ["three-stdlib"] },
  plugins: [{ name: "qa-boundary-chord-document-only", configureServer(instance) {
    instance.middlewares.use(async (request, response, next) => {
      if (request.url?.split("?")[0] !== route) return next();
      try {
        assert(preparedHtml, "실제 검증 문서가 아직 준비되지 않았습니다.");
        response.statusCode = 200; response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end(preparedHtml);
      } catch (error) { next(error); }
    });
  } }],
});
let closePromise;
const close = () => (closePromise ??= server.close());
process.once("SIGTERM", () => { void close().catch(() => { process.exitCode = 1; }); });
process.once("SIGINT", () => { void close().catch(() => { process.exitCode = 1; }); });
try {
  await server.listen();
  const optimizer = server.environments.client?.depsOptimizer;
  assert(optimizer?.initState === "initialized", "client optimizer가 초기화되지 않았습니다.");
  const scan = optimizer.scanProcessing;
  if (scan) await scan;
  const processing = optimizer.metadata.discovered["three-stdlib"]?.processing;
  if (processing) await processing;
  preparedHtml = await server.transformIndexHtml(route, html.replace("./spatial-boundary-chord-proof.tsx", entry));
  // 별도 HTML은 기본 entry scan에 없으므로 실제 검증 화면의 정적 그래프도 먼저 준비한다.
  const entryResult = await server.environments.client.transformRequest(entry);
  assert(entryResult?.code, "실제 검증 entry를 변환하지 못했습니다.");
  await server.environments.client.waitForRequestsIdle();
  // waitForRequestsIdle은 첫 crawl만 기다리므로 뒤에 발견된 실제 pre-transform도 소진한다.
  const pending = server.environments.client._pendingRequests;
  assert(pending instanceof Map, "현재 Vite의 변환 대기열 계약이 다릅니다.");
  while (pending.size) await Promise.all([...pending.values()].map(({ request }) => request));
  // Promise 이행만으로 성공시키지 않고 commit된 현재 기록과 실제 파일을 확인한다.
  const optimized = optimizer.metadata.optimized["three-stdlib"];
  assert(optimized && typeof optimized.fileHash === "string" && optimized.fileHash.length > 0,
    "three-stdlib의 최적화 완료 기록이 없습니다.");
  assert(statSync(optimized.file).isFile(), "three-stdlib의 최적화 출력 파일이 없습니다.");
  assert(Object.keys(optimizer.metadata.discovered).length === 0, "발견된 의존성의 최적화가 남아 있습니다.");
  assert(!closePromise, "준비 중 서버 종료가 시작됐습니다.");
  // fileHash는 Vite 메타데이터이며 출력 파일 내용의 SHA를 뜻하지 않는다.
  console.log(JSON.stringify({ event: "ready", pid: process.pid, port, route, productOverrides: false,
    entryGraph: { entry, transformed: true, staticImportsIdle: true, pendingTransforms: pending.size },
    prebundle: { id: "three-stdlib", fileHash: optimized.fileHash, fileExists: true, discovered: 0,
      scanWaited: Boolean(scan), processingWaited: Boolean(processing) } }));
} catch (error) {
  try { await close(); }
  catch (closeError) { throw new AggregateError([error, closeError], "시작 준비와 서버 정리가 모두 실패했습니다.", { cause: closeError }); }
  throw error;
}
