import { resolve } from "node:path";

import { loadConfigFromFile } from "vite";
import { expect, it } from "vitest";

it("첫 획의 필기음은 기본 import로 로드하고 다른 화면의 미리 읽기는 유지한다", async () => {
  const config = await loadConfigFromFile(
    { command: "build", mode: "production" }, resolve(import.meta.dirname, "../vite.config.ts"),
  );
  const preload = config?.config.build?.modulePreload;
  if (!preload || typeof preload !== "object" || !preload.resolveDependencies) {
    throw new Error("웹 빌드의 모듈 미리 읽기 정책을 찾지 못했습니다.");
  }
  const audio = "assets/studio-procedural-foley-audio-abc123.js";
  const shared = "assets/rolldown-runtime-abc123.js";
  const css = "assets/editor-abc123.css";
  const context = { hostId: "assets/studio-live-stroke-foley-bridge-abc123.js", hostType: "js" } as const;
  const resolveDeps = preload.resolveDependencies;
  expect(resolveDeps(audio, [audio, shared, css], context)).toEqual([css]);
  const panel = "assets/StudioPanel-abc123.js";
  expect(resolveDeps(panel, [panel, shared, css], context)).toEqual([panel, shared, css]);
});

it("불변 캐시에서 이전 필기음 호출자와 새 호출자의 URL을 구분한다", async () => {
  const { build } = await import("vite");
  const { studioFoleyImportHashPlugin, studioFoleyPreloads } = await import("../config/vite-studio-foley-preload");
  const modules: Record<string, string> = {
    "editor.js": 'export const editor = () => import("./studio-live-stroke-foley-bridge.js")',
    "studio-live-stroke-foley-bridge.js": 'export const draw = () => import("./studio-procedural-foley-audio.js")',
    "studio-procedural-foley-audio.js": 'export { sound } from "./paper.js"',
    "paper.js": 'export const sound = "ink"',
  };
  async function bundle(native: boolean) {
    const result = await build({
      configFile: false, publicDir: false, logLevel: "silent",
      plugins: [{
        name: "foley-test-modules",
        resolveId(id) {
          const name = id.replace(/^\.\//u, "");
          return Object.hasOwn(modules, name) ? name : null;
        },
        load(id) { return modules[id] ?? null; },
      }, ...(native ? [studioFoleyImportHashPlugin()] : [])],
      build: {
        write: false, minify: false,
        modulePreload: native ? { resolveDependencies: studioFoleyPreloads } : undefined,
        rolldownOptions: {
          input: "editor.js", preserveEntrySignatures: "strict",
          output: { manualChunks: (id) => id === "paper.js" ? "paper" : undefined },
        },
      },
    });
    const output = Array.isArray(result) ? result[0] : result;
    if (!output || !("output" in output)) throw new Error("필기음 빌드 결과가 없습니다.");
    const bridge = output.output.find((chunk) => chunk.type === "chunk" && chunk.name === "studio-live-stroke-foley-bridge");
    if (!bridge || bridge.type !== "chunk") throw new Error("필기음 호출자 청크가 없습니다.");
    return bridge;
  }
  const original = await bundle(false);
  const fixed = await bundle(true);
  expect(fixed.code).not.toBe(original.code);
  expect(fixed.fileName).not.toBe(original.fileName);
});
