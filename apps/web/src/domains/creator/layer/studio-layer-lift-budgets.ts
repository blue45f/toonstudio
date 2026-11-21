/**
 * 컷 레이어 분리(Scene Layer Lift) 가용성 판정에 필요한 예산·MIME 상수 리프.
 * 전체 계약 검증기를 진입 그래프에 묶지 않고 가용성 검사기만 경량으로 참조할 수 있게 한다.
 */

export const STUDIO_SCENE_LAYER_LIFT_BUDGETS = Object.freeze({
  maximumAxisPixels: 8_192,
  maximumPixels: 16_777_216,
  maximumInputBytes: 64 * 1_024 * 1_024,
  maximumOutputBytes: 256 * 1_024 * 1_024,
  maximumLayerCount: 12,
  maximumMaskBytes: 128 * 1_024 * 1_024,
  maximumSourceCharacters: 512,
  maximumIdentifierCharacters: 160,
  maximumLayerLabelCharacters: 128,
  maximumDiagnostics: 32,
  maximumDiagnosticMessageCharacters: 256,
  maximumProviderVersionCharacters: 64,
  maximumDurationMilliseconds: 24 * 60 * 60 * 1_000,
} as const);

export const STUDIO_SCENE_LAYER_LIFT_SOURCE_MIME_TYPES = Object.freeze([
  "image/png",
  "image/jpeg",
  "image/webp",
] as const);

export type StudioSceneLayerLiftSourceMimeType =
  (typeof STUDIO_SCENE_LAYER_LIFT_SOURCE_MIME_TYPES)[number];
