import { describe, expect, it } from "vitest";

import { createStudioManualChunks } from "./vite-manual-chunks";

const manualChunk = createStudioManualChunks({
  isInitialIconModule: () => false,
  isStudioCoreIconModule: () => false,
  isStudioWorkspaceIconModule: () => false,
});

function creatorModule(path: string): string {
  return `/repo/apps/web/src/domains/creator/${path}`;
}

describe("createStudioManualChunks", () => {
  it("keeps dependency-free Studio contracts in the shared micro-contract chunk", () => {
    expect(manualChunk(creatorModule("studio-story-beats.ts")))
      .toBe("studio-core-micro-contracts");
    expect(manualChunk(creatorModule("studio-element-model.ts")))
      .toBe("studio-core-micro-contracts");
  });

  it("keeps the insert-drag snap geometry with the placement contracts it feeds", () => {
    // 2026-10-16: 지연 로드되는 참 바가 이 순수 기하를 함께 가져오면서 모듈이 자기 공유 청크로 떼어졌다.
    for (const name of ["studio-object-insert-drag.ts", "studio-image-placement.ts", "studio-object-drag-snap.ts"]) {
      expect(manualChunk(creatorModule(name))).toBe("studio-placement-guide-contracts");
    }
  });

  it("keeps the lazy-surface skeleton leaf out of the Studio i18n loader chunk", () => {
    expect(manualChunk(creatorModule("StudioLazySurfaceFallback.tsx")))
      .toBe("studio-lazy-surface-fallback");
    expect(manualChunk(creatorModule("studio-router/useStudioI18nPriorityLoading.ts")))
      .toBeUndefined();
  });

  it("co-locates dependency-free editor leaves with their existing audited groups", () => {
    // 2026-10-15 번들 기준선 복구: 에디터 호스트가 정적으로 쓰고 지연 패널도 공유하는 무의존 잎
    // 모듈이 모듈마다 작은 공유 청크를 만들던 것을 기존 그룹에 합친다(정적·지연 폐포는 그대로).
    for (const leaf of [
      "studio-macro-recorder.ts",
      "studio-pathfinder-vector-engine.ts",
      "studio-advanced-fill-tap.ts",
      "studio-colordrop-gesture.ts",
      "studio-cuttoon-editor/runtime/useStudioMenuPopoverDismiss.ts",
      "studio-sfx-presets.ts",
    ]) {
      expect(manualChunk(creatorModule(leaf))).toBe("studio-editing-micro-models");
    }
    expect(manualChunk(creatorModule("drawing/studio-perspective-guide.ts")))
      .toBe("studio-placement-guide-contracts");
    expect(manualChunk(creatorModule("studio-quick-selection.ts")))
      .toBe("studio-selection-tools");
  });

  it("merges the tiny dependency-free editor leaves into the micro-model chunk", () => {
    // 2026-10-16: 모듈마다 따로 생기던 0.4~1.4 KiB 공유 청크(gzip 효율이 나쁘다)를 합친다.
    for (const leaf of [
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
    ]) {
      expect(manualChunk(creatorModule(leaf))).toBe("studio-editing-micro-models");
    }
  });

  it("keeps leaves that BG3D specialist closures import out of the Studio micro-model chunk", () => {
    // 합치면 BG3D 편집기 활성화·컷 일괄 처리 폐포가 이 묶음 전체(~46 KiB)를 끌어온다(crc32 는 압축 파일 쓰기가 쓴다).
    for (const leaf of ["bg3d/studio-bg3d-lens.ts", "bg3d/studio-bg3d-retained-owner.ts", "studio-crc32.ts"]) {
      expect(manualChunk(creatorModule(leaf))).toBeUndefined();
    }
  });

  it("does not merge leaves that hub or public pages also import", () => {
    // 허브·공개 페이지가 함께 쓰는 모듈을 Studio 묶음에 넣으면 그 경로가 Studio 청크를 끌어온다.
    for (const shared of [
      "publishing/showcase-links.ts",
      "creator-studio-links.ts",
      "studio-dialogue.ts",
      "ai/studio-ai-project-handoff.ts",
      "studio-diagnostic-redaction.ts",
    ]) {
      expect(manualChunk(creatorModule(shared))).toBeUndefined();
    }
  });

  it("keeps the quick-selection worker protocol and browser glue out of the eager selection chunk", () => {
    // 코어(순수 계산)만 묶음에 들어가고 Worker 클라이언트·프로토콜·브라우저 접착은 자기 경계를 유지한다.
    expect(manualChunk(creatorModule("studio-quick-selection-worker-client.ts"))).toBeUndefined();
    expect(manualChunk(creatorModule("studio-quick-selection-worker-protocol.ts"))).toBeUndefined();
    expect(manualChunk(creatorModule("studio-quick-selection-browser.ts"))).toBeUndefined();
    expect(manualChunk(creatorModule("studio-quick-selection.worker.ts"))).toBeUndefined();
  });

  it("does not color connected brush runtime graphs into the app entry closure", () => {
    expect(manualChunk(creatorModule("brush/studio-brush-pack-id.ts")))
      .toBeUndefined();
    expect(manualChunk(creatorModule("brush/studio-brush-selection.ts")))
      .toBeUndefined();
    expect(manualChunk(creatorModule("brush/studio-brush-engine-program-set.ts")))
      .toBeUndefined();
  });
});
