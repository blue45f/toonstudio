/**
 * 6패스(선화·음영·원색·깊이·노멀·마스크) LT 레이어 자동 그룹화 및 시차(Parallax) 바인딩 계약.
 *
 * - `#033–#034`: 카메라 깊이 대역(근경 1.8px · 중경 1.1px · 원경 0.5px)별로 6개 패스를
 *   단일 시차 그룹 키로 묶어 패닝·스크롤 시 선화와 원색·음영·마스크가 절대 분리되지 않도록 보장한다.
 */

import {
  LT_DEPTH_ATTENUATION_PRESETS,
  normalizeAlphaCutoutThreshold,
  normalizeLtDepthPresetId,
  type LtDepthAttenuationPresetId,
  type LtDepthBandId,
} from "./studio-lt-depth-attenuation";

export type LtSixPassId = "lineart" | "shading" | "albedo" | "depth" | "normal" | "mask";

export type LtSixPassCode =
  | "01_LT_LINEART"
  | "02_LT_SHADING"
  | "03_LT_ALBEDO"
  | "04_LT_DEPTH"
  | "05_LT_NORMAL"
  | "06_LT_ALPHA_MASK";

export const LT_SIX_PASS_ORDER: readonly LtSixPassId[] = Object.freeze([
  "lineart",
  "shading",
  "albedo",
  "depth",
  "normal",
  "mask",
]);

export interface SixPassParallaxBandBinding {
  readonly band: LtDepthBandId;
  readonly labelKo: string;
  readonly depthRange: readonly [number, number];
  readonly referenceLineWidthPx: number;
  readonly parallaxFactor: number;
  readonly parallaxGroupKey: string;
  /** 동일 대역 안에서 선화·음영·원색·깊이·노멀·마스크가 정확히 같은 시차 오프셋을 공유한다. */
  readonly lockedPasses: readonly LtSixPassId[];
}

export interface SixPassParallaxBindingContract {
  readonly version: 1;
  readonly presetId: LtDepthAttenuationPresetId;
  readonly focalPlaneZ: number;
  readonly maxShiftPx: number;
  readonly lockAllSixPassesPerBand: true;
  readonly bands: readonly [
    SixPassParallaxBandBinding,
    SixPassParallaxBandBinding,
    SixPassParallaxBandBinding,
  ];
}

export interface SixPassLtLayerEntry {
  readonly passId: LtSixPassId;
  readonly code: LtSixPassCode;
  readonly order: 1 | 2 | 3 | 4 | 5 | 6;
  readonly labelKo: string;
  readonly roleKo: string;
  readonly blendMode: "normal" | "multiply";
  readonly opacity: number;
  readonly visibleInComposite: boolean;
  readonly isUtilityPass: boolean;
  readonly clipMaskRole: boolean;
  readonly parallaxGroupKey: string;
  readonly fileName: string;
  readonly alphaCutoutProtected: boolean;
}

export interface SixPassLtLayerGroup {
  readonly groupId: string;
  readonly groupNameKo: string;
  readonly presetId: LtDepthAttenuationPresetId;
  readonly presetLabelKo: string;
  readonly width: number;
  readonly height: number;
  readonly passes: readonly [
    SixPassLtLayerEntry,
    SixPassLtLayerEntry,
    SixPassLtLayerEntry,
    SixPassLtLayerEntry,
    SixPassLtLayerEntry,
    SixPassLtLayerEntry,
  ];
  readonly parallaxContract: SixPassParallaxBindingContract;
  readonly alphaCutoutSeparated: boolean;
  readonly alphaCutoutThreshold: number;
}

export interface SixPassParallaxCameraInput {
  /** 카메라 가로 패닝량(px). */
  readonly panXPx: number;
  /** 카메라 세로 패닝량(px). */
  readonly panYPx: number;
  /** 선택적 세로 스크롤 변위(px, 기본 0). */
  readonly scrollDeltaPx?: number;
}

export interface SixPassParallaxBandOffset {
  readonly band: LtDepthBandId;
  readonly parallaxGroupKey: string;
  readonly offsetXPx: number;
  readonly offsetYPx: number;
  readonly referenceLineWidthPx: number;
  readonly passOffsets: Readonly<Record<LtSixPassId, { readonly x: number; readonly y: number }>>;
}

export interface SixPassParallaxEvaluation {
  readonly presetId: LtDepthAttenuationPresetId;
  readonly byBand: Readonly<Record<LtDepthBandId, SixPassParallaxBandOffset>>;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 6패스(선화·음영·원색·깊이·노멀·마스크) 레이어 자동 그룹화 및 시차(Parallax) 바인딩 계약을 생성한다.
 */
export function buildLtSixPassLayerGroup(params: {
  readonly groupId?: string;
  readonly groupNameKo?: string;
  readonly presetId?: LtDepthAttenuationPresetId;
  readonly width: number;
  readonly height: number;
  readonly alphaCutoutSeparated?: boolean;
  readonly alphaCutoutThreshold?: number;
  readonly maxParallaxShiftPx?: number;
}): SixPassLtLayerGroup {
  const presetId = normalizeLtDepthPresetId(params.presetId);
  const preset = LT_DEPTH_ATTENUATION_PRESETS[presetId];
  const groupId = params.groupId ?? `lt-6pass-${presetId}`;
  const groupNameKo = params.groupNameKo ?? `LT 6패스 그룹 (${preset.labelKo})`;
  const alphaCutoutSeparated = params.alphaCutoutSeparated !== false;
  const alphaCutoutThreshold = normalizeAlphaCutoutThreshold(params.alphaCutoutThreshold);
  const maxShiftPx = clamp(params.maxParallaxShiftPx ?? 48, 8, 240);

  const parallaxContract: SixPassParallaxBindingContract = Object.freeze({
    version: 1,
    presetId,
    focalPlaneZ: 0.5,
    maxShiftPx,
    lockAllSixPassesPerBand: true,
    bands: Object.freeze([
      Object.freeze({
        band: "foreground" as const,
        labelKo: "근경 (1.8px)",
        depthRange: Object.freeze([0, preset.nearBandMaxZ] as const),
        referenceLineWidthPx: preset.nearLineWidthPx,
        parallaxFactor: preset.parallaxFactors.foreground,
        parallaxGroupKey: `${groupId}:band:foreground`,
        lockedPasses: LT_SIX_PASS_ORDER,
      }),
      Object.freeze({
        band: "midground" as const,
        labelKo: "중경 (1.1px)",
        depthRange: Object.freeze([preset.nearBandMaxZ, preset.farBandMinZ] as const),
        referenceLineWidthPx: preset.midLineWidthPx,
        parallaxFactor: preset.parallaxFactors.midground,
        parallaxGroupKey: `${groupId}:band:midground`,
        lockedPasses: LT_SIX_PASS_ORDER,
      }),
      Object.freeze({
        band: "background" as const,
        labelKo: "원경 (0.5px)",
        depthRange: Object.freeze([preset.farBandMinZ, 1] as const),
        referenceLineWidthPx: preset.farLineWidthPx,
        parallaxFactor: preset.parallaxFactors.background,
        parallaxGroupKey: `${groupId}:band:background`,
        lockedPasses: LT_SIX_PASS_ORDER,
      }),
    ] as const),
  });

  const passes: SixPassLtLayerGroup["passes"] = Object.freeze([
    Object.freeze({
      passId: "lineart",
      code: "01_LT_LINEART",
      order: 1,
      labelKo: "선화 (Z-Depth 감쇠)",
      roleKo: `근경 ${preset.nearLineWidthPx}px · 중경 ${preset.midLineWidthPx}px · 원경 ${preset.farLineWidthPx}px 깊이 감쇠 선화`,
      blendMode: "normal",
      opacity: 1,
      visibleInComposite: true,
      isUtilityPass: false,
      clipMaskRole: false,
      parallaxGroupKey: `${groupId}:all-bands`,
      fileName: "01_LT_LINEART.png",
      alphaCutoutProtected: alphaCutoutSeparated,
    }),
    Object.freeze({
      passId: "shading",
      code: "02_LT_SHADING",
      order: 2,
      labelKo: "음영 (명암·톤)",
      roleKo: "셀 음영·스크린톤 Multiply 합성 패스",
      blendMode: "multiply",
      opacity: 0.85,
      visibleInComposite: true,
      isUtilityPass: false,
      clipMaskRole: false,
      parallaxGroupKey: `${groupId}:all-bands`,
      fileName: "02_LT_SHADING.png",
      alphaCutoutProtected: alphaCutoutSeparated,
    }),
    Object.freeze({
      passId: "albedo",
      code: "03_LT_ALBEDO",
      order: 3,
      labelKo: "원색 (밑색 알베도)",
      roleKo: "조명 제거 순수 밑색·마법봉 영역 선택 패스",
      blendMode: "normal",
      opacity: 1,
      visibleInComposite: true,
      isUtilityPass: false,
      clipMaskRole: false,
      parallaxGroupKey: `${groupId}:all-bands`,
      fileName: "03_LT_ALBEDO.png",
      alphaCutoutProtected: false,
    }),
    Object.freeze({
      passId: "depth",
      code: "04_LT_DEPTH",
      order: 4,
      labelKo: "깊이 (Z-Depth 맵)",
      roleKo: "카메라 깊이(0~1) 선 굵기 감쇠·시차 기준 패스",
      blendMode: "normal",
      opacity: 1,
      visibleInComposite: false,
      isUtilityPass: true,
      clipMaskRole: false,
      parallaxGroupKey: `${groupId}:all-bands`,
      fileName: "04_LT_DEPTH.png",
      alphaCutoutProtected: false,
    }),
    Object.freeze({
      passId: "normal",
      code: "05_LT_NORMAL",
      order: 5,
      labelKo: "노멀 (표면 법선)",
      roleKo: "유리/철망 알파 컷아웃 제외 표면 법선·재조명 패스",
      blendMode: "normal",
      opacity: 1,
      visibleInComposite: false,
      isUtilityPass: true,
      clipMaskRole: false,
      parallaxGroupKey: `${groupId}:all-bands`,
      fileName: "05_LT_NORMAL.png",
      alphaCutoutProtected: alphaCutoutSeparated,
    }),
    Object.freeze({
      passId: "mask",
      code: "06_LT_ALPHA_MASK",
      order: 6,
      labelKo: "마스크 (알파 컷아웃)",
      roleKo: `유리/철망 Alpha-Test(임계치 ${alphaCutoutThreshold}) 노멀 패스 분리 마스크`,
      blendMode: "normal",
      opacity: 1,
      visibleInComposite: false,
      isUtilityPass: false,
      clipMaskRole: true,
      parallaxGroupKey: `${groupId}:all-bands`,
      fileName: "06_LT_ALPHA_MASK.png",
      alphaCutoutProtected: alphaCutoutSeparated,
    }),
  ] as const);

  return {
    groupId,
    groupNameKo,
    presetId,
    presetLabelKo: preset.labelKo,
    width: Math.max(1, Math.floor(params.width)),
    height: Math.max(1, Math.floor(params.height)),
    passes,
    parallaxContract,
    alphaCutoutSeparated,
    alphaCutoutThreshold,
  };
}

/**
 * 6패스 시차(Parallax) 바인딩 계약에 따라 카메라 패닝·스크롤 시 깊이 대역별 픽셀 오프셋을 결정론 계산한다.
 * 같은 대역에 속한 6개 패스(선화·음영·원색·깊이·노멀·마스크)는 항상 정확히 같은 오프셋을 공유한다.
 */
export function evaluateSixPassParallaxOffset(
  contract: SixPassParallaxBindingContract,
  camera: SixPassParallaxCameraInput,
): SixPassParallaxEvaluation {
  const panX = Number.isFinite(camera.panXPx) ? camera.panXPx : 0;
  const panY = Number.isFinite(camera.panYPx) ? camera.panYPx : 0;
  const scrollY = typeof camera.scrollDeltaPx === "number" && Number.isFinite(camera.scrollDeltaPx)
    ? camera.scrollDeltaPx
    : 0;
  const maxShift = contract.maxShiftPx;

  const entries = {} as Record<LtDepthBandId, SixPassParallaxBandOffset>;
  for (const bandSpec of contract.bands) {
    const offsetXPx = round3(clamp(panX * bandSpec.parallaxFactor, -maxShift, maxShift));
    const offsetYPx = round3(clamp((panY + scrollY) * bandSpec.parallaxFactor, -maxShift, maxShift));
    const shared = Object.freeze({ x: offsetXPx, y: offsetYPx });
    const passOffsets = {} as Record<LtSixPassId, { readonly x: number; readonly y: number }>;
    for (const passId of bandSpec.lockedPasses) {
      passOffsets[passId] = shared;
    }
    entries[bandSpec.band] = {
      band: bandSpec.band,
      parallaxGroupKey: bandSpec.parallaxGroupKey,
      offsetXPx,
      offsetYPx,
      referenceLineWidthPx: bandSpec.referenceLineWidthPx,
      passOffsets,
    };
  }

  return {
    presetId: contract.presetId,
    byBand: entries,
  };
}
