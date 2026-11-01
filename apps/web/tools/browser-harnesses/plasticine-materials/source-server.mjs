/** 현재 제품 Vite 설정을 사용하며 구매 재질·렌더러·Worker를 대체하지 않는다. */
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [rootInput, portInput, cacheInput] = process.argv.slice(2);
assert(rootInput && portInput && cacheInput, "저장소·소유 포트·새 캐시 경로가 필요합니다.");
const root = path.resolve(rootInput), port = Number(portInput), cacheDir = path.resolve(cacheInput);
assert(path.isAbsolute(rootInput) && path.isAbsolute(cacheInput), "절대 경로만 허용합니다.");
assert(Number.isSafeInteger(port) && port > 1024 && port < 65536, "소유 포트를 확인하세요.");
assert(!cacheDir.startsWith(path.join(root, "apps", "web") + path.sep), "제품 앱 안에 캐시를 쓰지 않습니다.");
const require = createRequire(path.join(root, "package.json"));
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const server = await createServer({
  configFile: path.join(root, "apps/web/vite.config.ts"),
  // 이 로컬 기능 검증은 운영 env 파일과 실제 API·계정에 연결하지 않는다.
  envDir: false,
  cacheDir,
  server: { host: "127.0.0.1", port, strictPort: true, hmr: false, open: false },
  optimizeDeps: { include: ["three-stdlib"] },
});
assert.equal(server.config.root, path.join(root, "apps", "web"));
assert.equal(server.config.envDir, false);
assert.equal(server.config.cacheDir, cacheDir);
assert.notEqual(server.config.server.fs.strict, false);
let closePromise;
const close = () => (closePromise ??= server.close());
process.once("SIGTERM", () => { void close().catch(() => { process.exitCode = 1; }); });
process.once("SIGINT", () => { void close().catch(() => { process.exitCode = 1; }); });
try {
  await server.listen();
  // 기존 C4 소유 서버와 같은 최적화 완료 절차를 사용한다.
  const optimizer = server.environments.client?.depsOptimizer;
  assert(optimizer?.initState === "initialized", "client optimizer 초기화를 확인하지 못했습니다.");
  const scan = optimizer.scanProcessing;
  if (scan) await scan;
  const processing = optimizer.metadata.discovered["three-stdlib"]?.processing;
  if (processing) await processing;
  // 실제로 여는 route·정밀 편집·View·Templates의 지연 그래프를 dev 검증 입력으로 준비한다.
  const entries = ["/src/app/main.tsx", "/src/domains/creator/studio-router/StudioRouter.tsx",
    "/src/domains/creator/studio-legacy-editor-adapter.tsx", "/src/domains/creator/bg3d/StudioBackground3D.tsx",
    "/src/domains/creator/bg3d/StudioBg3dViewPanel.tsx", "/src/domains/creator/bg3d/StudioBg3dWebtoonBackgroundPicker.tsx",
    "/src/domains/creator/bg3d/StudioBg3dSceneTemplatePanel.tsx", "/src/domains/creator/bg3d/StudioBg3dUserTemplateLibraryPanel.tsx",
    "/src/domains/creator/bg3d/StudioBg3dRoomBuilderPanel.tsx", "/tools/browser-harnesses/plasticine-materials/passive-entry.ts"];
  for (const entry of entries) assert((await server.environments.client.transformRequest(entry))?.code, `검증 entry 변환 실패: ${entry}`);
  const pending = server.environments.client._pendingRequests;
  assert(pending instanceof Map, "현재 Vite의 변환 대기열 계약이 다릅니다.");
  while (pending.size) await Promise.all([...pending.values()].map(({ request }) => request));
  const optimized = optimizer.metadata.optimized["three-stdlib"];
  assert(optimized && typeof optimized.fileHash === "string" && optimized.fileHash.length > 0,
    "three-stdlib 최적화 완료 기록이 없습니다.");
  assert(statSync(optimized.file).isFile(), "최적화 출력 파일이 없습니다.");
  assert.equal(Object.keys(optimizer.metadata.discovered).length, 0, "미완료 의존성 최적화가 남아 있습니다.");
  assert(!closePromise, "준비 중 서버가 종료되었습니다.");
  console.log(JSON.stringify({ event: "ready", pid: process.pid, port, root,
    productModuleOverrides: false, environmentFileLoading: false, hmr: false,
    entryGraph: { entries, pendingTransforms: pending.size, coldProductStartupMeasurement: false },
    prebundle: { id: "three-stdlib", fileHash: optimized.fileHash, fileExists: true,
      discovered: 0, scanWaited: Boolean(scan), processingWaited: Boolean(processing) } }));
} catch (error) {
  try { await close(); }
  catch (closeError) { throw new AggregateError([error, closeError], "시작과 정리에 모두 실패했습니다.", { cause: closeError }); }
  throw error;
}
