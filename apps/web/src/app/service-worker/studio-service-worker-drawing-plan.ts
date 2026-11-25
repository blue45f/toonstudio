import { collectStudioManifestClosure, type StudioViteManifest } from "./studio-service-worker-precache-plan";

// 스튜디오의 온라인 첫 사용 뒤에만 준비하며, 서비스 워커 설치 비용에는 포함하지 않는다.
export const DRAWING_ROOTS = [
  "StudioRouter", "StudioMobileEditingDock", "StudioInspectorAside", "StudioToolHintBubble", "StudioColorVisionHintPreview",
  "StudioDraftSaveCenter", "studio-legacy-editor-adapter", "studio-pages-history-durable-runtime",
  "StudioPageThumbnails", "studio-lowlatency-predictor", "studio-procedural-foley-audio",
  "StudioDrawingClarityExport", "StudioExportMenuPanel", "StudioPromoHandoffSection", "StudioEnhancedExportMenuPanel",
  "studio-export", "studio-capture-readiness", "studio-project-file", "studio-release-schedule",
  "studio-publication-analytics", "studio-project-thumbnail", "studio-watermark-preferences-sqlite",
  "studio-skia-document-font-source", "studio-skia-document-export", "studio-unified-preflight-contract",
  "studio-autosave-sqlite-store", "studio-local-database-worker-client",
];

const SKIA_ENTRY = "../../packages/studio-engine-skia/src/index.ts";
const DOCUMENT_LOADER = "../../packages/studio-engine-skia/src/document-loader.ts";

/** 편집기와 첫 PNG에서 사용하는 Skia 진입점만 따라간다. 다른 엔진도 같은 청크 이름 src를 사용한다. */
function skiaDrawingEntries(manifest: StudioViteManifest): string[] {
  const imports = manifest[SKIA_ENTRY]?.dynamicImports ?? [];
  const script = imports.find((key) => key.endsWith("/canvaskit-wasm/bin/canvaskit.js"));
  const wasm = imports.find((key) => key.endsWith("/canvaskit-wasm/bin/canvaskit.wasm?url"));
  if (!imports.includes(DOCUMENT_LOADER) || !script || !wasm || !manifest[wasm.slice(0, -4)]) {
    throw new Error("Offline drawing Skia renderer/WASM missing");
  }
  return [SKIA_ENTRY, DOCUMENT_LOADER, script, wasm, wasm.slice(0, -4)];
}

/** 리소스 타이밍 버퍼가 가득 찬 경우에도 번들 매니페스트의 정적 의존성 전체를 포함한다. */
export function collectStudioOfflineDrawingUrls(manifest: StudioViteManifest, emittedFiles: readonly string[]): string[] {
  const roots = DRAWING_ROOTS.flatMap((name) => {
    const matches = Object.keys(manifest).filter((key) => manifest[key].name === name);
    if (matches.length !== 1) throw new Error(`Offline drawing root missing or ambiguous: ${name}`);
    return matches;
  });
  const urls = new Set([...roots, ...skiaDrawingEntries(manifest)].flatMap((key) => collectStudioManifestClosure(manifest, key)));
  // 저장 워커와 WASM은 정적 import 대신 별도 빌드 산출물로 나온다.
  for (const file of emittedFiles) {
    if (/^(?:studio-local-database\.worker-[\w-]+\.js|sqlite3(?:-opfs-async-proxy|-worker1)?-[\w-]+\.(?:js|wasm))$/u.test(file)) urls.add(`/assets/${file}`);
  }
  if (![...urls].some((url) => /studio-local-database\.worker-/u.test(url))
    || ![...urls].some((url) => /sqlite3-[\w-]+\.wasm$/u.test(url))) throw new Error("Offline storage worker/WASM missing");
  return [...urls].sort((left, right) => left.localeCompare(right));
}
