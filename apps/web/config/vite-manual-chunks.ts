export type StudioChunkPredicate = (id: string) => boolean;

/**
 * 2026-10-16: 에디터 호스트가 정적으로 쓰고 지연 패널도 공유하는 무의존 잎 모듈(`domains/creator` 기준 경로).
 *
 * 모듈마다 0.4~1.4 KiB 짜리 공유 청크가 따로 생겨 있었다. 작은 파일은 gzip 머리말·사전 시작 비용이 커서 원본 대비
 * 압축률이 나쁘고(500 B 파일이 ~350 B), 청크 수 상한(`check:studio-bundle`)도 이 자잘한 청크가 채운다. 이미 Studio
 * 정적 폐포에 있는 `studio-editing-micro-models` 에 합쳐 요청과 gzip 용량만 줄인다 — 정적·지연 폐포의 내용은 그대로다.
 *
 * 들어올 조건(모두 확인함): ① 값 import 가 없거나 React 뿐이다 ② 프로덕션 importer 가 전부 `domains/creator` 의
 * Studio 편집기 계열이다(허브·공개 페이지·다른 도메인이 쓰는 `showcase-links`·`creator-studio-links`·
 * `studio-dialogue` 같은 모듈은 넣지 않는다 — 합치면 그 경로가 Studio 묶음을 끌어온다).
 * 상태 저장소·Worker·렌더러·패널은 넣지 않는다.
 *
 * BG3D 전용 잎(`bg3d/studio-bg3d-lens.ts` 등)과 압축 파일 쓰기에 쓰는 `studio-crc32.ts` 도 넣지 않는다: BG3D 편집기
 * 활성화·컷 일괄 처리 런타임의 정적 폐포가 그 잎을 가져오는데(`studio-package-archive` → crc32), 합치면 이 묶음
 * (~46 KiB)이 통째로 그 폐포에 들어와 `BG3D editor activation`·`BG3D shot-batch runtime` 래칫을 깬다(원본 +~41 KiB,
 * gzip +~15 KiB). 새 잎을 더하기 전에 `check:studio-bundle` 의 전문 런타임 폐포 수치가 그대로인지 확인한다.
 */
const STUDIO_TINY_EDITOR_LEAVES: readonly string[] = [
  "studio-shell/studio-shell-floating-layout-events.ts",
  "studio-floating-menu-layouts.ts",
  "canvas/studio-canvas-viewport-primitives.ts",
  "studio-cuttoon-editor/studio-touch-gesture-policy.ts",
  "studio-vector-reference-source-budget-receipt.ts",
  "studio-stroke-focus-activity.ts",
  "studio-horizontal-wheel.ts",
  "studio-commercial-residuals.ts",
  "studio-active-tool-command.ts",
  "live/studio-live-page-lifecycle.ts",
  "studio-tool-hint-preferences.ts",
  "studio-selection-chrome-mirror.ts",
  "render/studio-raster-edit-surface-cache.ts",
  "render/studio-webgpu-color.ts",
  "layer/studio-layer-comps.ts",
  "studio-low-latency-canvas.ts",
];

export function createStudioManualChunks(predicates: {
  isInitialIconModule: StudioChunkPredicate;
  isStudioCoreIconModule: StudioChunkPredicate;
  isStudioWorkspaceIconModule?: StudioChunkPredicate;
}) {
  const { isInitialIconModule, isStudioCoreIconModule } = predicates;
  return (id: string): string | undefined => {
    if (id.endsWith("/src/domains/creator/studio-marketplace-cc0-catalog.generated.ts")) {
      // The curated Marketplace catalogue is a dependency-free ~300 KiB data leaf. Keep it
      // isolated so routes that never resolve built-in CC0 records do not share its payload.
      return "studio-marketplace-cc0-catalog";
    }
    if (id.endsWith("/src/domains/creator/brush/studio-material-tip-atlas.generated.json")) {
      // This is a dependency-free data leaf. Its sole runtime owner is the optional procedural
      // selection module; a named leaf prevents shared-contract coloring from capturing 32 R8
      // fields in an eager chunk. Never include the compiler, dynamics or catalogue module here.
      return "studio-material-tip-atlas";
    }
    if (
      id.includes("/node_modules/@babylonjs/")
      || id.includes("/node_modules/babylonjs-gltf2interface/")
    ) {
      // Keep every Babylon package in one manifest-visible specialist chunk. The production
      // bundle audit can then prove that no generic shared vendor chunk leaks the engine
      // into the app, Studio route, or BG3D editor activation graphs.
      return "studio-bg3d-babylon-runtime";
    }
    // NOTE (2026-08-29): naming a chunk for Three's `three.webgpu` build was tried and
    // reverted for the same reason as the SQLite repositories below. `three.webgpu.js` is
    // not a leaf — it shares `three.core.js` with `three.module.js` — so rolldown made the
    // named chunk the home of that shared color. Every three importer then gained a static
    // edge to an 897 KiB blob and the BG3D editor activation grew 68 KiB gzip. Left
    // unnamed, `three.webgpu` lands in a chunk reachable only through the WebGPU renderer's
    // dynamic import, which is exactly what the bundle audit requires.
    // NOTE (2026-08-14): naming a chunk for the launch-time SQLite repositories was tried and
    // reverted. Every entry above is a dependency-free leaf; these repositories are not, so
    // rolldown made the named chunk the home of their whole shared color — a 671 KiB blob that
    // the BG3D editor (+28%) and even the admin/feedback routes then had to download. Merging
    // only pays when the merged modules carry nothing behind them.
    if (
      id.endsWith("/src/domains/creator/bg3d/studio-bg3d-model-thumbnail-encode.ts")
      || id.endsWith("/src/domains/creator/bg3d/studio-bg3d-shot-png-worker-client.ts")
    ) {
      // Every thumbnail encoder caller already loads the PNG Worker client. Keep this
      // unconditional pair in one request rather than a separate 250-byte wrapper chunk.
      // The Worker itself, capture controller and archive paths retain their boundaries.
      return "studio-bg3d-png-client";
    }
    if (
      id.endsWith("/src/domains/creator/bg3d/studio-bg3d-production-workflow.ts")
      || id.endsWith("/src/domains/creator/bg3d/studio-bg3d-production-pass-readiness.ts")
      || id.endsWith("/src/domains/creator/bg3d/studio-bg3d-production-multipass.ts")
      || id.endsWith("/src/domains/creator/bg3d/studio-bg3d-pro-suite-runtime-context.tsx")
    ) {
      // The editor already needs these production UI contracts and its shared context.
      // Co-locate the 200-byte context instead of issuing another request on activation.
      // Its only runtime dependency is React, which keeps its existing react-runtime chunk.
      // Never include panels, SceneDocument runtime, engines or archive/Worker clients here.
      return "studio-bg3d-production-models";
    }
    if (
      id.endsWith("/src/domains/creator/studio-workspaces.ts")
      || id.endsWith("/src/domains/creator/brush/studio-drawing-palettes.ts")
    ) {
      // Drawing-palette layout is part of the synchronously restored workspace envelope.
      // Co-locate both small models so Studio startup does not pay a separate shared-chunk
      // request while the lazy palette stack can reuse the already-loaded workspace chunk.
      return "studio-workspaces";
    }
    if (
      id.endsWith("/lib/sha256-portable.ts")
      || id.endsWith("/src/domains/creator/studio-sha256.ts")
    ) {
      // The Studio entry is a compatibility-only re-export and the portable implementation
      // is dependency-free. Co-locate the unconditional pair so Studio/BG3D do not pay a
      // second request, while every non-Studio consumer still receives only this small hash
      // implementation rather than any product runtime.
      return "studio-sha256";
    }
    if (
      id.endsWith("/src/domains/creator/studio-selection-tools.ts")
      || id.endsWith("/src/domains/creator/studio-magic-wand.ts")
      || id.endsWith("/src/domains/creator/studio-alpha-lock.ts")
      || id.endsWith("/src/domains/creator/studio-quick-selection.ts")
    ) {
      // Advanced Fill's user-triggered browser engine shares alpha-lock and magic-wand
      // primitives with the always-on selection graph. Keep those already-eager pure cores
      // in one chunk so the dynamic boundary does not add two launch-time HTTP requests.
      // 2026-10-15: 퀵 선택 코어는 매직완드만 import하는 순수 모듈이고 에디터 호스트가 정적으로
      // 쓰므로 같은 묶음에 넣어 자기 청크(+1 요청)를 없앤다.
      return "studio-selection-tools";
    }
    if (
      id.endsWith("/src/domains/creator/studio-tool-hints.ts")
      || id.endsWith("/src/domains/creator/studio-view-action-hints.ts")
      || id.endsWith("/src/domains/creator/studio-inspector-layout.ts")
    ) {
      // The view HUD, always-visible rails and inspector shell share this small UI
      // vocabulary. Co-locating it avoids an extra HTTP request on every Studio launch.
      return "studio-tool-hints";
    }
    if (
      id.endsWith("/src/domains/creator/studio-page-orchestration-runtime.ts")
      || id.endsWith("/src/domains/creator/render/studio-raster-export-orchestration-runtime.ts")
    ) {
      // The page orchestration facade already re-exports the raster export runtime. Keep the
      // unconditional pair together as before the adjustment/export repair split them into two
      // requests; this does not pull a new runtime across an eager/lazy ownership boundary.
      return "studio-page-orchestration-runtime";
    }
    if (
      id.endsWith("/src/domains/creator/contracts/studio-work-asset-contract.ts")
      || id.endsWith("/src/domains/creator/contracts/studio-smart-filter-stack-contract.ts")
      || id.endsWith("/src/domains/creator/contracts/studio-live-adjustment-contract.ts")
    ) {
      // These schemas are one contract family: the work-asset contract imports both smaller
      // schemas, and the live-adjustment schema imports the smart-filter schema. Co-locating
      // them removes split contract requests without moving the lazy adjustment pixel runtime.
      return "studio-work-asset-contract";
    }
    if (
      id.endsWith("/lib/studio-raster-asset-admission.ts")
      || id.endsWith("/src/domains/creator/studio-background-gradient-color-stops.ts")
      || id.endsWith("/src/domains/creator/studio-characters.ts")
      || id.endsWith("/src/domains/creator/brush/studio-brush-pack-format.ts")
      || id.endsWith("/src/domains/creator/studio-help-center-channel.ts")
      || id.endsWith("/src/domains/creator/studio-inspector-focus.ts")
      || id.endsWith("/src/domains/creator/studio-liquify-contract.ts")
      || id.endsWith("/src/domains/creator/studio-mobile-sheet-snap.ts")
      || id.endsWith("/src/domains/creator/studio-similar-style.ts")
      || id.endsWith("/src/domains/creator/studio-story-beats.ts")
      || id.endsWith("/src/domains/creator/studio-element-model.ts")
      || id.endsWith("/src/domains/creator/render/studio-raster-image-presentation.ts")
      || id.endsWith("/src/domains/creator/contracts/studio-adjustment-engine-ids.ts")
      || id.endsWith("/src/domains/creator/studio-live-adjustment-status.ts")
      || id.endsWith("/src/domains/creator/render/studio-raster-presentation-cache.ts")
      || id.endsWith("/src/domains/creator/color/studio-color-proof-document.ts")
      || id.endsWith("/src/domains/creator/color/StudioColorProofContext.tsx")
    ) {
      // These lightweight contracts are shared by several Studio lazy entries. Similar-style
      // and story-beat helpers are also synchronously needed by StudioPage, so leaving their
      // tiny bodies as separate shared chunks costs launch requests without preserving lazy
      // bytes. Element-model and raster-presentation are dependency-free linked-surface
      // contracts. ColorProofContext keeps its dialog behind React.lazy, so only the tiny
      // already-eager provider joins this chunk. Connected brush modules such as selection,
      // pack-id and engine-program-set are deliberately excluded: each owns a substantial
      // catalogue or material-runtime graph, and naming them here would color that lazy graph
      // into the app entry's critical precache closure.
      return "studio-core-micro-contracts";
    }
    if (
      id.endsWith("/src/domains/creator/studio-panel-split.ts")
      || id.endsWith("/src/domains/creator/studio-edit-controls.ts")
      || id.endsWith("/src/domains/creator/studio-macro-recorder.ts")
      || id.endsWith("/src/domains/creator/studio-pathfinder-vector-engine.ts")
      || id.endsWith("/src/domains/creator/studio-advanced-fill-tap.ts")
      || id.endsWith("/src/domains/creator/studio-colordrop-gesture.ts")
      || id.endsWith("/src/domains/creator/studio-cuttoon-editor/runtime/useStudioMenuPopoverDismiss.ts")
      || id.endsWith("/src/domains/creator/studio-sfx-presets.ts")
      || STUDIO_TINY_EDITOR_LEAVES.some((leaf) => id.endsWith(`/src/domains/creator/${leaf}`))
    ) {
      // Dependency-free leaves with the same entry-owner set; merging removes one request
      // without changing any static or lazy closure.
      // 2026-10-15: 매크로 기록·패스파인더 벡터 엔진·컬러드롭 제스처(와 그 유일한 의존성인 탭 판정)는
      // 에디터 호스트가 정적으로 쓰고 지연 패널도 공유하는 무의존 잎 모듈이라 모듈마다 작은 공유
      // 청크가 따로 생겼다(Studio 라우트 정적 청크 +3). 이미 Studio 정적 폐포에 있는 이 그룹에
      // 합쳐 요청만 줄인다 — 패널·렌더러·Worker·상태 저장소는 넣지 않는다.
      // 2026-10-16: 팝오버 닫힘 훅(React 만 의존)과 SFX 프리셋 데이터(무의존)도 같은 사정이다 — 에디터 호스트가 정적으로
      // 쓰는데 지연 로드되는 참 바(팝오버 훅·카탈로그 데이터)가 함께 가져오면서 둘 다 자기 공유 청크로 떼어졌다(정적 청크 +2).
      return "studio-editing-micro-models";
    }
    if (["studio-isometric-grid", "studio-perspective-guide", "studio-object-insert-drag", "studio-image-placement",
      // 2026-10-16: 삽입 끌기 위치의 격자 스냅. 위 두 삽입 모듈이 쓰는 순수 기하인데, 지연 로드되는 참 바가 함께 가져오면서
      // 자기 공유 청크로 떼어졌다(정적 청크 +1). 같은 그룹에 둔다.
      "studio-object-drag-snap",
      // 2026-10-15: 원근 가이드 격자·소실점 기하(드로잉 보조). 같은 순수 기하라 같은 그룹에 둔다.
      "drawing/studio-perspective-guide"]
      .some((name) => id.endsWith(`/src/domains/creator/${name}.ts`))) {
      // Pure placement/guide geometry already used by the static editor graph.
      return "studio-placement-guide-contracts";
    }
    if (["studio-project-version", "studio-revision-document-extensions", "studio-webtoon-canvas-presets", "studio-tool-search"]
      .some((name) => id.endsWith(`/src/domains/creator/${name}.ts`))) {
      // Already-synchronous dependency-free document metadata and discovery functions.
      // Keep these separate from renderer/Worker/stateful authority chunks.
      return "studio-document-metadata-contracts";
    }
    if (
      id.endsWith("/src/domains/creator/studio-material-pressure-model.ts")
      || id.endsWith("/src/domains/creator/studio-hand-feel-media-load-v1.ts")
      || id.endsWith("/src/domains/creator/brush/studio-ink-pressure-model.ts")
      || id.endsWith("/src/domains/creator/studio-color-utils.ts")
      || id.endsWith("/src/domains/creator/studio-color-wheel.ts")
    ) {
      // Audited dependency-free numeric brush contracts, already needed at Studio entry.
      // Do not include renderers, catalogues, Workers, or their mutable runtime state here.
      return "studio-brush-numeric-contracts";
    }
    if (
      id.endsWith("/src/domains/creator/studio-id.ts")
      || id.endsWith("/src/domains/creator/render/studio-engine-failure-policy.ts")
      || id.endsWith("/src/domains/creator/contracts/studio-live-lock-resource.ts")
      || id.endsWith("/packages/contracts/src/studio-live-lock-resource.ts")
      || id.endsWith("/src/domains/creator/live/studio-live-local-transport-support.ts")
      || id.endsWith("/src/domains/creator/studio-content-aware-fill-contract.ts")
      || id.endsWith("/src/domains/creator/studio-z-index.ts")
      || id.endsWith("/src/domains/creator/studio-initial-primary-tool.ts")
    ) {
      // 의존성이 없는 구현과 잠금 계약의 호환 진입점만 묶는다. 공용 패키지로 옮긴
      // 잠금 구현도 같은 청크를 사용하며 패키지 전체나 UI를 이 경계에 포함하지 않는다.
      return "studio-tiny-capability-contracts";
    }
    if (
      id.endsWith("/src/domains/creator/studio-layers.ts")
      || id.endsWith("/src/domains/creator/studio-work-metadata.ts")
      || id.endsWith("/src/domains/creator/studio-page-review.ts")
      || id.endsWith("/src/domains/creator/studio-frame-animation-timing.ts")
      || id.endsWith("/src/domains/creator/studio-live-adjustment-visibility.ts")
    ) {
      // These pure document models have no runtime dependencies. Review status and frame
      // timing are already needed by the editor and reused by the lazy quality inspector;
      // co-locating their sub-KiB bodies avoids separate startup requests without
      // capturing a quality UI, decoder, rendering engine or browser runtime.
      return "studio-document-micro-models";
    }
    if (
      id.endsWith("/src/domains/creator/studio-assets.ts")
      || id.endsWith("/src/domains/creator/render/studio-raster-assets.ts")
    ) {
      // Both are dependency-free models; every raster-asset owner already loads assets.
      return "studio-asset-micro-models";
    }
    if (
      id.endsWith("/src/domains/creator/brush/studio-paper-brush-response.ts")
      || id.endsWith("/src/domains/creator/brush/studio-paper-texture.ts")
    ) {
      // Paper texture is an unconditional dependency of the eager brush-response model.
      // Keep the tiny texture helper in the same request instead of paying a second chunk.
      return "studio-paper-brush-response";
    }
    if (id.endsWith("/src/domains/creator/StudioLazySurfaceFallback.tsx")) {
      // The route/panel skeleton leaf is dependency-free apart from React, but rolldown left
      // it to shared-color grouping. Once the Studio i18n loader changed entry reachability,
      // that grouping absorbed this leaf into the `useStudioI18nPriorityLoading` chunk, so every
      // BG3D editor panel that only wants a skeleton spinner gained a static edge to ~82 KiB of
      // i18n loader code (+97 KiB raw / +34 KiB gzip / +8 chunks on the editor activation).
      // Naming the leaf keeps it one small request owned by the same importers as before.
      // Never add routers, panels, dictionaries or locale catalogs to this chunk.
      return "studio-lazy-surface-fallback";
    }
    if (
      id.includes("/node_modules/react/") ||
      id.includes("/node_modules/react-dom/") ||
      id.includes("/node_modules/scheduler/") ||
      id.includes("/node_modules/react-router/") ||
      id.includes("/node_modules/react-router-dom/")
    ) {
      return "react-runtime";
    }
    if (id.includes("/node_modules/konva/") || id.includes("/node_modules/react-konva/")) {
      return "studio-konva-runtime";
    }
    if (isInitialIconModule(id)) {
      return "lucide-initial-icons";
    }
    // These Studio-only leaves must not inflate the icon chunk shared by the app shell.
    if (predicates.isStudioWorkspaceIconModule?.(id)) {
      return "lucide-studio-workspace-icons";
    }
    if (isStudioCoreIconModule(id)) {
      return "lucide-studio-core-icons";
    }
  };
}
