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
    ]) {
      expect(manualChunk(creatorModule(leaf))).toBe("studio-editing-micro-models");
    }
    expect(manualChunk(creatorModule("drawing/studio-perspective-guide.ts")))
      .toBe("studio-placement-guide-contracts");
    expect(manualChunk(creatorModule("studio-quick-selection.ts")))
      .toBe("studio-selection-tools");
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
