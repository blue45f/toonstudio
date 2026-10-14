import { describe, expect, it } from "vitest";

import type { LayerOccupancyEntry } from "../layer/studio-layer-occupancy";
import type { PagePresenceEntry } from "../production-hub/page-edit-lock-model";

import {
  COLLABORATION_SURFACES,
  classifySurfaceLockMode,
  evaluateSurfaceWriteAccess,
  resolveSurfaceLockPolicy,
  summarizeSurfacePresence,
} from "./engine-surface-lock-policy";

const PAGE = "page-1";
const T0 = new Date("2026-10-14T00:00:00.000Z");
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1_000);

function pageEntry(overrides: Partial<PagePresenceEntry> = {}): PagePresenceEntry {
  return {
    pageId: PAGE,
    actorId: "actor-a",
    displayName: "민지",
    mode: "editing",
    heartbeatAt: T0.toISOString(),
    ...overrides,
  };
}

function layerEntry(overrides: Partial<LayerOccupancyEntry> = {}): LayerOccupancyEntry {
  return {
    pageId: PAGE,
    layerId: "layer-1",
    actorId: "actor-a",
    displayName: "민지",
    claimedAt: T0.toISOString(),
    heartbeatAt: T0.toISOString(),
    lastInteractionAt: T0.toISOString(),
    ...overrides,
  };
}

/** 다른 사람(민지)이 페이지를 편집 중이고 layer-1도 점유 중인 상태. */
const othersBusy = {
  pagePresence: [pageEntry()],
  layerOccupancy: [layerEntry()],
};

describe("표면 판정 규칙 고정", () => {
  it("판정은 emitsStrokeOps 하나로만 한다 — 같은 이름이어도 값이 다르면 결과가 갈린다", () => {
    expect(classifySurfaceLockMode({ surfaceId: "x", emitsStrokeOps: true })).toBe("merge");
    expect(classifySurfaceLockMode({ surfaceId: "x", emitsStrokeOps: false })).toBe("guarded");
  });

  it("알려진 표면 고정표: 드로잉 캔버스만 병합, 검수 룸·공정 매트릭스는 가드", () => {
    expect(classifySurfaceLockMode(COLLABORATION_SURFACES.studioDrawingCanvas)).toBe("merge");
    expect(classifySurfaceLockMode(COLLABORATION_SURFACES.productionEpisodeReviewRoom)).toBe("guarded");
    expect(classifySurfaceLockMode(COLLABORATION_SURFACES.productionProcessMatrix)).toBe("guarded");
  });

  it("병합 정책은 잠금을 프레즌스로 강등하고 어떤 쓰기도 막지 않는다", () => {
    const policy = resolveSurfaceLockPolicy(COLLABORATION_SURFACES.studioDrawingCanvas);
    expect(policy.pageLockRole).toBe("presence-only");
    expect(policy.layerOccupancyRole).toBe("presence-and-warning");
    expect(policy.acquirePageLockAsGuard).toBe(false);
    expect(policy.showPageLockControls).toBe(false);
    expect(policy.blockWritesOnPageLock).toBe(false);
    expect(policy.blockWritesOnLayerOccupancy).toBe(false);
  });

  it("가드 정책은 페이지 잠금·레이어 점유 모두 쓰기 가드로 유지한다", () => {
    const policy = resolveSurfaceLockPolicy(COLLABORATION_SURFACES.productionEpisodeReviewRoom);
    expect(policy.pageLockRole).toBe("write-guard");
    expect(policy.layerOccupancyRole).toBe("write-guard");
    expect(policy.acquirePageLockAsGuard).toBe(true);
    expect(policy.showPageLockControls).toBe(true);
    expect(policy.blockWritesOnPageLock).toBe(true);
    expect(policy.blockWritesOnLayerOccupancy).toBe(true);
  });
});

describe("evaluateSurfaceWriteAccess — 병합 표면 강등", () => {
  it("남이 페이지 편집 중이어도 드로잉 표면에서는 허용하고 강등+경고로 알린다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.studioDrawingCanvas,
      ...othersBusy,
      pageId: PAGE,
      layerId: null,
      actorId: "actor-b",
      now: at(5),
    });
    expect(access.allowed).toBe(true);
    expect(access.blockedBy).toBeNull();
    // 원래 판정은 그대로 실려 근거가 남는다.
    expect(access.pageDecision.allowed).toBe(false);
    expect(access.pageDecision.reason).toBe("locked-by-other");
    expect(access.pageLockDowngraded).toBe(true);
    expect(access.warnings).toEqual([
      { kind: "page-co-editing", other: { actorId: "actor-a", displayName: "민지" } },
    ]);
  });

  it("남이 같은 레이어를 점유 중이어도 드로잉 표면에서는 허용하고 레이어 경고와 결합한다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.studioDrawingCanvas,
      pagePresence: [],
      layerOccupancy: othersBusy.layerOccupancy,
      pageId: PAGE,
      layerId: "layer-1",
      actorId: "actor-b",
      now: at(5),
    });
    expect(access.allowed).toBe(true);
    expect(access.layerEvaluation?.allowed).toBe(false);
    expect(access.layerOccupancyDowngraded).toBe(true);
    expect(access.warnings).toEqual([
      {
        kind: "layer-co-editing",
        other: { actorId: "actor-a", displayName: "민지" },
        layerId: "layer-1",
      },
    ]);
  });

  it("페이지·레이어가 모두 겹치면 경고가 둘 다 쌓이고 그래도 허용한다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.studioDrawingCanvas,
      ...othersBusy,
      pageId: PAGE,
      layerId: "layer-1",
      actorId: "actor-b",
      now: at(5),
    });
    expect(access.allowed).toBe(true);
    expect(access.warnings.map((warning) => warning.kind)).toEqual([
      "page-co-editing",
      "layer-co-editing",
    ]);
  });

  it("아무도 없으면 강등 없이 허용하고 경고도 없다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.studioDrawingCanvas,
      pagePresence: [],
      layerOccupancy: [],
      pageId: PAGE,
      layerId: "layer-1",
      actorId: "actor-b",
      now: at(5),
    });
    expect(access.allowed).toBe(true);
    expect(access.pageLockDowngraded).toBe(false);
    expect(access.layerOccupancyDowngraded).toBe(false);
    expect(access.warnings).toEqual([]);
  });

  it("내가 잠금 보유자·점유자면 강등으로 치지 않는다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.studioDrawingCanvas,
      ...othersBusy,
      pageId: PAGE,
      layerId: "layer-1",
      actorId: "actor-a",
      now: at(5),
    });
    expect(access.allowed).toBe(true);
    expect(access.pageLockDowngraded).toBe(false);
    expect(access.layerOccupancyDowngraded).toBe(false);
    expect(access.warnings).toEqual([]);
  });
});

describe("evaluateSurfaceWriteAccess — 가드 표면 유지 (회귀 방지)", () => {
  it("검수 룸에서는 남이 편집 중이면 페이지 잠금이 그대로 막는다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.productionEpisodeReviewRoom,
      ...othersBusy,
      pageId: PAGE,
      layerId: null,
      actorId: "actor-b",
      now: at(5),
    });
    expect(access.allowed).toBe(false);
    expect(access.blockedBy).toBe("page-lock");
    expect(access.pageLockDowngraded).toBe(false);
    expect(access.warnings).toEqual([]);
  });

  it("가드 표면에서 페이지가 비어 있어도 남의 레이어 점유는 막는다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.productionEpisodeReviewRoom,
      pagePresence: [],
      layerOccupancy: othersBusy.layerOccupancy,
      pageId: PAGE,
      layerId: "layer-1",
      actorId: "actor-b",
      now: at(5),
    });
    expect(access.allowed).toBe(false);
    expect(access.blockedBy).toBe("layer-occupancy");
  });

  it("가드 표면에서도 잠금이 비고 레이어가 비면 허용한다", () => {
    const access = evaluateSurfaceWriteAccess({
      surface: COLLABORATION_SURFACES.productionEpisodeReviewRoom,
      pagePresence: [],
      layerOccupancy: [],
      pageId: PAGE,
      layerId: "layer-1",
      actorId: "actor-b",
      now: at(5),
    });
    expect(access.allowed).toBe(true);
    expect(access.blockedBy).toBeNull();
  });
});

describe("summarizeSurfacePresence — (b) 레이어 점유와의 결합", () => {
  it("페이지 프레즌스와 레이어 점유를 한 요약으로 돌려준다", () => {
    const summary = summarizeSurfacePresence({
      surface: COLLABORATION_SURFACES.studioDrawingCanvas,
      pagePresence: [
        pageEntry(),
        pageEntry({ actorId: "actor-b", displayName: "준호", mode: "viewing", heartbeatAt: at(2).toISOString() }),
      ],
      layerOccupancy: othersBusy.layerOccupancy,
      pageId: PAGE,
      myLayerIds: ["layer-1"],
      actorId: "actor-b",
      now: at(5),
    });
    expect(summary.policy.mode).toBe("merge");
    expect(summary.pageLock.holder?.actorId).toBe("actor-a");
    expect(summary.pageLock.present).toHaveLength(2);
    expect(summary.layers).toHaveLength(1);
    expect(summary.layers[0]?.holder.actorId).toBe("actor-a");
    expect(summary.layerHolder("layer-1")?.actorId).toBe("actor-a");
    expect(summary.layerHolder("layer-9")).toBeNull();
    // 내 작업 맥락 레이어가 남에게 넘어간 경고가 (b) 규칙 그대로 도출된다.
    expect(summary.myLayerWarnings).toEqual([
      { layerId: "layer-1", kind: "my-layer-taken", other: expect.objectContaining({ actorId: "actor-a" }) },
    ]);
  });

  it("만료된 프레즌스·점유는 요약에서 사라진다(TTL은 원 모델 규칙을 따른다)", () => {
    const summary = summarizeSurfacePresence({
      surface: COLLABORATION_SURFACES.studioDrawingCanvas,
      pagePresence: [pageEntry({ heartbeatAt: at(-200).toISOString() })],
      layerOccupancy: [layerEntry({ heartbeatAt: at(-200).toISOString() })],
      pageId: PAGE,
      myLayerIds: ["layer-1"],
      actorId: "actor-b",
      now: at(5),
    });
    expect(summary.pageLock.holder).toBeNull();
    expect(summary.layers).toEqual([]);
    expect(summary.myLayerWarnings).toEqual([]);
  });
});
