import assert from "node:assert/strict";
import nodeTest from "node:test";
import { test as vitestTest } from "vitest";

import { createWebReactCompilerPlugin, WEB_REACT_COMPILER_EXCLUDE } from "../apps/web/vite-react-compiler-filter.ts";

// 이 파일은 루트 Vitest 수집 대상이면서 `node --test`로도 직접 돌려야 하므로,
// 러너에 따라 테스트 등록 함수를 바꾼다.
const test = process.env.VITEST ? vitestTest : nodeTest;

const excluded = (path) => WEB_REACT_COMPILER_EXCLUDE.some((pattern) => pattern.test(path));

async function compilerForCache(cacheDir) {
  const plugin = await createWebReactCompilerPlugin();
  assert.equal(typeof plugin.configResolved, "function");
  await plugin.configResolved.call({}, { cacheDir });
  return plugin;
}

function pluginExcludes(plugin, id) {
  const patterns = plugin.transform.filter.id.exclude;
  assert.ok(Array.isArray(patterns));
  return patterns.some((pattern) => pattern.test(id));
}

test("React와 사전 번들링한 3D 의존성을 다시 컴파일하지 않는다", () => {
  for (const path of [
    "/workspace/node_modules/react-dom/client.js",
    "/@fs/worktree/node_modules/.vite/deps/react-dom_client.js?v=123",
    "/workspace/node_modules/.pnpm/three@0.184.0/node_modules/three/build/three.js",
    "C:\\work\\node_modules\\lucide-react\\dist\\index.js",
    "\0rolldown/runtime.js",
  ]) assert.equal(excluded(path), true, path);
});

test("리로드 안정성 예외는 쿼리 문자열이 있어도 보존한다", () => {
  for (const path of [
    "/src/shared/lib/programmatic-reload.ts",
    "/src/shared/lib/programmatic-reload-hmr.ts?direct",
  ]) assert.equal(excluded(path), true, path);
});

test("앱과 현재 워크스페이스의 React 소스는 여전히 컴파일한다", () => {
  for (const path of [
    "/workspace/apps/web/src/domains/creator/character-shaper/StudioCharacterShaper.tsx",
    "/workspace/packages/studio-project-model/src/useProject.ts",
  ]) assert.equal(excluded(path), false, path);
});

test("확정된 기본·환경·inline cacheDir의 의존성만 선행 Babel 필터에서 제외한다", async () => {
  for (const cacheDir of [
    "/workspace/apps/web/node_modules/.vite",
    "/workspace/.git/browser-validation-20261101/c4-r1-cache",
    "/outside/asset-reviews/runtime/core-3/vite-cache",
  ]) {
    const plugin = await compilerForCache(cacheDir);
    for (const relativePath of [
      "deps/three.module.js?v=123",
      "deps/react-dom_client.js",
      "deps/lucide-react.js",
      "deps_ssr/three.js",
      "deps_temp_123/chunk.js",
      "deps_ssr_temp_123/chunk.js",
    ]) assert.equal(pluginExcludes(plugin, `${cacheDir}/${relativePath}`), true, relativePath);
  }
});

test("캐시 경로의 정규식 문자·Windows 구분자와 @fs URL을 처리한다", async () => {
  const cacheDir = "C:\\work\\cache [qa](1)+.vite\\";
  const plugin = await compilerForCache(cacheDir);
  for (const id of [
    "C:\\work\\cache [qa](1)+.vite\\deps\\three.js?v=123",
    "C:/work/cache [qa](1)+.vite/deps/three.js",
    "/@fs/C:/work/cache [qa](1)+.vite/deps/three.js",
  ]) assert.equal(pluginExcludes(plugin, id), true, id);
  assert.equal(pluginExcludes(plugin, "C:/work/cache qaaaa1Xvite/deps/three.js"), false);
  const posix = await compilerForCache("/outside/cache");
  assert.equal(pluginExcludes(posix, "/@fs/outside/cache/deps/three.js?v=123"), true);
});

test("캐시 이름이 비슷한 경로와 cacheDir 아래의 실제 앱·패키지 소스는 컴파일한다", async () => {
  const plugin = await compilerForCache("/workspace");
  for (const id of [
    "/workspace/apps/web/src/Studio.tsx",
    "/workspace/packages/studio-project-model/src/useProject.ts",
    "/workspace/deps-backup/Widget.tsx",
    "/workspace-other/deps/Widget.tsx",
    "/different/cache/deps/Widget.tsx",
  ]) assert.equal(pluginExcludes(plugin, id), false, id);
  assert.equal(pluginExcludes(plugin, "/workspace/deps/three.js"), true);
});

test("서로 다른 Vite 설정의 캐시 제외 조건은 섞이지 않는다", async () => {
  const first = await compilerForCache("/first/cache");
  const second = await compilerForCache("/second/cache");
  assert.equal(pluginExcludes(first, "/first/cache/deps/three.js"), true);
  assert.equal(pluginExcludes(first, "/second/cache/deps/three.js"), false);
  assert.equal(pluginExcludes(second, "/first/cache/deps/three.js"), false);
  assert.equal(pluginExcludes(second, "/second/cache/deps/three.js"), true);
});

test("실제 Babel 옵션도 캐시를 건너뛰고 앱 React 컴파일을 유지한다", async () => {
  const plugin = await compilerForCache("/outside/cache");
  const context = {
    environment: { name: "client" },
    error(error) { throw error; },
  };
  assert.equal(plugin.applyToEnvironment({ name: "client", config: { consumer: "client" } }), true);
  assert.equal(await plugin.transform.handler.call(
    context, "invalid JavaScript ]", "/outside/cache/deps/three.js", { moduleType: "js" },
  ), undefined);
  const compiled = await plugin.transform.handler.call(
    context,
    "export function Widget({ name }) { return <span>{name}</span>; }",
    "/workspace/apps/web/src/Widget.tsx",
    { moduleType: "tsx" },
  );
  assert.match(compiled.code, /react\/compiler-runtime/u);
});
