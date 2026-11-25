import { describe, expect, it } from "vitest";

import { collectStudioOfflineDrawingUrls, DRAWING_ROOTS } from "./studio-service-worker-drawing-plan";
import type { StudioViteManifest } from "./studio-service-worker-precache-plan";

const names = DRAWING_ROOTS;
const skiaKey = "../../packages/studio-engine-skia/src/index.ts";
const loader = "../../packages/studio-engine-skia/src/document-loader.ts";
const kit = "../../node_modules/canvaskit-wasm/bin/canvaskit";
const manifest: StudioViteManifest = {
  ...Object.fromEntries(names.map((name) => [name, { name, file: `assets/${name}-hash.js`, imports: ["shared"] }])),
  [skiaKey]: { name: "src", file: "assets/skia.js", dynamicImports: [loader, kit + ".js", kit + ".wasm?url"] },
  unrelated: { name: "src", file: "assets/unrelated-engine.js" },
  [loader]: { file: "assets/document-loader.js" },
  [kit + ".js"]: { file: "assets/kit.js" },
  [kit + ".wasm?url"]: { file: "assets/kit-url.js" },
  [kit + ".wasm"]: { file: "assets/kit.wasm" },
  shared: { file: "assets/shared-hash.js", css: ["assets/shared-hash.css"], dynamicImports: ["heavy"] },
  heavy: { file: "assets/unrelated-heavy.js" },
};
const files = ["studio-local-database.worker-hash.js", "sqlite3-hash.wasm", "sqlite3-opfs-async-proxy-hash.js", "unrelated-heavy.wasm"];
describe("explicit offline drawing pack", () => {
  it("includes the complete static drawing and storage closure without unrelated lazy tools", () => {
    const urls = collectStudioOfflineDrawingUrls(manifest, files);
    expect(urls).toContain("/assets/shared-hash.css");
    expect(urls).toContain("/assets/StudioEnhancedExportMenuPanel-hash.js");
    expect(urls).toContain("/assets/studio-capture-readiness-hash.js");
    expect(urls).toContain("/assets/studio-project-file-hash.js");
    expect(urls).toContain("/assets/studio-pages-history-durable-runtime-hash.js");
    expect(urls).toEqual(expect.arrayContaining([
      "/assets/StudioPageThumbnails-hash.js", "/assets/studio-lowlatency-predictor-hash.js",
      "/assets/studio-procedural-foley-audio-hash.js", "/assets/StudioDrawingClarityExport-hash.js",
      "/assets/studio-skia-document-export-hash.js", "/assets/studio-unified-preflight-contract-hash.js",
      "/assets/skia.js", "/assets/document-loader.js", "/assets/kit.js", "/assets/kit-url.js", "/assets/kit.wasm",
    ]));
    expect(urls).not.toContain("/assets/unrelated-engine.js");
    expect(urls).toContain("/assets/studio-local-database.worker-hash.js");
    expect(urls).toContain("/assets/sqlite3-hash.wasm");
    expect(urls.some((url) => url.includes("unrelated-heavy"))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it("데스크톱에서 준비해도 좁은 화면에서 쓸 모바일 도크와 하위 모듈을 포함한다", () => {
    const urls = collectStudioOfflineDrawingUrls({
      ...manifest,
      StudioMobileEditingDock: { name: "StudioMobileEditingDock", file: "assets/mobile-dock.js", imports: ["eraserPicker"] },
      eraserPicker: { file: "assets/eraser-picker.js", imports: ["eraserPlan"] },
      eraserPlan: { file: "assets/eraser-plan.js" },
    }, files);
    expect(urls).toEqual(expect.arrayContaining([
      "/assets/mobile-dock.js", "/assets/eraser-picker.js", "/assets/eraser-plan.js",
    ]));
  });
  it("저장 대기 기록이 있는 원고를 새 탭에서 열 수 있도록 지연 패널을 준비한다", () => {
    const urls = collectStudioOfflineDrawingUrls({
      ...manifest,
      StudioDraftSaveCenter: { name: "StudioDraftSaveCenter", file: "assets/save-center.js", dynamicImports: ["StudioDurableSaveIntentPanel"] },
      StudioDurableSaveIntentPanel: { name: "StudioDurableSaveIntentPanel", file: "assets/save-intent-panel.js" },
    }, files);
    expect(urls).toContain("/assets/save-intent-panel.js");
  });
  it("fails the build instead of silently omitting a renamed core module", () => {
    expect(() => collectStudioOfflineDrawingUrls({}, files)).toThrow(/root missing/u);
  });
  it("requires the native storage worker and WASM", () => {
    expect(() => collectStudioOfflineDrawingUrls(manifest, [])).toThrow(/storage worker/u);
  });
});
