// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ARCHITECTURAL_SURFACES,
  MAX_SOLAR_HOUR_KST,
  MIN_SOLAR_HOUR_KST,
  PHYSICAL_SKY_PRESETS,
  RELIGHT_BRIDGE_SCHEMA_VERSION,
  SEOUL_LATITUDE_DEG,
  SEOUL_SEASONS,
  Studio3dLightingRigPanel,
  computeSeoulSunPosition,
  computeShadowCatcherProjection,
  createInitialStudioRigConfig,
  evaluatePhysicalSkyAtmosphere,
  evaluateStudioLightingRig,
  export2dCutRelightBridge,
  formatHourKst,
  getArchitecturalSurfaceById,
  getPhysicalSkyPresetById,
  kelvinToOklchColor,
  sampleSeoulDailyArc,
  serialize2dCutRelightBridgeJson,
  sphericalAnglesToVec3,
  validate2dCutRelightBridge,
} from "./index";

afterEach(cleanup);

describe("1. 서울(37.57°N) 계절·시각 태양 궤적 계산기 (computeSeoulSunPosition)", () => {
  it("서울 위도에서 하지(여름) > 춘·추분(봄·가을) > 동지(겨울) 순으로 남중 고도각이 정확히 분포한다", () => {
    const summerNoon = computeSeoulSunPosition("summer", 12.5);
    const springNoon = computeSeoulSunPosition("spring", 12.5);
    const autumnNoon = computeSeoulSunPosition("autumn", 12.5);
    const winterNoon = computeSeoulSunPosition("winter", 12.5);

    expect(summerNoon.latitudeDeg).toBeCloseTo(SEOUL_LATITUDE_DEG, 3);
    expect(summerNoon.elevationDeg).toBeGreaterThan(74);
    expect(summerNoon.elevationDeg).toBeLessThan(77.5);
    expect(springNoon.elevationDeg).toBeGreaterThan(50);
    expect(springNoon.elevationDeg).toBeLessThan(55);
    expect(autumnNoon.elevationDeg).toBeGreaterThan(50);
    expect(autumnNoon.elevationDeg).toBeLessThan(55);
    expect(winterNoon.elevationDeg).toBeGreaterThan(27.5);
    expect(winterNoon.elevationDeg).toBeLessThan(31);

    expect(summerNoon.elevationDeg).toBeGreaterThan(springNoon.elevationDeg);
    expect(springNoon.elevationDeg).toBeGreaterThan(winterNoon.elevationDeg);
    expect(Math.abs(summerNoon.azimuthDeg - 180)).toBeLessThan(8);
    expect(summerNoon.compassDirectionKo).toBe("남");
  });

  it("오전은 동쪽(<150°), 남중은 남쪽(~180°), 오후는 서쪽(>210°)으로 태양 방위각이 일관 이동한다", () => {
    const morning = computeSeoulSunPosition("spring", 8.0);
    const noon = computeSeoulSunPosition("spring", 12.5);
    const afternoon = computeSeoulSunPosition("spring", 16.5);

    expect(morning.azimuthDeg).toBeGreaterThan(70);
    expect(morning.azimuthDeg).toBeLessThan(135);
    expect(noon.azimuthDeg).toBeGreaterThan(170);
    expect(noon.azimuthDeg).toBeLessThan(190);
    expect(afternoon.azimuthDeg).toBeGreaterThan(230);
    expect(afternoon.azimuthDeg).toBeLessThan(285);
    expect(morning.azimuthDeg).toBeLessThan(noon.azimuthDeg);
    expect(noon.azimuthDeg).toBeLessThan(afternoon.azimuthDeg);
  });

  it("입력 시각을 05:00~22:00 범위로 안전 클램프하고 비정상 숫자 입력을 방어한다", () => {
    const tooEarly = computeSeoulSunPosition("summer", 1.5);
    const tooLate = computeSeoulSunPosition("summer", 25.0);
    const nanInput = computeSeoulSunPosition("winter", Number.NaN);

    expect(tooEarly.hourKst).toBe(MIN_SOLAR_HOUR_KST);
    expect(tooEarly.formattedHourKst).toBe("05:00");
    expect(tooLate.hourKst).toBe(MAX_SOLAR_HOUR_KST);
    expect(tooLate.formattedHourKst).toBe("22:00");
    expect(nanInput.hourKst).toBe(MIN_SOLAR_HOUR_KST);
    expect(formatHourKst(17.75)).toBe("17:45");
  });

  it("시간대에 따라 주간·골든아워·블루아워·야간 위상과 대기질량(Air Mass)이 물리적으로 변화한다", () => {
    const noon = computeSeoulSunPosition("autumn", 12.5);
    const golden = computeSeoulSunPosition("autumn", 17.85);
    const blue = computeSeoulSunPosition("autumn", 18.85);
    const night = computeSeoulSunPosition("autumn", 21.5);

    expect(noon.skyPhase).toBe("daylight");
    expect(golden.skyPhase).toBe("golden-hour");
    expect(blue.skyPhase).toBe("blue-hour");
    expect(night.skyPhase).toBe("night");

    expect(noon.airMass).toBeLessThan(golden.airMass);
    expect(golden.airMass).toBeLessThanOrEqual(blue.airMass);
    expect(noon.directTransmittance).toBeGreaterThan(golden.directTransmittance);
    expect(night.directTransmittance).toBe(0);
  });

  it("3D 방향 벡터는 항상 정규화된 단위 벡터이며 구면 좌표 변환이 방위 축과 일치한다", () => {
    for (const season of SEOUL_SEASONS) {
      for (const hour of [6, 9, 12.5, 16, 19.5]) {
        const pos = computeSeoulSunPosition(season.id, hour);
        const len = Math.hypot(pos.direction3d.x, pos.direction3d.y, pos.direction3d.z);
        expect(len).toBeCloseTo(1, 3);
      }
    }

    const eastHorizon = sphericalAnglesToVec3(90, 0);
    const southHorizon = sphericalAnglesToVec3(180, 0);
    const zenith = sphericalAnglesToVec3(0, 89.5);
    expect(eastHorizon.x).toBeCloseTo(1, 3);
    expect(southHorizon.z).toBeCloseTo(1, 3);
    expect(zenith.y).toBeGreaterThan(0.99);
  });

  it("sampleSeoulDailyArc가 05:00~22:00 궤적을 샘플링하고 여름 일조시간이 겨울보다 길다", () => {
    const summerArc = sampleSeoulDailyArc("summer", 30);
    const winterArc = sampleSeoulDailyArc("winter", 30);

    expect(summerArc.points.length).toBeGreaterThanOrEqual(35);
    expect(summerArc.maxElevationDeg).toBeGreaterThan(74);
    expect(winterArc.maxElevationDeg).toBeLessThan(31);
    expect(summerArc.daylightHours).toBeGreaterThan(winterArc.daylightHours + 3.5);
    expect(summerArc.sunriseHourKst).not.toBeNull();
    expect(winterArc.sunsetHourKst).not.toBeNull();
  });
});

describe("2. 6종 물리 하늘 프리셋 · 대기 산란(Rayleigh/Mie/Ozone) · 색온도 변환", () => {
  it("6종 물리 하늘·대기 산란 프리셋이 정본 명칭과 유효한 서울 시각·파라미터를 갖춘다", () => {
    expect(PHYSICAL_SKY_PRESETS).toHaveLength(6);
    expect(PHYSICAL_SKY_PRESETS.map((p) => p.nameKo)).toEqual([
      "정오 맑음",
      "황금 노을",
      "블루아워",
      "비 오는 흐림",
      "달빛 안뜰",
      "겨울 정오",
    ]);

    for (const preset of PHYSICAL_SKY_PRESETS) {
      expect(preset.recommendedHourKst).toBeGreaterThanOrEqual(MIN_SOLAR_HOUR_KST);
      expect(preset.recommendedHourKst).toBeLessThanOrEqual(MAX_SOLAR_HOUR_KST);
      const evalRes = evaluateStudioLightingRig(preset.config);
      expect(evalRes.sky.gradientStopsOklch).toHaveLength(4);
      for (const stop of evalRes.sky.gradientStopsOklch) {
        expect(stop.oklchCss).toMatch(/^oklch\(/u);
      }
    }
  });

  it("대기 산란 엔진이 정오·노을·흐림·블루아워 조건에 따라 OKLCH 돔 색채와 확산비를 물리적으로 계산한다", () => {
    const noonCfg = getPhysicalSkyPresetById("noon-clear").config;
    const sunsetCfg = getPhysicalSkyPresetById("golden-sunset").config;
    const rainyCfg = getPhysicalSkyPresetById("rainy-overcast").config;
    const blueCfg = getPhysicalSkyPresetById("blue-hour").config;

    const noonSky = evaluatePhysicalSkyAtmosphere(computeSeoulSunPosition(noonCfg.season, noonCfg.hourKst), noonCfg.atmosphere);
    const sunsetSky = evaluatePhysicalSkyAtmosphere(computeSeoulSunPosition(sunsetCfg.season, sunsetCfg.hourKst), sunsetCfg.atmosphere);
    const rainySky = evaluatePhysicalSkyAtmosphere(computeSeoulSunPosition(rainyCfg.season, rainyCfg.hourKst), rainyCfg.atmosphere);
    const blueSky = evaluatePhysicalSkyAtmosphere(computeSeoulSunPosition(blueCfg.season, blueCfg.hourKst), blueCfg.atmosphere);

    // 흐림은 구름 확산으로 하늘 확산비(skyToSunRatio)가 맑은 정오보다 높고 직사 조도가 감소한다
    expect(rainySky.skyToSunRatio).toBeGreaterThan(noonSky.skyToSunRatio + 0.25);
    expect(noonSky.hemisphereIrradianceLux).toBeGreaterThan(rainySky.hemisphereIrradianceLux);
    // 황금 노을 지평선은 정오보다 적색 성분이 지배적이며 색온도가 낮다
    expect(sunsetSky.horizon.linear.r).toBeGreaterThan(sunsetSky.horizon.linear.b * 2);
    expect(sunsetSky.dominantSkyKelvin).toBeLessThan(noonSky.dominantSkyKelvin);
    // 블루아워는 천정 청색 지배적이며 저조도 구간이다
    expect(blueSky.zenith.linear.b).toBeGreaterThan(blueSky.zenith.linear.r * 2);
    expect(blueSky.hemisphereIrradianceLux).toBeLessThan(noonSky.hemisphereIrradianceLux * 0.2);
  });

  it("Planckian 색온도 변환(kelvinToOklchColor)이 2200K 주황→5600K 백색→10000K 청색으로 단조 변화한다", () => {
    const warm = kelvinToOklchColor(2200);
    const neutral = kelvinToOklchColor(5800);
    const cool = kelvinToOklchColor(10000);

    expect(warm.oklchCss).toMatch(/^oklch\(/u);
    expect(warm.srgb.r).toBeGreaterThan(warm.srgb.b);
    expect(cool.srgb.b).toBeGreaterThan(cool.srgb.r);
    const ratio = (c: { readonly r: number; readonly b: number }) => c.b / Math.max(1e-5, c.r);
    expect(ratio(warm.srgb)).toBeLessThan(ratio(neutral.srgb));
    expect(ratio(neutral.srgb)).toBeLessThan(ratio(cool.srgb));
  });
});

describe("3. 3점 조명(Key/Fill/Rim) · 건축 바운스 · 바닥 그림자 캐처 엔진", () => {
  it("태양 동기화 ON이면 키라이트가 서울 태양 궤적을 추적하고 OFF이면 수동 방위·고도를 따른다", () => {
    const syncedCfg = createInitialStudioRigConfig("noon-clear");
    const syncedEval = evaluateStudioLightingRig({ ...syncedCfg, hourKst: 16.0, syncKeyWithSun: true });
    expect(syncedEval.key.azimuthDeg).toBeCloseTo(syncedEval.sun.azimuthDeg, 1);
    expect(syncedEval.key.elevationDeg).toBeCloseTo(syncedEval.sun.elevationDeg, 1);

    const manualEval = evaluateStudioLightingRig({
      ...syncedCfg,
      hourKst: 16.0,
      syncKeyWithSun: false,
      key: { ...syncedCfg.key, azimuthDeg: 95, elevationDeg: 25, kelvin: 3200 },
    });
    expect(manualEval.key.azimuthDeg).toBe(95);
    expect(manualEval.key.elevationDeg).toBe(25);
    expect(manualEval.key.kelvin).toBe(3200);
    expect(manualEval.metrics.characterBackgroundMatchScore).toBeLessThan(syncedEval.metrics.characterBackgroundMatchScore);
  });

  it("필라이트·림라이트·건축 바운스 토글과 재질 변경이 대비비·분리도·반사 색조에 정확히 반영된다", () => {
    const base = createInitialStudioRigConfig("noon-clear");
    const fullEval = evaluateStudioLightingRig(base);
    const noFillEval = evaluateStudioLightingRig({ ...base, fill: { ...base.fill, enabled: false } });
    const noRimEval = evaluateStudioLightingRig({ ...base, rim: { ...base.rim, enabled: false } });

    expect(noFillEval.metrics.keyToFillRatio).toBeGreaterThan(fullEval.metrics.keyToFillRatio * 2);
    expect(fullEval.metrics.rimSeparationIndex).toBeGreaterThan(0.2);
    expect(noRimEval.metrics.rimSeparationIndex).toBe(0);

    const hanokSpec = getArchitecturalSurfaceById("hanok-wood");
    const snowSpec = getArchitecturalSurfaceById("snow-slate");
    const hanokEval = evaluateStudioLightingRig({
      ...base,
      bounce: { ...base.bounce, surfaceMaterial: "hanok-wood", reflectance: hanokSpec.defaultReflectance, kelvin: hanokSpec.defaultKelvin },
    });
    const snowEval = evaluateStudioLightingRig({
      ...base,
      bounce: { ...base.bounce, surfaceMaterial: "snow-slate", reflectance: snowSpec.defaultReflectance, kelvin: snowSpec.defaultKelvin },
    });

    expect(ARCHITECTURAL_SURFACES).toHaveLength(5);
    expect(hanokEval.bounce.color.linear.r).toBeGreaterThan(hanokEval.bounce.color.linear.b);
    expect(snowEval.bounce.color.linear.b).toBeGreaterThan(snowEval.bounce.color.linear.r * 0.9);
    expect(snowEval.bounce.intensity).toBeGreaterThan(hanokEval.bounce.intensity);
  });

  it("바닥 그림자 캐처가 광원 반대 방위로 타원을 투영하고 겨울 정오·노을에서 여름 정오보다 긴 그림자를 생성한다", () => {
    const summerEval = evaluateStudioLightingRig(createInitialStudioRigConfig("noon-clear"));
    const winterEval = evaluateStudioLightingRig(createInitialStudioRigConfig("winter-noon"));
    const sunsetEval = evaluateStudioLightingRig(createInitialStudioRigConfig("golden-sunset"));
    const rainyEval = evaluateStudioLightingRig(createInitialStudioRigConfig("rainy-overcast"));

    expect(summerEval.shadowCatcher.isAmbientOnly).toBe(false);
    expect(Math.abs(((summerEval.shadowCatcher.shadowAzimuthDeg - summerEval.key.azimuthDeg + 360) % 360) - 180)).toBeLessThan(1);
    expect(winterEval.shadowCatcher.castLengthM).toBeGreaterThan(summerEval.shadowCatcher.castLengthM * 3);
    expect(sunsetEval.shadowCatcher.castLengthM).toBeGreaterThan(winterEval.shadowCatcher.castLengthM);
    expect(sunsetEval.shadowCatcher.castLengthM).toBeLessThanOrEqual(sunsetEval.shadowCatcher.semiMajorAxisM * 2);

    // 흐린 날씨는 맑은 날보다 캐처 오파시티가 낮고 반음영 블러가 넓다
    expect(rainyEval.shadowCatcher.castOpacity).toBeLessThan(summerEval.shadowCatcher.castOpacity);
    expect(rainyEval.shadowCatcher.penumbraBlurPx).toBeGreaterThan(summerEval.shadowCatcher.penumbraBlurPx);
    expect(summerEval.shadowCatcher.contactAoOpacity).toBeGreaterThan(0.5);
  });

  it("키라이트 OFF 또는 캐처 OFF 시 접지 전용(Ambient-Only) 및 비활성 상태를 안전 처리한다", () => {
    const base = createInitialStudioRigConfig("noon-clear");
    const baseEval = evaluateStudioLightingRig(base);

    const noKeyShadow = computeShadowCatcherProjection({
      shadowCatcher: base.shadowCatcher,
      keyLight: { ...baseEval.key, enabled: false },
      sky: baseEval.sky,
      cloudCoverage: base.atmosphere.cloudCoverage,
    });
    expect(noKeyShadow.enabled).toBe(true);
    expect(noKeyShadow.isAmbientOnly).toBe(true);
    expect(noKeyShadow.castLengthM).toBe(0);
    expect(noKeyShadow.contactAoOpacity).toBeGreaterThan(0.4);

    const disabledShadow = computeShadowCatcherProjection({
      shadowCatcher: { ...base.shadowCatcher, enabled: false },
      keyLight: baseEval.key,
      sky: baseEval.sky,
      cloudCoverage: base.atmosphere.cloudCoverage,
    });
    expect(disabledShadow.enabled).toBe(false);
    expect(disabledShadow.castOpacity).toBe(0);
    expect(disabledShadow.contactAoOpacity).toBe(0);
  });
});

describe("4. 2D 컷 리라이트 엔진용 JSON 조명 브리지 익스포터", () => {
  it("정본 스키마(v1) JSON 브리지를 생성하고 라운드트립 무결성 검증을 통과한다", () => {
    const sunsetCfg = createInitialStudioRigConfig("golden-sunset");
    const payload = export2dCutRelightBridge(sunsetCfg);
    const json = serialize2dCutRelightBridgeJson(sunsetCfg);
    const validation = validate2dCutRelightBridge(json);

    expect(payload.schemaVersion).toBe(RELIGHT_BRIDGE_SCHEMA_VERSION);
    expect(payload.location.city).toBe("Seoul");
    expect(payload.sky.presetNameKo).toBe("황금 노을");
    expect(payload.threeLayer2dRelight.suggestedPresetId).toBe("sunset");
    expect(payload.dynamicLights).toHaveLength(4);
    expect(payload.shadowCatcher.shadowTintOklch).toMatch(/^oklch\(/u);

    expect(validation.valid).toBe(true);
    expect(validation.errorKo).toBeNull();
    expect(validation.payload?.sky.presetId).toBe("golden-sunset");
  });

  it("손상되었거나 스키마 버전·광원 슬롯이 잘못된 JSON을 안전하게 거부한다", () => {
    expect(validate2dCutRelightBridge("not-json").valid).toBe(false);
    expect(validate2dCutRelightBridge(JSON.stringify({ schemaVersion: "old.v0" })).valid).toBe(false);
    expect(
      validate2dCutRelightBridge(
        JSON.stringify({ schemaVersion: RELIGHT_BRIDGE_SCHEMA_VERSION, sourceEngine: "studio-3d-lighting-rig", dynamicLights: [] }),
      ).valid,
    ).toBe(false);
  });
});

describe("5. Studio3dLightingRigPanel 2탭 인터랙티브 UI 및 엄격 규칙 검증", () => {
  it("<Studio3dLightingRigPanel />가 단독(zero-prop)으로 렌더링되고 2탭 접근성 역할·6종 프리셋이 노출된다", () => {
    render(<Studio3dLightingRigPanel />);

    expect(screen.getByTestId("studio-3d-lighting-rig-panel")).toBeTruthy();
    const skyTab = screen.getByTestId("rig-tab-sky-dome");
    const rigTab = screen.getByTestId("rig-tab-studio-rig");

    expect(skyTab.getAttribute("aria-selected")).toBe("true");
    expect(rigTab.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByTestId("seoul-sky-dome-svg")).toBeTruthy();
    expect(screen.getByTestId("seoul-sun-marker")).toBeTruthy();

    for (const preset of PHYSICAL_SKY_PRESETS) {
      expect(screen.getByTestId(`sky-preset-${preset.id}`).textContent).toContain(preset.nameKo);
    }
  });

  it("Tab 1(물리 하늘 SVG 돔)에서 프리셋·계절·시각 슬라이더 조작 시 태양 고도·위상·콜백이 실시간 갱신된다", () => {
    const onPresetChange = vi.fn();
    render(<Studio3dLightingRigPanel onPresetChange={onPresetChange} />);

    const initialSunText = screen.getByTestId("seoul-sun-readout").textContent;
    fireEvent.click(screen.getByTestId("sky-preset-golden-sunset"));
    expect(onPresetChange).toHaveBeenCalledWith("golden-sunset");
    expect(screen.getByTestId("sky-phase-badge").textContent).toContain("골든아워");

    fireEvent.click(screen.getByTestId("season-btn-winter"));
    fireEvent.change(screen.getByTestId("seoul-hour-slider"), { target: { value: "12.5" } });
    const winterNoonText = screen.getByTestId("seoul-sun-readout").textContent;
    expect(winterNoonText).not.toBe(initialSunText);
    expect(screen.getByTestId("seoul-hour-readout").textContent).toBe("12:30 KST");
    expect(screen.getByTestId("sky-telemetry-grid").textContent).toContain("29.");
  });

  it("Tab 2(3점 조명 릭·그림자 캐처)에서 SVG 그림자 타원·태양 연동 해제·광원 토글이 실시간 반영된다", () => {
    render(<Studio3dLightingRigPanel />);
    fireEvent.click(screen.getByTestId("rig-tab-studio-rig"));

    expect(screen.getByTestId("studio-rig-preview-svg")).toBeTruthy();
    expect(screen.getByTestId("shadow-catcher-cast-ellipse")).toBeTruthy();
    expect(screen.getByTestId("shadow-catcher-contact-ellipse")).toBeTruthy();

    // 태양 연동 OFF 후 고도각을 낮추면 바닥 그림자가 길어져야 한다
    const beforeLength = parseFloat(screen.getByTestId("shadow-length-readout").textContent ?? "0");
    fireEvent.click(screen.getByTestId("toggle-sun-sync-btn"));
    fireEvent.change(screen.getByTestId("rig-light-elevation-slider"), { target: { value: "18" } });
    const afterLength = parseFloat(screen.getByTestId("shadow-length-readout").textContent ?? "0");
    expect(afterLength).toBeGreaterThan(beforeLength * 2);

    // 림라이트 OFF 시 림 분리도가 0%가 되어야 한다
    fireEvent.click(screen.getByTestId("rig-toggle-rim"));
    expect(screen.getByTestId("rim-separation-readout").textContent).toBe("0%");

    // 그림자 캐처 OFF 시 투영 타원이 숨겨진다
    fireEvent.click(screen.getByTestId("toggle-shadow-catcher-btn"));
    expect(screen.queryByTestId("shadow-catcher-cast-ellipse")).toBeNull();
  });

  it("건축 바운스 재질 전환 및 2D 컷 리라이트 JSON 브리지 내보내기 버튼이 정본 페이로드를 전달한다", () => {
    const onExport = vi.fn();
    render(<Studio3dLightingRigPanel initialTab="studio-rig" initialPresetId="moonlit-courtyard" onExportRelightBridge={onExport} />);

    fireEvent.click(screen.getByTestId("rig-select-architectural-bounce"));
    fireEvent.click(screen.getByTestId("bounce-surface-snow-slate"));
    expect(screen.getByTestId("bounce-surface-snow-slate").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("export-relight-bridge-btn"));
    expect(onExport).toHaveBeenCalledTimes(1);
    const [payload, jsonText] = onExport.mock.calls[0] as [ReturnType<typeof export2dCutRelightBridge>, string];
    expect(payload.schemaVersion).toBe(RELIGHT_BRIDGE_SCHEMA_VERSION);
    expect(payload.threeLayer2dRelight.suggestedPresetId).toBe("moonlight");
    expect(validate2dCutRelightBridge(jsonText).valid).toBe(true);
    expect(screen.getByTestId("export-status-message").textContent).toContain(RELIGHT_BRIDGE_SCHEMA_VERSION);
    expect(screen.getByTestId("relight-bridge-json-preview").textContent).toContain("moonlit-courtyard");
  });

  it("초기화 버튼과 영문(locale='en') 모드가 정상 동작한다", () => {
    render(<Studio3dLightingRigPanel initialPresetId="winter-noon" locale="en" />);
    expect(screen.getByTestId("rig-tab-sky-dome").textContent).toContain("Physical Sky");
    expect(screen.getByTestId("sky-preset-winter-noon").textContent).toContain("Winter Noon");

    fireEvent.change(screen.getByTestId("seoul-hour-slider"), { target: { value: "16.5" } });
    expect(screen.getByTestId("seoul-hour-readout").textContent).toBe("16:30 KST");

    fireEvent.click(screen.getByTestId("rig-reset-preset-btn"));
    expect(screen.getByTestId("seoul-hour-readout").textContent).toBe("12:30 KST");
  });

  it("JSON 복사 버튼 클릭 시 오류 없이 상태 배너를 갱신한다", () => {
    render(<Studio3dLightingRigPanel initialTab="studio-rig" />);
    fireEvent.click(screen.getByTestId("copy-relight-bridge-btn"));
    expect(screen.getByTestId("export-status-message").textContent).toContain("JSON");
  });

  it("엄격 규칙(800줄 이하 · Storage/BigInt/private Map store/원시 색상/props={} 0건 · 시맨틱 토큰)을 준수한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "hdri-sky-rig-engine.ts",
      "Studio3dLightingRigPanel.tsx",
      "index.ts",
      "studio-3d-lighting-rig.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);
      if (file !== "studio-3d-lighting-rig.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }
      if (file.endsWith(".tsx") && file !== "studio-3d-lighting-rig.test.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/props\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
