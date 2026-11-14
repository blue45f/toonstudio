/**
 * RenderPanel 전용 피부·의상 표면 소재 프리셋 및 툰 셰이딩·그림자 통합 프리셋 (P2-16).
 *
 * - 피부(`skin`)·헤어(`hair`)·상의(`top`)·하의(`bottom`)·아우터(`outer`)·신발(`shoes`)·장식(`accessory`) 채널에
 *   검증된 `MaterialPresetId` 표면을 원자적 명령으로 적용한다.
 * - 툰 셰이딩(음영 단수·림라이트·비등방 필압 외곽선)과 그림자(CSM 캐스케이드·PCF·PCSS 접촉 경화)·IBL을
 *   웹툰 장르별 조명 연출 프리셋으로 한 번에 전환하고 기본값 복원을 지원한다.
 */
import { DEFAULT_SHADING, mergeLook } from "../../../contracts";

import type { ChannelKey, LabCommand, LookPatch, MaterialPresetId, ShadingProfile, Surface, Surfaces } from "../../../contracts";

export interface WebtoonMaterialSurfacePreset {
  readonly id: "peach-wool-school" | "porcelain-silk-rofan" | "action-leather-armor" | "casual-knit-denim";
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly surfaces: Readonly<Partial<Record<ChannelKey, MaterialPresetId>>>;
}

export interface WebtoonLightingShadowPreset {
  readonly id: "daylight-cel-soft" | "sunset-rim-pcss" | "romance-soft-bloom" | "noir-hard-cascade4";
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly buildShading: (current: ShadingProfile) => Partial<ShadingProfile>;
  readonly lookPatch: LookPatch;
}

export const WEBTOON_MATERIAL_SURFACE_PRESETS: readonly WebtoonMaterialSurfacePreset[] = [
  {
    id: "peach-wool-school",
    labelKo: "복숭아 피부 · 매트 울 교복",
    summaryKo: "SSS 복숭아 피부 + 비등방 헤어 + 매트 코튼 교복 + 가죽 로퍼",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-cotton",
      bottom: "cloth-cotton",
      outer: "cloth-cotton",
      shoes: "leather",
    },
  },
  {
    id: "porcelain-silk-rofan",
    labelKo: "도자기 피부 · 실크 드레스",
    summaryKo: "투명 도자기 SSS 피부 + 고광택 실크 드레스/로브 + 메탈 장식",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-silk",
      bottom: "cloth-silk",
      outer: "cloth-silk",
      shoes: "leather",
      accessory: "metal",
    },
  },
  {
    id: "action-leather-armor",
    labelKo: "액션 가죽 전투복 · 메탈",
    summaryKo: "탄탄한 가죽 아우터/부츠 + 데님 하의 + 강철 메탈 소품",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "leather",
      outer: "leather",
      bottom: "cloth-denim",
      shoes: "leather",
      accessory: "metal",
    },
  },
  {
    id: "casual-knit-denim",
    labelKo: "포근 니트 · 생지 데님",
    summaryKo: "부드러운 니트 상의 + 생지 데님 팬츠 + 코튼 스니커즈",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-knit",
      bottom: "cloth-denim",
      shoes: "cloth-cotton",
    },
  },
] as const;

export const WEBTOON_LIGHTING_SHADOW_PRESETS: readonly WebtoonLightingShadowPreset[] = [
  {
    id: "daylight-cel-soft",
    labelKo: "낮 일상 2단 셀 · 소프트 그림자",
    summaryKo: "2단 셀 음영 · 외곽선 필압 · 2단 CSM + 부드러운 PCF 그림자",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "khr-pbr-neutral",
      toon: { ...current.toon, rampSteps: 2, faceSdfShadow: true, rim: false, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 2, pcf: true, contactHardening: false },
      postfx: { ...current.postfx, fxaa: true, bloom: false, sharpen: false },
      ibl: { enabled: true, intensity: 1.05 },
    }),
    lookPatch: {
      ramp: { softness: 0.12 },
      rim: { strength: 0 },
      line: { widthMm: 2.2 },
    },
  },
  {
    id: "sunset-rim-pcss",
    labelKo: "노을 역광 3단 · 림 · PCSS 그림자",
    summaryKo: "3단 풍부한 셀 음영 · 황금빛 림라이트 · 3단 CSM + PCSS 접촉 경화 그림자",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "aces",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 3, pcf: true, contactHardening: true },
      postfx: { ...current.postfx, fxaa: true, bloom: true, sharpen: false },
      ibl: { enabled: true, intensity: 1.35 },
    }),
    lookPatch: {
      ramp: { softness: 0.22 },
      rim: { strength: 0.65, color: [1, 0.7, 0.42], edge0: 0.58, edge1: 0.92 },
      shade: { skin: { kind: "multiply", rgb: [0.92, 0.72, 0.68] } },
      line: { widthMm: 2.6 },
    },
  },
  {
    id: "romance-soft-bloom",
    labelKo: "로맨스 실내 소프트 · 블룸",
    summaryKo: "부드러운 3단 수채 램프 · 은은한 핑크 림 · 소프트 PCF 그림자 + 블룸",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "khr-pbr-neutral",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 2, pcf: true, contactHardening: false },
      postfx: { ...current.postfx, fxaa: true, bloom: true, sharpen: false },
      ibl: { enabled: true, intensity: 1.25 },
    }),
    lookPatch: {
      ramp: { softness: 0.38 },
      rim: { strength: 0.42, color: [1, 0.84, 0.91], edge0: 0.55, edge1: 0.93 },
      shade: { skin: { kind: "multiply", rgb: [0.95, 0.8, 0.84] } },
      line: { widthMm: 1.8 },
    },
  },
  {
    id: "noir-hard-cascade4",
    labelKo: "느와르 고대비 · 4단 하드 그림자",
    summaryKo: "칼각 2단 셀 음영 · 차가운 시안 림 · 4단 정밀 CSM 하드 그림자",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "aces",
      toon: { ...current.toon, rampSteps: 2, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 4, pcf: false, contactHardening: true },
      postfx: { ...current.postfx, fxaa: true, bloom: false, sharpen: true },
      ibl: { enabled: true, intensity: 0.72 },
    }),
    lookPatch: {
      ramp: { softness: 0.04 },
      rim: { strength: 0.75, color: [0.49, 0.83, 0.99], edge0: 0.65, edge1: 0.9 },
      shade: { other: { kind: "multiply", rgb: [0.42, 0.48, 0.58] } },
      line: { widthMm: 3.2 },
    },
  },
] as const;

const MANAGED_SURFACE_CHANNELS: readonly ChannelKey[] = ["skin", "hair", "top", "bottom", "outer", "shoes", "accessory"];

export function buildMaterialSurfaceCommands(
  currentSurfaces: Surfaces,
  preset: WebtoonMaterialSurfacePreset,
): readonly LabCommand[] {
  const commands: LabCommand[] = [];
  for (const channel of MANAGED_SURFACE_CHANNELS) {
    const nextMaterial = preset.surfaces[channel];
    const existingPattern = currentSurfaces[channel]?.pattern ?? null;
    if (nextMaterial === undefined) {
      if (currentSurfaces[channel] !== undefined) {
        commands.push({ type: "surface/set", channel, surface: null });
      }
      continue;
    }
    const nextSurface: Surface = { material: nextMaterial, pattern: existingPattern };
    commands.push({ type: "surface/set", channel, surface: nextSurface });
  }
  return commands;
}

export function isMaterialSurfacePresetActive(currentSurfaces: Surfaces, preset: WebtoonMaterialSurfacePreset): boolean {
  return Object.entries(preset.surfaces).every(([channel, mat]) => currentSurfaces[channel as ChannelKey]?.material === mat);
}

export function buildLightingShadowCommands(
  currentShading: ShadingProfile,
  preset: WebtoonLightingShadowPreset,
): readonly LabCommand[] {
  const profilePatch = preset.buildShading(currentShading);
  return [
    {
      type: "shading/set",
      profile: {
        ...profilePatch,
        look: mergeLook(currentShading.look, preset.lookPatch),
      },
    },
  ];
}

export function buildResetMaterialLightingCommands(currentSurfaces: Surfaces): readonly LabCommand[] {
  const commands: LabCommand[] = [];
  for (const channel of MANAGED_SURFACE_CHANNELS) {
    if (currentSurfaces[channel] !== undefined) {
      commands.push({ type: "surface/set", channel, surface: null });
    }
  }
  commands.push({
    type: "shading/set",
    profile: {
      mode: DEFAULT_SHADING.mode,
      toneMapping: DEFAULT_SHADING.toneMapping,
      toon: { ...DEFAULT_SHADING.toon },
      shadows: { ...DEFAULT_SHADING.shadows },
      postfx: { ...DEFAULT_SHADING.postfx },
      ibl: { ...DEFAULT_SHADING.ibl },
    },
  });
  return commands;
}

export function summarizeActiveMaterialAndShadowKo(surfaces: Surfaces, shading: ShadingProfile): string {
  const skinMat = surfaces.skin?.material ?? "skin-sss(기본)";
  const topMat = surfaces.top?.material ?? "역할 기본";
  const shadowDesc = shading.shadows.enabled
    ? `CSM ${shading.shadows.cascades}단 · ${shading.shadows.pcf ? "PCF" : "하드"}${shading.shadows.contactHardening ? "+PCSS" : ""}`
    : "그림자 꺼짐";
  const shadeDesc = shading.mode === "toon"
    ? `툰 ${shading.toon.rampSteps}단 · ${shading.toon.rim ? "림 켜짐" : "림 꺼짐"}`
    : "PBR 조명";
  return `피부 ${skinMat} · 의상 ${topMat} · ${shadeDesc} · ${shadowDesc}`;
}
