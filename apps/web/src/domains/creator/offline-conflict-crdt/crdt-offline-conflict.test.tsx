// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n";

import {
  compareCausality,
  compareHlc,
  createHlc,
  createVectorClock,
  incrementVectorClock,
  mergeVectorClocks,
  parseHlc,
  receiveHlc,
  serializeHlc,
  tickHlc,
} from "./hlc-vector-clock";
import {
  applyConflictResolution,
  computeBoundsOverlapRatio,
  createRasterTileDelta,
  fnv1a64Hex,
  makeTileKey,
  mergeCrdtStates,
  mergeOfflineDocumentStates,
  sealOfflineDocumentDelta,
  verifyManifestIntegrity,
  type OfflineDocumentDelta,
  type OfflineLayerMeta,
  type OfflineSpeechBubble,
  type RasterTileDelta,
  type TileStrokeOp,
} from "./tile-layer-crdt-merger";
import { OfflineConflictResolverPanel } from "./OfflineConflictResolverPanel";
import { StudioOfflinePanel } from "../offline/StudioOfflinePanel";

const offlineMocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  prepare: vi.fn(),
  persist: vi.fn(),
  connectivity: {
    browserOnline: false,
    serverReachable: false,
    checking: false,
    mode: "offline" as "online" | "reconnecting" | "server-unavailable" | "offline",
    serverAvailable: false,
    localOnly: true,
    lastCheckedAt: 1,
    consecutiveFailures: 2,
  },
}));

vi.mock("../offline/studio-offline-client", () => ({
  inspectStudioOfflineDevice: offlineMocks.inspect,
  prepareLoadedStudioOfflineResources: offlineMocks.prepare,
  requestStudioPersistentStorage: offlineMocks.persist,
}));

vi.mock("../offline/use-studio-connectivity", () => ({
  useStudioConnectivity: () => offlineMocks.connectivity,
}));

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeStroke(
  strokeId: string,
  deviceId: string,
  hlc: ReturnType<typeof createHlc>,
  bounds = { x: 16, y: 16, width: 96, height: 96 },
  pointCount = 32,
): TileStrokeOp {
  return {
    strokeId,
    deviceId,
    brushId: "g-pen-pro",
    pointCount,
    bounds,
    hlc,
    opHash: fnv1a64Hex(`${strokeId}:${deviceId}:${pointCount}:${bounds.x}:${bounds.y}`),
  };
}

function buildThreeWayFixture(): {
  readonly base: OfflineDocumentDelta;
  readonly local: OfflineDocumentDelta;
  readonly remote: OfflineDocumentDelta;
} {
  const t0 = 1_764_100_000_000;
  const baseHlc = createHlc("device-a", t0, 0);
  const baseVc = createVectorClock({ "device-a": 1, "device-b": 1 });
  const sharedStroke = makeStroke("s-base", "device-a", baseHlc, { x: 10, y: 10, width: 80, height: 80 });

  const baseLayer1: OfflineLayerMeta = {
    layerId: "L1",
    name: "선화",
    visible: true,
    opacity: 1,
    blendMode: "normal",
    zOrder: 1,
    locked: false,
    hlc: baseHlc,
    vectorClock: baseVc,
  };
  const baseLayer2: OfflineLayerMeta = {
    layerId: "L2",
    name: "배경",
    visible: true,
    opacity: 1,
    blendMode: "normal",
    zOrder: 0,
    locked: false,
    hlc: baseHlc,
    vectorClock: baseVc,
  };
  const baseBubble: OfflineSpeechBubble = {
    bubbleId: "B1",
    layerId: "L1",
    text: "초안 대사",
    x: 100,
    y: 120,
    width: 160,
    height: 80,
    fontSize: 15,
    style: "speech",
    hlc: baseHlc,
    vectorClock: baseVc,
  };

  const base = sealOfflineDocumentDelta({
    documentId: "doc-crdt-1",
    deviceId: "device-a",
    deviceLabel: "Desktop",
    hlc: baseHlc,
    vectorClock: baseVc,
    layers: { L1: baseLayer1, L2: baseLayer2 },
    tiles: {
      [makeTileKey("L1", 0, 0)]: createRasterTileDelta({
        layerId: "L1",
        tileX: 0,
        tileY: 0,
        strokes: [sharedStroke],
        hlc: baseHlc,
        vectorClock: baseVc,
      }),
    },
    bubbles: { B1: baseBubble },
  });

  const localHlc = tickHlc(baseHlc, t0 + 5_000);
  const localVc = incrementVectorClock(baseVc, "device-a");
  const localStrokeConflict = makeStroke("s-local-1", "device-a", localHlc, { x: 40, y: 40, width: 100, height: 100 });
  const localStrokeAuto = makeStroke("s-local-2", "device-a", localHlc, { x: 10, y: 20, width: 120, height: 90 });

  const local = sealOfflineDocumentDelta({
    documentId: base.documentId,
    deviceId: "device-a",
    deviceLabel: "Desktop",
    hlc: localHlc,
    vectorClock: localVc,
    layers: {
      ...base.layers,
      L1: {
        ...baseLayer1,
        name: "선화-최종",
        hlc: localHlc,
        vectorClock: localVc,
        fieldClocks: { ...base.layers["L1"]?.fieldClocks, name: localHlc },
      },
    },
    tiles: {
      ...base.tiles,
      [makeTileKey("L1", 0, 0)]: createRasterTileDelta({
        layerId: "L1",
        tileX: 0,
        tileY: 0,
        strokes: [sharedStroke, localStrokeConflict],
        hlc: localHlc,
        vectorClock: localVc,
      }),
      [makeTileKey("L1", 1, 0)]: createRasterTileDelta({
        layerId: "L1",
        tileX: 1,
        tileY: 0,
        strokes: [localStrokeAuto],
        hlc: localHlc,
        vectorClock: localVc,
      }),
    },
    bubbles: {
      B1: {
        ...baseBubble,
        text: "로컬 수정 대사",
        hlc: localHlc,
        vectorClock: localVc,
        fieldClocks: { ...base.bubbles["B1"]?.fieldClocks, text: localHlc },
      },
    },
  });

  const remoteHlc = createHlc("device-b", t0 + 7_000, 0);
  const remoteVc = incrementVectorClock(baseVc, "device-b");
  const remoteStrokeConflict = makeStroke("s-remote-1", "device-b", remoteHlc, { x: 90, y: 40, width: 100, height: 100 });
  const remoteStrokeAuto = makeStroke("s-remote-2", "device-b", remoteHlc, { x: 20, y: 30, width: 140, height: 110 });

  const remote = sealOfflineDocumentDelta({
    documentId: base.documentId,
    deviceId: "device-b",
    deviceLabel: "iPad",
    hlc: remoteHlc,
    vectorClock: remoteVc,
    layers: {
      ...base.layers,
      L1: {
        ...baseLayer1,
        opacity: 0.75,
        hlc: remoteHlc,
        vectorClock: remoteVc,
        fieldClocks: { ...base.layers["L1"]?.fieldClocks, opacity: remoteHlc },
      },
    },
    tiles: {
      ...base.tiles,
      [makeTileKey("L1", 0, 0)]: createRasterTileDelta({
        layerId: "L1",
        tileX: 0,
        tileY: 0,
        strokes: [sharedStroke, remoteStrokeConflict],
        hlc: remoteHlc,
        vectorClock: remoteVc,
      }),
      [makeTileKey("L2", 0, 1)]: createRasterTileDelta({
        layerId: "L2",
        tileX: 0,
        tileY: 1,
        strokes: [remoteStrokeAuto],
        hlc: remoteHlc,
        vectorClock: remoteVc,
      }),
    },
    bubbles: {
      B1: {
        ...baseBubble,
        x: 240,
        hlc: remoteHlc,
        vectorClock: remoteVc,
        fieldClocks: { ...base.bubbles["B1"]?.fieldClocks, x: remoteHlc },
      },
    },
  });

  return { base, local, remote };
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  vi.clearAllMocks();
  offlineMocks.connectivity = {
    browserOnline: false,
    serverReachable: false,
    checking: false,
    mode: "offline",
    serverAvailable: false,
    localOnly: true,
    lastCheckedAt: 1,
    consecutiveFailures: 2,
  };
  offlineMocks.inspect.mockResolvedValue({
    online: false,
    navigationFallback: false,
    supported: true,
    controlled: true,
    offlineReady: true,
    buildId: "build-crdt",
    persisted: true,
    usage: 20,
    quota: 100,
  });
  offlineMocks.prepare.mockResolvedValue({
    schema: 1,
    buildId: "build-crdt",
    checked: 5,
    cached: 5,
    downloadedBytes: 0,
    missing: [],
    complete: true,
  });
  offlineMocks.persist.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

describe("HLC & Vector Clock 엔진", () => {
  it("물리 시계가 역행해도 tickHlc가 엄격한 단조 증가를 유지한다", () => {
    const start = createHlc("desktop-mac", 10_000, 0);
    const sameWall = tickHlc(start, 10_000);
    const backwardWall = tickHlc(sameWall, 8_000);
    const forwardWall = tickHlc(backwardWall, 10_500);

    expect(sameWall).toEqual({ physicalMs: 10_000, logical: 1, deviceId: "desktop-mac" });
    expect(backwardWall).toEqual({ physicalMs: 10_000, logical: 2, deviceId: "desktop-mac" });
    expect(forwardWall).toEqual({ physicalMs: 10_500, logical: 0, deviceId: "desktop-mac" });
    expect(compareHlc(sameWall, start)).toBe(1);
    expect(compareHlc(backwardWall, sameWall)).toBe(1);
    expect(compareHlc(forwardWall, backwardWall)).toBe(1);
  });

  it("receiveHlc는 Kulkarni 규약의 모든 분기에서 인과 순서를 보장하고 직렬화 왕복이 일치한다", () => {
    const local = createHlc("desktop", 20_000, 3);
    const remoteEqual = createHlc("ipad", 20_000, 5);
    const r1 = receiveHlc(local, remoteEqual, 19_000);
    expect(r1).toEqual({ physicalMs: 20_000, logical: 6, deviceId: "desktop" });

    const remoteAhead = createHlc("ipad", 25_000, 2);
    const r2 = receiveHlc(local, remoteAhead, 21_000);
    expect(r2).toEqual({ physicalMs: 25_000, logical: 3, deviceId: "desktop" });

    const r3 = receiveHlc(local, remoteAhead, 30_000);
    expect(r3).toEqual({ physicalMs: 30_000, logical: 0, deviceId: "desktop" });

    const serialized = serializeHlc(r2);
    expect(parseHlc(serialized)).toEqual(r2);
    expect(parseHlc("invalid-hlc")).toBeNull();
  });

  it("동일 물리·논리 시각일 때 deviceId 사전순으로 결정론적 타이브레이크를 수행한다", () => {
    const a = createHlc("alpha-pad", 50_000, 4);
    const b = createHlc("beta-mac", 50_000, 4);
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, a)).toBe(1);
    expect(compareHlc(a, a)).toBe(0);
  });

  it("Vector Clock 인과 관계(before/after/equal/concurrent)와 결합을 정확히 판정한다", () => {
    const base = createVectorClock({ a: 1, b: 1, c: 0 });
    const aOnly = incrementVectorClock(base, "a");
    const bOnly = incrementVectorClock(base, "b");
    const merged = mergeVectorClocks(aOnly, bOnly);

    expect(compareCausality(base, { a: 1, b: 1 })).toBe("equal");
    expect(compareCausality(base, aOnly)).toBe("before");
    expect(compareCausality(aOnly, base)).toBe("after");
    expect(compareCausality(aOnly, bOnly)).toBe("concurrent");
    expect(compareCausality(aOnly, merged)).toBe("before");
    expect(compareCausality(bOnly, merged)).toBe("before");
    expect(merged).toEqual({ a: 2, b: 2 });
  });
});

describe("FNV-1a 64-bit 매니페스트 무결성 검증", () => {
  it("표준 FNV-1a 64-bit 테스트 벡터와 일치한다", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("foobar")).toBe("85944171f73967e8");
  });

  it("스냅샷의 스트로크·타일 해시·체크섬 변조를 즉시 감지한다", () => {
    const { local } = buildThreeWayFixture();
    expect(verifyManifestIntegrity(local).valid).toBe(true);

    // 1) 타일 내부 스트로크 변조
    const targetKey = makeTileKey("L1", 0, 0);
    const targetTile = local.tiles[targetKey] as RasterTileDelta;
    const tamperedStrokeDoc: OfflineDocumentDelta = {
      ...local,
      tiles: {
        ...local.tiles,
        [targetKey]: {
          ...targetTile,
          strokes: targetTile.strokes.map((s, idx) =>
            idx === 0 ? { ...s, opHash: "00000000deadbeef" } : s,
          ),
        },
      },
    };
    const strokeReport = verifyManifestIntegrity(tamperedStrokeDoc);
    expect(strokeReport.valid).toBe(false);
    expect(strokeReport.corruptedTileKeys).toContain(targetKey);
    expect(strokeReport.reasons).toContain(`tile_hash_mismatch:${targetKey}`);
    expect(strokeReport.reasons).toContain("manifest_checksum_mismatch");

    // 2) 매니페스트 체크섬 변조
    const tamperedChecksumDoc: OfflineDocumentDelta = {
      ...local,
      manifestChecksum: "ffffffffffffffff",
    };
    const checksumReport = verifyManifestIntegrity(tamperedChecksumDoc);
    expect(checksumReport.valid).toBe(false);
    expect(checksumReport.reasons).toContain("manifest_checksum_mismatch");
  });
});

describe("3-Way 타일·레이어 CRDT 병합 및 4가지 충돌 해결 전략", () => {
  it("비충돌 타일·레이어·말풍선은 자동 병합하고 동시 수정 타일만 정밀 충돌로 분류한다", () => {
    const { base, local, remote } = buildThreeWayFixture();
    const plan = mergeOfflineDocumentStates(base, local, remote);

    expect(plan.integrityReport.allValid).toBe(true);
    expect(plan.autoMergedTiles).toEqual([makeTileKey("L1", 1, 0), makeTileKey("L2", 0, 1)]);
    expect(plan.autoMergedLayers).toContain("L1");
    expect(plan.autoMergedBubbles).toContain("B1");
    expect(plan.autoMergedCount).toBe(4);

    // 필드 단위 LWW로 레이어 이름(로컬) + 불투명도(원격), 말풍선 텍스트(로컬) + X좌표(원격) 모두 무손실 공존
    expect(plan.draftMergedDocument.layers["L1"]?.name).toBe("선화-최종");
    expect(plan.draftMergedDocument.layers["L1"]?.opacity).toBe(0.75);
    expect(plan.draftMergedDocument.bubbles["B1"]?.text).toBe("로컬 수정 대사");
    expect(plan.draftMergedDocument.bubbles["B1"]?.x).toBe(240);

    // 동일 타일 (L1, 0, 0) 동시 수정만 충돌로 분류
    expect(plan.conflicts).toHaveLength(1);
    const conflict = plan.conflicts[0]!;
    expect(conflict.tileKey).toBe(makeTileKey("L1", 0, 0));
    expect(conflict.localStrokeCount).toBe(1);
    expect(conflict.remoteStrokeCount).toBe(1);
    expect(conflict.recommendedStrategy).toBe("stack-as-new-layer");
    // (40,40,100,100) vs (90,40,100,100) => 교집합 50x100=5000, 합집합 15000 => 1/3 ≈ 0.3333
    expect(conflict.overlapRatio).toBeCloseTo(1 / 3, 3);
    expect(computeBoundsOverlapRatio({ x: 0, y: 0, width: 20, height: 20 }, { x: 100, y: 100, width: 20, height: 20 })).toBe(0);
  });

  it("4가지 충돌 해결 전략(stack-as-new-layer, keep-local, keep-remote, keep-newer-hlc)을 정확히 실행한다", () => {
    const { base, local, remote } = buildThreeWayFixture();
    const plan = mergeOfflineDocumentStates(base, local, remote);
    const conflictId = plan.conflicts[0]!.conflictId;

    // 1) 기본 추천 stack-as-new-layer: 100% 무손실 (유실 0획)
    const stacked = applyConflictResolution(plan, { [conflictId]: "stack-as-new-layer" });
    expect(stacked.lostStrokeCount).toBe(0);
    expect(stacked.preservedStrokeCount).toBe(stacked.totalUniqueInputStrokes);
    expect(stacked.createdLayers).toHaveLength(1);
    expect(stacked.manifestIntegrity.valid).toBe(true);
    const auxLayerId = stacked.createdLayers[0]!.layerId;
    expect(stacked.resolvedDocument.tiles[makeTileKey(auxLayerId, 0, 0)]?.strokes.map((s) => s.strokeId)).toEqual(["s-remote-1"]);

    // 2) keep-local
    const keptLocal = applyConflictResolution(plan, { [conflictId]: "keep-local" });
    expect(keptLocal.resolvedDocument.tiles[makeTileKey("L1", 0, 0)]?.strokes.map((s) => s.strokeId)).toEqual(["s-base", "s-local-1"]);
    expect(keptLocal.manifestIntegrity.valid).toBe(true);

    // 3) keep-remote
    const keptRemote = applyConflictResolution(plan, { [conflictId]: "keep-remote" });
    expect(keptRemote.resolvedDocument.tiles[makeTileKey("L1", 0, 0)]?.strokes.map((s) => s.strokeId)).toEqual(["s-base", "s-remote-1"]);
    expect(keptRemote.manifestIntegrity.valid).toBe(true);

    // 4) keep-newer-hlc: 인자 순서를 뒤바꿔도 동일한 승자 선택
    const newerAB = applyConflictResolution(plan, { [conflictId]: "keep-newer-hlc" });
    const planSwapped = mergeOfflineDocumentStates(base, remote, local);
    const newerBA = applyConflictResolution(planSwapped, { [conflictId]: "keep-newer-hlc" });
    expect(newerAB.resolvedDocument.tiles[makeTileKey("L1", 0, 0)]?.tileHash)
      .toBe(newerBA.resolvedDocument.tiles[makeTileKey("L1", 0, 0)]?.tileHash);
    expect(newerAB.resolvedDocument.tiles[makeTileKey("L1", 0, 0)]?.strokes.map((s) => s.strokeId))
      .toEqual(["s-base", "s-remote-1"]);
  });

  it("인과 선후(before/after) 관계인 타일 수정은 충돌로 오탐하지 않고 자동 병합한다", () => {
    const { base, local } = buildThreeWayFixture();
    const newerHlc = tickHlc(local.hlc, local.hlc.physicalMs + 3_000);
    const causalRemoteVc = incrementVectorClock(local.vectorClock, "device-b");
    const causalStroke = makeStroke("s-causal-3", "device-b", newerHlc);
    const localTile = local.tiles[makeTileKey("L1", 0, 0)]!;

    const causalRemote = sealOfflineDocumentDelta({
      ...local,
      deviceId: "device-b",
      deviceLabel: "iPad",
      hlc: newerHlc,
      vectorClock: causalRemoteVc,
      tiles: {
        ...local.tiles,
        [makeTileKey("L1", 0, 0)]: createRasterTileDelta({
          layerId: "L1",
          tileX: 0,
          tileY: 0,
          strokes: [...localTile.strokes, causalStroke],
          hlc: newerHlc,
          vectorClock: causalRemoteVc,
        }),
      },
    });

    const plan = mergeOfflineDocumentStates(base, local, causalRemote);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.autoMergedTiles).toContain(makeTileKey("L1", 0, 0));
  });
});

describe("수학적 CRDT 법칙 및 100회 다중 기기 동시 오프라인 퍼즈 검증", () => {
  it("교환법칙·결합법칙·멱등성을 엄밀히 만족한다", () => {
    const { base, local: stateA, remote: stateB } = buildThreeWayFixture();
    const cHlc = createHlc("device-c", base.hlc.physicalMs + 6_000, 1);
    const cVc = incrementVectorClock(base.vectorClock, "device-c");
    const stateC = sealOfflineDocumentDelta({
      ...base,
      deviceId: "device-c",
      deviceLabel: "Tablet C",
      hlc: cHlc,
      vectorClock: cVc,
      tiles: {
        ...base.tiles,
        [makeTileKey("L1", 0, 0)]: createRasterTileDelta({
          layerId: "L1",
          tileX: 0,
          tileY: 0,
          strokes: [
            ...(base.tiles[makeTileKey("L1", 0, 0)]?.strokes ?? []),
            makeStroke("s-c-1", "device-c", cHlc, { x: 60, y: 80, width: 70, height: 70 }),
          ],
          hlc: cHlc,
          vectorClock: cVc,
        }),
      },
    });

    // 1) 교환법칙: merge(A, B) == merge(B, A)
    const ab = mergeCrdtStates(stateA, stateB);
    const ba = mergeCrdtStates(stateB, stateA);
    expect(ab).toEqual(ba);
    expect(ab.manifestChecksum).toBe(ba.manifestChecksum);

    // 2) 결합법칙: merge(merge(A, B), C) == merge(A, merge(B, C))
    const abThenC = mergeCrdtStates(mergeCrdtStates(stateA, stateB), stateC);
    const aThenBc = mergeCrdtStates(stateA, mergeCrdtStates(stateB, stateC));
    expect(abThenC).toEqual(aThenBc);
    expect(abThenC.manifestChecksum).toBe(aThenBc.manifestChecksum);

    // 3) 멱등성: merge(A, A) == A
    const aa = mergeCrdtStates(stateA, stateA);
    expect(aa).toEqual(stateA);
    expect(aa.manifestChecksum).toBe(stateA.manifestChecksum);

    // 3-Way draftMergedDocument 역시 교환·멱등
    expect(mergeOfflineDocumentStates(base, stateA, stateB).draftMergedDocument)
      .toEqual(mergeOfflineDocumentStates(base, stateB, stateA).draftMergedDocument);
    expect(mergeOfflineDocumentStates(base, stateA, stateA).conflicts).toHaveLength(0);
  });

  it("100회 무작위 다중 기기 동시 오프라인 편집 퍼즈 테스트에서 스트로크 유실 0건과 수렴 일치를 증명한다", () => {
    const rand = createMulberry32(20261123);
    const devicePool = ["desktop-mac", "ipad-pro", "surface-studio", "linux-pen"] as const;
    const layerPool = ["layer-ink", "layer-color", "layer-fx"] as const;
    let totalFuzzStrokesVerified = 0;

    for (let iter = 0; iter < 100; iter += 1) {
      const baseMs = 1_765_000_000_000 + iter * 100_000;
      const baseHlc = createHlc("desktop-mac", baseMs, 0);
      const baseVc = createVectorClock({ "desktop-mac": 1 });

      const baseLayers: Record<string, OfflineLayerMeta> = {};
      for (let li = 0; li < layerPool.length; li += 1) {
        const lid = layerPool[li]!;
        baseLayers[lid] = {
          layerId: lid,
          name: lid,
          visible: true,
          opacity: 1,
          blendMode: "normal",
          zOrder: li,
          locked: false,
          hlc: baseHlc,
          vectorClock: baseVc,
        };
      }

      const baseStroke = makeStroke(`iter${iter}-base`, "desktop-mac", baseHlc);
      const baseDoc = sealOfflineDocumentDelta({
        documentId: `fuzz-doc-${iter}`,
        deviceId: "desktop-mac",
        deviceLabel: "Desktop",
        hlc: baseHlc,
        vectorClock: baseVc,
        layers: baseLayers,
        tiles: {
          [makeTileKey("layer-ink", 0, 0)]: createRasterTileDelta({
            layerId: "layer-ink",
            tileX: 0,
            tileY: 0,
            strokes: [baseStroke],
            hlc: baseHlc,
            vectorClock: baseVc,
          }),
        },
        bubbles: {},
      });

      const deviceCount = 2 + Math.floor(rand() * 3); // 2..4대
      const replicas: OfflineDocumentDelta[] = [];
      const expectedStrokeIds = new Set<string>([baseStroke.strokeId]);

      for (let d = 0; d < deviceCount; d += 1) {
        const deviceId = devicePool[d]!;
        let hlc = createHlc(deviceId, baseMs + 100 + Math.floor(rand() * 10_000), 0);
        let vc = baseVc;
        const tileStrokes = new Map<string, TileStrokeOp[]>([
          [makeTileKey("layer-ink", 0, 0), [baseStroke]],
        ]);
        const strokeCount = 2 + Math.floor(rand() * 5);

        for (let s = 0; s < strokeCount; s += 1) {
          hlc = tickHlc(hlc, hlc.physicalMs + Math.floor(rand() * 500));
          vc = incrementVectorClock(vc, deviceId);
          const layerId = layerPool[Math.floor(rand() * layerPool.length)]!;
          // 50%는 충돌 핫스팟 (0, 0), 나머지는 분산 타일 (0..2, 0..1)
          const tileX = rand() < 0.5 ? 0 : Math.floor(rand() * 3);
          const tileY = rand() < 0.5 ? 0 : Math.floor(rand() * 2);
          const key = makeTileKey(layerId, tileX, tileY);
          const stroke = makeStroke(
            `iter${iter}-${deviceId}-s${s}`,
            deviceId,
            hlc,
            {
              x: Math.floor(rand() * 180),
              y: Math.floor(rand() * 180),
              width: 24 + Math.floor(rand() * 72),
              height: 24 + Math.floor(rand() * 72),
            },
            8 + Math.floor(rand() * 80),
          );
          expectedStrokeIds.add(stroke.strokeId);
          const existing = tileStrokes.get(key) ?? [];
          tileStrokes.set(key, [...existing, stroke]);
        }

        const tiles: Record<string, RasterTileDelta> = {};
        for (const [key, strokes] of tileStrokes.entries()) {
          const [lid, txText, tyText] = key.split(":");
          tiles[key] = createRasterTileDelta({
            layerId: lid ?? "layer-ink",
            tileX: Number(txText ?? 0),
            tileY: Number(tyText ?? 0),
            strokes,
            hlc,
            vectorClock: vc,
          });
        }

        replicas.push(sealOfflineDocumentDelta({
          documentId: baseDoc.documentId,
          deviceId,
          deviceLabel: deviceId,
          hlc,
          vectorClock: vc,
          layers: baseLayers,
          tiles,
          bubbles: {},
        }));
      }

      // 1) 정방향 병합 vs 역방향 병합의 완전 수렴 + 유실 0건
      const forwardFold = replicas.reduce((acc, next) => mergeCrdtStates(acc, next));
      const reverseFold = [...replicas].reverse().reduce((acc, next) => mergeCrdtStates(acc, next));
      expect(forwardFold.manifestChecksum).toBe(reverseFold.manifestChecksum);
      expect(verifyManifestIntegrity(forwardFold).valid).toBe(true);

      const foldedStrokeIds = new Set<string>();
      for (const tile of Object.values(forwardFold.tiles)) {
        for (const stroke of tile.strokes) foldedStrokeIds.add(stroke.strokeId);
      }
      expect(foldedStrokeIds.size).toBe(expectedStrokeIds.size);
      for (const id of expectedStrokeIds) {
        expect(foldedStrokeIds.has(id)).toBe(true);
      }

      // 2) 첫 두 기기 3-Way 병합 + 기본 무손실 stack-as-new-layer: 유실 0건 + 무결성 통과
      const plan = mergeOfflineDocumentStates(baseDoc, replicas[0]!, replicas[1]!);
      const resolved = applyConflictResolution(plan);
      expect(resolved.lostStrokeCount).toBe(0);
      expect(resolved.preservedStrokeCount).toBe(resolved.totalUniqueInputStrokes);
      expect(resolved.manifestIntegrity.valid).toBe(true);

      totalFuzzStrokesVerified += expectedStrokeIds.size;
    }

    expect(totalFuzzStrokesVerified).toBeGreaterThan(500);
  });
});

describe("OfflineConflictResolverPanel UI 및 StudioOfflinePanel 지연 마운트", () => {
  it("자동 병합 타일 배지·충돌 타일 카드·원클릭 무손실 레이어 보존·무결성 해시를 표시한다", () => {
    const onResolved = vi.fn();
    render(<OfflineConflictResolverPanel connectivityMode="offline" localOnly onResolved={onResolved} />);

    expect(screen.getByText(/다중 기기 CRDT 충돌 해결/u)).toBeTruthy();
    expect(screen.getByText(/자동 병합 완료/u)).toBeTruthy();
    expect(screen.getByText(/layer-ink \(1, 0\)/u)).toBeTruthy();
    expect(screen.getByText(/layer-bg \(0, 1\)/u)).toBeTruthy();
    expect(screen.getByText(/스냅샷 무결성 확인 완료/u)).toBeTruthy();

    const hashNode = document.querySelector('[data-crdt-manifest-hash="true"]');
    expect(hashNode?.textContent).toMatch(/^[0-9a-f]{16}$/u);

    const preserveBtn = screen.getByRole("button", { name: "두 기기 작업 모두 무손실 레이어 보존" });
    fireEvent.click(preserveBtn);

    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/유실 0획/u)).toBeTruthy();
    expect(screen.getByText(/생성된 보존 레이어:/u)).toBeTruthy();
  });

  it("변조 감지 점검 시 무결성 경고를 표시하고 복원할 수 있다", () => {
    render(<OfflineConflictResolverPanel />);
    const tamperBtn = screen.getByRole("button", { name: "변조 감지 점검" });
    fireEvent.click(tamperBtn);

    expect(screen.getByText(/무결성 불일치 감지/u)).toBeTruthy();
    expect(screen.getByText(/변조 감지:/u)).toBeTruthy();
    const preserveBtn = screen.getByRole("button", {
      name: "두 기기 작업 모두 무손실 레이어 보존",
    }) as HTMLButtonElement;
    expect(preserveBtn.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "정상 스냅샷 복원" }));
    expect(screen.getByText(/스냅샷 무결성 확인 완료/u)).toBeTruthy();
  });

  it("영어(en) 로케일에서 한글이 0자이고 모든 제어가 영어로 렌더링된다", () => {
    useI18n.setState({ lang: "en" });
    const { container } = render(<OfflineConflictResolverPanel connectivityMode="offline" localOnly />);

    expect(screen.getByText("Multi-device CRDT conflict merge")).toBeTruthy();
    const preserveBtn = screen.getByRole("button", {
      name: "Preserve both devices on lossless layers",
    });
    expect(container.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(preserveBtn);
    expect(screen.getByText(/0 lost/u)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[가-힣]/u);
  });

  it("StudioOfflinePanel은 접힌 상태에서는 충돌 해결기를 마운트하지 않고 details 펼침 시 지연 마운트한다", async () => {
    const view = render(<StudioOfflinePanel />);
    await screen.findByText("오프라인 모드 · 로컬 작업 중");

    const details = view.container.querySelector("details");
    expect(details).toBeTruthy();
    expect(details?.className).toContain("rounded-full");
    expect(details?.className).toContain("open:rounded-2xl");
    expect(view.container.querySelector('[data-crdt-conflict-resolver="true"]')).toBeNull();

    if (details) {
      details.open = true;
      fireEvent(details, new Event("toggle"));
    }

    expect(await screen.findByText("다중 기기 CRDT 충돌 해결")).toBeTruthy();
    expect(
      await screen.findByRole("button", { name: "두 기기 작업 모두 무손실 레이어 보존" }),
    ).toBeTruthy();
  });
});
