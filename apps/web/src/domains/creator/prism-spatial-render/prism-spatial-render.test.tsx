// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ATELIER_STAGE_BRAND,
  DEFAULT_SPATIAL_HASH_GRID_SIZE,
  MAX_BRISTLE_PARTICLES,
  MAX_DEPTH_SEPARATION,
  MAX_LOD_BIAS,
  MAX_SPATIAL_HASH_GRID_SIZE,
  MIN_BRISTLE_PARTICLES,
  MIN_DEPTH_SEPARATION,
  MIN_LOD_BIAS,
  MIN_SPATIAL_HASH_GRID_SIZE,
  PRISM_DEPTH_LAYER_IDS,
  PRISM_ENGINE_BRAND,
  PRISM_LOD_LEVELS,
  PRISM_SCENE_IDS,
  PRISM_SCENE_PRESETS,
  PRISM_SPATIAL_MODEL_KIND,
  PRISM_SPATIAL_RENDER_SCHEMA_VERSION,
  StudioPrismSpatialRenderPanel,
  TOON_CORE_BRAND,
  buildPrismSpatialRenderReport,
  computePrismHiZCulling,
  exportPrismSpatialRenderJson,
  getPrismScenePreset,
  normalizePrismSpatialConfig,
  simulateSpatialHashBristleDynamics,
  synthesizeNeuralDepth25D,
  type PrismSceneId,
  type PrismSpatialRenderReport,
} from "./index";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("1. AtelierStage 4종 3D 웹툰 씬 · 계층적 Hi-Z 차폐 컬링 · LOD 0..3 드로우콜 절감", () => {
  it("4종 3D 웹툰 씬이 정확한 객체 수(4,800·7,200·2,400·1,200)와 함께 중복 없이 등록되어 있다", () => {
    expect(PRISM_SCENE_PRESETS).toHaveLength(4);
    expect(PRISM_SCENE_IDS).toHaveLength(4);
    const byId = Object.fromEntries(PRISM_SCENE_PRESETS.map((p) => [p.id, p.totalObjects]));
    expect(byId).toEqual({
      "seoul-urban-street": 4800,
      "fantasy-cathedral": 7200,
      "school-corridor": 2400,
      "atelier-studio": 1200,
    });
  });

  it("getPrismScenePreset이 미지정 입력 시 서울 도심 거리 기본 프리셋을 반환한다", () => {
    expect(getPrismScenePreset().id).toBe("seoul-urban-street");
    expect(getPrismScenePreset("fantasy-cathedral").totalObjects).toBe(7200);
    expect(getPrismScenePreset("atelier-studio").totalObjects).toBe(1200);
  });

  it("normalizePrismSpatialConfig가 NaN·음수·초과 범위를 안전하게 클램프한다", () => {
    const low = normalizePrismSpatialConfig({
      lodBias: -99,
      gridSize: 2,
      particleCount: -10,
      depthSeparationStrength: -5,
      hiZPyramidLevels: 1,
      cameraFovDeg: 5,
    });
    const high = normalizePrismSpatialConfig({
      lodBias: 99,
      gridSize: 128,
      particleCount: 9999,
      depthSeparationStrength: 5,
      hiZPyramidLevels: 32,
      cameraFovDeg: 220,
    });
    const nanCase = normalizePrismSpatialConfig({
      lodBias: Number.NaN,
      gridSize: Number.POSITIVE_INFINITY,
      particleCount: Number.NaN,
    });

    expect(low.lodBias).toBe(MIN_LOD_BIAS);
    expect(low.gridSize).toBe(MIN_SPATIAL_HASH_GRID_SIZE);
    expect(low.particleCount).toBe(MIN_BRISTLE_PARTICLES);
    expect(low.depthSeparationStrength).toBe(MIN_DEPTH_SEPARATION);
    expect(high.lodBias).toBe(MAX_LOD_BIAS);
    expect(high.gridSize).toBe(MAX_SPATIAL_HASH_GRID_SIZE);
    expect(high.particleCount).toBe(MAX_BRISTLE_PARTICLES);
    expect(high.depthSeparationStrength).toBe(MAX_DEPTH_SEPARATION);
    expect(nanCase.gridSize).toBe(DEFAULT_SPATIAL_HASH_GRID_SIZE);
  });

  it("4종 씬 모두에서 frustumCulled + hiZOccluded + surviving === totalObjects 보존 법칙을 만족한다", () => {
    for (const sceneId of PRISM_SCENE_IDS) {
      const culling = computePrismHiZCulling(normalizePrismSpatialConfig({ sceneId, hiZEnabled: true }));
      expect(culling.frustumCulledObjects + culling.frustumVisibleObjects).toBe(culling.totalObjects);
      expect(culling.hiZOccludedObjects + culling.survivingObjects).toBe(culling.frustumVisibleObjects);
      expect(culling.frustumCulledObjects + culling.hiZOccludedObjects + culling.survivingObjects).toBe(
        culling.totalObjects,
      );
      expect(culling.drawCallReductionPct).toBeGreaterThan(50);
    }
  });

  it("Hi-Z 차폐 컬링 활성화 시 비활성화 대비 생존 객체와 드로우콜이 유의미하게 감소한다", () => {
    const withHiZ = computePrismHiZCulling(
      normalizePrismSpatialConfig({ sceneId: "fantasy-cathedral", hiZEnabled: true }),
    );
    const withoutHiZ = computePrismHiZCulling(
      normalizePrismSpatialConfig({ sceneId: "fantasy-cathedral", hiZEnabled: false }),
    );

    expect(withHiZ.hiZOccludedObjects).toBeGreaterThan(0);
    expect(withHiZ.survivingObjects).toBeLessThan(withoutHiZ.survivingObjects);
    expect(withHiZ.finalDrawCalls).toBeLessThan(withoutHiZ.finalDrawCalls);
    expect(withHiZ.hiZAdditionalDrawCallSaved).toBeGreaterThan(0);
    expect(withHiZ.drawCallReductionPct).toBeGreaterThan(withoutHiZ.drawCallReductionPct);
  });

  it("Hi-Z 비활성화 시 hiZOccludedObjects=0, 추가 절감=0, 피라미드 밉 커버리지 0%로 기준선을 제공한다", () => {
    const baseline = computePrismHiZCulling(
      normalizePrismSpatialConfig({ sceneId: "seoul-urban-street", hiZEnabled: false }),
    );
    expect(baseline.hiZEnabled).toBe(false);
    expect(baseline.hiZOccludedObjects).toBe(0);
    expect(baseline.hiZCullRatioPct).toBe(0);
    expect(baseline.hiZAdditionalDrawCallSaved).toBe(0);
    expect(baseline.hiZPyramidMips.every((mip) => mip.occluderCoveragePct === 0)).toBe(true);
  });

  it("LOD 0..3 breakdown의 객체 합이 survivingObjects와, 드로우콜 합이 finalDrawCalls와 정확히 일치한다", () => {
    const culling = computePrismHiZCulling(normalizePrismSpatialConfig({ sceneId: "school-corridor" }));
    expect(culling.lodBreakdown.map((item) => item.lod)).toEqual([...PRISM_LOD_LEVELS]);
    const lodObjSum = culling.lodBreakdown.reduce((acc, item) => acc + item.objectCount, 0);
    const lodDcSum = culling.lodBreakdown.reduce((acc, item) => acc + item.drawCalls, 0);
    expect(lodObjSum).toBe(culling.survivingObjects);
    expect(lodDcSum).toBe(culling.finalDrawCalls);
  });

  it("lodBias를 높이면 원경 LOD 2+3 비중이 늘고 드로우콜 및 삼각형 수가 감소한다", () => {
    const sharp = computePrismHiZCulling(normalizePrismSpatialConfig({ lodBias: -1.0 }));
    const lightweight = computePrismHiZCulling(normalizePrismSpatialConfig({ lodBias: 2.0 }));

    const sharpFar = (sharp.lodBreakdown[2]?.objectCount ?? 0) + (sharp.lodBreakdown[3]?.objectCount ?? 0);
    const lightFar =
      (lightweight.lodBreakdown[2]?.objectCount ?? 0) + (lightweight.lodBreakdown[3]?.objectCount ?? 0);

    expect(lightFar).toBeGreaterThan(sharpFar);
    expect(lightweight.finalDrawCalls).toBeLessThan(sharp.finalDrawCalls);
    expect(lightweight.survivingTriangles).toBeLessThan(sharp.survivingTriangles);
  });

  it("Hi-Z 깊이 피라미드가 512×256에서 레벨마다 절반씩 축소되어 지정 단계 수만큼 생성된다", () => {
    const culling = computePrismHiZCulling(normalizePrismSpatialConfig({ hiZPyramidLevels: 6, hiZEnabled: true }));
    expect(culling.hiZPyramidMips).toHaveLength(6);
    expect(culling.hiZPyramidMips[0]?.width).toBe(512);
    expect(culling.hiZPyramidMips[0]?.height).toBe(256);
    expect(culling.hiZPyramidMips[1]?.width).toBe(256);
    expect(culling.hiZPyramidMips[1]?.height).toBe(128);
    expect(culling.hiZPyramidMips[5]?.width).toBe(16);
    expect(culling.hiZPyramidMips[5]?.height).toBe(8);
  });

  it("탑다운 36개 샘플 노드의 Hi-Z 제거 상태가 토글에 연동되며 동일 입력에서 결정론적이다", () => {
    const cfgOn = normalizePrismSpatialConfig({ sceneId: "seoul-urban-street", hiZEnabled: true });
    const cfgOff = normalizePrismSpatialConfig({ sceneId: "seoul-urban-street", hiZEnabled: false });
    const on1 = computePrismHiZCulling(cfgOn);
    const on2 = computePrismHiZCulling(cfgOn);
    const off = computePrismHiZCulling(cfgOff);

    expect(on1.topDownSamples).toHaveLength(36);
    expect(on1.topDownSamples).toEqual(on2.topDownSamples);
    expect(off.topDownSamples.filter((n) => n.state === "hiz-culled")).toHaveLength(0);
    expect(on1.topDownSamples.filter((n) => n.state === "hiz-culled").length).toBeGreaterThan(0);
  });
});

describe("2. 24×24 공간 해시 브러시 모 입자 동역학 · O(1) 근접 탐색 실측", () => {
  it("기본 공간 해시 격자가 24×24(576셀)이며 pairsMeasured=true를 보고한다", () => {
    const hash = simulateSpatialHashBristleDynamics(normalizePrismSpatialConfig());
    expect(hash.pairsMeasured).toBe(true);
    expect(hash.gridSize).toBe(24);
    expect(hash.totalCellCount).toBe(576);
  });

  it("브루트포스 O(N²) 쌍 대비 24×24 공간 해시 탐색 쌍이 크게 절감된다", () => {
    const hash = simulateSpatialHashBristleDynamics(
      normalizePrismSpatialConfig({ gridSize: 24, particleCount: 96 }),
    );
    expect(hash.bruteForcePairs).toBe((96 * 95) / 2);
    expect(hash.spatialHashCheckedPairs).toBeGreaterThan(0);
    expect(hash.spatialHashCheckedPairs).toBeLessThan(hash.bruteForcePairs);
    expect(hash.pairReductionFactor).toBeGreaterThan(5);
    expect(hash.pairReductionPct).toBeGreaterThan(80);
  });

  it("입자 수 증가(24→96→192)에 따라 브루트포스 쌍과 점유 셀 수가 단조 증가한다", () => {
    const small = simulateSpatialHashBristleDynamics(normalizePrismSpatialConfig({ particleCount: 24 }));
    const medium = simulateSpatialHashBristleDynamics(normalizePrismSpatialConfig({ particleCount: 96 }));
    const large = simulateSpatialHashBristleDynamics(normalizePrismSpatialConfig({ particleCount: 192 }));

    expect(small.bruteForcePairs).toBeLessThan(medium.bruteForcePairs);
    expect(medium.bruteForcePairs).toBeLessThan(large.bruteForcePairs);
    expect(small.occupiedCellCount).toBeLessThan(medium.occupiedCellCount);
    expect(medium.occupiedCellCount).toBeLessThan(large.occupiedCellCount);
  });

  it("격자 해상도(12×12 → 24×24 → 32×32)가 세밀할수록 탐색 쌍이 줄고 절감 배수가 커진다", () => {
    const coarse = simulateSpatialHashBristleDynamics(
      normalizePrismSpatialConfig({ gridSize: 12, particleCount: 144 }),
    );
    const std = simulateSpatialHashBristleDynamics(
      normalizePrismSpatialConfig({ gridSize: 24, particleCount: 144 }),
    );
    const fine = simulateSpatialHashBristleDynamics(
      normalizePrismSpatialConfig({ gridSize: 32, particleCount: 144 }),
    );

    expect(fine.spatialHashCheckedPairs).toBeLessThan(std.spatialHashCheckedPairs);
    expect(std.spatialHashCheckedPairs).toBeLessThan(coarse.spatialHashCheckedPairs);
    expect(fine.pairReductionFactor).toBeGreaterThan(std.pairReductionFactor);
    expect(std.pairReductionFactor).toBeGreaterThan(coarse.pairReductionFactor);
  });

  it("브러시 모 입자 반발·안료 뭉침·ToonCore 벡터 경계 충돌 상호작용이 모두 계산된다", () => {
    const hash = simulateSpatialHashBristleDynamics(
      normalizePrismSpatialConfig({ gridSize: 24, particleCount: 168 }),
    );
    expect(hash.repulsionInteractions).toBeGreaterThan(0);
    expect(hash.pigmentClumpPairs).toBeGreaterThan(0);
    expect(hash.vectorBoundaryCollisions).toBeGreaterThan(0);
    expect(hash.meanPigmentClumpingIndex).toBeGreaterThan(0);
    expect(hash.meanPigmentClumpingIndex).toBeLessThanOrEqual(1);
  });

  it("점유 hotCells의 입자 수 합이 particleCount와 정확히 일치하고 좌표가 유효 격자 범위 안이다", () => {
    const hash = simulateSpatialHashBristleDynamics(
      normalizePrismSpatialConfig({ gridSize: 24, particleCount: 120 }),
    );
    const sumCount = hash.hotCells.reduce((acc, cell) => acc + cell.count, 0);
    expect(sumCount).toBe(120);
    expect(hash.hotCells).toHaveLength(hash.occupiedCellCount);
    for (const cell of hash.hotCells) {
      expect(cell.cx).toBeGreaterThanOrEqual(0);
      expect(cell.cx).toBeLessThan(24);
      expect(cell.cy).toBeGreaterThanOrEqual(0);
      expect(cell.cy).toBeLessThan(24);
    }
  });

  it("sampleParticles 좌표 및 밀도가 정규화 범위를 지키며 동일 입력에서 결정론적이다", () => {
    const cfg = normalizePrismSpatialConfig({ sceneId: "atelier-studio", gridSize: 24, particleCount: 84 });
    const a = simulateSpatialHashBristleDynamics(cfg);
    const b = simulateSpatialHashBristleDynamics(cfg);
    expect(a).toEqual(b);
    expect(a.sampleParticles).toHaveLength(84);
    for (const p of a.sampleParticles) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
      expect(p.clumpDensity).toBeGreaterThanOrEqual(0);
      expect(p.clumpDensity).toBeLessThanOrEqual(1);
    }
  });

  it("벡터 경계 충돌이 발생한 경우 경계 충돌 표시된 hotCell이 1개 이상 존재한다", () => {
    const hash = simulateSpatialHashBristleDynamics(
      normalizePrismSpatialConfig({ gridSize: 24, particleCount: 144 }),
    );
    expect(hash.vectorBoundaryPolyline.length).toBeGreaterThanOrEqual(4);
    expect(hash.vectorBoundaryCollisions).toBeGreaterThan(0);
    expect(hash.hotCells.some((cell) => cell.hasBoundaryHit)).toBe(true);
  });
});

describe("3. 2D→2.5D 신경망 깊이 합성 (4층 0.0~1.0 깊이 맵 및 Z-분리 마스크)", () => {
  it("전경 인물·중경 소품·후경 건축·대기 원근 4층이 0.0~1.0 단조 증가 순서로 생성된다", () => {
    const depth = synthesizeNeuralDepth25D(normalizePrismSpatialConfig());
    expect(depth.layerCount).toBe(4);
    expect(depth.depthRange).toEqual([0, 1]);
    expect(depth.layers.map((l) => l.id)).toEqual([...PRISM_DEPTH_LAYER_IDS]);

    for (let i = 1; i < depth.layers.length; i += 1) {
      const prev = depth.layers[i - 1];
      const curr = depth.layers[i];
      expect(prev && curr && curr.normalizedDepth > prev.normalizedDepth).toBe(true);
      expect(prev && curr && curr.depthMin > prev.depthMax).toBe(true);
    }
  });

  it("4층의 depthMin<=normalizedDepth<=depthMax 및 Z-마스크 면적 합계 100%를 만족한다", () => {
    for (const sceneId of PRISM_SCENE_IDS) {
      const depth = synthesizeNeuralDepth25D(normalizePrismSpatialConfig({ sceneId }));
      const shareSum = depth.layers.reduce((acc, layer) => acc + layer.zMaskCoveragePct, 0);
      expect(shareSum).toBe(100);
      for (const layer of depth.layers) {
        expect(layer.depthMin).toBeGreaterThanOrEqual(0);
        expect(layer.depthMax).toBeLessThanOrEqual(1);
        expect(layer.normalizedDepth).toBeGreaterThanOrEqual(layer.depthMin);
        expect(layer.normalizedDepth).toBeLessThanOrEqual(layer.depthMax);
      }
    }
  });

  it("2.5D 시차 이동량(parallaxShiftPx)이 전경 인물에서 대기 원근으로 갈수록 엄격히 감소한다", () => {
    const depth = synthesizeNeuralDepth25D(normalizePrismSpatialConfig());
    for (let i = 1; i < depth.layers.length; i += 1) {
      expect(depth.layers[i - 1]?.parallaxShiftPx ?? 0).toBeGreaterThan(depth.layers[i]?.parallaxShiftPx ?? 999);
    }
    expect(depth.effectiveParallaxSpanPx).toBeGreaterThan(0);
  });

  it("depthSeparationStrength를 높이면 경계 무결성이 오르고 Z-마스크 겹침 충돌률이 낮아진다", () => {
    const soft = synthesizeNeuralDepth25D(normalizePrismSpatialConfig({ depthSeparationStrength: 0.25 }));
    const crisp = synthesizeNeuralDepth25D(normalizePrismSpatialConfig({ depthSeparationStrength: 0.95 }));

    expect(crisp.layers[0]?.maskEdgeIntegrityPct ?? 0).toBeGreaterThan(soft.layers[0]?.maskEdgeIntegrityPct ?? 100);
    expect(crisp.zMaskOverlapConflictPct).toBeLessThan(soft.zMaskOverlapConflictPct);
    expect(crisp.effectiveParallaxSpanPx).toBeGreaterThan(soft.effectiveParallaxSpanPx);
  });

  it("atmosphericHazeAmount 증가 시 원경 대기 감쇠가 높아지고 0일 때 감쇠가 0이 된다", () => {
    const clear = synthesizeNeuralDepth25D(normalizePrismSpatialConfig({ atmosphericHazeAmount: 0 }));
    const misty = synthesizeNeuralDepth25D(normalizePrismSpatialConfig({ atmosphericHazeAmount: 0.85 }));

    expect(clear.layers.every((l) => l.aerialAttenuation === 0)).toBe(true);
    expect(misty.layers[3]?.aerialAttenuation ?? 0).toBeGreaterThan(misty.layers[0]?.aerialAttenuation ?? 1);
    expect(misty.layers[3]?.aerialAttenuation ?? 0).toBeGreaterThan(0.5);
  });

  it("focalDepth에 가까운 전경 층보다 멀리 떨어진 원경 층의 착란원 블러 반경이 더 크다", () => {
    const depth = synthesizeNeuralDepth25D(normalizePrismSpatialConfig({ focalDepth: 0.12 }));
    expect(depth.layers[0]?.defocusBlurRadiusPx ?? 999).toBeLessThan(depth.layers[3]?.defocusBlurRadiusPx ?? 0);
  });

  it("12칼럼 깊이 프로파일이 모두 0.0~1.0 범위를 벗어나지 않는다", () => {
    const depth = synthesizeNeuralDepth25D(normalizePrismSpatialConfig({ sceneId: "fantasy-cathedral" }));
    expect(depth.depthProfileColumns).toHaveLength(12);
    for (const col of depth.depthProfileColumns) {
      expect(col.depthValue).toBeGreaterThanOrEqual(0);
      expect(col.depthValue).toBeLessThanOrEqual(1);
    }
  });
});

describe("4. 통합 리포트 · 브랜드 계약 · exportPrismSpatialRenderJson 매니페스트", () => {
  it("buildPrismSpatialRenderReport가 정확한 modelKind와 ToonStudio 고유 브랜드를 반환한다", () => {
    const report = buildPrismSpatialRenderReport();
    expect(report.schemaVersion).toBe(PRISM_SPATIAL_RENDER_SCHEMA_VERSION);
    expect(report.modelKind).toBe(PRISM_SPATIAL_MODEL_KIND);
    expect(report.modelKind).toBe("deterministic-depth-and-culling-reference-model");
    expect(report.engineBrand).toBe(PRISM_ENGINE_BRAND);
    expect(report.stageBrand).toBe(ATELIER_STAGE_BRAND);
    expect(report.runtimeBrand).toBe(TOON_CORE_BRAND);
  });

  it("현재 구현(Current)과 목표 런타임(Target) 실행 플래그를 정직하게 구분한다", () => {
    const report = buildPrismSpatialRenderReport();
    expect(report.sourceKind).toBe("cpu-reference-model");
    expect(report.gpuPipelineExecuted).toBe(false);
    expect(report.neuralInferenceExecuted).toBe(false);
    expect(report.spatialHashPairsMeasured).toBe(true);
    expect(report.honestScopeDisclosure.currentImplementationKo).toContain("현재 구현");
    expect(report.honestScopeDisclosure.targetRuntimeKo).toContain("목표 런타임");
  });

  it("exportPrismSpatialRenderJson이 유효한 매니페스트 JSON을 생성하고 핵심 섹션을 모두 포함한다", () => {
    const report = buildPrismSpatialRenderReport({ sceneId: "school-corridor", gridSize: 24, particleCount: 96 });
    const json = exportPrismSpatialRenderJson(report);
    const parsed = JSON.parse(json) as Record<string, unknown>;

    expect(parsed.schemaVersion).toBe(PRISM_SPATIAL_RENDER_SCHEMA_VERSION);
    expect(parsed.modelKind).toBe("deterministic-depth-and-culling-reference-model");
    expect(parsed.brands).toEqual({
      renderEngine: "PrismRender",
      stage: "AtelierStage",
      runtime: "ToonCore",
    });
    expect(parsed.cullingSummary).toBeDefined();
    expect(parsed.spatialHashSummary).toBeDefined();
    expect(parsed.depthSynthesisSummary).toBeDefined();
  });

  it("동일 입력으로 두 번 직렬화한 매니페스트 JSON이 바이트 단위로 100% 동일하다", () => {
    const input = { sceneId: "fantasy-cathedral" as PrismSceneId, hiZEnabled: true, lodBias: 0.5, particleCount: 120 };
    const json1 = exportPrismSpatialRenderJson(buildPrismSpatialRenderReport(input));
    const json2 = exportPrismSpatialRenderJson(buildPrismSpatialRenderReport(input));
    expect(json1).toBe(json2);
  });

  it("4종 씬 각각의 JSON 라운드트립이 총 객체 수(4800·7200·2400·1200)를 정확히 보존한다", () => {
    const expected: Record<PrismSceneId, number> = {
      "seoul-urban-street": 4800,
      "fantasy-cathedral": 7200,
      "school-corridor": 2400,
      "atelier-studio": 1200,
    };
    for (const sceneId of PRISM_SCENE_IDS) {
      const parsed = JSON.parse(exportPrismSpatialRenderJson(buildPrismSpatialRenderReport({ sceneId }))) as {
        scene: { totalObjects: number };
      };
      expect(parsed.scene.totalObjects).toBe(expected[sceneId]);
    }
  });
});

describe("5. StudioPrismSpatialRenderPanel UI 상호작용 · 2단 SVG · JSON 내보내기 · 접근성", () => {
  it("선택적 props 없이 기본 렌더링되며 2단 SVG·4종 씬·4층 깊이 테이블을 표시한다", () => {
    render(<StudioPrismSpatialRenderPanel />);
    expect(screen.getByTestId("studio-prism-spatial-render-panel")).toBeDefined();
    expect(screen.getByTestId("prism-model-kind").textContent).toBe(
      "deterministic-depth-and-culling-reference-model",
    );
    expect(screen.getByTestId("prism-topdown-culling-svg").getAttribute("data-scene-id")).toBe("seoul-urban-street");
    expect(screen.getByTestId("prism-depth-spatial-hash-svg").getAttribute("data-grid-size")).toBe("24");
    expect(screen.getByTestId("prism-depth-layer-table").querySelectorAll("tbody tr")).toHaveLength(4);
  });

  it("4종 씬 버튼 클릭 시 탑다운 SVG 속성과 onReportChange 콜백이 즉시 갱신된다", () => {
    const onReportChange = vi.fn();
    render(<StudioPrismSpatialRenderPanel onReportChange={onReportChange} />);

    fireEvent.click(screen.getByTestId("scene-btn-fantasy-cathedral"));
    expect(screen.getByTestId("prism-topdown-culling-svg").getAttribute("data-scene-id")).toBe("fantasy-cathedral");
    expect(screen.getByTestId("prism-topdown-culling-svg").getAttribute("data-total-objects")).toBe("7200");

    const [latest] = onReportChange.mock.calls.at(-1) as [PrismSpatialRenderReport];
    expect(latest.scene.id).toBe("fantasy-cathedral");
    expect(latest.culling.totalObjects).toBe(7200);

    fireEvent.click(screen.getByTestId("scene-btn-atelier-studio"));
    expect(screen.getByTestId("prism-topdown-culling-svg").getAttribute("data-total-objects")).toBe("1200");
  });

  it("Hi-Z 공격적 차폐 토글 클릭 시 차폐 제거 객체가 0과 양수 사이로 전환된다", () => {
    render(<StudioPrismSpatialRenderPanel />);
    const svg = screen.getByTestId("prism-topdown-culling-svg");
    expect(svg.getAttribute("data-hiz-enabled")).toBe("true");
    expect(Number(svg.getAttribute("data-hiz-occluded"))).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId("hiz-toggle-btn"));
    expect(svg.getAttribute("data-hiz-enabled")).toBe("false");
    expect(svg.getAttribute("data-hiz-occluded")).toBe("0");

    fireEvent.click(screen.getByTestId("hiz-toggle-btn"));
    expect(svg.getAttribute("data-hiz-enabled")).toBe("true");
    expect(Number(svg.getAttribute("data-hiz-occluded"))).toBeGreaterThan(0);
  });

  it("LOD·공간 해시 셀·입자 수·깊이 분리 4종 슬라이더 변경 시 리드아웃과 SVG가 즉시 업데이트된다", () => {
    render(<StudioPrismSpatialRenderPanel />);

    fireEvent.change(screen.getByTestId("lod-bias-slider"), { target: { value: "1.5" } });
    expect(screen.getByTestId("lod-bias-readout").textContent).toBe("+1.50");

    fireEvent.change(screen.getByTestId("grid-size-slider"), { target: { value: "32" } });
    expect(screen.getByTestId("grid-size-readout").textContent).toBe("32×32");
    expect(screen.getByTestId("prism-depth-spatial-hash-svg").getAttribute("data-grid-size")).toBe("32");

    fireEvent.change(screen.getByTestId("particle-count-slider"), { target: { value: "168" } });
    expect(screen.getByTestId("particle-count-readout").textContent).toBe("168");
    expect(screen.getByTestId("prism-depth-spatial-hash-svg").getAttribute("data-particle-count")).toBe("168");

    fireEvent.change(screen.getByTestId("depth-separation-slider"), { target: { value: "0.95" } });
    expect(screen.getByTestId("depth-separation-readout").textContent).toBe("95%");
    expect(screen.getByTestId("prism-depth-spatial-hash-svg").getAttribute("data-depth-separation")).toBe("0.95");
  });

  it("JSON 내보내기·미리보기 토글·초기값 복원 버튼이 정상 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioPrismSpatialRenderPanel initialSceneId="school-corridor" onExportJson={onExportJson} />);

    expect(screen.queryByTestId("prism-json-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("export-prism-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    const [jsonArg, reportArg] = onExportJson.mock.calls[0] as [string, PrismSpatialRenderReport];
    expect(jsonArg).toContain(PRISM_SPATIAL_RENDER_SCHEMA_VERSION);
    expect(reportArg.scene.id).toBe("school-corridor");
    expect(screen.getByTestId("prism-json-preview").textContent).toContain(PRISM_SPATIAL_MODEL_KIND);

    fireEvent.click(screen.getByTestId("toggle-prism-json-btn"));
    expect(screen.queryByTestId("prism-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("scene-btn-atelier-studio"));
    expect(screen.getByTestId("prism-topdown-culling-svg").getAttribute("data-scene-id")).toBe("atelier-studio");

    fireEvent.click(screen.getByTestId("reset-prism-panel-btn"));
    expect(screen.getByTestId("prism-topdown-culling-svg").getAttribute("data-scene-id")).toBe("school-corridor");
  });

  it("JSON 복사 버튼이 클립보드 API 가용·미가용 경로를 모두 안전하게 처리한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });

    render(<StudioPrismSpatialRenderPanel />);
    fireEvent.click(screen.getByTestId("copy-prism-json-btn"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("prism-spatial-status").textContent).toContain("JSON");
    });

    cleanup();
    vi.stubGlobal("navigator", {});
    render(<StudioPrismSpatialRenderPanel />);
    fireEvent.click(screen.getByTestId("copy-prism-json-btn"));
    expect(screen.getByTestId("prism-json-preview")).toBeDefined();
    expect(screen.getByTestId("prism-spatial-status").textContent).toContain("JSON");
  });

  it("영문 로케일(locale='en') 렌더링과 모든 버튼의 min-h-11 터치 타깃 계약을 만족한다", () => {
    const { container } = render(<StudioPrismSpatialRenderPanel locale="en" />);
    expect(screen.getByTestId("prism-topdown-culling-svg").textContent).toContain("PRISM RENDER");
    expect(screen.getByTestId("prism-depth-spatial-hash-svg").textContent).toContain("2.5D 4-LAYER DEPTH");

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(9);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }
  });
});

describe("6. 코드 위생 · 줄 수 상한 · 탈-바이올렛 OKLCH · 100% 고유 브랜드 계약 자가 검증", () => {
  it("소유 파일 4개가 정확히 존재하며 줄 수 상한(engine<=730, panel<=680, 전체<=800)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "prism-spatial-render-engine.ts",
      "StudioPrismSpatialRenderPanel.tsx",
      "index.ts",
      "prism-spatial-render.test.tsx",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }
    const allTsFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allTsFiles.sort()).toEqual([...required].sort());

    for (const file of allTsFiles) {
      const lineCount = readFileSync(path.join(dir, file), "utf8").split(/\r?\n/u).length;
      expect(lineCount).toBeLessThanOrEqual(800);
      if (file === "prism-spatial-render-engine.ts") expect(lineCount).toBeLessThanOrEqual(730);
      if (file === "StudioPrismSpatialRenderPanel.tsx") expect(lineCount).toBeLessThanOrEqual(680);
    }
  });

  it("소스 3개 파일에 금지 패턴(원시 색·storage·BigInt·private Map·아이콘·번역투·전역 전환·기본 props)이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const forbiddenIcon = ["Spark", "les"].join("");
    const forbiddenStorageA = ["local", "Storage"].join("");
    const forbiddenStorageB = ["session", "Storage"].join("");
    const forbiddenTransition = ["transition", "-all"].join("");

    for (const file of ["prism-spatial-render-engine.ts", "StudioPrismSpatialRenderPanel.tsx", "index.ts"]) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src).not.toContain(forbiddenStorageA);
      expect(src).not.toContain(forbiddenStorageB);
      expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
      expect(src).not.toMatch(/\b\d+n\b/u);
      expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src).not.toMatch(/\brgba?\s*\(/iu);
      expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      expect(src).not.toContain(forbiddenIcon);
      expect(src).not.toContain("하는 것을 가능하게 합니다");
      expect(src).not.toContain("직관적인 경험을 제공합니다");
      expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      if (file === "StudioPrismSpatialRenderPanel.tsx") {
        expect(src).not.toContain(forbiddenTransition);
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
      }
    }
  });

  it("패널 내 모든 oklch() 색상이 바이올렛 휴(270~320°)를 0% 배제하고 접근성 클래스를 포함한다", () => {
    const panelSrc = readFileSync(
      path.resolve(import.meta.dirname, "StudioPrismSpatialRenderPanel.tsx"),
      "utf8",
    );
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(7);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
    expect(panelSrc).toContain("motion-reduce:transition-none");
  });

  it("소유 4개 파일 전체에 외부 라이브러리·경쟁사 명칭이 0건이고 ToonStudio 고유 브랜드만 사용한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const blockedBrands = [
      ["vel", "lo"],
      ["hoku", "sai"],
      ["sk", "ia"],
      ["thor", "vg"],
      ["c", "sp"],
      ["shapr", "3d"],
      ["pro", "create"],
      ["photo", "shop"],
      ["blen", "der"],
      ["mag", "ma"],
      ["rebel", "le"],
    ].map((parts) => parts.join(""));

    const files = [
      "prism-spatial-render-engine.ts",
      "StudioPrismSpatialRenderPanel.tsx",
      "index.ts",
      "prism-spatial-render.test.tsx",
    ];
    for (const file of files) {
      const lower = readFileSync(path.join(dir, file), "utf8").toLowerCase();
      for (const brand of blockedBrands) {
        expect(lower).not.toContain(brand);
      }
    }
  });
});
