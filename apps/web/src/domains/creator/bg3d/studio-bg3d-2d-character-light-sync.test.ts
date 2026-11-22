// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildGradientLut, normalizeGradientMap } from "../studio-gradient-map";
import {
  STUDIO_BG3D_2D_LIGHT_SYNC_EVENT,
  STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN,
  STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN,
  STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS,
  STUDIO_BG3D_2D_LIGHT_SYNC_STORAGE_KEY,
  clearLatestStudioBg3d2dCharacterLightSync,
  computeStudioBg3d2dCharacterLightSync,
  deriveCharacterLightSyncFromBg3dLighting,
  deriveCharacterLightSyncFromSceneDocument,
  dispatchStudioBg3d2dCharacterLightSync,
  estimateColorTemperatureKFromHex,
  getLatestStudioBg3d2dCharacterLightSync,
  getStudioBg3d2dLightSyncPreset,
  kelvinToSrgbHex,
  normalizeAzimuthDeg,
  normalizeLightSyncHex,
  oklchToLightSyncColor,
  resolveStudioBg3d2dLightSyncPreset,
  srgbHexToLightSyncColor,
  type StudioBg3d2dCharacterLightSyncPayload,
} from "./studio-bg3d-2d-character-light-sync";
import { studioBg3dLightAnglesToDirection } from "./studio-bg3d-light-direction";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

afterEach(() => {
  clearLatestStudioBg3d2dCharacterLightSync();
});

describe("3D 배경 → 2D 캐릭터 광원·림라이트 색온도 변환 엔진", () => {
  it("색온도(2400K~10000K)와 sRGB·OKLCH 변환을 결정적으로 계산하고 범위를 안전하게 클램프한다", () => {
    const warmHex = kelvinToSrgbHex(2_400);
    const neutralHex = kelvinToSrgbHex(6_500);
    const coolHex = kelvinToSrgbHex(10_000);

    expect(warmHex).toBe(kelvinToSrgbHex(1_000));
    expect(coolHex).toBe(kelvinToSrgbHex(18_000));
    expect(kelvinToSrgbHex(Number.NaN)).toBe(neutralHex);

    const warm = srgbHexToLightSyncColor(warmHex);
    const cool = srgbHexToLightSyncColor(coolHex);

    expect(warm.rgb[0]).toBeGreaterThan(warm.rgb[2]);
    expect(cool.rgb[2]).toBeGreaterThan(cool.rgb[0]);
    expect(warm.oklchCss).toMatch(/^oklch\(/u);
    expect(cool.oklchCss).toMatch(/^oklch\(/u);

    // 색역 외 고채도 OKLCH 입력도 색상·명도를 보존하며 유효 sRGB 색으로 안전 압축한다.
    const gamutMapped = oklchToLightSyncColor({ l: 0.78, c: 0.45, h: 48 });
    expect(gamutMapped.srgbHex).toMatch(/^#[\da-f]{6}$/u);
    expect(gamutMapped.oklch.l).toBeGreaterThan(0.7);
    expect(gamutMapped.oklch.l).toBeLessThan(0.86);

    // 3D 키 라이트 색상 → 근사 색온도 역추정 단조성 검증
    const estWarm = estimateColorTemperatureKFromHex("#ff9e50");
    const estMid = estimateColorTemperatureKFromHex("#fffdf8");
    const estCool = estimateColorTemperatureKFromHex("#b8d4ff");
    expect(estWarm).toBeGreaterThanOrEqual(STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN);
    expect(estWarm).toBeLessThan(4_200);
    expect(estMid).toBeGreaterThan(5_800);
    expect(estMid).toBeLessThan(7_200);
    expect(estCool).toBeGreaterThan(7_500);
    expect(estCool).toBeLessThanOrEqual(STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN);

    // 비흑체 극채도 시안 네온도 NaN 없이 차가운 색온도 구간으로 안전 매핑된다.
    const estNeonCyan = estimateColorTemperatureKFromHex("#06b6d4");
    expect(estNeonCyan).toBeGreaterThanOrEqual(7_000);
    expect(estNeonCyan).toBeLessThanOrEqual(STUDIO_BG3D_2D_LIGHT_SYNC_MAX_KELVIN);
  });

  it("방위각·헥스 정규화와 비정상 입력(NaN/Infinity) 방어가 결정적이다", () => {
    expect(normalizeAzimuthDeg(0)).toBe(0);
    expect(normalizeAzimuthDeg(270)).toBe(-90);
    expect(normalizeAzimuthDeg(-270)).toBe(90);
    expect(normalizeAzimuthDeg(180)).toBe(180);
    expect(normalizeAzimuthDeg(-180)).toBe(180);
    expect(normalizeAzimuthDeg(Number.NaN)).toBe(0);

    expect(normalizeLightSyncHex("#AbC")).toBe("#aabbcc");
    expect(normalizeLightSyncHex("  #FF8800 ")).toBe("#ff8800");
    expect(normalizeLightSyncHex("not-a-color", "#112233")).toBe("#112233");

    const sanitized = computeStudioBg3d2dCharacterLightSync({
      azimuthDeg: Number.NaN,
      elevationDeg: Number.POSITIVE_INFINITY,
      colorTemperatureK: -999,
      ambientTintHex: "invalid",
      intensity: Number.NaN,
    });
    expect(sanitized.normalizedInput.azimuthDeg).toBe(0);
    expect(sanitized.normalizedInput.elevationDeg).toBe(35);
    expect(sanitized.normalizedInput.colorTemperatureK).toBe(STUDIO_BG3D_2D_LIGHT_SYNC_MIN_KELVIN);
    expect(Math.hypot(sanitized.rimLight.vector2d.x, sanitized.rimLight.vector2d.y)).toBeCloseTo(1, 3);
    expect(
      Math.hypot(sanitized.shadowCast.direction2d.x, sanitized.shadowCast.direction2d.y),
    ).toBeCloseTo(1, 3);
  });

  it("3단계 그라데이션 맵·림라이트 벡터·그림자 투사 방향의 기하/색채 불변식을 만족한다", () => {
    const sunset = computeStudioBg3d2dCharacterLightSync({
      azimuthDeg: 120,
      elevationDeg: 18,
      colorTemperatureK: 3_200,
      ambientTintHex: "#451a2d",
      intensity: 1.8,
      ambientIntensity: 0.4,
    });

    // 동일 입력 재호출 시 완전 결정적 동일 결과
    expect(
      computeStudioBg3d2dCharacterLightSync({
        azimuthDeg: 120,
        elevationDeg: 18,
        colorTemperatureK: 3_200,
        ambientTintHex: "#451a2d",
        intensity: 1.8,
        ambientIntensity: 0.4,
      }),
    ).toEqual(sunset);

    // 3단계 그라데이션 맵 단조 명도 증가 + studio-gradient-map 호환성 검증
    const { shadow, midtone, highlight, studioGradientMap } = sunset.gradientMap;
    expect(shadow.pos).toBe(0);
    expect(midtone.pos).toBe(0.5);
    expect(highlight.pos).toBe(1);
    expect(shadow.color.oklch.l).toBeLessThan(midtone.color.oklch.l);
    expect(midtone.color.oklch.l).toBeLessThan(highlight.color.oklch.l);

    const normalizedMap = normalizeGradientMap(studioGradientMap);
    expect(normalizedMap.stops).toHaveLength(3);
    const lut = buildGradientLut(normalizedMap);
    expect(lut).toHaveLength(256 * 3);
    expect(lut[0]).toBe(shadow.color.rgb[0]);
    expect(lut[255 * 3]).toBe(highlight.color.rgb[0]);

    // 림라이트 벡터는 단위 벡터이며 그림자 투사 방향과 정확히 정반대(내적 -1)다.
    const rim = sunset.rimLight.vector2d;
    const sh = sunset.shadowCast.direction2d;
    expect(Math.hypot(rim.x, rim.y)).toBeCloseTo(1, 3);
    expect(Math.hypot(sh.x, sh.y)).toBeCloseTo(1, 3);
    expect(rim.x * sh.x + rim.y * sh.y).toBeCloseTo(-1, 3);

    // 우상단(azimuth +120°, elevation +18°) 광원 → 림은 우상(+x, -y), 그림자는 좌하(-x, +y)
    expect(rim.x).toBeGreaterThan(0);
    expect(rim.y).toBeLessThan(0);
    expect(sh.x).toBeLessThan(0);
    expect(sh.y).toBeGreaterThan(0);

    // 낮은 고도(18°)가 높은 고도(65°)보다 그림자가 길고 림라이트 두께가 두껍다.
    const noon = computeStudioBg3d2dCharacterLightSync({
      azimuthDeg: 36,
      elevationDeg: 65,
      colorTemperatureK: 6_500,
      ambientTintHex: "#bdd9f2",
      intensity: 1.4,
      ambientIntensity: 0.6,
    });
    expect(sunset.shadowCast.lengthRatio).toBeGreaterThan(noon.shadowCast.lengthRatio);
    expect(sunset.rimLight.thicknessPx).toBeGreaterThan(noon.rimLight.thicknessPx);
    expect(sunset.rimLight.backlightFactor).toBeGreaterThan(noon.rimLight.backlightFactor);

    // 따뜻한 색온도(3200K) → 양수 temperature, 차가운 색온도(8800K) → 음수 temperature
    const moonlight = computeStudioBg3d2dCharacterLightSync({
      azimuthDeg: 140,
      elevationDeg: 38,
      colorTemperatureK: 8_800,
      ambientTintHex: "#172540",
      intensity: 1.15,
      ambientIntensity: 0.28,
    });
    expect(sunset.characterLayerPatch.temperature).toBeGreaterThan(30);
    expect(moonlight.characterLayerPatch.temperature).toBeLessThan(-30);
  });

  it("정면·측면·역광 각도와 환경광 비율에 따라 add/screen/soft-light 3종 블렌드 모드를 정확히 선택한다", () => {
    const front = computeStudioBg3d2dCharacterLightSync({
      azimuthDeg: 0,
      elevationDeg: 0,
      colorTemperatureK: 5_800,
      ambientTintHex: "#d8e0e6",
      intensity: 1.0,
      ambientIntensity: 0.85,
    });
    const side = computeStudioBg3d2dCharacterLightSync({
      azimuthDeg: 90,
      elevationDeg: 35,
      colorTemperatureK: 6_500,
      ambientTintHex: "#bdd9f2",
      intensity: 1.35,
      ambientIntensity: 0.45,
    });
    const back = computeStudioBg3d2dCharacterLightSync({
      azimuthDeg: 180,
      elevationDeg: 15,
      colorTemperatureK: 3_200,
      ambientTintHex: "#3a1e38",
      intensity: 1.85,
      ambientIntensity: 0.3,
    });

    expect(back.rimLight.backlightFactor).toBeGreaterThan(side.rimLight.backlightFactor);
    expect(side.rimLight.backlightFactor).toBeGreaterThan(front.rimLight.backlightFactor);
    expect(front.rimLight.blendMode).toBe("soft-light");
    expect(side.rimLight.blendMode).toBe("screen");
    expect(back.rimLight.blendMode).toBe("add");
    // 순정면(0°, 0°) 2D 투영 영벡터 폴백 → 상단(0, -1)
    expect(front.rimLight.vector2d).toEqual({ x: 0, y: -1 });
  });

  it("웹툰 현장 즉시 프리셋 5종(석양·교실 형광등·네온 골목·정오 야외·새벽 달빛)의 색온도·불변성·블렌드 모드를 보장한다", () => {
    expect(STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS).toHaveLength(5);
    expect(Object.isFrozen(STUDIO_BG3D_2D_LIGHT_SYNC_PRESETS)).toBe(true);

    const expected = [
      { id: "sunset", labelKo: "석양", kelvin: 3_200, blend: "add" },
      { id: "classroom-fluorescent", labelKo: "교실 형광등", kelvin: 5_400, blend: "soft-light" },
      { id: "neon-alley", labelKo: "네온 골목", kelvin: 7_800, blend: "add" },
      { id: "noon-outdoor", labelKo: "정오 야외", kelvin: 6_500, blend: "screen" },
      { id: "dawn-moonlight", labelKo: "새벽 달빛", kelvin: 8_800, blend: "screen" },
    ] as const;

    for (const item of expected) {
      const preset = getStudioBg3d2dLightSyncPreset(item.id);
      expect(preset).not.toBeNull();
      expect(Object.isFrozen(preset)).toBe(true);
      expect(preset!.labelKo).toBe(item.labelKo);
      expect(preset!.input.colorTemperatureK).toBe(item.kelvin);
      expect(preset!.kelvinLabel).toBe(`${item.kelvin}K`);
      expect(preset!.preview.rimLight.blendMode).toBe(item.blend);
      expect(preset!.preview.gradientMap.shadow.color.oklch.l).toBeLessThan(
        preset!.preview.gradientMap.midtone.color.oklch.l,
      );
      expect(preset!.preview.gradientMap.midtone.color.oklch.l).toBeLessThan(
        preset!.preview.gradientMap.highlight.color.oklch.l,
      );

      // 프리셋의 3D 조명을 다시 직결 API로 넘기면 정확히 동일 프리셋이 식별·복원된다.
      const resolved = resolveStudioBg3d2dLightSyncPreset(preset!.bg3dLighting, preset!.exposure);
      expect(resolved?.id).toBe(item.id);
      const derived = deriveCharacterLightSyncFromBg3dLighting(
        preset!.bg3dLighting,
        preset!.exposure,
      );
      expect(derived.normalizedInput.colorTemperatureK).toBe(item.kelvin);
      expect(derived.rimLight.blendMode).toBe(item.blend);
    }
  });

  it("사용자 3D 씬 문서(StudioBg3dSceneDocument)에서 직접 2D 캐릭터 광원 동기화 패치를 추출한다", () => {
    const customScene = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      lighting: {
        ambientColor: "#25314d",
        ambientIntensity: 0.35,
        key: {
          color: "#ffa45b",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: -115, elevationDeg: 22 }),
          intensity: 1.7,
          castsShadow: true,
        },
        fill: {
          color: "#6b88d8",
          direction: studioBg3dLightAnglesToDirection({ azimuthDeg: 65, elevationDeg: 30 }),
          intensity: 0.4,
          castsShadow: false,
        },
      },
      render: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.render,
        exposure: 1.15,
      },
    };

    const synced = deriveCharacterLightSyncFromSceneDocument(customScene);
    expect(synced.normalizedInput.azimuthDeg).toBeCloseTo(-115, 0);
    expect(synced.normalizedInput.elevationDeg).toBeCloseTo(22, 0);
    expect(synced.normalizedInput.colorTemperatureK).toBeLessThan(4_200);
    expect(synced.rimLight.vector2d.x).toBeLessThan(0);
    expect(synced.shadowCast.direction2d.x).toBeGreaterThan(0);
    expect(synced.characterLayerPatch.gradientMap.stops).toHaveLength(3);
  });

  it("1클릭 동기화 발행 시 브리지 이벤트·스토리지 영속화·예외 안전 폴백을 보장한다", () => {
    const received: StudioBg3d2dCharacterLightSyncPayload[] = [];
    const listener = (event: Event) => {
      received.push((event as CustomEvent<StudioBg3d2dCharacterLightSyncPayload>).detail);
    };
    window.addEventListener(STUDIO_BG3D_2D_LIGHT_SYNC_EVENT, listener);

    try {
      const sunset = getStudioBg3d2dLightSyncPreset("sunset")!;
      const receipt = dispatchStudioBg3d2dCharacterLightSync(sunset.preview, {
        source: "preset",
        presetId: "sunset",
        syncedAt: "2026-11-22T03:30:00.000Z",
      });

      expect(receipt.dispatchedEvent).toBe(true);
      expect(receipt.persistedToStorage).toBe(true);
      expect(received).toHaveLength(1);
      expect(received[0]?.presetId).toBe("sunset");
      expect(received[0]?.labelKo).toBe("석양 3200K");
      expect(window.localStorage.getItem(STUDIO_BG3D_2D_LIGHT_SYNC_STORAGE_KEY)).toContain(
        "sunset",
      );

      // 메모리 캐시 비워도 localStorage에서 정상 복원된다.
      clearLatestStudioBg3d2dCharacterLightSync(null);
      const restored = getLatestStudioBg3d2dCharacterLightSync();
      expect(restored?.presetId).toBe("sunset");
      expect(restored?.result.normalizedInput.colorTemperatureK).toBe(3_200);

      // 스토리지 쓰기 실패 시에도 예외 없이 메모리/이벤트 발행은 성공한다.
      const failingStorage = {
        getItem: vi.fn(() => {
          throw new Error("quota");
        }),
        setItem: vi.fn(() => {
          throw new Error("quota");
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      } satisfies Storage;

      const fallbackReceipt = dispatchStudioBg3d2dCharacterLightSync(sunset.preview, {
        storage: failingStorage,
      });
      expect(fallbackReceipt.persistedToStorage).toBe(false);
      expect(fallbackReceipt.dispatchedEvent).toBe(true);
    } finally {
      window.removeEventListener(STUDIO_BG3D_2D_LIGHT_SYNC_EVENT, listener);
    }
  });
});
