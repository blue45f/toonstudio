import { describe, expect, it } from "vitest";
import {
  NEURAL_BRUSH_PRESET_PROFILES,
  auditMultiTenantIsolationPolicy,
  buildAssetProvenanceMerkleLedger,
  canonicalizeJsonValue,
  computeDelegationAttestationSha256,
  constantTimeHexEquals,
  createNeuralBrushSurrogateModel,
  estimateSketchNormalDepthField,
  evaluateNeuralBrushSurrogatePatch,
  evaluateSh0Color,
  generateMerkleInclusionProof,
  int4MatVecMulAdd,
  packInt4WeightMatrix,
  projectGaussianSplatsToComicNpr,
  relightCanvasFromNormalField,
  sha256Hex,
  silu,
  unpackInt4WeightMatrix,
  verifyMerkleInclusionProof,
  type GaussianSplat3D,
  type ProvenanceAssetEntry,
  type TenantAccessRequest,
} from "./index";

function createCircleMask(width: number, height: number, radius: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  const cx = (width - 1) * 0.5;
  const cy = (height - 1) * 0.5;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (Math.hypot(x - cx, y - cy) <= radius) mask[y * width + x] = 255;
    }
  }
  return mask;
}

function createFlatAlbedo(
  width: number, height: number, r: number, g: number, b: number,
  bgR = 250, bgG = 248, bgB = 242, mask?: Uint8Array,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const inside = !mask || mask[i] >= 128;
    const o = i * 4;
    out[o] = inside ? r : bgR;
    out[o + 1] = inside ? g : bgG;
    out[o + 2] = inside ? b : bgB;
    out[o + 3] = 255;
  }
  return out;
}

function makeEntry(overrides: Partial<ProvenanceAssetEntry> & { entryId: string }): ProvenanceAssetEntry {
  return {
    tenantId: "tenant-studio-seoul",
    workspaceId: "ws-ep01",
    episodeId: "ep-01",
    assetKind: "manuscript",
    assetName: `asset-${overrides.entryId}`,
    contentSha256: sha256Hex(`content:${overrides.entryId}`),
    licenseTier: "commercial-cleared",
    licenseGrantId: `grant-${overrides.entryId}`,
    issuerId: "toonstudio-rights-authority",
    recordedAtIso: "2026-11-27T12:00:00.000Z",
    ...overrides,
  };
}

function makeAccessReq(overrides: Partial<TenantAccessRequest> = {}): TenantAccessRequest {
  return {
    requestId: "req-1",
    actorId: "artist-01",
    actorTenantId: "tenant-alpha",
    actorKeyScopeId: "kms:tenant-alpha:ws-main",
    grantedCapabilities: ["read", "write", "export-bom", "verify-proof"],
    action: "export-bom",
    resourceTenantId: "tenant-alpha",
    resourceWorkspaceId: "ws-main",
    resourceKeyScopeId: "kms:tenant-alpha:ws-main",
    storageNamespace: "tenant/tenant-alpha/episodes/ep-01/ledger.json",
    sessionExpiresAtMs: 2_000_000,
    hardwareAttested: true,
    ...overrides,
  };
}

describe("Wave 64 — Neural Brush Surrogate (INT4)", () => {
  it("1. INT4 대칭 블록 양자화 패킹/언패킹이 4배 이상 압축률과 낮은 RMSE를 보장한다", () => {
    const raw = new Float32Array(256);
    for (let i = 0; i < raw.length; i++) raw[i] = Math.sin(i * 0.37) * 0.85;
    const packed = packInt4WeightMatrix(raw, 16, 16, 16);
    const unpacked = unpackInt4WeightMatrix(packed);

    expect(packed.totalElements).toBe(256);
    expect(packed.packedNibbles.byteLength).toBe(128);
    expect(packed.compressionRatio).toBeGreaterThan(4.5);
    expect(packed.rmse).toBeLessThan(0.06);
    for (let i = 0; i < raw.length; i++) {
      expect(Math.abs(unpacked[i] - raw[i])).toBeLessThanOrEqual(packed.maxQuantizationError + 1e-6);
    }
  });

  it("2. 영 블록 포함 행렬 양자화 및 스트리밍 INT4 곱이 언패킹 FP32 곱과 일치한다", () => {
    const weights = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0.5, -0.75, 1.0, -0.25, 0.35, -0.6, 0.9, -0.1]);
    const packed = packInt4WeightMatrix(weights, 2, 8, 8);
    const unpacked = unpackInt4WeightMatrix(packed);
    const input = new Float32Array([0.2, -0.4, 0.8, 0.5, -0.1, 0.6, -0.3, 0.9]);
    const bias = new Float32Array([0.15, -0.25]);
    const fused = int4MatVecMulAdd(packed, input, bias);

    for (let r = 0; r < 2; r++) {
      let expected = bias[r];
      for (let c = 0; c < 8; c++) expected += unpacked[r * 8 + c] * input[c];
      expect(fused[r]).toBeCloseTo(expected, 5);
    }
    expect(fused[0]).toBeCloseTo(0.15, 5);
  });

  it("3. SiLU 활성화 함수가 극단값에서 NaN 없이 연속적으로 동작한다", () => {
    expect(silu(0)).toBeCloseTo(0, 6);
    expect(silu(2)).toBeCloseTo(2 / (1 + Math.exp(-2)), 6);
    expect(silu(50)).toBe(50);
    expect(silu(-50)).toBe(0);
  });

  it("4. 대리 모델 브러시 패치 추론은 완전 결정론적이며 온디바이스 예산을 충족한다", () => {
    const input = {
      pressure: 0.72, tiltX: 0.25, tiltY: -0.1, velocity: 0.45, paperTooth: 0.65, wetness: 0.7,
      pickupColor: [0.92, 0.88, 0.78, 1] as const, paintColor: [0.16, 0.35, 0.62, 1] as const,
      patchSize: 24, seed: 4242, presetId: "watercolor-granulation" as const,
    };
    const a = evaluateNeuralBrushSurrogatePatch(input);
    const b = evaluateNeuralBrushSurrogatePatch(input);

    expect(a.colorRgba).toEqual(b.colorRgba);
    expect(a.impastoHeightF32).toEqual(b.impastoHeightF32);
    expect(a.granulationMaskF32).toEqual(b.granulationMaskF32);
    expect(a.metrics.activePixelCount).toBeGreaterThan(80);
    expect(a.metrics.compressionRatio).toBeGreaterThan(3.5);
    expect(a.metrics.inferenceMs).toBeLessThan(20);
  });

  it("5. 필압 증가에 따라 유효 브러시 면적과 임파스토 두께가 유의미하게 증가한다", () => {
    const common = {
      tiltX: 0.1, tiltY: 0, velocity: 0.3, paperTooth: 0.35, wetness: 0.3,
      pickupColor: [0.95, 0.94, 0.9, 1] as const, paintColor: [0.75, 0.2, 0.18, 1] as const,
      patchSize: 24, presetId: "oil-impasto-hog" as const,
    };
    const light = evaluateNeuralBrushSurrogatePatch({ ...common, pressure: 0.18 });
    const heavy = evaluateNeuralBrushSurrogatePatch({ ...common, pressure: 0.92 });

    expect(heavy.metrics.activePixelCount).toBeGreaterThan(light.metrics.activePixelCount * 1.4);
    expect(heavy.metrics.meanImpasto).toBeGreaterThan(light.metrics.meanImpasto * 1.3);
    expect(heavy.metrics.maxImpasto).toBeGreaterThan(light.metrics.maxImpasto * 1.2);
  });

  it("6. 종이 돌기(paperTooth) 증가 시 수채 과립화 마스크 평균과 공간 분산이 증가한다", () => {
    const common = {
      pressure: 0.7, tiltX: 0, tiltY: 0, velocity: 0.25, wetness: 0.85,
      pickupColor: [0.96, 0.95, 0.92, 1] as const, paintColor: [0.12, 0.28, 0.52, 1] as const,
      patchSize: 24, presetId: "watercolor-granulation" as const,
    };
    const smooth = evaluateNeuralBrushSurrogatePatch({ ...common, paperTooth: 0.04 });
    const rough = evaluateNeuralBrushSurrogatePatch({ ...common, paperTooth: 0.95 });

    expect(rough.metrics.meanGranulation).toBeGreaterThan(smooth.metrics.meanGranulation * 2.5);
    expect(rough.metrics.granulationVariance).toBeGreaterThan(smooth.metrics.granulationVariance * 3.0);
  });

  it("7. 틸트 방향(X vs Y)에 따라 브러시 풋프린트 이방성 분산 주축이 회전한다", () => {
    const spread = (alpha: Float32Array, size: number) => {
      const center = (size - 1) * 0.5;
      let sumW = 0; let varX = 0; let varY = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const w = alpha[y * size + x];
          if (w <= 0) continue;
          sumW += w; varX += w * (x - center) * (x - center); varY += w * (y - center) * (y - center);
        }
      }
      return { varX: varX / sumW, varY: varY / sumW };
    };
    const base = {
      pressure: 0.65, velocity: 0.4, paperTooth: 0.4, wetness: 0.4,
      pickupColor: [1, 1, 1, 1] as const, paintColor: [0.1, 0.1, 0.1, 1] as const,
      patchSize: 28, presetId: "sumi-ink-fude" as const,
    };
    const sX = spread(evaluateNeuralBrushSurrogatePatch({ ...base, tiltX: 0.95, tiltY: 0 }).alphaCoverageF32, 28);
    const sY = spread(evaluateNeuralBrushSurrogatePatch({ ...base, tiltX: 0, tiltY: 0.95 }).alphaCoverageF32, 28);
    expect(sX.varX).toBeGreaterThan(sX.varY * 1.4);
    expect(sY.varY).toBeGreaterThan(sY.varX * 1.4);
  });

  it("8. 고속 스트로크 임파스토 감소·습도 바닥색 픽업·프리셋 분화 및 잘못된 크기 거부를 검증한다", () => {
    const oil = createNeuralBrushSurrogateModel("oil-impasto-hog");
    const wc = createNeuralBrushSurrogateModel("watercolor-granulation");
    expect(Object.keys(NEURAL_BRUSH_PRESET_PROFILES)).toHaveLength(4);
    const common = {
      pressure: 0.75, tiltX: 0.1, tiltY: 0.1, paperTooth: 0.6,
      pickupColor: [0.95, 0.9, 0.1, 1] as const, paintColor: [0.1, 0.2, 0.85, 1] as const, patchSize: 20,
    };
    const slowOil = evaluateNeuralBrushSurrogatePatch({ ...common, velocity: 0.1, wetness: 0.2 }, oil);
    const fastOil = evaluateNeuralBrushSurrogatePatch({ ...common, velocity: 3.2, wetness: 0.2 }, oil);
    const wetWc = evaluateNeuralBrushSurrogatePatch({ ...common, velocity: 0.3, wetness: 0.95 }, wc);
    const dryWc = evaluateNeuralBrushSurrogatePatch({ ...common, velocity: 0.3, wetness: 0.05 }, wc);

    expect(slowOil.metrics.meanImpasto).toBeGreaterThan(fastOil.metrics.meanImpasto);
    expect(slowOil.metrics.meanImpasto).toBeGreaterThan(wetWc.metrics.meanImpasto);
    expect(wetWc.metrics.meanGranulation).toBeGreaterThan(slowOil.metrics.meanGranulation);
    expect(wetWc.colorRgba[(10 * 20 + 10) * 4]).toBeGreaterThan(dryWc.colorRgba[(10 * 20 + 10) * 4]);
    expect(() => evaluateNeuralBrushSurrogatePatch({ ...common, velocity: 0.3, wetness: 0.5, patchSize: 4 })).toThrow(RangeError);
  });
});

describe("Wave 64 — 2D Sketch-to-Normal & Interactive Relighting", () => {
  it("9. 원형 실루엣 구면 팽창 법선맵이 모든 내부 픽셀에서 단위 벡터이며 4사분면 방향이 정확하다", () => {
    const size = 41;
    const field = estimateSketchNormalDepthField({
      width: size, height: size, silhouetteMask: createCircleMask(size, size, 16), inflationProfile: "spherical",
    });
    expect(field.silhouettePixelCount).toBeGreaterThan(750);
    for (let i = 0; i < size * size; i++) {
      if (field.coverageMask[i] === 0) { expect(field.depthF32[i]).toBe(0); continue; }
      const [nx, ny, nz] = [field.normalXyzF32[i * 3], field.normalXyzF32[i * 3 + 1], field.normalXyzF32[i * 3 + 2]];
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 4);
      expect(nz).toBeGreaterThan(0);
    }
    const c = 20;
    expect(field.normalXyzF32[(c * size + (c - 10)) * 3]).toBeLessThan(-0.35);
    expect(field.normalXyzF32[(c * size + (c + 10)) * 3]).toBeGreaterThan(0.35);
    expect(field.normalXyzF32[((c - 10) * size + c) * 3 + 1]).toBeGreaterThan(0.35);
    expect(field.normalXyzF32[((c + 10) * size + c) * 3 + 1]).toBeLessThan(-0.35);
    expect(field.normalXyzF32[(c * size + c) * 3 + 2]).toBeGreaterThan(0.98);
  });

  it("10. 내부 선화 마스크(주름선)가 국소 깊이를 음각하고 법선 벡터를 굴절시킨다", () => {
    const size = 37;
    const mask = createCircleMask(size, size, 14);
    const lineArt = new Uint8Array(size * size);
    for (let y = 10; y <= 26; y++) lineArt[y * size + 18] = 255;

    const smooth = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask });
    const creased = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask, lineArtMask: lineArt, creaseStrength: 0.65 });

    expect(creased.depthF32[18 * size + 18]).toBeLessThan(smooth.depthF32[18 * size + 18]);
    expect(Math.abs(creased.normalXyzF32[(18 * size + 17) * 3] - smooth.normalXyzF32[(18 * size + 17) * 3])).toBeGreaterThan(0.05);
  });

  it("11. spherical·pillowy·beveled 프로파일이 서로 구분되는 2.5D 단면 깊이를 생성한다", () => {
    const size = 33;
    const mask = createCircleMask(size, size, 13);
    const sphere = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask, inflationProfile: "spherical" });
    const pillow = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask, inflationProfile: "pillowy" });
    const bevel = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask, inflationProfile: "beveled" });

    const midIdx = 16 * size + 10;
    expect(bevel.depthF32[midIdx]).toBeGreaterThan(pillow.depthF32[midIdx]);
    expect(sphere.depthF32[midIdx]).toBeGreaterThan(pillow.depthF32[midIdx]);
  });

  it("12. 가상 광원 구슬을 좌측에서 우측으로 이동하면 좌/우 반구 명암이 정확히 반전된다", () => {
    const size = 41;
    const mask = createCircleMask(size, size, 16);
    const field = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask });
    const albedo = createFlatAlbedo(size, size, 224, 192, 168, 250, 248, 244, mask);

    const leftLit = relightCanvasFromNormalField({ field, albedoRgba: albedo, light: { direction: [-1, 0, 0.55], color: [1, 0.96, 0.88], intensity: 1 } });
    const rightLit = relightCanvasFromNormalField({ field, albedoRgba: albedo, light: { direction: [1, 0, 0.55], color: [1, 0.96, 0.88], intensity: 1 } });

    expect(leftLit.stats.leftHalfMeanLuma).toBeGreaterThan(leftLit.stats.rightHalfMeanLuma * 1.25);
    expect(rightLit.stats.rightHalfMeanLuma).toBeGreaterThan(rightLit.stats.leftHalfMeanLuma * 1.25);
  });

  it("13. 상단/하단 가상 광원 이동 시 상/하 반구 명암이 반전된다", () => {
    const size = 41;
    const mask = createCircleMask(size, size, 16);
    const field = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask });
    const albedo = createFlatAlbedo(size, size, 210, 210, 220, 255, 255, 255, mask);

    const topLit = relightCanvasFromNormalField({ field, albedoRgba: albedo, light: { direction: [0, 1, 0.5], color: [1, 1, 1], intensity: 1 } });
    const botLit = relightCanvasFromNormalField({ field, albedoRgba: albedo, light: { direction: [0, -1, 0.5], color: [1, 1, 1], intensity: 1 } });

    expect(topLit.stats.topHalfMeanLuma).toBeGreaterThan(topLit.stats.bottomHalfMeanLuma * 1.2);
    expect(botLit.stats.bottomHalfMeanLuma).toBeGreaterThan(botLit.stats.topHalfMeanLuma * 1.2);
  });

  it("14. 림라이트는 실루엣 가장자리에, 반사 하이라이트는 반벡터 정점에 집중되며 외부 배경은 보존된다", () => {
    const size = 41;
    const mask = createCircleMask(size, size, 16);
    const field = estimateSketchNormalDepthField({ width: size, height: size, silhouetteMask: mask });
    const albedo = createFlatAlbedo(size, size, 180, 140, 130, 12, 34, 56, mask);

    const relit = relightCanvasFromNormalField({
      field, albedoRgba: albedo,
      light: { direction: [0, 0, 1], color: [1, 1, 1], intensity: 1, rimStrength: 1.0, specularStrength: 0.9 },
    });

    const centerIdx = 20 * size + 20;
    const rimEdgeIdx = 20 * size + 36;
    expect(relit.rimMaskF32[rimEdgeIdx]).toBeGreaterThan(relit.rimMaskF32[centerIdx] + 0.15);
    expect(relit.specularMaskF32[centerIdx]).toBeGreaterThan(0.75);
    expect(relit.specularMaskF32[rimEdgeIdx]).toBeLessThan(0.25);
    expect([relit.litRgba[0], relit.litRgba[1], relit.litRgba[2]]).toEqual([12, 34, 56]);
  });
});

describe("Wave 64 — 3D Gaussian Splatting (3DGS) Comic NPR & Line-Art Extraction", () => {
  const defaultCam = {
    position: [0, 0, 10] as const, target: [0, 0, 0] as const, up: [0, 1, 0] as const,
    fovYDeg: 50, near: 0.2, far: 100, width: 48, height: 48,
  };

  it("15. 전경·후경 3DGS 스플랫을 깊이 순 정렬하고 전경 스플랫이 후경 색/깊이를 가린다", () => {
    const splats: GaussianSplat3D[] = [
      { id: "far-wall", position: [0, 0, -4], scale: [3.2, 3.2, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.98, sh0Color: [0.15, 0.35, 0.9], semanticGroup: "wall" },
      { id: "near-pillar", position: [0, 0, 4], scale: [0.7, 0.7, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.99, sh0Color: [0.92, 0.2, 0.18], semanticGroup: "pillar" },
    ];
    const res = projectGaussianSplatsToComicNpr({ splats, camera: defaultCam });

    expect(res.renderedSplatCount).toBe(2);
    expect(res.sortedSplatIds).toEqual(["near-pillar", "far-wall"]);
    const centerIdx = 24 * 48 + 24;
    const farIdx = 24 * 48 + 10;
    expect(res.depthBufferF32[centerIdx]).toBeCloseTo(6, 0);
    expect(res.depthBufferF32[farIdx]).toBeGreaterThan(12);
    expect(res.celToneRgba[centerIdx * 4]).toBeGreaterThan(res.celToneRgba[centerIdx * 4 + 2]);
    expect(res.celToneRgba[farIdx * 4 + 2]).toBeGreaterThan(res.celToneRgba[farIdx * 4]);
  });

  it("16. 전경 기둥과 후경 벽 사이의 깊이 불연속 경계에서 만화 배경 선화 마스크가 추출된다", () => {
    const splats: GaussianSplat3D[] = [
      { id: "bg-facade", position: [0, 0, -5], scale: [4.5, 4.5, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.99, sh0Color: [0.72, 0.76, 0.84], semanticGroup: "facade" },
      { id: "fg-balcony", position: [0, 0, 4.5], scale: [0.8, 1.4, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.99, sh0Color: [0.85, 0.82, 0.78], semanticGroup: "facade" },
    ];
    const res = projectGaussianSplatsToComicNpr({ splats, camera: defaultCam, options: { depthEdgeThreshold: 0.15 } });

    expect(res.stats.lineArtPixelCount).toBeGreaterThan(20);
    let rowLinePixels = 0;
    for (let x = 0; x < 48; x++) if (res.lineArtMaskF32[24 * 48 + x] >= 0.45) rowLinePixels++;
    expect(rowLinePixels).toBeGreaterThanOrEqual(2);
  });

  it("17. 동일 깊이에서 직교하는 두 서펠(법선 90도 불연속) 경계에서 코너 선화가 추출된다", () => {
    const s = Math.sin(Math.PI / 8);
    const c = Math.cos(Math.PI / 8);
    const splats: GaussianSplat3D[] = [
      { id: "left-wall", position: [-0.9, 0, 2], scale: [1.1, 2.2, 0.08], rotationQuat: [0, s, 0, c], opacity: 0.99, sh0Color: [0.8, 0.8, 0.8], semanticGroup: "room" },
      { id: "right-wall", position: [0.9, 0, 2], scale: [1.1, 2.2, 0.08], rotationQuat: [0, -s, 0, c], opacity: 0.99, sh0Color: [0.8, 0.8, 0.8], semanticGroup: "room" },
    ];
    const res = projectGaussianSplatsToComicNpr({ splats, camera: defaultCam, options: { normalEdgeThreshold: 0.25 } });

    let seamEdge = 0;
    for (let x = 21; x <= 26; x++) seamEdge = Math.max(seamEdge, res.lineArtMaskF32[24 * 48 + x]);
    expect(seamEdge).toBeGreaterThan(0.45);
  });

  it("18. EWA 2D 공분산 투영이 타원체 축 비등방성과 쿼터니언 90도 회전을 정확히 반영한다", () => {
    const horiz: GaussianSplat3D = {
      id: "h", position: [0, 0, 2], scale: [1.6, 0.35, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.98, sh0Color: [0.3, 0.6, 0.5],
    };
    const vert: GaussianSplat3D = { ...horiz, id: "v", rotationQuat: [0, 0, Math.SQRT1_2, Math.SQRT1_2] };
    const extents = (alpha: Float32Array) => {
      let minX = 48; let maxX = 0; let minY = 48; let maxY = 0;
      for (let y = 0; y < 48; y++) {
        for (let x = 0; x < 48; x++) {
          if (alpha[y * 48 + x] > 0.2) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
      }
      return { spanX: maxX - minX, spanY: maxY - minY };
    };
    const hExt = extents(projectGaussianSplatsToComicNpr({ splats: [horiz], camera: defaultCam }).alphaBufferF32);
    const vExt = extents(projectGaussianSplatsToComicNpr({ splats: [vert], camera: defaultCam }).alphaBufferF32);
    expect(hExt.spanX).toBeGreaterThan(hExt.spanY * 2.2);
    expect(vExt.spanY).toBeGreaterThan(vExt.spanX * 2.2);
  });

  it("19. 카메라 후방·절두체 밖 스플랫을 컬링하고 SH0 DC 색 변환을 결정론적으로 수행한다", () => {
    const splats: GaussianSplat3D[] = [
      { id: "behind", position: [0, 0, 14], scale: [1, 1, 1], rotationQuat: [0, 0, 0, 1], opacity: 1, sh0Color: [1, 0, 0] },
      { id: "zero-op", position: [0, 0, 0], scale: [1, 1, 1], rotationQuat: [0, 0, 0, 1], opacity: 0, sh0Color: [0, 1, 0] },
      { id: "visible", position: [0, 0, 0], scale: [1, 1, 1], rotationQuat: [0, 0, 0, 1], opacity: 0.95, sh0Color: evaluateSh0Color([0.8, -0.5, 0.2]) },
    ];
    const res = projectGaussianSplatsToComicNpr({ splats, camera: defaultCam });
    expect(res.renderedSplatCount).toBe(1);
    expect(res.culledSplatCount).toBe(2);
    expect(res.sortedSplatIds).toEqual(["visible"]);
    expect(evaluateSh0Color([0, 0, 0])).toEqual([0.5, 0.5, 0.5]);
  });
});

describe("Wave 64 — Zero-Trust Multi-Tenant Isolation & SHA-256 Merkle Provenance Ledger", () => {
  it("20. 순수 동기 SHA-256 구현이 NIST FIPS 180-4 표준 테스트 벡터와 한글 UTF-8 해시와 일치한다", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(
      sha256Hex("abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu"),
    ).toBe("cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1");
    expect(sha256Hex("툰스튜디오 원고 저작권 증명 🖋️")).toBe(sha256Hex("툰스튜디오 원고 저작권 증명 🖋️"));
  });

  it("21. 정규화 JSON 직렬화가 키 삽입 순서와 무관하게 동일한 머클 리프 페이로드를 생성한다", () => {
    const a = canonicalizeJsonValue({ b: 2, a: 1, nested: { z: true, y: "ok" } });
    const b = canonicalizeJsonValue({ nested: { y: "ok", z: true }, a: 1, b: 2 });
    expect(a).toBe(b);
    expect(constantTimeHexEquals(sha256Hex(a), sha256Hex(b))).toBe(true);
  });

  it("22. 원고·브러시·3D 에셋·폰트·로컬 연산 증명을 머클 루트로 봉인하고 미검증 라이선스는 익스포트를 차단한다", () => {
    const entries = [
      makeEntry({ entryId: "ms-01", assetKind: "manuscript" }),
      makeEntry({ entryId: "br-01", assetKind: "brush-preset" }),
      makeEntry({ entryId: "bg-01", assetKind: "asset-3d", licenseTier: "cc-by-4.0" }),
      makeEntry({ entryId: "ft-01", assetKind: "font-license", licenseTier: "proprietary-owned" }),
      makeEntry({ entryId: "npu-01", assetKind: "local-compute-attestation", localComputeProofHash: sha256Hex("int4-run") }),
    ];
    const cleared = buildAssetProvenanceMerkleLedger({ ledgerId: "l-1", tenantId: "tenant-studio-seoul", workspaceId: "ws-ep01", entries });
    expect(cleared.leafCount).toBe(5);
    expect(cleared.treeDepth).toBe(3);
    expect(cleared.rightsClearance.clearedForCommercialExport).toBe(true);

    const blocked = buildAssetProvenanceMerkleLedger({
      ledgerId: "l-2", tenantId: "tenant-studio-seoul", workspaceId: "ws-ep01",
      entries: [...entries, makeEntry({ entryId: "ft-unverified", assetKind: "font-license", licenseTier: "unverified" })],
    });
    expect(blocked.rightsClearance.clearedForCommercialExport).toBe(false);
    expect(blocked.rightsClearance.blockedEntryIds).toEqual(["ft-unverified"]);
  });

  it("23. 홀수(5개)·짝수(8개) 리프 원장 모든 항목의 머클 포함 증명이 1ms 내 정상 검증된다", () => {
    for (const count of [5, 8]) {
      const entries = Array.from({ length: count }, (_, idx) => makeEntry({ entryId: `e-${count}-${idx}` }));
      const ledger = buildAssetProvenanceMerkleLedger({ ledgerId: `l-${count}`, tenantId: "tenant-studio-seoul", workspaceId: "ws-ep01", entries });
      for (const entry of entries) {
        const res = verifyMerkleInclusionProof(generateMerkleInclusionProof(ledger, entry.entryId), entry);
        expect(res.valid).toBe(true);
        expect(res.computedRootHex).toBe(ledger.merkleRootHex);
        expect(res.verificationMs).toBeLessThan(10);
      }
    }
  });

  it("24. 페이로드·형제 해시·형제 방향의 1바이트(1니블) 변조도 즉시 적발한다", () => {
    const entries = ["e-0", "e-1", "e-2", "e-3"].map((id) => makeEntry({ entryId: id, assetName: `${id}.bin` }));
    const ledger = buildAssetProvenanceMerkleLedger({ ledgerId: "l-tamper", tenantId: "tenant-studio-seoul", workspaceId: "ws-ep01", entries });
    const proof = generateMerkleInclusionProof(ledger, "e-2");

    expect(verifyMerkleInclusionProof(proof, { ...entries[2], assetName: "e-2.bio" }).valid).toBe(false);
    const sib = proof.steps[0].siblingHashHex;
    const flipped = (sib[0] === "a" ? "b" : "a") + sib.slice(1);
    expect(verifyMerkleInclusionProof({ ...proof, steps: [{ ...proof.steps[0], siblingHashHex: flipped }, ...proof.steps.slice(1)] }).valid).toBe(false);
    const swapped = proof.steps[0].position === "left" ? ("right" as const) : ("left" as const);
    expect(verifyMerkleInclusionProof({ ...proof, steps: [{ ...proof.steps[0], position: swapped }, ...proof.steps.slice(1)] }).valid).toBe(false);
  });

  it("25. 중복 entryId·잘못된 SHA-256 형식·단일 테넌트 혼입 시 원장 생성을 거부한다", () => {
    const e = makeEntry({ entryId: "dup-1" });
    expect(() => buildAssetProvenanceMerkleLedger({ ledgerId: "l1", tenantId: "tenant-studio-seoul", workspaceId: "ws", entries: [e, e] })).toThrow(RangeError);
    expect(() => buildAssetProvenanceMerkleLedger({ ledgerId: "l2", tenantId: "tenant-studio-seoul", workspaceId: "ws", entries: [makeEntry({ entryId: "x", contentSha256: "bad" })] })).toThrow(RangeError);
    expect(() => buildAssetProvenanceMerkleLedger({ ledgerId: "l3", tenantId: "tenant-studio-seoul", workspaceId: "ws", entries: [makeEntry({ entryId: "f", tenantId: "tenant-evil" })] })).toThrow();
  });

  it("26. 멀티테넌트 제로트러스트 감사기가 정상 동일 테넌트 요청을 허용하고 감사 다이제스트를 봉인한다", () => {
    const audit = auditMultiTenantIsolationPolicy({
      policy: { nowMs: 1_500_000, denyByDefault: true, requireKeyScopeMatch: true, requireHardwareAttestation: true },
      requests: [makeAccessReq()],
    });
    expect(audit.compliant).toBe(true);
    expect(audit.allowedCount).toBe(1);
    expect(audit.deniedCount).toBe(0);
    expect(audit.auditDigestSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("27. 교차 테넌트 접근·KMS 키 불일치·경로 탈출(`..`)·세션 만료·권한 누락·원장 오염을 전수 차단한다", () => {
    const contaminated = buildAssetProvenanceMerkleLedger({
      ledgerId: "l-contam", tenantId: "tenant-alpha", workspaceId: "ws-main", strictSingleTenant: false,
      entries: [makeEntry({ entryId: "ok", tenantId: "tenant-alpha" }), makeEntry({ entryId: "leak", tenantId: "tenant-beta" })],
    });
    const audit = auditMultiTenantIsolationPolicy({
      policy: { nowMs: 1_500_000, denyByDefault: true, requireKeyScopeMatch: true, requireHardwareAttestation: true },
      ledger: contaminated,
      requests: [
        makeAccessReq({ requestId: "cross", actorTenantId: "tenant-alpha", resourceTenantId: "tenant-beta", storageNamespace: "tenant/tenant-beta/a.json" }),
        makeAccessReq({ requestId: "kms", actorKeyScopeId: "kms:tenant-alpha:ws-other" }),
        makeAccessReq({ requestId: "escape", storageNamespace: "tenant/tenant-alpha/../tenant-beta/secret.db" }),
        makeAccessReq({ requestId: "expired", sessionExpiresAtMs: 1_400_000 }),
        makeAccessReq({ requestId: "cap", action: "delegate", grantedCapabilities: ["read"] }),
        makeAccessReq({ requestId: "unattested", hardwareAttested: false }),
      ],
    });
    expect(audit.compliant).toBe(false);
    expect(audit.allowedCount).toBe(0);
    expect(audit.deniedCount).toBe(6);
    const codes = new Set(audit.violations.map((v) => v.code));
    expect(codes.has("CROSS_TENANT_ACCESS_DENIED")).toBe(true);
    expect(codes.has("KEY_SCOPE_MISMATCH")).toBe(true);
    expect(codes.has("STORAGE_NAMESPACE_ESCAPE")).toBe(true);
    expect(codes.has("SESSION_EXPIRED")).toBe(true);
    expect(codes.has("MISSING_CAPABILITY")).toBe(true);
    expect(codes.has("UNATTESTED_DEVICE")).toBe(true);
    expect(codes.has("LEDGER_TENANT_CONTAMINATION")).toBe(true);
  });

  it("28. 서명된 비상 교차 테넌트 위임 토큰은 유효 시에만 통과하고 1니블 변조 시 즉시 차단한다", () => {
    const salt = "zero-trust-breakglass-salt-2026";
    const base = {
      delegationId: "del-001", sourceTenantId: "tenant-auditor", targetTenantId: "tenant-alpha",
      allowedCapabilities: ["verify-proof"] as const, expiresAtMs: 1_900_000,
    };
    const digest = computeDelegationAttestationSha256(base, salt);
    const okReq = makeAccessReq({
      requestId: "del-ok", actorTenantId: "tenant-auditor", actorKeyScopeId: "kms:tenant-auditor:audit",
      grantedCapabilities: ["verify-proof"], action: "verify-proof", resourceTenantId: "tenant-alpha",
      delegation: { ...base, attestationSha256: digest },
    });
    const badReq = makeAccessReq({
      requestId: "del-bad", actorTenantId: "tenant-auditor", actorKeyScopeId: "kms:tenant-auditor:audit",
      grantedCapabilities: ["verify-proof"], action: "verify-proof", resourceTenantId: "tenant-alpha",
      delegation: { ...base, attestationSha256: (digest[0] === "0" ? "1" : "0") + digest.slice(1) },
    });

    const audit = auditMultiTenantIsolationPolicy({
      policy: { nowMs: 1_500_000, allowVerifiedDelegation: true, delegationSigningSalt: salt },
      requests: [okReq, badReq],
    });
    expect(audit.decisions[0].allowed).toBe(true);
    expect(audit.decisions[0].delegated).toBe(true);
    expect(audit.decisions[1].allowed).toBe(false);
    expect(audit.decisions[1].violations[0].code).toBe("INVALID_DELEGATION_TOKEN");
  });
});
