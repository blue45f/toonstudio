/**
 * Studio BG3D 씬 문서의 루트 섹션(카메라·렌더·배경·조명·품질·출력·예산) 및 컷 오버라이드 정규화.
 */
import {
  STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
  STUDIO_BG3D_CAMERA_DEFAULT_UP,
  STUDIO_BG3D_CAMERA_MAX_NEAR_CLIP,
  STUDIO_BG3D_CAMERA_MIN_NEAR_CLIP,
  isStudioBg3dCameraUpVectorValid,
  normalizeStudioBg3dCameraUpVector,
  readStudioBg3dOrthographicHeightField,
  resolveStudioBg3dCameraUpVector,
} from "./studio-bg3d-camera-orientation";
import { normalizeStudioBg3dEnvironmentSettings } from "./studio-bg3d-environment-settings";
import { normalizeStudioBg3dOutput } from "./studio-bg3d-output-settings";
import {
  STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  STUDIO_BG3D_SKY_PRESET_IDS,
} from "./studio-bg3d-scene-document-constants";
import {
  DEFAULT_STUDIO_BG3D_CAMERA_POSITION,
  DEFAULT_STUDIO_BG3D_CAMERA_TARGET,
  DEFAULT_STUDIO_BG3D_RAW_DOCUMENT,
} from "./studio-bg3d-scene-document-defaults";
import {
  MAX_WORLD_COORDINATE,
  boundedInteger,
  boundedNumber,
  hasOwn,
  isRecord,
  normalizedBoolean,
  normalizedColor,
  normalizedDirection,
  normalizedEnum,
  normalizedShadowMapSize,
  normalizedVec3,
} from "./studio-bg3d-scene-document-primitives";
import { parseStudioBg3dSixPassLtSettings } from "./studio-bg3d-six-pass-settings";

import type {
  StudioBg3dBackgroundSettings,
  StudioBg3dCameraSettings,
  StudioBg3dDirectionalLightSettings,
  StudioBg3dLightingSettings,
  StudioBg3dLineOutputSettings,
  StudioBg3dOutputSettings,
  StudioBg3dQualityProfile,
  StudioBg3dQualityProfiles,
  StudioBg3dRenderSettings,
  StudioBg3dSceneBudgets,
  StudioBg3dShotBackgroundOverride,
  StudioBg3dShotCameraOverride,
  StudioBg3dShotDirectionalLightOverride,
  StudioBg3dShotLightingOverride,
  StudioBg3dShotLineOutputOverride,
  StudioBg3dShotOutputOverride,
  StudioBg3dShotRenderOverride,
  StudioBg3dShotToneOutputOverride,
  StudioBg3dVec3,
} from "../bg3d/studio-bg3d-scene-document-types";

const BACKGROUND_MODE_SET = new Set<string>(["color", "sky-preset", "transparent"]);
const SKY_PRESET_SET = new Set<string>(STUDIO_BG3D_SKY_PRESET_IDS);
const TONE_MAPPING_SET = new Set<string>(["none", "neutral", "aces"]);
const TONE_MODE_SET = new Set<string>(["none", "flat", "cel", "screentone"]);
const LINE_LAYER_TYPE_SET = new Set<string>(["raster", "vector"]);
const TONE_OUTPUT_TYPE_SET = new Set<string>(["color", "grayscale", "pattern"]);
const TONE_PATTERN_SET = new Set<string>(["dot", "line", "crosshatch", "noise"]);

export function normalizeCamera(value: unknown): StudioBg3dCameraSettings {
  const hasCameraRecord = isRecord(value);
  const candidate = hasCameraRecord ? value : {};
  let position = normalizedVec3(
    candidate.position,
    DEFAULT_STUDIO_BG3D_CAMERA_POSITION,
    -MAX_WORLD_COORDINATE,
    MAX_WORLD_COORDINATE,
  );
  const target = normalizedVec3(
    candidate.target,
    DEFAULT_STUDIO_BG3D_CAMERA_TARGET,
    -MAX_WORLD_COORDINATE,
    MAX_WORLD_COORDINATE,
  );
  if (Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]) < 0.01) {
    position = [
      target[0],
      target[1],
      target[2] > MAX_WORLD_COORDINATE - 1 ? target[2] - 1 : target[2] + 1,
    ];
  }
  const result: Record<string, unknown> = {
    position,
    target,
    fovDegrees: boundedNumber(candidate.fovDegrees, 50, 10, 120),
    projection: candidate.projection === "orthographic" ? "orthographic" : "perspective",
    zoom: boundedNumber(candidate.zoom, 1, 0.1, 100),
    ...readStudioBg3dOrthographicHeightField(candidate),
  };
  if (
    Array.isArray(candidate.lensShift)
    && candidate.lensShift.length === 2
    && typeof candidate.lensShift[0] === "number"
    && typeof candidate.lensShift[1] === "number"
  ) {
    result.lensShift = [
      boundedNumber(candidate.lensShift[0], 0, -2, 2),
      boundedNumber(candidate.lensShift[1], 0, -2, 2),
    ] as readonly [number, number];
  }
  // Camera vNext is an additive v3 extension. Keep both fields absent when reading an older
  // canonical v3 graph so strict parse/serialize remains byte-compatible without weakening the
  // unknown-version guard. New defaults and every live viewport snapshot persist both fields.
  if (hasOwn(candidate, "nearClip") || !hasCameraRecord) {
    result.nearClip = boundedNumber(
      hasCameraRecord ? candidate.nearClip : STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
      STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
      STUDIO_BG3D_CAMERA_MIN_NEAR_CLIP,
      STUDIO_BG3D_CAMERA_MAX_NEAR_CLIP,
    );
  }
  if (hasOwn(candidate, "up") || !hasCameraRecord) {
    const normalizedUp = normalizeStudioBg3dCameraUpVector(
      hasCameraRecord ? candidate.up : STUDIO_BG3D_CAMERA_DEFAULT_UP,
    );
    const resolvedUp = isStudioBg3dCameraUpVectorValid(normalizedUp, { position, target })
      ? normalizedUp
      : resolveStudioBg3dCameraUpVector({ position, target, up: normalizedUp });
    result.up = [...resolvedUp] as StudioBg3dVec3;
  }
  return result as unknown as StudioBg3dCameraSettings;
}

export function normalizeRender(value: unknown): StudioBg3dRenderSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    antialias: normalizedBoolean(candidate.antialias, true),
    shadows: normalizedBoolean(candidate.shadows, true),
    exposure: boundedNumber(candidate.exposure, 1, 0.1, 8),
    toneMapping: normalizedEnum(candidate.toneMapping, TONE_MAPPING_SET, "neutral"),
    colorSpace: "srgb",
  };
}

export function normalizeBackground(value: unknown): StudioBg3dBackgroundSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    mode: normalizedEnum(candidate.mode, BACKGROUND_MODE_SET, "sky-preset"),
    color: normalizedColor(candidate.color, "#ffffff"),
    skyPresetId: normalizedEnum(candidate.skyPresetId, SKY_PRESET_SET, "blank"),
    panoramaRotation: boundedNumber(candidate.panoramaRotation, 0, -360, 360),
    fogEnabled: normalizedBoolean(candidate.fogEnabled, false),
    fogColor: normalizedColor(candidate.fogColor, "#ffffff"),
    // Keep each schema-v1 value independently canonical. Older v1 documents were allowed to
    // persist an inverted pair, so enforcing cross-field ordering here would make their strict
    // parser reject them. The render/UI boundary repairs ordering without breaking stored scenes.
    fogNear: boundedNumber(candidate.fogNear, 10, 0, MAX_WORLD_COORDINATE),
    fogFar: boundedNumber(candidate.fogFar, 50, 0, MAX_WORLD_COORDINATE * 2),
  };
}

function normalizeDirectionalLight(
  value: unknown,
  fallback: (typeof DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.lighting)["key" | "fill"],
): StudioBg3dDirectionalLightSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    color: normalizedColor(candidate.color, fallback.color),
    direction: normalizedDirection(candidate.direction, fallback.direction),
    intensity: boundedNumber(candidate.intensity, fallback.intensity, 0, 20),
    castsShadow: normalizedBoolean(candidate.castsShadow, fallback.castsShadow),
  };
}

export function normalizeLighting(value: unknown): StudioBg3dLightingSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    ambientColor: normalizedColor(candidate.ambientColor, "#ffffff"),
    ambientIntensity: boundedNumber(candidate.ambientIntensity, 0.75, 0, 10),
    key: normalizeDirectionalLight(candidate.key, DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.lighting.key),
    fill: normalizeDirectionalLight(candidate.fill, DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.lighting.fill),
    environment: normalizeStudioBg3dEnvironmentSettings(candidate.environment),
  };
}

function normalizeQualityProfile(
  value: unknown,
  fallback: (typeof DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.quality)["desktop" | "mobile"],
): StudioBg3dQualityProfile {
  const candidate = isRecord(value) ? value : {};
  const dprMin = boundedNumber(candidate.dprMin, fallback.dprMin, 0.5, 3);
  return {
    targetFps: boundedInteger(candidate.targetFps, fallback.targetFps, 15, 120),
    dprMin,
    dprMax: boundedNumber(candidate.dprMax, fallback.dprMax, dprMin, 3),
    maxRenderPixels: boundedInteger(
      candidate.maxRenderPixels,
      fallback.maxRenderPixels,
      320 * 240,
      16_777_216,
    ),
    shadows: normalizedBoolean(candidate.shadows, fallback.shadows),
    shadowMapSize: normalizedShadowMapSize(candidate.shadowMapSize, fallback.shadowMapSize),
    textureScale: boundedNumber(candidate.textureScale, fallback.textureScale, 0.25, 1),
    lodBias: boundedNumber(candidate.lodBias, fallback.lodBias, -2, 4),
  };
}

export function normalizeQuality(value: unknown): StudioBg3dQualityProfiles {
  const candidate = isRecord(value) ? value : {};
  return {
    desktop: normalizeQualityProfile(candidate.desktop, DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.quality.desktop),
    mobile: normalizeQualityProfile(candidate.mobile, DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.quality.mobile),
  };
}

type LineFieldSpec = readonly [key: string, fallback: boolean | number | string, minimum?: number, maximum?: number];

/**
 * 선 설정 필드 표. 전체 설정(`output.line`)과 컷별 덮어쓰기(`shots[].output.line`)가 같은 표를 쓴다. 순서는 저장
 * 문서의 키 순서와 같다. 불리언·문자열은 [키, 기본값], 숫자는 [키, 기본값, 최솟값, 최댓값]이다. 마지막 두 개(내부선
 * 억제)는 선택 필드다. 전체 설정에서는 켜져 있고 기본이 아닐 때만 기록하고(꺼짐·기본은 쓰지 않아 억제를 켠 적 없는
 * 문서를 옛 코드도 읽는다), 컷 덮어쓰기에서는 입력에 있는 키를 그대로 남긴다(꺼짐도 전체 설정을 덮는 값이다).
 */
const LINE_FIELD_SPECS: readonly LineFieldSpec[] = [
  ["enabled", true], ["layerType", "raster"], ["color", "#000000"], ["widthPx", 1.75, 0.25, 8],
  ["strength", 0.8, 0, 1], ["accuracy", 0.75, 0, 1], ["scaleAwareAccuracy", true], ["exteriorOutlineStrength", 1, 0, 2],
  ["depthEnabled", false], ["depthStrength", 0.5, 0, 1], ["depthOutlineOnly", true], ["smoothing", 0.5, 0, 1],
  ["textureLineEnabled", true], ["textureLineStrength", 0.5, 0, 1], ["creaseAngleDegrees", 20, 0, 180],
  ["hiddenLineRemoval", true], ["interiorSuppressionEnabled", false],
  ["interiorSuppressionStrength", STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH, 0, 1],
];
const OPTIONAL_LINE_FIELD_SET = new Set<string>(["interiorSuppressionEnabled", "interiorSuppressionStrength"]);

function normalizeLineFields(value: unknown, onlyPresent: boolean): Record<string, unknown> {
  const source = isRecord(value) ? value : {};
  const result: Record<string, unknown> = {};
  for (const [key, fallback, minimum = 0, maximum = 1] of LINE_FIELD_SPECS) {
    if ((onlyPresent || OPTIONAL_LINE_FIELD_SET.has(key)) && !hasOwn(source, key)) continue;
    const input = source[key];
    result[key] = typeof fallback === "boolean" ? normalizedBoolean(input, fallback)
      : typeof fallback === "number" ? boundedNumber(input, fallback, minimum, maximum)
      : key === "color" ? normalizedColor(input, fallback) : normalizedEnum(input, LINE_LAYER_TYPE_SET, fallback);
  }
  if (!onlyPresent) {
    if (result.interiorSuppressionEnabled !== true) {
      delete result.interiorSuppressionEnabled;
      delete result.interiorSuppressionStrength;
    } else if (result.interiorSuppressionStrength === STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH) {
      delete result.interiorSuppressionStrength;
    }
  }
  return result;
}

/** 엄격 비교용: 정규화가 쓰지 않는 꺼짐·기본 표기(false, 의미 없는 강도, 기본 강도)의 억제 필드는 없는 것과 같다. 틀린 값은 남긴다. */
export function withoutRedundantSuppressionFields(root: Record<string, unknown>): Record<string, unknown> {
  const output = isRecord(root.output) ? root.output : null;
  const line = output && isRecord(output.line) ? output.line : null;
  if (!output || !line) return root;
  const strength = line.interiorSuppressionStrength;
  const validStrength = typeof strength === "number" && strength >= 0 && strength <= 1;
  const rest = { ...line };
  if (line.interiorSuppressionEnabled === false) delete rest.interiorSuppressionEnabled;
  if (validStrength && (line.interiorSuppressionEnabled !== true || strength === STUDIO_BG3D_INTERIOR_SUPPRESSION_DEFAULT_STRENGTH)) {
    delete rest.interiorSuppressionStrength;
  }
  return { ...root, output: { ...output, line: rest } };
}

/** `output.line` 정규화. 필드별 기본값·범위는 위의 표가 단일 기준이다. */
export const normalizeStudioBg3dLineOutputSettings = (value: unknown): StudioBg3dLineOutputSettings =>
  normalizeLineFields(value, false) as unknown as StudioBg3dLineOutputSettings;

/** 컷별 선 덮어쓰기 정규화. 입력에 있는 키만 결과에 남긴다. */
export const normalizeStudioBg3dShotLineOutputOverride = (value: unknown): StudioBg3dShotLineOutputOverride =>
  normalizeLineFields(value, true) as StudioBg3dShotLineOutputOverride;

export const normalizeOutput = (value: unknown): StudioBg3dOutputSettings =>
  normalizeStudioBg3dOutput(value, normalizeStudioBg3dLineOutputSettings);

export function normalizeShotCameraOverride(value: unknown): StudioBg3dShotCameraOverride {
  const candidate = isRecord(value) ? value : {};
  const result: Record<string, unknown> = { ...readStudioBg3dOrthographicHeightField(candidate) };
  if (hasOwn(candidate, "position")) {
    result.position = normalizedVec3(
      candidate.position,
      DEFAULT_STUDIO_BG3D_CAMERA_POSITION,
      -MAX_WORLD_COORDINATE,
      MAX_WORLD_COORDINATE,
    );
  }
  if (hasOwn(candidate, "target")) {
    result.target = normalizedVec3(
      candidate.target,
      DEFAULT_STUDIO_BG3D_CAMERA_TARGET,
      -MAX_WORLD_COORDINATE,
      MAX_WORLD_COORDINATE,
    );
  }
  if (hasOwn(candidate, "fovDegrees")) {
    result.fovDegrees = boundedNumber(candidate.fovDegrees, 50, 10, 120);
  }
  if (hasOwn(candidate, "projection")) {
    result.projection = candidate.projection === "orthographic" ? "orthographic" : "perspective";
  }
  if (hasOwn(candidate, "zoom")) {
    result.zoom = boundedNumber(candidate.zoom, 1, 0.1, 100);
  }
  if (hasOwn(candidate, "lensShift")) {
    result.lensShift =
      Array.isArray(candidate.lensShift) && candidate.lensShift.length === 2
        ? [
            boundedNumber(candidate.lensShift[0], 0, -2, 2),
            boundedNumber(candidate.lensShift[1], 0, -2, 2),
          ]
        : [0, 0];
  }
  if (hasOwn(candidate, "nearClip")) {
    result.nearClip = boundedNumber(
      candidate.nearClip,
      STUDIO_BG3D_CAMERA_DEFAULT_NEAR_CLIP,
      STUDIO_BG3D_CAMERA_MIN_NEAR_CLIP,
      STUDIO_BG3D_CAMERA_MAX_NEAR_CLIP,
    );
  }
  if (hasOwn(candidate, "up")) {
    // A partial shot may override orientation without position/target; when it owns the complete
    // view ray, reject singular up intent now. Merge-time full-camera normalization covers the
    // inherited-ray case.
    const normalizedUp = normalizeStudioBg3dCameraUpVector(candidate.up);
    const position = result.position as StudioBg3dVec3 | undefined;
    const target = result.target as StudioBg3dVec3 | undefined;
    const resolvedUp = position && target &&
      !isStudioBg3dCameraUpVectorValid(normalizedUp, { position, target })
      ? resolveStudioBg3dCameraUpVector({ position, target, up: normalizedUp })
      : normalizedUp;
    result.up = [...resolvedUp] as StudioBg3dVec3;
  }
  return result as StudioBg3dShotCameraOverride;
}

export function normalizeShotRenderOverride(value: unknown): StudioBg3dShotRenderOverride {
  const candidate = isRecord(value) ? value : {};
  const result: Record<string, unknown> = {};
  if (hasOwn(candidate, "antialias")) {
    result.antialias = normalizedBoolean(candidate.antialias, true);
  }
  if (hasOwn(candidate, "shadows")) {
    result.shadows = normalizedBoolean(candidate.shadows, true);
  }
  if (hasOwn(candidate, "exposure")) {
    result.exposure = boundedNumber(candidate.exposure, 1, 0.1, 8);
  }
  if (hasOwn(candidate, "toneMapping")) {
    result.toneMapping = normalizedEnum(candidate.toneMapping, TONE_MAPPING_SET, "neutral");
  }
  if (hasOwn(candidate, "colorSpace")) result.colorSpace = "srgb";
  return result as StudioBg3dShotRenderOverride;
}

export function normalizeShotBackgroundOverride(value: unknown): StudioBg3dShotBackgroundOverride {
  const candidate = isRecord(value) ? value : {};
  const result: Record<string, unknown> = {};
  if (hasOwn(candidate, "mode")) {
    result.mode = normalizedEnum(candidate.mode, BACKGROUND_MODE_SET, "sky-preset");
  }
  if (hasOwn(candidate, "color")) result.color = normalizedColor(candidate.color, "#ffffff");
  if (hasOwn(candidate, "skyPresetId")) {
    result.skyPresetId = normalizedEnum(candidate.skyPresetId, SKY_PRESET_SET, "blank");
  }
  if (hasOwn(candidate, "panoramaRotation")) {
    result.panoramaRotation = boundedNumber(candidate.panoramaRotation, 0, -360, 360);
  }
  if (hasOwn(candidate, "fogEnabled")) {
    result.fogEnabled = normalizedBoolean(candidate.fogEnabled, false);
  }
  if (hasOwn(candidate, "fogColor")) {
    result.fogColor = normalizedColor(candidate.fogColor, "#ffffff");
  }
  if (hasOwn(candidate, "fogNear")) {
    result.fogNear = boundedNumber(candidate.fogNear, 10, 0, MAX_WORLD_COORDINATE);
  }
  if (hasOwn(candidate, "fogFar")) {
    result.fogFar = boundedNumber(candidate.fogFar, 50, 0, MAX_WORLD_COORDINATE * 2);
  }
  return result as StudioBg3dShotBackgroundOverride;
}

function normalizeShotDirectionalLightOverride(
  value: unknown,
  fallback: (typeof DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.lighting)["key" | "fill"],
): StudioBg3dShotDirectionalLightOverride {
  const candidate = isRecord(value) ? value : {};
  const result: Record<string, unknown> = {};
  if (hasOwn(candidate, "color")) result.color = normalizedColor(candidate.color, fallback.color);
  if (hasOwn(candidate, "direction")) {
    result.direction = normalizedDirection(candidate.direction, fallback.direction);
  }
  if (hasOwn(candidate, "intensity")) {
    result.intensity = boundedNumber(candidate.intensity, fallback.intensity, 0, 20);
  }
  if (hasOwn(candidate, "castsShadow")) {
    result.castsShadow = normalizedBoolean(candidate.castsShadow, fallback.castsShadow);
  }
  return result as StudioBg3dShotDirectionalLightOverride;
}

export function normalizeShotLightingOverride(value: unknown): StudioBg3dShotLightingOverride {
  const candidate = isRecord(value) ? value : {};
  const result: Record<string, unknown> = {};
  if (hasOwn(candidate, "ambientColor")) {
    result.ambientColor = normalizedColor(candidate.ambientColor, "#ffffff");
  }
  if (hasOwn(candidate, "ambientIntensity")) {
    result.ambientIntensity = boundedNumber(candidate.ambientIntensity, 0.75, 0, 10);
  }
  if (hasOwn(candidate, "key")) {
    result.key = normalizeShotDirectionalLightOverride(
      candidate.key,
      DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.lighting.key,
    );
  }
  if (hasOwn(candidate, "fill")) {
    result.fill = normalizeShotDirectionalLightOverride(
      candidate.fill,
      DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.lighting.fill,
    );
  }
  return result as StudioBg3dShotLightingOverride;
}

function normalizeShotToneOutputOverride(value: unknown): StudioBg3dShotToneOutputOverride {
  const candidate = isRecord(value) ? value : {};
  const result: Record<string, unknown> = {};
  if (hasOwn(candidate, "mode")) {
    result.mode = normalizedEnum(candidate.mode, TONE_MODE_SET, "flat");
  }
  if (hasOwn(candidate, "type")) {
    result.type = normalizedEnum(candidate.type, TONE_OUTPUT_TYPE_SET, "color");
  }
  if (hasOwn(candidate, "pattern")) {
    result.pattern = normalizedEnum(candidate.pattern, TONE_PATTERN_SET, "dot");
  }
  if (hasOwn(candidate, "levels")) {
    result.levels = boundedInteger(candidate.levels, 4, 2, 8);
  }
  if (hasOwn(candidate, "opacity")) {
    result.opacity = boundedNumber(candidate.opacity, 1, 0, 1);
  }
  if (hasOwn(candidate, "frequency")) {
    result.frequency = boundedNumber(candidate.frequency, 60, 1, 200);
  }
  if (hasOwn(candidate, "angleDegrees")) {
    result.angleDegrees = boundedNumber(candidate.angleDegrees, 45, -180, 180);
  }
  return result as StudioBg3dShotToneOutputOverride;
}

export function normalizeShotOutputOverride(value: unknown): StudioBg3dShotOutputOverride {
  const candidate = isRecord(value) ? value : {};
  const result: Record<string, unknown> = {};
  if (hasOwn(candidate, "transparentBackground")) {
    result.transparentBackground = normalizedBoolean(candidate.transparentBackground, false);
  }
  if (hasOwn(candidate, "exportHeight")) {
    result.exportHeight = boundedInteger(candidate.exportHeight, 640, 256, 4096);
  }
  if (hasOwn(candidate, "line")) {
    result.line = normalizeStudioBg3dShotLineOutputOverride(candidate.line);
  }
  if (hasOwn(candidate, "tone")) {
    result.tone = normalizeShotToneOutputOverride(candidate.tone);
  }
  if (hasOwn(candidate, "sixPassLt")) {
    const settings = parseStudioBg3dSixPassLtSettings(candidate.sixPassLt);
    if (!settings) throw new TypeError("6패스 LT 컷 설정이 손상되었습니다.");
    result.sixPassLt = settings;
  }
  return result as StudioBg3dShotOutputOverride;
}

export function normalizeBudgets(value: unknown): StudioBg3dSceneBudgets {
  const candidate = isRecord(value) ? value : {};
  const complexity = isRecord(candidate.complexity) ? candidate.complexity : {};
  const textures = isRecord(candidate.textures) ? candidate.textures : {};
  return {
    complexity: {
      maxNodes: boundedInteger(
        complexity.maxNodes,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxNodes,
        1,
        STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
      ),
      maxTriangles: boundedInteger(
        complexity.maxTriangles,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxTriangles,
        1_000,
        10_000_000,
      ),
      maxDrawCalls: boundedInteger(
        complexity.maxDrawCalls,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxDrawCalls,
        1,
        2_048,
      ),
      maxMaterials: boundedInteger(
        complexity.maxMaterials,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxMaterials,
        1,
        1_024,
      ),
      maxLights: boundedInteger(
        complexity.maxLights,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxLights,
        3,
        16,
      ),
      maxAnimations: boundedInteger(
        complexity.maxAnimations,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimations,
        0,
        256,
      ),
      maxAnimationChannels: boundedInteger(
        complexity.maxAnimationChannels,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimationChannels,
        0,
        4_096,
      ),
      maxAnimationKeyframes: boundedInteger(
        complexity.maxAnimationKeyframes,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimationKeyframes,
        0,
        4_000_000,
      ),
      maxAnimationValues: boundedInteger(
        complexity.maxAnimationValues,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAnimationValues,
        0,
        32_000_000,
      ),
      maxSkins: boundedInteger(
        complexity.maxSkins,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxSkins,
        0,
        256,
      ),
      maxJoints: boundedInteger(
        complexity.maxJoints,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxJoints,
        0,
        8_192,
      ),
      maxMorphTargets: boundedInteger(
        complexity.maxMorphTargets,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxMorphTargets,
        0,
        1_024,
      ),
      maxAccessorElements: boundedInteger(
        complexity.maxAccessorElements,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxAccessorElements,
        0,
        160_000_000,
      ),
      maxDecodedGeometryBytes: boundedInteger(
        complexity.maxDecodedGeometryBytes,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxDecodedGeometryBytes,
        0,
        2 * 1024 * 1024 * 1024,
      ),
      maxModelBytes: boundedInteger(
        complexity.maxModelBytes,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.complexity.maxModelBytes,
        1 * 1024 * 1024,
        2 * 1024 * 1024 * 1024,
      ),
    },
    textures: {
      maxTextures: boundedInteger(
        textures.maxTextures,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.textures.maxTextures,
        0,
        256,
      ),
      maxTotalBytes: boundedInteger(
        textures.maxTotalBytes,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.textures.maxTotalBytes,
        0,
        1024 * 1024 * 1024,
      ),
      maxDimension: boundedInteger(
        textures.maxDimension,
        DEFAULT_STUDIO_BG3D_RAW_DOCUMENT.budgets.textures.maxDimension,
        256,
        8_192,
      ),
    },
  };
}
