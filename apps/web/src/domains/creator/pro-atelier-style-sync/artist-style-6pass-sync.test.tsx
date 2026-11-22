// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_ARTIST_LINE_PRESETS,
  DEFAULT_SHARED_3D_CLASSROOM_SCENE,
  SIX_PASS_LUT_NODE_COUNT,
  applyNonDestructiveCutPostProcessOverride,
  build3dSixPassStyleSync,
  buildColorTemperatureLut17,
  buildSyntheticCharacterLineLayer,
  clearCutPostProcessOverride,
  computeFocalDepthBlur,
  computeShared3dMaterialsHash,
  createEmptyCutPostProcessOverrideStore,
  extractArtistLineLayerProfile,
  resolveEffectiveCut3dRenderState,
} from "./artist-style-6pass-sync";
import {
  DEFAULT_ASSISTANT_SUBMISSION_CUTS,
  DEFAULT_MASTER_CUT_DNA,
  STYLE_SYNC_DELTA_E_TARGET,
  STYLE_SYNC_STROKE_ERROR_TARGET_PX,
  syncCrossCutMasterWith3dSixPass,
} from "./cross-cut-style-harmonizer-engine";
import { ProAtelierStyleSyncWorkbench } from "./ProAtelierStyleSyncWorkbench";

afterEach(cleanup);

describe("축 27 · 3D→2D 작가 그림체 1클릭 동기화 엔진 (artist-style-6pass-sync)", () => {
  it("캐릭터 선화 레이어 1장에서 주 선색·평균 선폭·종이 입자량을 결정론적으로 로컬 추출한다", () => {
    const warmThinRough = buildSyntheticCharacterLineLayer({
      layerId: "warm-thin-rough",
      layerName: "따뜻한 세피아 얇은 선화",
      lineRgb: { r: 78, g: 42, b: 26 },
      strokeWidthPx: 2,
      paperGrainLevel: 0.78,
    });
    const coolThickSmooth = buildSyntheticCharacterLineLayer({
      layerId: "cool-thick-smooth",
      layerName: "차가운 남색 굵은 선화",
      lineRgb: { r: 22, g: 34, b: 74 },
      strokeWidthPx: 4,
      paperGrainLevel: 0.08,
    });

    const warmProfile = extractArtistLineLayerProfile(warmThinRough);
    const coolProfile = extractArtistLineLayerProfile(coolThickSmooth);

    expect(warmProfile.inkPixelCount).toBeGreaterThan(0);
    expect(coolProfile.inkPixelCount).toBeGreaterThan(0);
    expect(warmProfile.dominantLineColorRgb.r).toBeGreaterThan(warmProfile.dominantLineColorRgb.b);
    expect(coolProfile.dominantLineColorRgb.b).toBeGreaterThan(coolProfile.dominantLineColorRgb.r);
    expect(warmProfile.estimatedInkKelvin).toBeLessThan(coolProfile.estimatedInkKelvin);
    expect(coolProfile.averageStrokeWidthPx).toBeGreaterThan(warmProfile.averageStrokeWidthPx);
    expect(warmProfile.paperGrainAmount).toBeGreaterThan(coolProfile.paperGrainAmount);
  });

  it("투명 배경 선화 레이어에서도 종이 입자 힌트와 선폭을 안전하게 추출한다", () => {
    const transparentSample = buildSyntheticCharacterLineLayer({
      layerId: "transparent-ink",
      layerName: "투명 선화 레이어",
      lineRgb: { r: 35, g: 32, b: 44 },
      strokeWidthPx: 3,
      paperGrainLevel: 0.45,
      transparentPaper: true,
    });
    const profile = extractArtistLineLayerProfile(transparentSample);

    expect(profile.averageStrokeWidthPx).toBeGreaterThanOrEqual(2.5);
    expect(profile.paperGrainAmount).toBeCloseTo(0.45, 2);
    expect(profile.dominantLineCssOklch).toMatch(/^oklch\(/);
  });

  it("초점거리 증가(24mm→50mm→85mm→135mm) 및 개방 조리개(f/8→f/2.0)에 따라 가우시안·보케 블러가 단조 증가한다", () => {
    const blur24 = computeFocalDepthBlur({
      focalLengthMm: 24,
      apertureFStop: 2.8,
      subjectDistanceM: 2.5,
      backgroundDistanceM: 10,
    });
    const blur50 = computeFocalDepthBlur({
      focalLengthMm: 50,
      apertureFStop: 2.8,
      subjectDistanceM: 2.5,
      backgroundDistanceM: 10,
    });
    const blur85 = computeFocalDepthBlur({
      focalLengthMm: 85,
      apertureFStop: 2.8,
      subjectDistanceM: 2.5,
      backgroundDistanceM: 10,
    });
    const blur135 = computeFocalDepthBlur({
      focalLengthMm: 135,
      apertureFStop: 2.8,
      subjectDistanceM: 2.5,
      backgroundDistanceM: 10,
    });

    expect(blur24.gaussianRadiusPx).toBeLessThan(blur50.gaussianRadiusPx);
    expect(blur50.gaussianRadiusPx).toBeLessThan(blur85.gaussianRadiusPx);
    expect(blur85.gaussianRadiusPx).toBeLessThanOrEqual(blur135.gaussianRadiusPx);
    expect(blur85.bokehDiskRadiusPx).toBeGreaterThan(blur24.bokehDiskRadiusPx);

    const stoppedDown = computeFocalDepthBlur({
      focalLengthMm: 85,
      apertureFStop: 8,
      subjectDistanceM: 2.5,
      backgroundDistanceM: 10,
    });
    const wideOpen = computeFocalDepthBlur({
      focalLengthMm: 85,
      apertureFStop: 2.0,
      subjectDistanceM: 2.5,
      backgroundDistanceM: 10,
    });
    expect(wideOpen.gaussianRadiusPx).toBeGreaterThan(stoppedDown.gaussianRadiusPx);
    expect(wideOpen.bokehBladeCount).toBe(9);
  });

  it("17노드 색온도 LUT는 단조 증가 휘도를 유지하고 석양(3100K)은 R 게인 우세·야간(6800K)은 B 게인 우세를 띤다", () => {
    const sunsetLut = buildColorTemperatureLut17(3100, 0.68, 1.14, 1);
    const nightLut = buildColorTemperatureLut17(6800, -0.52, 1.22, 1);

    expect(sunsetLut).toHaveLength(SIX_PASS_LUT_NODE_COUNT);
    expect(sunsetLut[0]?.outputLuminance).toBe(0);
    expect(sunsetLut[16]?.outputLuminance).toBe(1);
    for (let i = 1; i < sunsetLut.length; i += 1) {
      expect(sunsetLut[i]!.outputLuminance).toBeGreaterThanOrEqual(
        sunsetLut[i - 1]!.outputLuminance,
      );
    }
    expect(sunsetLut[8]!.rGain).toBeGreaterThan(sunsetLut[8]!.bGain);
    expect(nightLut[8]!.bGain).toBeGreaterThan(nightLut[8]!.rGain);
  });

  it("#135 실내 형광등→야외 석양 컷 전환 시 공유 3D 배경 원본 재질을 절대 변경하지 않고 컷 오버라이드 레이어에만 기록한다", () => {
    const sharedScene = DEFAULT_SHARED_3D_CLASSROOM_SCENE;
    const originalSnapshotJson = JSON.stringify(sharedScene.baseMaterials);
    const originalHash = computeShared3dMaterialsHash(sharedScene.baseMaterials);

    const profile = extractArtistLineLayerProfile(DEFAULT_ARTIST_LINE_PRESETS[0]!.sample);
    const indoorPlan = build3dSixPassStyleSync({
      profile,
      lightingPresetId: "indoor-fluorescent",
      depthBlurInput: { focalLengthMm: 35, apertureFStop: 4.0 },
    });
    const sunsetPlan = build3dSixPassStyleSync({
      profile,
      lightingPresetId: "outdoor-sunset",
      depthBlurInput: { focalLengthMm: 85, apertureFStop: 2.0 },
    });

    let store = createEmptyCutPostProcessOverrideStore(sharedScene.sceneId);
    const cutAOutcome = applyNonDestructiveCutPostProcessOverride({
      sharedScene,
      store,
      cutId: "cut-indoor-01",
      cutLabel: "실내 교실 컷",
      sixPassPlan: indoorPlan,
    });
    store = cutAOutcome.store;

    const cutBStep1 = applyNonDestructiveCutPostProcessOverride({
      sharedScene,
      store,
      cutId: "cut-sunset-02",
      cutLabel: "창가 전환 컷",
      sixPassPlan: indoorPlan,
    });
    store = cutBStep1.store;

    // 실내 형광등 → 야외 석양 전환
    const cutBStep2 = applyNonDestructiveCutPostProcessOverride({
      sharedScene,
      store,
      cutId: "cut-sunset-02",
      cutLabel: "창가 전환 컷",
      sixPassPlan: sunsetPlan,
    });
    store = cutBStep2.store;

    // 공유 3D 원본 재질은 바이트 단위로 100% 동일해야 한다
    expect(JSON.stringify(sharedScene.baseMaterials)).toBe(originalSnapshotJson);
    expect(computeShared3dMaterialsHash(sharedScene.baseMaterials)).toBe(originalHash);
    expect(cutBStep2.sharedSceneIntegrityPreserved).toBe(true);
    expect(cutBStep2.overrideLayer.sharedMaterialMutated).toBe(false);
    expect(cutBStep2.overrideLayer.revision).toBe(2);
    expect(cutBStep2.overrideLayer.lightingPresetId).toBe("outdoor-sunset");

    // 컷 A(실내)·컷 B(석양)·컷 C(오버라이드 없음)가 서로 간섭 없이 독립 렌더 상태를 가진다
    const stateA = resolveEffectiveCut3dRenderState(sharedScene, store, "cut-indoor-01");
    const stateB = resolveEffectiveCut3dRenderState(sharedScene, store, "cut-sunset-02");
    const stateC = resolveEffectiveCut3dRenderState(sharedScene, store, "cut-untouched-03");

    expect(stateA.activeOverride?.lightingPresetId).toBe("indoor-fluorescent");
    expect(stateB.activeOverride?.lightingPresetId).toBe("outdoor-sunset");
    expect(stateB.effectiveGaussianBlurPx).toBeGreaterThan(stateA.effectiveGaussianBlurPx);
    expect(stateC.activeOverride).toBeNull();
    expect(stateC.effectiveGaussianBlurPx).toBe(0);
    expect(stateC.materialsIntegrityHash).toBe(originalHash);

    // 오버라이드 해제 후 원본 복귀
    const cleared = clearCutPostProcessOverride(store, "cut-sunset-02");
    expect(resolveEffectiveCut3dRenderState(sharedScene, cleared, "cut-sunset-02").activeOverride).toBeNull();
  });

  it("cross-cut-style-harmonizer-engine 브리지(syncCrossCutMasterWith3dSixPass)가 6패스 계획과 전 컷 수렴을 동시 검증한다", () => {
    const bridged = syncCrossCutMasterWith3dSixPass({
      baseMaster: DEFAULT_MASTER_CUT_DNA,
      lineSample: DEFAULT_ARTIST_LINE_PRESETS[0]!.sample,
      submittedCuts: DEFAULT_ASSISTANT_SUBMISSION_CUTS,
      lightingPresetId: "outdoor-sunset",
      depthBlurInput: { focalLengthMm: 85, apertureFStop: 2.2 },
      syncStrength: 1,
    });

    expect(bridged.updatedMaster.averageStrokeWidthPx).toBe(
      bridged.extractedProfile.averageStrokeWidthPx,
    );
    expect(bridged.sixPassPlan.lightingPresetId).toBe("outdoor-sunset");
    expect(bridged.harmonizationReport.afterMaxDeltaE).toBeLessThanOrEqual(STYLE_SYNC_DELTA_E_TARGET);
    expect(bridged.harmonizationReport.afterMaxStrokeErrorPx).toBeLessThanOrEqual(
      STYLE_SYNC_STROKE_ERROR_TARGET_PX,
    );
    expect(bridged.harmonizationReport.convergencePassed).toBe(true);
  });

  it("ProAtelierStyleSyncWorkbench에서 3D→2D 6패스 동기화와 야외 석양 비파괴 컷 오버라이드가 즉시 반응한다", () => {
    render(<ProAtelierStyleSyncWorkbench />);

    expect(screen.getByTestId("pas-3d-sixpass-sync-section")).toBeTruthy();
    const initialHashText = screen.getByTestId("pas-shared-scene-hash-badge").textContent;

    fireEvent.click(screen.getByTestId("pas-6pass-focal-135"));
    fireEvent.click(screen.getByTestId("pas-6pass-lighting-outdoor-sunset"));
    fireEvent.click(screen.getByTestId("pas-6pass-apply-override-btn"));

    expect(screen.getByTestId("pas-6pass-override-summary").textContent).toContain("공유 3D 재질 변경 0건");
    expect(screen.getByTestId("pas-6pass-override-summary").textContent).toContain("활성 컷 오버라이드 1개");
    expect(screen.getByTestId("pas-6pass-cut-state-ep01-cut-014-assist-b").textContent).toContain(
      "야외 석양",
    );
    expect(screen.getByTestId("pas-6pass-cut-state-ep01-cut-015-outsource-c").textContent).toContain(
      "공유 3D 원본 유지",
    );
    expect(screen.getByTestId("pas-shared-scene-hash-badge").textContent).toBe(initialHashText);
  });
});
