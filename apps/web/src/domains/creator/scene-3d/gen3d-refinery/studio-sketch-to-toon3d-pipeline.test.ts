import { describe, expect, it } from "vitest";

import {
  bakePbrAlbedoToToonTexture,
  computeRefineryIdempotencyKey,
  createLocalBlockoutProviderAdapter,
  estimateRefineryCost,
  GEN3D_POLY_BUDGET_BY_TIER,
  inspectAndNormalizeRefineryMesh,
  runSketchToToon3dRefinery,
  type SketchBlockoutGenerationRequest,
} from "./studio-sketch-to-toon3d-pipeline";

function makeBaseRequest(): SketchBlockoutGenerationRequest {
  return {
    provider: "meshy",
    prompt: "조선시대 목조 약장 서랍과 여닫이문",
    budgetTier: "bg-prop",
    targetHeightMeters: 1.6,
    seed: 2026,
    commercialLicenseRequired: true,
    sketchStrokes: [
      {
        points: [
          [0.1, 0.1],
          [0.9, 0.1],
          [0.9, 0.9],
          [0.1, 0.9],
        ],
        strokeWidthPx: 3,
      },
    ],
    blockoutPrimitives: [
      {
        id: "cabinet-body",
        label: "약장 본체",
        shape: "box",
        position: [0, 0.8, 0],
        sizeMeters: [1.0, 1.4, 0.5],
        articulationHint: "static",
      },
      {
        id: "cabinet-door",
        label: "여닫이 문짝",
        shape: "box",
        position: [0, 0.8, 0.35],
        sizeMeters: [0.9, 1.3, 0.06],
        articulationHint: "hinge-door",
      },
    ],
    styleDna: {
      styleId: "webtoon-warm-ink",
      swatchesRgb: [
        [0.45, 0.28, 0.18],
        [0.72, 0.52, 0.34],
        [0.91, 0.84, 0.72],
      ],
      toonSteps: 3,
      outlineSensitivity: 0.7,
    },
  };
}

describe("studio-sketch-to-toon3d-pipeline", () => {
  it("스케치·3D 블록아웃 요청에서 멱등성 키·크레딧 추정·매니폴드 정규화·파츠 분해·툰 베이킹·Rights BOM을 완주한다", async () => {
    const req = makeBaseRequest();
    const key1 = computeRefineryIdempotencyKey(req);
    const key2 = computeRefineryIdempotencyKey({ ...req, prompt: "  조선시대 목조 약장 서랍과 여닫이문  " });
    expect(key1).toBe(key2);

    const est = estimateRefineryCost(req);
    expect(est.targetMaxTriangles).toBe(GEN3D_POLY_BUDGET_BY_TIER["bg-prop"]);
    expect(est.estimatedCredits).toBeGreaterThan(0);

    const result = await runSketchToToon3dRefinery(req);
    expect(result.qualityReport.nonManifoldEdgeCount).toBe(0);
    expect(result.qualityReport.looseVertexCount).toBe(0);
    expect(result.qualityReport.degenerateFaceCount).toBe(0);
    expect(result.qualityReport.minY).toBeCloseTo(0, 5);
    expect(result.qualityReport.heightMeters).toBeCloseTo(1.6, 2);
    expect(result.qualityReport.quadRatio).toBeCloseTo(1.0, 4);
    expect(result.qualityReport.withinPolyBudget).toBe(true);

    // 2개 파츠 분해 및 여닫이문 경첩(Y축 회전, 좌측 모서리 피벗) 추론 확인
    expect(result.partManifest.length).toBe(2);
    const door = result.partManifest.find((p) => p.partId === "cabinet-door")!;
    expect(door.articulationKind).toBe("hinge-door");
    expect(door.hingeAxis).toEqual([0, 1, 0]);
    expect(door.pivotPosition[0]).toBeCloseTo(door.boundsMin[0], 5);

    // Rights BOM 라이선스·출처 검증
    expect(result.rightsBom.provider).toBe("meshy");
    expect(result.rightsBom.commercialClearance).toBe(true);
    expect(result.rightsBom.toonbridgeIsolated).toBe(false);
  });

  it("예산을 초과한 고밀도 메시를 결정적 디시메이션으로 목표 예산 이내로 감축하며 지면 접지를 유지한다", () => {
    // 20x20 평면 그리드 = 800 삼각형 생성 후 예산 200으로 축소 테스트
    const gridN = 20;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let z = 0; z <= gridN; z += 1) {
      for (let x = 0; x <= gridN; x += 1) {
        pos.push(x * 0.1, 2.0 + Math.sin(x * 0.3) * 0.25, z * 0.1);
      }
    }
    const stride = gridN + 1;
    for (let z = 0; z < gridN; z += 1) {
      for (let x = 0; x < gridN; x += 1) {
        const a = z * stride + x;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    const res = inspectAndNormalizeRefineryMesh(new Float32Array(pos), new Uint32Array(idx), {
      targetHeightMeters: 1.0,
      maxTriangles: 200,
    });
    expect(res.report.triangleCount).toBeLessThanOrEqual(200);
    expect(res.report.withinPolyBudget).toBe(true);
    expect(res.report.minY).toBeCloseTo(0, 5);
  });

  it("PBR De-lighting이 구워진 음영 편차를 완화하고 3단 MToon 램프와 윤곽선 마스크를 생성하며 취소를 처리한다", async () => {
    const w = 16;
    const h = 16;
    const shaded = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const off = (y * w + x) * 4;
        // 상하 강한 구워진 그림자 그라데이션 + 중앙 세로 경계
        const base = x < 8 ? 220 : 90;
        const grad = 0.4 + 0.6 * (y / (h - 1));
        shaded[off] = Math.round(base * grad);
        shaded[off + 1] = Math.round(base * 0.85 * grad);
        shaded[off + 2] = Math.round(base * 0.7 * grad);
        shaded[off + 3] = 255;
      }
    }

    const baked = bakePbrAlbedoToToonTexture(shaded, w, h, {
      styleId: "cel-3",
      swatchesRgb: [
        [0.85, 0.72, 0.6],
        [0.35, 0.3, 0.28],
      ],
      toonSteps: 3,
      outlineSensitivity: 0.8,
    });

    expect(baked.celRampLut.length).toBe(256);
    expect(new Set(baked.celRampLut).size).toBe(3);
    // 중앙 경계(x=8)에서 윤곽선 마스크가 선명하게 검출되어야 함
    expect(baked.outlineMask[8 * w + 8]!).toBeGreaterThan(100);
    expect(baked.delighingLuminanceVarianceRatio).toBeLessThan(1.0);

    // 취소 신호 시 즉시 중단
    const controller = new AbortController();
    controller.abort();
    await expect(
      runSketchToToon3dRefinery(
        makeBaseRequest(),
        createLocalBlockoutProviderAdapter("toonbridge-local"),
        controller.signal,
      ),
    ).rejects.toThrow(/취소/);
  });
});
