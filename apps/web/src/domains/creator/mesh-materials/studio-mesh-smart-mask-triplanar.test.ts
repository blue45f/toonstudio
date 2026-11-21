import { describe, expect, it } from "vitest";

import {
  WEBTOON_SMART_MASK_PRESETS,
  bakeVertexCurvatureAndAo,
  buildTriPlanarUniformPayload,
  createTriPlanarGlslChunk,
  evaluateTriPlanarWeights,
  generateWebtoonSmartMask,
  type SmartMaskGeometryInput,
} from "./studio-mesh-smart-mask-triplanar";

function createConvexRidgeAndConcaveValleyMesh(): SmartMaskGeometryInput {
  // 정점 0: 볼록 능선 꼭짓점 (y=0.5, 인접점이 아래쪽에 위치)
  // 정점 3: 오목 골짜기 바닥 (y=0.0, 인접점이 위쪽에 위치)
  const positions = new Float32Array([
    0, 0.5, 0,    // 0: convex peak
    -0.4, 0.2, 0, // 1
    0.4, 0.2, 0,  // 2
    0, 0.0, 0.8,  // 3: concave valley
    -0.4, 0.4, 0.8, // 4
    0.4, 0.4, 0.8,  // 5
  ]);
  const normals = new Float32Array([
    0, 1, 0,
    -0.5, 0.86, 0,
    0.5, 0.86, 0,
    0, 1, 0,
    0.5, 0.86, 0,
    -0.5, 0.86, 0,
  ]);
  const indices = new Uint16Array([
    0, 1, 2,
    3, 4, 5,
  ]);
  return { positions, normals, indices };
}

describe("studio-mesh-smart-mask-triplanar", () => {
  it("bakes positive curvature on convex edges and stronger AO darkening in concave crevices", () => {
    const geom = createConvexRidgeAndConcaveValleyMesh();
    const baked = bakeVertexCurvatureAndAo(geom);

    expect(baked.curvature[0]).toBeGreaterThan(0.5);
    expect(baked.curvature[3]).toBeLessThan(-0.5);
    expect(baked.ambientOcclusion[0]).toBeGreaterThan(baked.ambientOcclusion[3]);

    const edgeMask = generateWebtoonSmartMask(
      geom,
      baked,
      WEBTOON_SMART_MASK_PRESETS["edge-wear-highlight"].defaults,
    );
    const creviceMask = generateWebtoonSmartMask(
      geom,
      baked,
      WEBTOON_SMART_MASK_PRESETS["crevice-ink-hatch"].defaults,
    );

    // 볼록 능선(0번)은 모서리 하이라이트 마스크가 강하고, 오목 골짜기(3번)는 틈새 해칭 마스크가 강해야 한다
    expect(edgeMask[0]).toBeGreaterThan(edgeMask[3]);
    expect(creviceMask[3]).toBeGreaterThan(creviceMask[0]);
  });

  it("computes normalized Tri-Planar blend weights and emits valid GLSL sampling chunk", () => {
    const diagWeights = evaluateTriPlanarWeights([0.577, 0.577, 0.577], 4);
    expect(diagWeights[0] + diagWeights[1] + diagWeights[2]).toBeCloseTo(1, 6);
    expect(diagWeights[0]).toBeCloseTo(1 / 3, 3);

    const upWeights = evaluateTriPlanarWeights([0.1, 0.99, 0.05], 8);
    expect(upWeights[1]).toBeGreaterThan(0.99);

    const payload = buildTriPlanarUniformPayload({
      worldTilingScale: 2.5,
      blendSharpness: 6,
      offsetWorldM: [0, 0, 0],
      enableStochasticRotation: true,
    });
    expect(payload.uTriPlanarScale).toBe(2.5);
    expect(payload.uTriPlanarStochastic).toBe(1);
    expect(createTriPlanarGlslChunk()).toContain("sampleStudioTriPlanar");
  });
});
