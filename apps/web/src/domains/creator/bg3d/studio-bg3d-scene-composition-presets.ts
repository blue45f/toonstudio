/**
 * Studio BG3D 배경 카메라 구도 프리셋 + 장르 씬팩.
 *
 * 기존에는 카메라(위치·화각)와 조명(HDRI 프리셋, studio-bg3d-hdri-lighting-presets.ts)을
 * 따로 골라야 해서, 배경을 처음 만드는 사용자는 "어떤 씬에 어떤 앵글+조명"인지 감이 없었다.
 * 이 모듈은 장르(로맨스·액션·스릴러·일상)별 대표 씬을 하나의 팩으로 묶는다:
 * 팩 하나를 고르면 ① 카메라 앵글(위치·타깃·화각·더치롤)과 ② 그 씬에 맞는 HDRI 조명
 * 프리셋(조명+노출+날씨+태양 시각)이 함께 적용된다.
 *
 * Three.js 객체를 직접 다루지 않는 순수 데이터 모듈이며, 조명은 기존 HDRI 프리셋을
 * 참조(preset id)해서 가져오므로 조명 값이 두 곳에서 어긋날 일이 없다.
 * 카메라 좌표는 앵글(방위·고도·거리)로부터 결정적으로 계산해 썸네일 다이어그램과
 * 실제 적용 카메라가 항상 같은 각도를 가리키게 한다.
 */

import { STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP } from "./studio-bg3d-camera-orientation";
import {
  getStudioBg3dHdriLightingPreset,
  resolveStudioBg3dHdriLightingPreset,
  type StudioBg3dHdriLightingPresetId,
} from "./studio-bg3d-hdri-lighting-presets";

import type {
  StudioBg3dCameraSettings,
  StudioBg3dLightingSettings,
} from "./studio-bg3d-scene-document";
import type { WeatherPresetId } from "../scene-3d/studio-3d-atmosphere-weather";

export type StudioBg3dSceneGenreId = "romance" | "action" | "thriller" | "daily";

/** 썸네일·카드 배지에 쓰는 구도 종류. */
export type StudioBg3dCameraFramingKind =
  | "wide"
  | "medium"
  | "close-up"
  | "overhead"
  | "low-angle"
  | "dutch";

/** 카메라 앵글 썸네일 다이어그램이 그릴 정보(방위·고도·거리·구도). */
export interface StudioBg3dCameraAngleThumbnail {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distance: number;
  readonly framing: StudioBg3dCameraFramingKind;
  readonly framingLabelKo: string;
  readonly framingLabelEn: string;
}

export interface StudioBg3dSceneCompositionPreset {
  readonly id: string;
  readonly genreId: StudioBg3dSceneGenreId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly tooltipKo: string;
  readonly tooltipEn: string;
  /** 함께 적용될 HDRI 조명 프리셋. 조명·노출·날씨·태양 시각은 이 프리셋에서 가져온다. */
  readonly lightingPresetId: StudioBg3dHdriLightingPresetId;
  /** 적용될 카메라 전체 스냅샷(씬 문서 camera와 동형). */
  readonly camera: StudioBg3dCameraSettings;
  readonly thumbnail: StudioBg3dCameraAngleThumbnail;
}

export interface StudioBg3dSceneGenre {
  readonly id: StudioBg3dSceneGenreId;
  readonly labelKo: string;
  readonly labelEn: string;
}

export const STUDIO_BG3D_SCENE_GENRES: readonly StudioBg3dSceneGenre[] = Object.freeze([
  { id: "romance", labelKo: "로맨스", labelEn: "Romance" },
  { id: "action", labelKo: "액션", labelEn: "Action" },
  { id: "thriller", labelKo: "스릴러·공포", labelEn: "Thriller" },
  { id: "daily", labelKo: "일상·학원", labelEn: "Daily" },
]);

const FRAMING_LABELS: Readonly<
  Record<StudioBg3dCameraFramingKind, { readonly ko: string; readonly en: string }>
> = {
  wide: { ko: "와이드", en: "Wide" },
  medium: { ko: "미디엄", en: "Medium" },
  "close-up": { ko: "클로즈업", en: "Close-up" },
  overhead: { ko: "하이앵글", en: "High angle" },
  "low-angle": { ko: "로우앵글", en: "Low angle" },
  dutch: { ko: "더치앵글", en: "Dutch angle" },
};

function round3(value: number): number {
  const rounded = Math.round(value * 1_000) / 1_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 방위·고도·거리로 카메라 위치를 계산한다. 방위 0°는 타깃 정면(+Z), 양의 방위는 +X 쪽,
 * 양의 고도는 타깃보다 위에서 내려다본다(조명 각도 모듈과 같은 구면 규약).
 */
export function studioBg3dCameraPositionFromAngle(input: {
  readonly target: readonly [number, number, number];
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distance: number;
}): readonly [number, number, number] {
  const azimuth = (input.azimuthDeg * Math.PI) / 180;
  const elevation = (input.elevationDeg * Math.PI) / 180;
  const horizontal = Math.cos(elevation) * input.distance;
  return Object.freeze([
    round3(input.target[0] + Math.sin(azimuth) * horizontal),
    round3(input.target[1] + Math.sin(elevation) * input.distance),
    round3(input.target[2] + Math.cos(azimuth) * horizontal),
  ] as const);
}

/** 더치롤(°)만큼 기울인 카메라 up 벡터. 0이면 기본 [0,1,0]. */
function dutchUp(rollDegrees: number): readonly [number, number, number] {
  if (rollDegrees === 0) return Object.freeze([0, 1, 0] as const);
  const roll = (rollDegrees * Math.PI) / 180;
  return Object.freeze([
    round3(-Math.sin(roll)),
    round3(Math.cos(roll)),
    0,
  ] as const);
}

interface ScenePackSpec {
  readonly id: string;
  readonly genreId: StudioBg3dSceneGenreId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly lightingPresetId: StudioBg3dHdriLightingPresetId;
  readonly target: readonly [number, number, number];
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distance: number;
  readonly fovDegrees: number;
  readonly framing: StudioBg3dCameraFramingKind;
  readonly dutchRollDegrees?: number;
}

function buildPreset(spec: ScenePackSpec): StudioBg3dSceneCompositionPreset {
  const framingLabel = FRAMING_LABELS[spec.framing];
  const camera: StudioBg3dCameraSettings = Object.freeze({
    position: studioBg3dCameraPositionFromAngle(spec),
    target: Object.freeze([...spec.target] as [number, number, number]),
    fovDegrees: spec.fovDegrees,
    projection: "perspective" as const,
    zoom: 1,
    nearClip: STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
    up: dutchUp(spec.dutchRollDegrees ?? 0),
  });
  return Object.freeze({
    id: spec.id,
    genreId: spec.genreId,
    labelKo: spec.labelKo,
    labelEn: spec.labelEn,
    descriptionKo: spec.descriptionKo,
    descriptionEn: spec.descriptionEn,
    tooltipKo: `${spec.labelKo} — ${framingLabel.ko} 구도와 조명을 함께 적용합니다.`,
    tooltipEn: `${spec.labelEn} — applies the ${framingLabel.en.toLowerCase()} framing and its lighting together.`,
    lightingPresetId: spec.lightingPresetId,
    camera,
    thumbnail: Object.freeze({
      azimuthDeg: spec.azimuthDeg,
      elevationDeg: spec.elevationDeg,
      distance: spec.distance,
      framing: spec.framing,
      framingLabelKo: framingLabel.ko,
      framingLabelEn: framingLabel.en,
    }),
  });
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export const STUDIO_BG3D_SCENE_COMPOSITION_PRESETS: readonly StudioBg3dSceneCompositionPreset[] =
  deepFreeze([
    buildPreset({
      id: "romance-cafe-two-shot",
      genreId: "romance",
      labelKo: "카페 투샷",
      labelEn: "Café two-shot",
      descriptionKo: "마주 앉은 두 사람이 함께 잡히는 황혼빛 카페 구도.",
      descriptionEn: "A twilight café framing that holds both seated characters.",
      lightingPresetId: "twilight",
      target: [0, 1.1, 0],
      azimuthDeg: 25,
      elevationDeg: 8,
      distance: 4.2,
      fovDegrees: 40,
      framing: "medium",
    }),
    buildPreset({
      id: "romance-rooftop-confession",
      genreId: "romance",
      labelKo: "옥상 고백 와이드",
      labelEn: "Rooftop confession wide",
      descriptionKo: "노을 진 옥상에서 두 사람과 하늘을 넓게 담는 고백 씬.",
      descriptionEn: "A wide sunset rooftop framing for a confession scene.",
      lightingPresetId: "twilight",
      target: [0, 1, 0],
      azimuthDeg: -35,
      elevationDeg: 12,
      distance: 9,
      fovDegrees: 55,
      framing: "wide",
    }),
    buildPreset({
      id: "action-alley-chase",
      genreId: "action",
      labelKo: "골목 추격 로우앵글",
      labelEn: "Alley chase low angle",
      descriptionKo: "아래에서 올려다봐 속도와 위압감을 키우는 밤 골목 추격 구도.",
      descriptionEn: "A low night-alley angle that sells speed and pressure.",
      lightingPresetId: "night",
      target: [0, 1.2, 0],
      azimuthDeg: 15,
      elevationDeg: -8,
      distance: 5.5,
      fovDegrees: 65,
      framing: "low-angle",
    }),
    buildPreset({
      id: "action-rooftop-showdown",
      genreId: "action",
      labelKo: "옥상 대결 하이앵글",
      labelEn: "Rooftop showdown high angle",
      descriptionKo: "위에서 내려다보며 대치 구도 전체를 읽게 하는 한낮 옥상 씬.",
      descriptionEn: "A midday overhead framing that reads the whole standoff.",
      lightingPresetId: "daylight",
      target: [0, 0.8, 0],
      azimuthDeg: 60,
      elevationDeg: 38,
      distance: 10,
      fovDegrees: 50,
      framing: "overhead",
    }),
    buildPreset({
      id: "thriller-corridor-dutch",
      genreId: "thriller",
      labelKo: "복도 서스펜스 더치",
      labelEn: "Corridor suspense dutch",
      descriptionKo: "화면을 기울여 불안감을 만드는 달빛 복도 구도.",
      descriptionEn: "A tilted moonlit corridor framing that builds unease.",
      lightingPresetId: "night",
      target: [0, 1.2, 0],
      azimuthDeg: 0,
      elevationDeg: 4,
      distance: 7,
      fovDegrees: 45,
      framing: "dutch",
      dutchRollDegrees: 18,
    }),
    buildPreset({
      id: "thriller-moonlit-close-up",
      genreId: "thriller",
      labelKo: "달빛 창가 클로즈업",
      labelEn: "Moonlit window close-up",
      descriptionKo: "얼굴과 창가 달빛에 집중하는 긴장감 있는 근접 구도.",
      descriptionEn: "A tight moonlit framing focused on face and window light.",
      lightingPresetId: "night",
      target: [0, 1.4, 0],
      azimuthDeg: -50,
      elevationDeg: 10,
      distance: 2.6,
      fovDegrees: 35,
      framing: "close-up",
    }),
    buildPreset({
      id: "daily-classroom-morning",
      genreId: "daily",
      labelKo: "교실 아침 와이드",
      labelEn: "Classroom morning wide",
      descriptionKo: "아침 햇살이 드는 교실 전체를 보여 주는 오프닝 구도.",
      descriptionEn: "A bright morning wide that establishes the whole classroom.",
      lightingPresetId: "daylight",
      target: [0, 1, 0],
      azimuthDeg: 40,
      elevationDeg: 15,
      distance: 8.5,
      fovDegrees: 55,
      framing: "wide",
    }),
    buildPreset({
      id: "daily-studio-portrait",
      genreId: "daily",
      labelKo: "인물 소개 포트레이트",
      labelEn: "Character intro portrait",
      descriptionKo: "부드러운 스튜디오 조명으로 인물을 소개하는 정면 구도.",
      descriptionEn: "A soft studio-lit frontal framing for character introductions.",
      lightingPresetId: "studio",
      target: [0, 1.3, 0],
      azimuthDeg: 10,
      elevationDeg: 6,
      distance: 3.2,
      fovDegrees: 42,
      framing: "medium",
    }),
  ]);

/** ID로 씬팩을 찾습니다. 없으면 undefined를 돌립니다. */
export function getStudioBg3dSceneCompositionPreset(
  id: string,
): StudioBg3dSceneCompositionPreset | undefined {
  return STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.find((preset) => preset.id === id);
}

/** 장르별 씬팩 목록. null이면 전체를 돌립니다. */
export function listStudioBg3dSceneCompositionPresets(
  genreId: StudioBg3dSceneGenreId | null,
): readonly StudioBg3dSceneCompositionPreset[] {
  if (genreId === null) return STUDIO_BG3D_SCENE_COMPOSITION_PRESETS;
  return STUDIO_BG3D_SCENE_COMPOSITION_PRESETS.filter((preset) => preset.genreId === genreId);
}

export interface StudioBg3dSceneCompositionApplyInput {
  readonly camera: StudioBg3dCameraSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
}

export interface StudioBg3dSceneCompositionApplyResult {
  readonly presetId: string;
  /** 프리셋 카메라 전체 스냅샷(입력 카메라를 대체). */
  readonly camera: StudioBg3dCameraSettings;
  /** 프리셋 조명 전체(입력 조명을 대체). */
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  /** 호스트가 날씨·태양 시각까지 연동할 때 쓰는 값(HDRI 프리셋에서 그대로 전달). */
  readonly weatherPresetId: WeatherPresetId;
  readonly sunTimeHours: number;
}

function isFiniteVec3(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => typeof component === "number" && Number.isFinite(component))
  );
}

function isApplicableCamera(camera: StudioBg3dCameraSettings): boolean {
  return (
    typeof camera === "object" &&
    camera !== null &&
    isFiniteVec3(camera.position) &&
    isFiniteVec3(camera.target) &&
    typeof camera.fovDegrees === "number" &&
    Number.isFinite(camera.fovDegrees)
  );
}

/**
 * 씬팩 하나를 현재 상태에 적용한 새 상태(카메라+조명+노출)를 돌립니다.
 * 입력 상태나 프리셋이 유효하지 않으면 null — 부분 적용은 절대 하지 않는다
 * (판정 기준: "프리셋 선택만으로 카메라+조명 적용").
 */
export function applyStudioBg3dSceneCompositionPreset(
  input: StudioBg3dSceneCompositionApplyInput,
  presetId: string,
): StudioBg3dSceneCompositionApplyResult | null {
  if (typeof input !== "object" || input === null || !isApplicableCamera(input.camera)) {
    return null;
  }
  if (
    typeof input.lighting !== "object" ||
    input.lighting === null ||
    typeof input.exposure !== "number" ||
    !Number.isFinite(input.exposure)
  ) {
    return null;
  }
  const preset = getStudioBg3dSceneCompositionPreset(presetId);
  if (!preset) return null;
  const lightingPreset = getStudioBg3dHdriLightingPreset(preset.lightingPresetId);
  if (!lightingPreset) return null;
  return Object.freeze({
    presetId: preset.id,
    camera: preset.camera,
    lighting: lightingPreset.lighting,
    exposure: lightingPreset.exposure,
    weatherPresetId: lightingPreset.weatherPresetId,
    sunTimeHours: lightingPreset.sunTimeHours,
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function sameVec3(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): boolean {
  return (
    round2(left[0]) === round2(right[0]) &&
    round2(left[1]) === round2(right[1]) &&
    round2(left[2]) === round2(right[2])
  );
}

/**
 * 현재 카메라+조명+노출이 어느 씬팩과 일치하는지 찾습니다.
 * 카메라 위치·타깃·화각이 팩과 같고 조명이 팩의 HDRI 프리셋과 같을 때만 일치로 본다 —
 * 카메라만 같거나 조명만 같으면 사용자 커스텀 상태로 보고 null을 돌립니다.
 */
export function resolveStudioBg3dSceneCompositionPreset(
  input: StudioBg3dSceneCompositionApplyInput,
): StudioBg3dSceneCompositionPreset | null {
  if (typeof input !== "object" || input === null || !isApplicableCamera(input.camera)) {
    return null;
  }
  const activeLightingPreset = resolveStudioBg3dHdriLightingPreset(
    input.lighting,
    input.exposure,
  );
  if (!activeLightingPreset) return null;
  for (const preset of STUDIO_BG3D_SCENE_COMPOSITION_PRESETS) {
    if (preset.lightingPresetId !== activeLightingPreset.id) continue;
    const camera = preset.camera;
    const sameCamera =
      sameVec3(camera.position, input.camera.position) &&
      sameVec3(camera.target, input.camera.target) &&
      round2(camera.fovDegrees) === round2(input.camera.fovDegrees);
    if (sameCamera) return preset;
  }
  return null;
}
