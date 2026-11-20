import { describe, expect, it } from "vitest";
import {
  buildLineArtRibbonDrawCalls,
  buildStyleBuilderStrokeAtlas,
  chainProjected3dEdges,
  createDefaultLineArtModifierStackConfig,
  deserializeStyleBuilderAtlas,
  deterministicSpatialNoise,
  evaluateLineArtModifierStack,
  selectBestAtlasBucket,
  serializeStyleBuilderAtlas,
  toVectorLayerStrokes,
  type CreatorStrokeSample,
  type Projected3dEdgeSegment,
} from "./studio-lt-style-builder-edge-atlas";

function makeCreatorStroke(lengthPx: number, peakPressure = 0.9): readonly CreatorStrokeSample[] {
  return [
    { x: 0, y: 0, pressure01: 0.25, alpha01: 0.7 },
    { x: lengthPx * 0.35, y: 1.5, pressure01: peakPressure, alpha01: 1.0 },
    { x: lengthPx * 0.75, y: -1.0, pressure01: peakPressure * 0.85, alpha01: 0.95 },
    { x: lengthPx, y: 0, pressure01: 0.2, alpha01: 0.65 },
  ];
}

describe("studio-lt-style-builder-edge-atlas", () => {
  it("3~5개 길이 버킷 스트로크로 아틀라스를 구축하고 직렬화 왕복을 검증한다", () => {
    expect(() =>
      buildStyleBuilderStrokeAtlas({
        id: "too-few",
        name: "부족한 버킷",
        strokesByBucket: {
          32: makeCreatorStroke(32),
          64: makeCreatorStroke(64),
        },
      }),
    ).toThrow(/최소 3개/);

    const atlas = buildStyleBuilderStrokeAtlas({
      id: "ink-gpen",
      name: "G펜 작가 아틀라스",
      strokesByBucket: {
        32: makeCreatorStroke(32, 0.7),
        128: makeCreatorStroke(128, 0.9),
        512: makeCreatorStroke(512, 1.0),
      },
    });

    expect(atlas.buckets).toHaveLength(3);
    expect(selectBestAtlasBucket(atlas, 40).lengthPx).toBe(32);
    expect(selectBestAtlasBucket(atlas, 150).lengthPx).toBe(128);
    expect(selectBestAtlasBucket(atlas, 440).lengthPx).toBe(512);

    const roundtrip = deserializeStyleBuilderAtlas(serializeStyleBuilderAtlas(atlas));
    expect(roundtrip.id).toBe("ink-gpen");
    expect(roundtrip.buckets).toHaveLength(3);
  });

  it("카메라 투영 3D 엣지를 크리즈 임계값으로 필터링하고 연속 폴리라인으로 체이닝한다", () => {
    const segments: readonly Projected3dEdgeSegment[] = [
      {
        id: "s1",
        ax: 0,
        ay: 0,
        azDepth: 4,
        bx: 60,
        by: 5,
        bzDepth: 4.5,
        kind: "silhouette",
        dihedralAngleDeg: 90,
        materialBoundary: false,
        intersectionEdge: false,
      },
      {
        id: "s2",
        ax: 60.4,
        ay: 5.2,
        azDepth: 4.5,
        bx: 130,
        by: 12,
        bzDepth: 5.2,
        kind: "silhouette",
        dihedralAngleDeg: 90,
        materialBoundary: false,
        intersectionEdge: false,
      },
      {
        id: "soft-crease",
        ax: 0,
        ay: 30,
        azDepth: 6,
        bx: 50,
        by: 30,
        bzDepth: 6,
        kind: "crease",
        dihedralAngleDeg: 18,
        materialBoundary: false,
        intersectionEdge: false,
      },
      {
        id: "sharp-crease",
        ax: 0,
        ay: 60,
        azDepth: 25,
        bx: 50,
        by: 60,
        bzDepth: 25,
        kind: "crease",
        dihedralAngleDeg: 65,
        materialBoundary: false,
        intersectionEdge: false,
      },
    ];

    const chains = chainProjected3dEdges(segments, { creaseAngleThresholdDeg: 35 });
    expect(chains).toHaveLength(2);
    const sil = chains.find((c) => c.kind === "silhouette");
    expect(sil?.points).toHaveLength(3);
    expect(sil?.totalLengthPx).toBeGreaterThan(125);
  });

  it("비파괴 모디파이어 스택이 오버슈트·원근 감쇠·결정론적 지터·리본·벡터 출력을 생성한다", () => {
    const atlas = buildStyleBuilderStrokeAtlas({
      id: "brush-ink",
      name: "먹선 아틀라스",
      seed: 99,
      strokesByBucket: {
        32: makeCreatorStroke(32, 0.8),
        64: makeCreatorStroke(64, 0.85),
        128: makeCreatorStroke(128, 0.9),
        256: makeCreatorStroke(256, 0.95),
      },
    });
    const chains = chainProjected3dEdges([
      {
        id: "near",
        ax: 10,
        ay: 10,
        azDepth: 2,
        bx: 140,
        by: 10,
        bzDepth: 2,
        kind: "silhouette",
        dihedralAngleDeg: 90,
        materialBoundary: false,
        intersectionEdge: false,
      },
      {
        id: "far",
        ax: 10,
        ay: 50,
        azDepth: 30,
        bx: 140,
        by: 50,
        bzDepth: 30,
        kind: "silhouette",
        dihedralAngleDeg: 90,
        materialBoundary: false,
        intersectionEdge: false,
      },
    ]);

    const cfg = createDefaultLineArtModifierStackConfig();
    const run1 = evaluateLineArtModifierStack(chains, atlas, cfg);
    const run2 = evaluateLineArtModifierStack(chains, atlas, cfg);
    expect(run1).toEqual(run2);
    expect(deterministicSpatialNoise(42, 12.5, 8.25, 3)).toBe(
      deterministicSpatialNoise(42, 12.5, 8.25, 3),
    );

    const nearMid = run1[0].points[1].widthPx;
    const farMid = run1[1].points[1].widthPx;
    expect(nearMid).toBeGreaterThan(farMid);
    // 오버슈트로 인해 원래 130px보다 길어져야 함
    expect(run1[0].totalLengthPx).toBeGreaterThan(130 + cfg.overshootPx * 1.5);

    const ribbons = buildLineArtRibbonDrawCalls(run1, atlas.id);
    expect(ribbons).toHaveLength(2);
    expect(ribbons[0].indices.length).toBe((run1[0].points.length - 1) * 6);

    const vectorStrokes = toVectorLayerStrokes(run1, atlas.id);
    expect(vectorStrokes).toHaveLength(2);
    expect(vectorStrokes[0].layerPass).toBe("main-line");
    expect(vectorStrokes[0].points.length).toBe(run1[0].points.length);
  });
});
