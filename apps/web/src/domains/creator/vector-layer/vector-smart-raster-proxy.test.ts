import { describe, expect, it } from "vitest";

import {
  VECTOR_LAYER_TYPE,
  VECTOR_SMART_RASTER_PROXY_TYPE,
  applyVectorSmartRasterWarp,
  computeVectorLayerRevisionDigest,
  createVectorLayer,
  createVectorSmartRasterProxy,
  inspectVectorSmartRasterProxySync,
  isVectorLayer,
  isVectorSmartRasterProxy,
  revertVectorSmartRasterProxy,
} from "./vector-layer-model";
import { pointsToVectorStroke } from "./vector-stroke-path";

function makeSampleVectorLayer(revision = 7) {
  const strokeA = pointsToVectorStroke(
    [
      { x: 10, y: 20, pressure: 0.8 },
      { x: 60, y: 20, pressure: 1 },
      { x: 110, y: 40, pressure: 0.6 },
    ],
    { baseWidth: 6, color: "#111111", id: "vec-a" },
  )!;
  const strokeB = pointsToVectorStroke(
    [
      { x: 40, y: 0, pressure: 0.7 },
      { x: 40, y: 80, pressure: 0.9 },
    ],
    { baseWidth: 4, color: "#2244cc", id: "vec-b" },
  )!;
  return createVectorLayer({
    id: "layer-lineart-1",
    name: "선화 벡터",
    strokes: [strokeA, strokeB],
    revision,
  });
}

describe("vector-smart-raster-proxy (비파괴 스마트 래스터 워프 프록시)", () => {
  it("리퀴파이 적용 시 원본 벡터 ID·리비전·스트로크를 파괴하지 않고 프록시를 생성한다", () => {
    const original = makeSampleVectorLayer(12);
    const warped = applyVectorSmartRasterWarp(original, {
      operation: {
        id: "op-liq-1",
        kind: "liquify",
        label: "리퀴파이 밀기",
        strength: 0.75,
        radiusPx: 24,
        appliedAtIso: "2026-11-23T04:00:00Z",
        params: { mode: "push", brushHardness: 0.6 },
      },
      rasterResolutionScale: 2,
    });

    expect(warped.type).toBe(VECTOR_LAYER_TYPE);
    expect(warped.id).toBe("layer-lineart-1");
    expect(warped.revision).toBe(12);
    expect(warped.strokes).toEqual(original.strokes);
    expect(original.smartRasterProxy).toBeUndefined();

    const proxy = warped.smartRasterProxy;
    expect(proxy).toBeDefined();
    expect(proxy!.kind).toBe(VECTOR_SMART_RASTER_PROXY_TYPE);
    expect(proxy!.sourceVectorLayerId).toBe("layer-lineart-1");
    expect(proxy!.sourceVectorRevision).toBe(12);
    expect(proxy!.sourceVectorDigest).toBe(computeVectorLayerRevisionDigest(original));
    expect(proxy!.activeWarpKinds).toEqual(["liquify"]);
    expect(proxy!.operations).toHaveLength(1);
    expect(proxy!.operations[0]?.kind).toBe("liquify");
    expect(proxy!.rasterResolutionScale).toBe(2);
    expect(proxy!.active).toBe(true);
    expect(proxy!.rasterBounds).not.toBeNull();
    expect(proxy!.rasterBounds!.minX).toBeLessThan(10);
    expect(proxy!.rasterBounds!.maxX).toBeGreaterThan(110);
    expect(isVectorSmartRasterProxy(proxy)).toBe(true);
    expect(isVectorLayer(warped)).toBe(true);
  });

  it("리퀴파이 → 스머지 → 퍼펫 워프를 연속 적용해도 최초 원본 벡터 ID·리비전·스냅샷을 보존한다", () => {
    const original = makeSampleVectorLayer(3);
    const step1 = applyVectorSmartRasterWarp(original, {
      proxyId: "proxy-fixed-1",
      operation: { id: "op-1", kind: "liquify", strength: 0.5, radiusPx: 10 },
    });
    const step2 = applyVectorSmartRasterWarp(step1, {
      operation: { id: "op-2", kind: "smudge", strength: 0.4, radiusPx: 16 },
    });
    const step3 = applyVectorSmartRasterWarp(step2, {
      operation: {
        id: "op-3",
        kind: "puppet-warp",
        strength: 0.9,
        radiusPx: 40,
        params: { pinCount: 5, meshRigid: true },
      },
    });

    const proxy = step3.smartRasterProxy!;
    expect(proxy.proxyId).toBe("proxy-fixed-1");
    expect(proxy.sourceVectorLayerId).toBe("layer-lineart-1");
    expect(proxy.sourceVectorRevision).toBe(3);
    expect(proxy.activeWarpKinds).toEqual(["liquify", "smudge", "puppet-warp"]);
    expect(proxy.operations.map((op) => op.id)).toEqual(["op-1", "op-2", "op-3"]);
    expect(proxy.sourceSnapshot.smartRasterProxy).toBeUndefined();
    expect(proxy.sourceSnapshot.strokes).toEqual(original.strokes);
    // 마지막 연산의 더 큰 radiusPx(40)만큼 래스터 경계가 확장된다.
    expect(proxy.rasterBounds!.minX).toBeLessThan(step1.smartRasterProxy!.rasterBounds!.minX);
  });

  it("1클릭 원본 벡터 복귀(revertVectorSmartRasterProxy)가 원본 ID·리비전·스트로크를 정확히 복원한다", () => {
    const original = makeSampleVectorLayer(9);
    const warped = applyVectorSmartRasterWarp(
      applyVectorSmartRasterWarp(original, {
        operation: { id: "op-1", kind: "smudge", strength: 0.6, radiusPx: 12 },
      }),
      {
        operation: { id: "op-2", kind: "puppet-warp", strength: 0.8, radiusPx: 20 },
      },
    );

    const reverted = revertVectorSmartRasterProxy(warped);
    expect(reverted).not.toBeNull();
    expect(reverted!.revertedFromProxyId).toBe(warped.smartRasterProxy!.proxyId);
    expect(reverted!.restoredVectorLayerId).toBe("layer-lineart-1");
    expect(reverted!.restoredRevision).toBe(9);
    expect(reverted!.discardedOperationCount).toBe(2);
    expect(reverted!.layer.smartRasterProxy).toBeUndefined();
    expect(reverted!.layer.id).toBe(original.id);
    expect(reverted!.layer.revision).toBe(9);
    expect(reverted!.layer.strokes).toEqual(original.strokes);
    expect(isVectorLayer(reverted!.layer)).toBe(true);

    // 프록시가 없는 일반 벡터 레이어에서 호출하면 null 반환(안전한 no-op)
    expect(revertVectorSmartRasterProxy(reverted!.layer)).toBeNull();
  });

  it("원본 벡터 레이어가 외부에서 수정되면 동기화 드리프트를 감지한다", () => {
    const original = makeSampleVectorLayer(4);
    const warped = applyVectorSmartRasterWarp(original, {
      operation: { id: "op-1", kind: "liquify", strength: 0.5 },
    });

    const synced = inspectVectorSmartRasterProxySync(warped);
    expect(synced).not.toBeNull();
    expect(synced!.inSync).toBe(true);

    const drifted = {
      ...warped,
      revision: 5,
      strokes: warped.strokes.slice(0, 1),
    };
    const driftStatus = inspectVectorSmartRasterProxySync(drifted);
    expect(driftStatus!.inSync).toBe(false);
    expect(driftStatus!.sourceRevision).toBe(4);
    expect(driftStatus!.currentRevision).toBe(5);
    expect(driftStatus!.sourceDigest).not.toBe(driftStatus!.currentDigest);
  });

  it("빈 벡터 레이어·배율 클램프·잘못된 워프 종류·역직렬화 가드를 안전하게 처리한다", () => {
    const empty = createVectorLayer({ id: "empty-vec", revision: 0 });
    const proxy = createVectorSmartRasterProxy(empty, {
      operation: { id: "op-empty", kind: "liquify", strength: 2.5 },
      rasterResolutionScale: 99,
    });
    expect(proxy.rasterBounds).toBeNull();
    expect(proxy.rasterResolutionScale).toBe(4);
    expect(proxy.operations[0]?.strength).toBe(1);

    expect(() =>
      createVectorSmartRasterProxy(empty, {
        operation: { id: "bad", kind: "unknown" as never },
      }),
    ).toThrow();

    expect(isVectorSmartRasterProxy(null)).toBe(false);
    expect(isVectorSmartRasterProxy({ ...proxy, sourceVectorRevision: -1 })).toBe(false);
    expect(isVectorLayer({ ...empty, revision: -2 })).toBe(false);
    expect(isVectorLayer({ ...empty, smartRasterProxy: { kind: "wrong" } })).toBe(false);
  });
});
