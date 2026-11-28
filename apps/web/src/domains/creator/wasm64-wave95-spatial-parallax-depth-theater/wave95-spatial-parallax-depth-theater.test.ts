/**
 * Wave 95 — 2D 웹툰 → WebXR·공간 디스플레이 입체 컷 극장 단위·시나리오 테스트 모음.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_IPD_METERS,
  MAX_CONVERGENCE_DEPTH_METERS,
  MAX_IPD_METERS,
  MIN_CONVERGENCE_DEPTH_METERS,
  MIN_IPD_METERS,
  SPATIAL_VIEWER_PRESETS,
  auditDisocclusionMargins,
  buildSpatialParallaxDepthWgsl,
  canonicalizeSpatialPayload,
  compileSpatialTheaterSceneGraph,
  compressLayersIntoComfortZone,
  computeBinocularDisparityArcmin,
  computeOffAxisStereoProjectionPair,
  createSpatialOpticsConfig,
  depthMetersFromDisparityArcmin,
  renderSpatialDepthCrossSectionSvg,
  sha256SpatialSceneHex,
  summarizeSpatialTheaterComfortKo,
  validateSpatialTheaterWgsl,
  type SpatialDepthLayerInput,
  type SpatialEpisodePanelInput,
  type SpatialViewerPresetId,
} from "./index";

function projectPointColumnMajor(
  m: readonly number[],
  x: number,
  y: number,
  z: number,
): readonly [number, number, number] {
  const cx = (m[0] ?? 0) * x + (m[4] ?? 0) * y + (m[8] ?? 0) * z + (m[12] ?? 0);
  const cy = (m[1] ?? 0) * x + (m[5] ?? 0) * y + (m[9] ?? 0) * z + (m[13] ?? 0);
  const cz = (m[2] ?? 0) * x + (m[6] ?? 0) * y + (m[10] ?? 0) * z + (m[14] ?? 0);
  const cw = (m[3] ?? 0) * x + (m[7] ?? 0) * y + (m[11] ?? 0) * z + (m[15] ?? 0);
  return [cx / cw, cy / cw, cz / cw];
}

const EXTREME_ACTION_LAYERS: readonly SpatialDepthLayerInput[] = [
  { layerId: "sky", labelKo: "야경 하늘", role: "sky-backdrop", rawDepthMeters: 150, overscanMarginPx: 64 },
  { layerId: "city", labelKo: "원경 도시", role: "far-background", rawDepthMeters: 28, overscanMarginPx: 48 },
  { layerId: "alley", labelKo: "중경 골목", role: "midground", rawDepthMeters: 4.5, overscanMarginPx: 36 },
  { layerId: "hero", labelKo: "주인공", role: "character", rawDepthMeters: 2.0, overscanMarginPx: 32 },
  { layerId: "debris", labelKo: "파편 소품", role: "foreground-prop", rawDepthMeters: 0.9, overscanMarginPx: 48 },
  { layerId: "slash-fx", labelKo: "검기 돌출", role: "fx-popout", rawDepthMeters: 0.25, overscanMarginPx: 96 },
];

describe("Wave 95 — 공간 디스플레이 프리셋 및 양안 폭주 광학식", () => {
  it("4종 표준 시청 프리셋을 제공하고 물리 IPD(0.052..0.075m)·수렴 거리(1.5..4.0m)를 안전 클램프한다", () => {
    const presetIds: readonly SpatialViewerPresetId[] = [
      "vision-spatial-window",
      "webxr-curved-theater",
      "mobile-parallax-window",
      "desktop-stereo-preview",
    ];
    for (let i = 0; i < presetIds.length; i += 1) {
      const pid = presetIds[i];
      if (!pid) continue;
      const preset = SPATIAL_VIEWER_PRESETS[pid];
      expect(preset.ipdMeters).toBe(DEFAULT_IPD_METERS);
      expect(preset.convergenceDepthMeters).toBeGreaterThanOrEqual(MIN_CONVERGENCE_DEPTH_METERS);
      expect(preset.convergenceDepthMeters).toBeLessThanOrEqual(MAX_CONVERGENCE_DEPTH_METERS);
    }

    const low = createSpatialOpticsConfig("vision-spatial-window", {
      ipdMeters: 0.03,
      convergenceDepthMeters: 0.4,
    });
    expect(low.ipdMeters).toBe(MIN_IPD_METERS);
    expect(low.convergenceDepthMeters).toBe(MIN_CONVERGENCE_DEPTH_METERS);

    const high = createSpatialOpticsConfig("webxr-curved-theater", {
      ipdMeters: 0.12,
      convergenceDepthMeters: 9.0,
    });
    expect(high.ipdMeters).toBe(MAX_IPD_METERS);
    expect(high.convergenceDepthMeters).toBe(MAX_CONVERGENCE_DEPTH_METERS);
  });

  it("수렴 스크린 평면에서는 정확히 0 arcmin(-0 금지)을 반환한다", () => {
    const d = computeBinocularDisparityArcmin(2.2, 2.2, 0.063);
    expect(d).toBe(0);
    expect(Object.is(d, -0)).toBe(false);
  });

  it("스크린 뒤 원경은 양(+), 스크린 앞 돌출은 음(-) 부호 규약을 정확히 따른다", () => {
    const behind = computeBinocularDisparityArcmin(6.0, 2.0, 0.063);
    const popout = computeBinocularDisparityArcmin(1.1, 2.0, 0.063);
    expect(behind).toBeGreaterThan(0);
    expect(popout).toBeLessThan(0);
    expect(Math.abs(popout)).toBeGreaterThan(Math.abs(behind) * 0.5);
  });

  it("양안 시차가 IPD에 거의 선형으로 비례하고 IPD=0이면 0을 반환한다", () => {
    const dNarrow = computeBinocularDisparityArcmin(3.5, 2.0, 0.052);
    const dDefault = computeBinocularDisparityArcmin(3.5, 2.0, 0.063);
    const dWide = computeBinocularDisparityArcmin(3.5, 2.0, 0.075);
    expect(dNarrow).toBeLessThan(dDefault);
    expect(dDefault).toBeLessThan(dWide);
    expect(dWide / dNarrow).toBeCloseTo(0.075 / 0.052, 2);
    expect(computeBinocularDisparityArcmin(3.5, 2.0, 0)).toBe(0);
  });

  it("depthMetersFromDisparityArcmin은 교차·비교차 시차의 정확한 역함수로 왕복 일치한다", () => {
    const samples = [-50, -25, -10, 0, 12, 28, 52];
    for (let i = 0; i < samples.length; i += 1) {
      const target = samples[i] ?? 0;
      const depth = depthMetersFromDisparityArcmin(target, 2.0, 0.063);
      const back = computeBinocularDisparityArcmin(depth, 2.0, 0.063);
      expect(back).toBeCloseTo(target, 6);
    }
  });

  it("큰 수렴 거리(4.0m)와 좁은 IPD(52mm)에서도 극단 원경 요청이 NaN/음수 깊이 없이 안전하다", () => {
    const depth = depthMetersFromDisparityArcmin(120, 4.0, 0.052);
    expect(Number.isFinite(depth)).toBe(true);
    expect(depth).toBeGreaterThan(4.0);
  });
});

describe("Wave 95 — Percival/Sheard VAC 압축 및 대사 복시(Diplopia) 방지", () => {
  it("standard-theater(±60')에서 0.25m 돌출~150m 하늘을 모두 ±60' 안으로 압축하고 단조 순서를 유지한다", () => {
    const optics = createSpatialOpticsConfig("desktop-stereo-preview", {
      comfortTier: "standard-theater",
    });
    const res = compressLayersIntoComfortZone(EXTREME_ACTION_LAYERS, optics);
    expect(res.allWithinVacComfortBounds).toBe(true);
    expect(res.strictDepthMonotonic).toBe(true);
    expect(res.maxCrossedDisparityArcmin).toBeLessThanOrEqual(60);
    expect(res.maxUncrossedDisparityArcmin).toBeLessThanOrEqual(60);
    expect(res.maxCrossedDisparityArcmin).toBeGreaterThan(30);

    for (let i = 1; i < res.layers.length; i += 1) {
      const prev = res.layers[i - 1];
      const curr = res.layers[i];
      expect(prev && curr && prev.compressedDepthMeters > curr.compressedDepthMeters).toBe(true);
    }
  });

  it("calm-strict(±30')에서는 극단 깊이 레이어가 모두 엄격히 ±30' 안으로 압축된다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window", {
      comfortTier: "calm-strict",
    });
    const res = compressLayersIntoComfortZone(EXTREME_ACTION_LAYERS, optics);
    expect(res.allWithinVacComfortBounds).toBe(true);
    expect(res.strictDepthMonotonic).toBe(true);
    expect(res.maxCrossedDisparityArcmin).toBeLessThanOrEqual(30);
    expect(res.maxUncrossedDisparityArcmin).toBeLessThanOrEqual(30);
    expect(res.maxVacConflictDiopters).toBeLessThan(0.2);
  });

  it("각 레이어의 sizeScale = compressedDepth / convergenceDepth가 2D 원근 각크기를 100% 보존한다", () => {
    const optics = createSpatialOpticsConfig("webxr-curved-theater");
    const res = compressLayersIntoComfortZone(EXTREME_ACTION_LAYERS, optics);
    const panelWidthAtScreen = 1.6;
    const expectedAngularRad = 2 * Math.atan(panelWidthAtScreen / (2 * optics.convergenceDepthMeters));

    for (let i = 0; i < res.layers.length; i += 1) {
      const layer = res.layers[i];
      if (!layer) continue;
      expect(layer.sizeScale).toBeCloseTo(
        layer.compressedDepthMeters / optics.convergenceDepthMeters,
        12,
      );
      const scaledWidth = panelWidthAtScreen * layer.sizeScale;
      const apparentAngularRad = 2 * Math.atan(scaledWidth / (2 * layer.compressedDepthMeters));
      expect(apparentAngularRad).toBeCloseTo(expectedAngularRad, 10);
    }
  });

  it("깊은 배경(25m~80m) 위에 놓인 말풍선·자막도 ±15' 안쪽에 고정된다", () => {
    const optics = createSpatialOpticsConfig("webxr-curved-theater");
    const layers: readonly SpatialDepthLayerInput[] = [
      { layerId: "sky", role: "sky-backdrop", rawDepthMeters: 120 },
      { layerId: "bg", role: "far-background", rawDepthMeters: 30 },
      { layerId: "narration", role: "caption", rawDepthMeters: 25 },
      { layerId: "hero", role: "character", rawDepthMeters: 3.0 },
    ];
    const res = compressLayersIntoComfortZone(layers, optics);
    const caption = res.layers.find((l) => l.layerId === "narration");
    expect(caption).toBeDefined();
    expect(caption?.dialogueDiplopiaGuarded).toBe(true);
    expect(Math.abs(caption?.compressedDisparityArcmin ?? 99)).toBeLessThanOrEqual(15);
    expect(res.dialogueDiplopiaSafe).toBe(true);
    expect(res.strictDepthMonotonic).toBe(true);
  });

  it("강한 전경 돌출(0.30m) 앞에 배치된 말풍선도 ±15' 안쪽을 지키며 깊이 역전을 막는다", () => {
    const optics = createSpatialOpticsConfig("desktop-stereo-preview");
    const layers: readonly SpatialDepthLayerInput[] = [
      { layerId: "bg", role: "far-background", rawDepthMeters: 40 },
      { layerId: "hero", role: "character", rawDepthMeters: 2.0 },
      { layerId: "sword-fx", role: "fx-popout", rawDepthMeters: 0.3 },
      { layerId: "shout", role: "speech-balloon", rawDepthMeters: 0.2 },
    ];
    const res = compressLayersIntoComfortZone(layers, optics);
    const balloon = res.layers.find((l) => l.layerId === "shout");
    const sword = res.layers.find((l) => l.layerId === "sword-fx");
    expect(balloon).toBeDefined();
    expect(sword).toBeDefined();
    expect(Math.abs(balloon?.compressedDisparityArcmin ?? 99)).toBeLessThanOrEqual(15);
    expect((sword?.compressedDepthMeters ?? 0) > (balloon?.compressedDepthMeters ?? 99)).toBe(true);
    expect(res.strictDepthMonotonic).toBe(true);
    expect(res.dialogueDiplopiaSafe).toBe(true);
  });

  it("연속된 다중 말풍선과 자막이 모두 ±15' 이내에서 엄격한 앞뒤 순서를 유지한다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const layers: readonly SpatialDepthLayerInput[] = [
      { layerId: "bg", role: "far-background", rawDepthMeters: 15 },
      { layerId: "dlg-1", role: "speech-balloon", rawDepthMeters: 1.4 },
      { layerId: "dlg-2", role: "speech-balloon", rawDepthMeters: 0.8 },
      { layerId: "cap-1", role: "caption", rawDepthMeters: 0.4 },
    ];
    const res = compressLayersIntoComfortZone(layers, optics);
    const dialogues = res.layers.filter((l) => l.dialogueDiplopiaGuarded);
    expect(dialogues.length).toBe(3);
    for (let i = 0; i < dialogues.length; i += 1) {
      expect(Math.abs(dialogues[i]?.compressedDisparityArcmin ?? 99)).toBeLessThanOrEqual(15);
    }
    expect(res.strictDepthMonotonic).toBe(true);
  });
});

describe("Wave 95 — 비대칭 오프액시스(Off-Axis) 스테레오 절두체 투영 행렬", () => {
  it("모든 4종 프리셋에 대해 유한한 16원소 좌·우안 투영 행렬 쌍을 생성한다", () => {
    const ids: readonly SpatialViewerPresetId[] = [
      "vision-spatial-window",
      "webxr-curved-theater",
      "mobile-parallax-window",
      "desktop-stereo-preview",
    ];
    for (let i = 0; i < ids.length; i += 1) {
      const pid = ids[i];
      if (!pid) continue;
      const pair = computeOffAxisStereoProjectionPair(SPATIAL_VIEWER_PRESETS[pid], 0.15, 50);
      expect(pair.leftMatrix.length).toBe(16);
      expect(pair.rightMatrix.length).toBe(16);
      for (let k = 0; k < 16; k += 1) {
        expect(Number.isFinite(pair.leftMatrix[k])).toBe(true);
        expect(Number.isFinite(pair.rightMatrix[k])).toBe(true);
      }
      expect(pair.verticalKeystoneDistortionDeg).toBe(0);
    }
  });

  it("정확히 대칭인 수평 전단(mLeft[8] === -mRight[8]), 동일 수직 스케일(mLeft[5] === mRight[5]), 수직 키스톤 0을 보장한다", () => {
    const optics = createSpatialOpticsConfig("webxr-curved-theater");
    const pair = computeOffAxisStereoProjectionPair(optics, 0.1, 80);
    expect(pair.leftMatrix[0]).toBe(pair.rightMatrix[0]);
    expect(pair.leftMatrix[5]).toBe(pair.rightMatrix[5]);
    expect(pair.leftMatrix[8]).toBe(-(pair.rightMatrix[8] ?? 0));
    expect(Math.abs(pair.leftMatrix[8] ?? 0)).toBeCloseTo(
      optics.ipdMeters / optics.viewportWidthMeters,
      12,
    );
    expect(pair.leftMatrix[9]).toBe(0);
    expect(pair.rightMatrix[9]).toBe(0);
  });

  it("광선 투영 검증: 수렴면 위 점은 좌·우안 NDC가 정확히 일치하고, 비수렴면 점도 수직 시차는 정확히 0이다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const pair = computeOffAxisStereoProjectionPair(optics, 0.1, 60);
    const d = optics.convergenceDepthMeters;
    const e = optics.ipdMeters * 0.5;

    // 수렴면 위 임의 점 (X=0.45, Y=0.31, Z=-d)
    const convL = projectPointColumnMajor(pair.leftMatrix, 0.45 + e, 0.31, -d);
    const convR = projectPointColumnMajor(pair.rightMatrix, 0.45 - e, 0.31, -d);
    expect(convL[0]).toBeCloseTo(convR[0], 12);
    expect(convL[1]).toBeCloseTo(convR[1], 12);

    // 화면 뒤 원경 점 (Z=-d*2): 수직 시차 0, 좌안 NDC X < 우안 NDC X (비교차 시차)
    const farL = projectPointColumnMajor(pair.leftMatrix, 0.45 + e, 0.31, -d * 2);
    const farR = projectPointColumnMajor(pair.rightMatrix, 0.45 - e, 0.31, -d * 2);
    expect(farL[1]).toBeCloseTo(farR[1], 12);
    expect(farL[0]).toBeLessThan(farR[0]);

    // 화면 앞 돌출 점 (Z=-d*0.7): 수직 시차 0, 좌안 NDC X > 우안 NDC X (교차 시차)
    const nearL = projectPointColumnMajor(pair.leftMatrix, 0.45 + e, 0.31, -d * 0.7);
    const nearR = projectPointColumnMajor(pair.rightMatrix, 0.45 - e, 0.31, -d * 0.7);
    expect(nearL[1]).toBeCloseTo(nearR[1], 12);
    expect(nearL[0]).toBeGreaterThan(nearR[0]);
  });

  it("WebGPU zero-to-one 깊이 범위와 잘못된 near/far 입력 방어(RangeError)가 동작한다", () => {
    const optics = createSpatialOpticsConfig("desktop-stereo-preview");
    const webgpuPair = computeOffAxisStereoProjectionPair(optics, 0.2, 40, "zero-to-one");
    expect(webgpuPair.depthRange).toBe("zero-to-one");
    const nearNdc = projectPointColumnMajor(webgpuPair.leftMatrix, 0, 0, -0.2);
    const farNdc = projectPointColumnMajor(webgpuPair.leftMatrix, 0, 0, -40);
    expect(nearNdc[2]).toBeCloseTo(0, 10);
    expect(farNdc[2]).toBeCloseTo(1, 10);

    expect(() => computeOffAxisStereoProjectionPair(optics, 0, 40)).toThrow(RangeError);
    expect(() => computeOffAxisStereoProjectionPair(optics, 10, 5)).toThrow(RangeError);
  });
});

describe("Wave 95 — SHA-256 서명 및 시차 가려짐(Disocclusion) 여백 감사", () => {
  it("순수 동기 ES2017 FIPS 180-4 SHA-256이 표준 테스트 벡터 및 한글 UTF-8을 정확히 계산한다", () => {
    expect(sha256SpatialSceneHex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256SpatialSceneHex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    const koHash1 = sha256SpatialSceneHex("웹툰 입체 극장");
    const koHash2 = sha256SpatialSceneHex("웹툰 입체 극장");
    expect(koHash1).toMatch(/^[0-9a-f]{64}$/);
    expect(koHash1).toBe(koHash2);
    expect(canonicalizeSpatialPayload({ b: 1, a: -0 })).toBe('{"a":0,"b":1}');
  });

  it("인접 깊이 간격 |1/z_front - 1/z_back|이 커질수록 필요 오버스캔 여백(px)이 정확히 비례 증가한다", () => {
    const optics = createSpatialOpticsConfig("desktop-stereo-preview");
    const smallStep: readonly SpatialDepthLayerInput[] = [
      { layerId: "bg", role: "far-background", rawDepthMeters: 2.4, overscanMarginPx: 100 },
      { layerId: "fg", role: "character", rawDepthMeters: 2.0, overscanMarginPx: 100 },
    ];
    const largeStep: readonly SpatialDepthLayerInput[] = [
      { layerId: "bg", role: "far-background", rawDepthMeters: 6.0, overscanMarginPx: 100 },
      { layerId: "fg", role: "character", rawDepthMeters: 1.5, overscanMarginPx: 100 },
    ];
    const smallAudit = auditDisocclusionMargins(smallStep, optics, 0.12);
    const largeAudit = auditDisocclusionMargins(largeStep, optics, 0.12);

    const smallBg = smallAudit.layers.find((l) => l.layerId === "bg");
    const largeBg = largeAudit.layers.find((l) => l.layerId === "bg");
    expect(smallBg && largeBg).toBeTruthy();
    expect((largeBg?.horizontalShiftPx ?? 0) > (smallBg?.horizontalShiftPx ?? 0) * 5).toBe(true);
    expect((largeBg?.requiredOverscanPx ?? 0) > (smallBg?.requiredOverscanPx ?? 0)).toBe(true);
  });

  it("머리 이동 반경(maxHeadOffsetMeters)이 넓어질수록 수평·수직 시차와 필요 오버스캔이 증가한다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const layers: readonly SpatialDepthLayerInput[] = [
      { layerId: "bg", role: "far-background", rawDepthMeters: 4.0, overscanMarginPx: 200 },
      { layerId: "char", role: "character", rawDepthMeters: 2.0, overscanMarginPx: 200 },
    ];
    const narrowHead = auditDisocclusionMargins(layers, optics, 0.05);
    const wideHead = auditDisocclusionMargins(layers, optics, 0.3);
    expect(wideHead.maxHorizontalParallaxPx).toBeGreaterThan(narrowHead.maxHorizontalParallaxPx * 3);
    expect(wideHead.maxVerticalParallaxPx).toBeCloseTo(narrowHead.maxVerticalParallaxPx * 6, 8);
    expect(wideHead.maxRequiredOverscanPx).toBeGreaterThan(narrowHead.maxRequiredOverscanPx);
  });

  it("여백이 부족한 배경 레이어만 정확히 검은 틈 위험(disocclusionTearRisk)과 부족 px로 표시한다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const layers: readonly SpatialDepthLayerInput[] = [
      { layerId: "bg-underpadded", role: "far-background", rawDepthMeters: 4.5, overscanMarginPx: 8 },
      { layerId: "char-safe", role: "character", rawDepthMeters: 2.2, overscanMarginPx: 24 },
    ];
    const audit = auditDisocclusionMargins(layers, optics, 0.2);
    const bg = audit.layers.find((l) => l.layerId === "bg-underpadded");
    const char = audit.layers.find((l) => l.layerId === "char-safe");
    expect(audit.hasTearRisk).toBe(true);
    expect(audit.atRiskLayerIds).toEqual(["bg-underpadded"]);
    expect(bg?.disocclusionTearRisk).toBe(true);
    expect(bg?.missingMarginPx).toBe((bg?.requiredOverscanPx ?? 0) - 8);
    expect(char?.disocclusionTearRisk).toBe(false);
    expect(char?.missingMarginPx).toBe(0);
  });
});

describe("Wave 95 — 3D 장면 그래프 컴파일러, 모션 저감, WGSL, SVG 및 한국어 요약", () => {
  const sampleEpisode: readonly SpatialEpisodePanelInput[] = [
    {
      panelId: "cut-01",
      titleKo: "1컷: 빗속 대치",
      panelWidthPx: 800,
      panelHeightPx: 1200,
      gutterAfterPx: 120,
      layers: [
        { layerId: "sky", labelKo: "밤하늘", role: "sky-backdrop", rawDepthMeters: 120, overscanMarginPx: 180 },
        { layerId: "street", labelKo: "젖은 골목", role: "far-background", rawDepthMeters: 14, overscanMarginPx: 180 },
        { layerId: "hero", labelKo: "주인공", role: "character", rawDepthMeters: 2.2, overscanMarginPx: 180 },
        { layerId: "rain-fx", labelKo: "빗방울 돌출", role: "fx-popout", rawDepthMeters: 0.4, overscanMarginPx: 180 },
        { layerId: "dlg-1", labelKo: "대사 말풍선", role: "speech-balloon", rawDepthMeters: 0.3, overscanMarginPx: 40 },
      ],
    },
    {
      panelId: "cut-02",
      titleKo: "2컷: 결전 선언",
      panelWidthPx: 800,
      panelHeightPx: 1000,
      layers: [
        { layerId: "bg", labelKo: "성벽 배경", role: "far-background", rawDepthMeters: 25, overscanMarginPx: 180 },
        { layerId: "rival", labelKo: "라이벌", role: "character", rawDepthMeters: 2.2, overscanMarginPx: 180 },
        { layerId: "cap-1", labelKo: "내레이션 자막", role: "caption", rawDepthMeters: 18, overscanMarginPx: 40 },
      ],
    },
  ];

  it("curved-theater-arc 레이아웃은 컷들을 관찰자 중심 원호 위에 정확한 반경 거리와 회전각으로 배치한다", () => {
    const optics = createSpatialOpticsConfig("webxr-curved-theater");
    const scene = compileSpatialTheaterSceneGraph(sampleEpisode, optics, {
      layoutMode: "curved-theater-arc",
    });
    expect(scene.layoutMode).toBe("curved-theater-arc");
    expect(scene.panels.length).toBe(2);
    expect(scene.panels[0]?.anchorAzimuthRad).toBeLessThan(0);
    expect(scene.panels[1]?.anchorAzimuthRad).toBeGreaterThan(0);

    for (let p = 0; p < scene.panels.length; p += 1) {
      const panel = scene.panels[p];
      if (!panel) continue;
      for (let l = 0; l < panel.layers.length; l += 1) {
        const node = panel.layers[l];
        if (!node) continue;
        const radialDist = Math.hypot(node.positionMeters[0], node.positionMeters[2]);
        expect(radialDist).toBeCloseTo(node.compressedDepthMeters, 10);
        expect(node.worldWidthMeters).toBeCloseTo(panel.baseWorldWidthMeters * node.sizeScale, 10);
      }
    }
  });

  it("vertical-spatial-scroll 레이아웃은 웹툰 컷을 -Y 수직 스크롤 축으로 쌓고 각크기를 보존한다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const scene = compileSpatialTheaterSceneGraph(sampleEpisode, optics, {
      layoutMode: "vertical-spatial-scroll",
    });
    expect(scene.layoutMode).toBe("vertical-spatial-scroll");
    expect((scene.panels[0]?.anchorCenterY ?? 0) > (scene.panels[1]?.anchorCenterY ?? 0)).toBe(true);
    expect(scene.panels[0]?.layers[0]?.positionMeters[0]).toBe(0);
    expect(scene.panels[0]?.layers[0]?.rotationEulerRad).toEqual([0, 0, 0]);
  });

  it("prefersReducedMotion: true는 IPD=0, 머리 시차=0, 모든 레이어 수렴면 평탄화 및 시차 0을 강제한다", () => {
    const optics = createSpatialOpticsConfig("webxr-curved-theater");
    const scene = compileSpatialTheaterSceneGraph(sampleEpisode, optics, {
      prefersReducedMotion: true,
    });
    expect(scene.prefersReducedMotion).toBe(true);
    expect(scene.effectiveIpdMeters).toBe(0);
    expect(scene.maxHeadParallaxMeters).toBe(0);
    expect(scene.maxCrossedDisparityArcmin).toBe(0);
    expect(scene.maxUncrossedDisparityArcmin).toBe(0);
    expect(scene.overallDisocclusionTearRisk).toBe(false);
    expect(scene.stereoProjection.leftMatrix[8]).toBe(0);
    expect(scene.stereoProjection.rightMatrix[8]).toBe(0);
    expect(scene.drawCallBudget.stereoRenderMode).toBe("mono-reduced-motion");

    for (let p = 0; p < scene.panels.length; p += 1) {
      const panel = scene.panels[p];
      if (!panel) continue;
      for (let l = 0; l < panel.layers.length; l += 1) {
        const node = panel.layers[l];
        expect(node?.compressedDepthMeters).toBe(optics.convergenceDepthMeters);
        expect(node?.compressedDisparityArcmin).toBe(0);
        expect(node?.sizeScale).toBe(1);
      }
    }
  });

  it("동일 입력은 동일한 SHA-256 장면 해시를 생성하고, 미세 변경 시 해시가 즉시 달라진다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const a = compileSpatialTheaterSceneGraph(sampleEpisode, optics);
    const b = compileSpatialTheaterSceneGraph(sampleEpisode, optics);
    expect(a.sceneHashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.sceneHashSha256).toBe(b.sceneHashSha256);

    const tweakedOptics = createSpatialOpticsConfig("vision-spatial-window", { ipdMeters: 0.064 });
    const c = compileSpatialTheaterSceneGraph(sampleEpisode, tweakedOptics);
    expect(c.sceneHashSha256).not.toBe(a.sceneHashSha256);
  });

  it("3종 스테레오 렌더 모드의 WebGPU/WebXR WGSL 셰이더가 모두 정적 검증을 통과한다", () => {
    const modes = ["multiview-side-by-side", "layered-quad-xr", "mono-reduced-motion"] as const;
    for (let i = 0; i < modes.length; i += 1) {
      const mode = modes[i];
      if (!mode) continue;
      const artifact = buildSpatialParallaxDepthWgsl(mode);
      const validation = validateSpatialTheaterWgsl(artifact.source);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toEqual([]);
      expect(validation.discoveredBindings).toEqual([0, 1, 2, 3]);
      expect(validation.entryPoints).toContain("mainSpatialParallaxCompose");
      expect(validation.stereoModeTag).toBe(mode);
      expect(artifact.uniformByteLength % 16).toBe(0);
    }
  });

  it("validateSpatialTheaterWgsl은 괄호 불균형·바인딩 누락·NaN 리터럴이 있는 잘못된 WGSL을 거부한다", () => {
    const broken = `
      struct SpatialTheaterUniforms { a: vec4<f32>, };
      @compute @workgroup_size(8, 8, 1)
      fn wrongEntry() { let x = NaN;
    `;
    const result = validateSpatialTheaterWgsl(broken);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("renderSpatialDepthCrossSectionSvg는 NaN/원시 hex 없이 XML 안전 이스케이프된 고대비 단면도 SVG를 만든다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const maliciousPanel: readonly SpatialEpisodePanelInput[] = [
      {
        panelId: 'cut-<script>"&1',
        titleKo: '위험 제목 <img src="x" onerror="alert(1)"> & 테스트',
        panelWidthPx: 800,
        panelHeightPx: 1200,
        layers: [
          { layerId: "bg&1", labelKo: "배경 <숲>", role: "far-background", rawDepthMeters: 30, overscanMarginPx: 100 },
          { layerId: "fx", labelKo: "검기 \"돌출\"", role: "fx-popout", rawDepthMeters: 0.4, overscanMarginPx: 100 },
          { layerId: "dlg", labelKo: "말풍선 '대사'", role: "speech-balloon", rawDepthMeters: 0.3, overscanMarginPx: 50 },
        ],
      },
    ];
    const scene = compileSpatialTheaterSceneGraph(maliciousPanel, optics);
    const svg = renderSpatialDepthCrossSectionSvg(scene);

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;img src=&quot;x&quot;");
    expect(svg).toContain("수렴 스크린");
    expect(svg).toContain("oklch(");
  });

  it("renderSpatialDepthCrossSectionSvg는 모션 저감 모드와 빈 컷 입력에서도 NaN 없이 안전하게 렌더링한다", () => {
    const optics = createSpatialOpticsConfig("mobile-parallax-window");
    const emptyScene = compileSpatialTheaterSceneGraph([], optics, { prefersReducedMotion: true });
    const svg = renderSpatialDepthCrossSectionSvg(emptyScene);
    expect(svg).toContain("표시할 레이어가 없습니다.");
    expect(svg).toContain("단안");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("summarizeSpatialTheaterComfortKo는 번역투 없는 자연스러운 한국어로 6대 점검 항목을 보고한다", () => {
    const optics = createSpatialOpticsConfig("vision-spatial-window");
    const cleanScene = compileSpatialTheaterSceneGraph(sampleEpisode, optics);
    const summary = summarizeSpatialTheaterComfortKo(cleanScene);

    expect(summary.verdict).toBe("ready");
    expect(summary.vacComfortPassed).toBe(true);
    expect(summary.dialogueDiplopiaSafe).toBe(true);
    expect(summary.disocclusionReady).toBe(true);
    expect(summary.dialogueLayerCount).toBe(2);
    expect(summary.estimatedDrawCalls).toBe(8);
    expect(summary.reportTextKo).toContain("공간 윈도우");
    expect(summary.reportTextKo).toContain("대사 복시 방지");
    expect(summary.reportTextKo).toContain("가려짐 여백 점검");
    expect(summary.reportTextKo).toContain("모션 저감 모드");
    expect(summary.reportTextKo).toContain("렌더 예산");
    expect(summary.reportTextKo).not.toContain("가능하게 합니다");
    expect(summary.reportTextKo).not.toContain("직관적인 경험을 제공");
    expect(summary.reportTextKo).not.toContain("원활한 워크플로우");
  });

  it("summarizeSpatialTheaterComfortKo는 여백 부족 위험과 모션 저감 평면 모드를 각각 정확히 판정한다", () => {
    const optics = createSpatialOpticsConfig("webxr-curved-theater");
    const riskyEpisode: readonly SpatialEpisodePanelInput[] = [
      {
        panelId: "cut-risk",
        panelWidthPx: 800,
        panelHeightPx: 1200,
        layers: [
          { layerId: "bg-tight", role: "far-background", rawDepthMeters: 20, overscanMarginPx: 2 },
          { layerId: "hero", role: "character", rawDepthMeters: 3.0, overscanMarginPx: 10 },
        ],
      },
    ];
    const riskyScene = compileSpatialTheaterSceneGraph(riskyEpisode, optics);
    const riskySummary = summarizeSpatialTheaterComfortKo(riskyScene);
    expect(riskySummary.verdict).toBe("needs-overscan");
    expect(riskySummary.disocclusionReady).toBe(false);
    expect(riskySummary.atRiskLayerCount).toBeGreaterThan(0);
    expect(riskySummary.reportTextKo).toContain("여백 부족");

    const flatScene = compileSpatialTheaterSceneGraph(riskyEpisode, optics, {
      prefersReducedMotion: true,
    });
    const flatSummary = summarizeSpatialTheaterComfortKo(flatScene);
    expect(flatSummary.verdict).toBe("reduced-motion-flat");
    expect(flatSummary.reducedMotionActive).toBe(true);
    expect(flatSummary.reportTextKo).toContain("모션 저감 모드: 켜짐");
  });
});
