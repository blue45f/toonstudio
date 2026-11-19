/**
 * RenderPanel 전용 피부·의상 표면 소재 프리셋, 툰 셰이딩·그림자·흑백 원고 스크린톤 통합 프리셋,
 * 그리고 한국 웹툰 6대 장르별(로판·느와르·학원·무협·스릴러·힐링) 1-클릭 마스터 씬 프리셋 (P2-16+).
 *
 * - 피부(`skin`)·헤어(`hair`)·상의(`top`)·하의(`bottom`)·아우터(`outer`)·신발(`shoes`)·장식(`accessory`) 채널에
 *   검증된 `MaterialPresetId` 표면을 원자적 명령으로 적용한다.
 * - 툰 셰이딩(음영 단수·림라이트·비등방 필압 외곽선), 그림자(CSM 캐스케이드·PCF·PCSS 접촉 경화)·IBL,
 *   그리고 만화 출판 원고용 흑백 크로스해칭/망점 스크린톤(`look.tone` + `look.grade`)을 원클릭 전환하고 기본값 복원을 지원한다.
 */
import { DEFAULT_SHADING, cloneLook, mergeLook } from "../../../contracts";
import { stableStringify } from "../../../shared/stable-json";

import type { ChannelKey, LabCommand, LookPatch, MaterialPresetId, ShadingProfile, Surface, Surfaces } from "../../../contracts";

export interface WebtoonMaterialSurfacePreset {
  readonly id:
    | "peach-wool-school"
    | "porcelain-silk-rofan"
    | "action-leather-armor"
    | "casual-knit-denim"
    | "sanctuary-ivory-brocade"
    | "bespoke-charcoal-suit"
    | "academy-officer-wool"
    | "tactical-ripstop-gear";
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly surfaces: Readonly<Partial<Record<ChannelKey, MaterialPresetId>>>;
}

export interface WebtoonLightingShadowPreset {
  readonly id:
    | "daylight-cel-soft"
    | "sunset-rim-pcss"
    | "romance-soft-bloom"
    | "noir-hard-cascade4"
    | "sanctuary-ethereal-halo"
    | "office-editorial-clean"
    | "manga-ink-lineart"
    | "manga-halftone-screentone";
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly buildShading: (current: ShadingProfile) => Partial<ShadingProfile>;
  readonly lookPatch: LookPatch;
}

export interface WebtoonGenreScenePreset {
  readonly id:
    | "genre-rofan-twilight"
    | "genre-noir-rain"
    | "genre-academy-cherry"
    | "genre-murim-moonlight"
    | "genre-thriller-interrogation"
    | "genre-healing-cafe";
  readonly labelKo: string;
  readonly genreTagKo: string;
  readonly summaryKo: string;
  readonly surfaces: Readonly<Partial<Record<ChannelKey, MaterialPresetId>>>;
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
  {
    id: "sanctuary-ivory-brocade",
    labelKo: "성소 에테르 실크 · 금사 성물",
    summaryKo: "투명 백자 SSS 피부 + 성소 실크 드레스/망토 + 순금 헤일로 메탈",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-silk",
      bottom: "cloth-silk",
      outer: "cloth-silk",
      shoes: "cloth-silk",
      accessory: "metal",
    },
  },
  {
    id: "bespoke-charcoal-suit",
    labelKo: "비스포크 울 수트 · 오피스 로퍼",
    summaryKo: "정제된 매트 울 재킷/슬랙스 + 유광 가죽 로퍼 + 메탈 타이클립/안경",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-cotton",
      bottom: "cloth-cotton",
      outer: "cloth-cotton",
      shoes: "leather",
      accessory: "metal",
    },
  },
  {
    id: "academy-officer-wool",
    labelKo: "황립 장교 울 제복 · 금장 에길레트",
    summaryKo: "아이보리 장교 울 케이프 블레이저 + 체크 플리츠 스커트 + 순금 견장 메탈",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-cotton",
      bottom: "cloth-cotton",
      outer: "cloth-silk",
      shoes: "leather",
      accessory: "metal",
    },
  },
  {
    id: "tactical-ripstop-gear",
    labelKo: "택티컬 립스탑 필드기어 · 방탄 리그",
    summaryKo: "매트 립스탑 후디 재킷 + 카고 데님 + 전술 부츠 및 바이저 메탈",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-cotton",
      outer: "leather",
      bottom: "cloth-denim",
      shoes: "leather",
      accessory: "metal",
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
  {
    id: "sanctuary-ethereal-halo",
    labelKo: "신전 성광 3단 · 샴페인 에테르 블룸",
    summaryKo: "성스러운 3단 셀 그라데이션 · 황금 성광 림 · 3단 PCF 그림자 + 에테르 블룸",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "khr-pbr-neutral",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 3, pcf: true, contactHardening: false },
      postfx: { ...current.postfx, fxaa: true, bloom: true, sharpen: false },
      ibl: { enabled: true, intensity: 1.45 },
    }),
    lookPatch: {
      ramp: { softness: 0.34 },
      rim: { strength: 0.58, color: [1, 0.93, 0.72], edge0: 0.54, edge1: 0.92 },
      shade: { skin: { kind: "multiply", rgb: [0.96, 0.84, 0.8] } },
      line: { widthMm: 1.9 },
    },
  },
  {
    id: "office-editorial-clean",
    labelKo: "오피스 에디토리얼 2단 · 쿨 스틸 림",
    summaryKo: "도회적 2단 클린 셀 음영 · 스틸 화이트 림 · 3단 정밀 PCSS 그림자",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "khr-pbr-neutral",
      toon: { ...current.toon, rampSteps: 2, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 3, pcf: true, contactHardening: true },
      postfx: { ...current.postfx, fxaa: true, bloom: false, sharpen: true },
      ibl: { enabled: true, intensity: 1.15 },
    }),
    lookPatch: {
      ramp: { softness: 0.14 },
      rim: { strength: 0.38, color: [0.84, 0.91, 1], edge0: 0.62, edge1: 0.93 },
      shade: { other: { kind: "multiply", rgb: [0.74, 0.78, 0.86] } },
      line: { widthMm: 2.3 },
    },
  },
  {
    id: "manga-ink-lineart",
    labelKo: "흑백 출판 원고 · 고대비 잉크 선화",
    summaryKo: "무채색 고대비 잉크 2단 셀 + 35° 크로스해칭 펜선 음영 + 3.4mm 필압 외곽선",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "none",
      toon: { ...current.toon, rampSteps: 2, faceSdfShadow: true, rim: false, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 3, pcf: false, contactHardening: false },
      postfx: { ...current.postfx, fxaa: true, bloom: false, sharpen: true },
      ibl: { enabled: true, intensity: 1.05 },
    }),
    lookPatch: {
      ramp: { softness: 0.02 },
      rim: { strength: 0 },
      line: { widthMm: 3.4 },
      tone: { kind: "crosshatch", cellPerHead: 52, angleDeg: 35, bands: [0, 0.45, 0.8], strength: 0.86, ink: "line" },
      grade: { saturation: 0, lightness: 0.04 },
    },
  },
  {
    id: "manga-halftone-screentone",
    labelKo: "회상·연출 컷 · 45° 망점 스크린톤",
    summaryKo: "흑백 회상 톤 + 45° 망점(Halftone) 스크린톤 음영 + 또렷한 펜선 외곽선",
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "khr-pbr-neutral",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 2, pcf: true, contactHardening: false },
      postfx: { ...current.postfx, fxaa: true, bloom: false, sharpen: false },
      ibl: { enabled: true, intensity: 1.1 },
    }),
    lookPatch: {
      ramp: { softness: 0.08 },
      rim: { strength: 0.35, color: [0.95, 0.95, 0.95], edge0: 0.6, edge1: 0.92 },
      line: { widthMm: 2.8 },
      tone: { kind: "halftone", cellPerHead: 44, angleDeg: 45, bands: [0, 0.5, 0.85], strength: 0.88, ink: "line" },
      grade: { saturation: 0.06, lightness: 0.02 },
    },
  },
] as const;

export const WEBTOON_GENRE_SCENE_PRESETS: readonly WebtoonGenreScenePreset[] = [
  {
    id: "genre-rofan-twilight",
    labelKo: "로판 황혼 테라스 역광",
    genreTagKo: "로맨스판타지",
    summaryKo: "도자기 SSS 피부 · 고광택 실크 예복 · 3단 ACES 골든 림라이트 + PCSS 그림자",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-silk",
      bottom: "cloth-silk",
      outer: "cloth-silk",
      shoes: "leather",
      accessory: "metal",
    },
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "aces",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 3, pcf: true, contactHardening: true },
      postfx: { ...current.postfx, fxaa: true, bloom: true, sharpen: false },
      ibl: { enabled: true, intensity: 1.38 },
    }),
    lookPatch: {
      ramp: { softness: 0.24 },
      rim: { strength: 0.66, color: [1, 0.72, 0.44], edge0: 0.56, edge1: 0.92 },
      shade: { skin: { kind: "multiply", rgb: [0.93, 0.74, 0.7] } },
      line: { widthMm: 2.4 },
      grade: { saturation: 1.05, lightness: 0.01 },
    },
  },
  {
    id: "genre-noir-rain",
    labelKo: "느와르 골목 네온 하드림",
    genreTagKo: "액션·느와르",
    summaryKo: "매트 울 코트/가죽 로퍼 · 칼각 2단 셀 · 4단 CSM 하드 그림자 + 네온 시안 림",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-cotton",
      bottom: "cloth-cotton",
      outer: "leather",
      shoes: "leather",
      accessory: "metal",
    },
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "aces",
      toon: { ...current.toon, rampSteps: 2, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 4, pcf: false, contactHardening: true },
      postfx: { ...current.postfx, fxaa: true, bloom: false, sharpen: true },
      ibl: { enabled: true, intensity: 0.74 },
    }),
    lookPatch: {
      ramp: { softness: 0.04 },
      rim: { strength: 0.78, color: [0.45, 0.85, 1], edge0: 0.64, edge1: 0.9 },
      shade: { other: { kind: "multiply", rgb: [0.4, 0.46, 0.56] } },
      line: { widthMm: 3.2 },
      grade: { saturation: 0.88, lightness: -0.02 },
    },
  },
  {
    id: "genre-academy-cherry",
    labelKo: "학원물 봄날 자연광",
    genreTagKo: "학원·청춘",
    summaryKo: "복숭아 SSS 피부 · 매트 울 교복 · 부드러운 3단 수채 셀 + 벚꽃 핑크 림 블룸",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-cotton",
      bottom: "cloth-cotton",
      outer: "cloth-cotton",
      shoes: "leather",
      accessory: "metal",
    },
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "khr-pbr-neutral",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 2, pcf: true, contactHardening: false },
      postfx: { ...current.postfx, fxaa: true, bloom: true, sharpen: false },
      ibl: { enabled: true, intensity: 1.24 },
    }),
    lookPatch: {
      ramp: { softness: 0.34 },
      rim: { strength: 0.4, color: [1, 0.85, 0.91], edge0: 0.55, edge1: 0.93 },
      shade: { skin: { kind: "multiply", rgb: [0.95, 0.81, 0.84] } },
      line: { widthMm: 1.9 },
      grade: { saturation: 1.04, lightness: 0.02 },
    },
  },
  {
    id: "genre-murim-moonlight",
    labelKo: "무협 청운 월광 검기",
    genreTagKo: "무협·동양판타지",
    summaryKo: "비단 도포 · 가죽 호완/부츠 · 3단 ACES 청록 월광 림라이트 + 정밀 PCSS 그림자",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-silk",
      bottom: "cloth-cotton",
      outer: "cloth-silk",
      shoes: "leather",
      accessory: "metal",
    },
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "aces",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 3, pcf: true, contactHardening: true },
      postfx: { ...current.postfx, fxaa: true, bloom: true, sharpen: true },
      ibl: { enabled: true, intensity: 1.08 },
    }),
    lookPatch: {
      ramp: { softness: 0.14 },
      rim: { strength: 0.7, color: [0.56, 0.92, 0.98], edge0: 0.58, edge1: 0.91 },
      shade: { other: { kind: "multiply", rgb: [0.52, 0.62, 0.74] } },
      line: { widthMm: 2.7 },
      grade: { saturation: 0.96, lightness: 0 },
    },
  },
  {
    id: "genre-thriller-interrogation",
    labelKo: "스릴러 취조실 집중광",
    genreTagKo: "스릴러·추리",
    summaryKo: "트렌치/전술 코튼 · 저채도 2단 고대비 셀 · 4단 CSM 하드 집중광 + 샤프 외곽선",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-cotton",
      bottom: "cloth-denim",
      outer: "leather",
      shoes: "leather",
      accessory: "metal",
    },
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "aces",
      toon: { ...current.toon, rampSteps: 2, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 4, pcf: false, contactHardening: true },
      postfx: { ...current.postfx, fxaa: true, bloom: false, sharpen: true },
      ibl: { enabled: true, intensity: 0.68 },
    }),
    lookPatch: {
      ramp: { softness: 0.03 },
      rim: { strength: 0.54, color: [0.82, 0.88, 0.96], edge0: 0.66, edge1: 0.92 },
      shade: { other: { kind: "multiply", rgb: [0.44, 0.46, 0.5] } },
      line: { widthMm: 3.1 },
      grade: { saturation: 0.72, lightness: -0.02 },
    },
  },
  {
    id: "genre-healing-cafe",
    labelKo: "일상 힐링 오후 카페광",
    genreTagKo: "일상·힐링",
    summaryKo: "포근 니트 · 생지 데님 · 따스한 3단 앰버 라떼 림라이트 + 소프트 PCF 블룸",
    surfaces: {
      skin: "skin-sss",
      hair: "hair-aniso",
      top: "cloth-knit",
      bottom: "cloth-denim",
      outer: "cloth-cotton",
      shoes: "cloth-cotton",
      accessory: "metal",
    },
    buildShading: (current) => ({
      mode: "toon",
      toneMapping: "khr-pbr-neutral",
      toon: { ...current.toon, rampSteps: 3, faceSdfShadow: true, rim: true, outline: "hull", outlinePressure: true },
      shadows: { enabled: true, cascades: 2, pcf: true, contactHardening: false },
      postfx: { ...current.postfx, fxaa: true, bloom: true, sharpen: false },
      ibl: { enabled: true, intensity: 1.28 },
    }),
    lookPatch: {
      ramp: { softness: 0.3 },
      rim: { strength: 0.45, color: [1, 0.86, 0.68], edge0: 0.56, edge1: 0.93 },
      shade: { skin: { kind: "multiply", rgb: [0.95, 0.82, 0.76] } },
      line: { widthMm: 2.0 },
      grade: { saturation: 1.02, lightness: 0.02 },
    },
  },
] as const;

const MANAGED_SURFACE_CHANNELS: readonly ChannelKey[] = ["skin", "hair", "top", "bottom", "outer", "shoes", "accessory"];

function buildSurfaceMapCommands(
  currentSurfaces: Surfaces,
  targetSurfaces: Readonly<Partial<Record<ChannelKey, MaterialPresetId>>>,
): LabCommand[] {
  const commands: LabCommand[] = [];
  for (const channel of MANAGED_SURFACE_CHANNELS) {
    const nextMaterial = targetSurfaces[channel];
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

export function buildMaterialSurfaceCommands(
  currentSurfaces: Surfaces,
  preset: WebtoonMaterialSurfacePreset,
): readonly LabCommand[] {
  return buildSurfaceMapCommands(currentSurfaces, preset.surfaces);
}

export function isMaterialSurfacePresetActive(currentSurfaces: Surfaces, preset: Pick<WebtoonMaterialSurfacePreset, "surfaces">): boolean {
  return MANAGED_SURFACE_CHANNELS.every(channel => currentSurfaces[channel]?.material === preset.surfaces[channel]);
}

type LightingPreset = Pick<WebtoonLightingShadowPreset, "buildShading" | "lookPatch">;

function lightingProfile(current: ShadingProfile, preset: LightingPreset): Partial<ShadingProfile> {
  return {
    ...preset.buildShading(current),
    look: mergeLook(current.look, {
      tone: { kind: "none", strength: 0 },
      grade: { saturation: 1, lightness: 0 },
      ...preset.lookPatch,
    }),
  };
}

export function isLightingPresetActive(current: ShadingProfile, preset: LightingPreset): boolean {
  const profile = lightingProfile(current, preset);
  return stableStringify({ ...current, ...profile }) === stableStringify(current);
}

export function buildLightingShadowCommands(
  currentShading: ShadingProfile,
  preset: WebtoonLightingShadowPreset,
): readonly LabCommand[] {
  return [{ type: "shading/set", profile: lightingProfile(currentShading, preset) }];
}

export function buildGenreScenePresetCommands(
  currentSurfaces: Surfaces,
  currentShading: ShadingProfile,
  preset: WebtoonGenreScenePreset,
): readonly LabCommand[] {
  return [
    ...buildSurfaceMapCommands(currentSurfaces, preset.surfaces),
    { type: "shading/set", profile: lightingProfile(currentShading, preset) },
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
      look: cloneLook(DEFAULT_SHADING.look),
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
  const toneTag = shading.look.tone.kind !== "none" && shading.look.tone.strength > 0 ? ` · 스크린톤(${shading.look.tone.kind})` : "";
  const monoTag = shading.look.grade.saturation <= 0.15 ? " · 흑백원고" : "";
  const shadeDesc = shading.mode === "toon"
    ? `툰 ${shading.toon.rampSteps}단 · ${shading.toon.rim ? "림 켜짐" : "림 꺼짐"}${toneTag}${monoTag}`
    : "PBR 조명";
  return `피부 ${skinMat} · 의상 ${topMat} · ${shadeDesc} · ${shadowDesc}`;
}
