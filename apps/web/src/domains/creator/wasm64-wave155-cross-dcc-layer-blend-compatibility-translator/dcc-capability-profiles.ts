/**
 * Wave 155 — 5종 웹툰 DCC 포맷 능력 매트릭스 및 정본 블렌드모드·레이어 유형 정의.
 */

export const DCC_FORMAT_IDS = [
  "toonstudio",
  "clip-studio-paint",
  "photoshop-psd",
  "procreate",
  "krita-kra",
] as const;

export type DccFormatId = (typeof DCC_FORMAT_IDS)[number];

export const CANONICAL_BLEND_MODES = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "linear-burn",
  "linear-dodge",
  "add-glow",
  "glow-dodge",
  "vivid-light",
  "pass-through",
] as const;

export type CanonicalBlendMode = (typeof CANONICAL_BLEND_MODES)[number];

export const PIXEL_BLEND_MODES: readonly CanonicalBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "linear-burn",
  "linear-dodge",
  "add-glow",
  "glow-dodge",
  "vivid-light",
];

export const DCC_LAYER_KINDS = [
  "raster",
  "vector-ink",
  "screentone-live",
  "text-editable",
  "adjustment-curve",
  "group-folder",
  "3d-reference",
] as const;

export type DccLayerKind = (typeof DCC_LAYER_KINDS)[number];

export type DccBitDepth = 8 | 16 | 32;

export interface DccCapabilityProfile {
  readonly dccId: DccFormatId;
  readonly displayNameKo: string;
  readonly shortLabel: string;
  readonly fileExtension: string;
  readonly supportedBlendModes: readonly CanonicalBlendMode[];
  readonly supportedLayerKinds: readonly DccLayerKind[];
  readonly preservesEditableVectorInk: boolean;
  readonly preservesLiveScreentone: boolean;
  readonly preservesEditableText: boolean;
  readonly preservesAdjustmentCurve: boolean;
  readonly preserves3dReference: boolean;
  readonly supportsPassThroughGroup: boolean;
  readonly supportsClippingMask: boolean;
  readonly supportedBitDepths: readonly DccBitDepth[];
  readonly maxBitDepth: DccBitDepth;
  readonly nativeBlendNameByMode: Readonly<Partial<Record<CanonicalBlendMode, string>>>;
}

/** 정본 블렌드모드 한국어 실무 명칭 사전. */
export const BLEND_MODE_LABEL_KO: Readonly<Record<CanonicalBlendMode, string>> = {
  normal: "표준 (Normal)",
  multiply: "곱하기 (Multiply)",
  screen: "스크린 (Screen)",
  overlay: "오버레이 (Overlay)",
  darken: "어둡게 (Darken)",
  lighten: "밝게 (Lighten)",
  "color-dodge": "컬러 닷지 (Color Dodge)",
  "color-burn": "컬러 번 (Color Burn)",
  "hard-light": "하드 라이트 (Hard Light)",
  "soft-light": "소프트 라이트 (Soft Light)",
  difference: "차이 (Difference)",
  exclusion: "제외 (Exclusion)",
  "linear-burn": "선형 번 (Linear Burn)",
  "linear-dodge": "선형 닷지 (Linear Dodge)",
  "add-glow": "더하기(발광) (Add Glow)",
  "glow-dodge": "발광 닷지 (Glow Dodge)",
  "vivid-light": "선명한 라이트 (Vivid Light)",
  "pass-through": "통과 (Pass-Through)",
};

/** 레이어 유형 한국어 실무 명칭 사전. */
export const LAYER_KIND_LABEL_KO: Readonly<Record<DccLayerKind, string>> = {
  raster: "래스터",
  "vector-ink": "벡터 먹선",
  "screentone-live": "라이브 망점 톤",
  "text-editable": "편집 식자",
  "adjustment-curve": "톤 커브 보정",
  "group-folder": "레이어 폴더",
  "3d-reference": "3D 포즈·배경 참조",
};

const STANDARD_16_BLEND_MODES: readonly CanonicalBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "linear-burn",
  "linear-dodge",
  "vivid-light",
  "pass-through",
];

const PROCREATE_14_BLEND_MODES: readonly CanonicalBlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "linear-burn",
  "linear-dodge",
];

function pickNativeBlendLabels(
  modes: readonly CanonicalBlendMode[],
  overrides: Readonly<Partial<Record<CanonicalBlendMode, string>>> = {},
): Readonly<Partial<Record<CanonicalBlendMode, string>>> {
  const result: Partial<Record<CanonicalBlendMode, string>> = {};
  for (let i = 0; i < modes.length; i += 1) {
    const mode = modes[i];
    result[mode] = overrides[mode] ?? BLEND_MODE_LABEL_KO[mode];
  }
  return result;
}

/** 5종 실무 웹툰 DCC 포맷 능력 매트릭스. */
export const DCC_CAPABILITY_MATRIX: Readonly<Record<DccFormatId, DccCapabilityProfile>> = {
  toonstudio: {
    dccId: "toonstudio",
    displayNameKo: "ToonStudio 네이티브 (.toon)",
    shortLabel: "ToonStudio",
    fileExtension: ".toon",
    supportedBlendModes: CANONICAL_BLEND_MODES,
    supportedLayerKinds: DCC_LAYER_KINDS,
    preservesEditableVectorInk: true,
    preservesLiveScreentone: true,
    preservesEditableText: true,
    preservesAdjustmentCurve: true,
    preserves3dReference: true,
    supportsPassThroughGroup: true,
    supportsClippingMask: true,
    supportedBitDepths: [8, 16, 32],
    maxBitDepth: 32,
    nativeBlendNameByMode: BLEND_MODE_LABEL_KO,
  },
  "clip-studio-paint": {
    dccId: "clip-studio-paint",
    displayNameKo: "Clip Studio Paint (.clip)",
    shortLabel: "CSP",
    fileExtension: ".clip",
    supportedBlendModes: CANONICAL_BLEND_MODES,
    supportedLayerKinds: DCC_LAYER_KINDS,
    preservesEditableVectorInk: true,
    preservesLiveScreentone: true,
    preservesEditableText: true,
    preservesAdjustmentCurve: true,
    preserves3dReference: true,
    supportsPassThroughGroup: true,
    supportsClippingMask: true,
    supportedBitDepths: [8],
    maxBitDepth: 8,
    nativeBlendNameByMode: pickNativeBlendLabels(CANONICAL_BLEND_MODES, {
      "linear-dodge": "더하기 (Add)",
      "pass-through": "통과 (Through)",
    }),
  },
  "photoshop-psd": {
    dccId: "photoshop-psd",
    displayNameKo: "Adobe Photoshop (.psd)",
    shortLabel: "PSD",
    fileExtension: ".psd",
    supportedBlendModes: STANDARD_16_BLEND_MODES,
    supportedLayerKinds: ["raster", "text-editable", "adjustment-curve", "group-folder"],
    preservesEditableVectorInk: false,
    preservesLiveScreentone: false,
    preservesEditableText: true,
    preservesAdjustmentCurve: true,
    preserves3dReference: false,
    supportsPassThroughGroup: true,
    supportsClippingMask: true,
    supportedBitDepths: [8, 16, 32],
    maxBitDepth: 32,
    nativeBlendNameByMode: pickNativeBlendLabels(STANDARD_16_BLEND_MODES, {
      "linear-dodge": "선형 닷지(추가) (Linear Dodge)",
      "pass-through": "통과 (Pass Through)",
    }),
  },
  procreate: {
    dccId: "procreate",
    displayNameKo: "Procreate (.procreate)",
    shortLabel: "Procreate",
    fileExtension: ".procreate",
    supportedBlendModes: PROCREATE_14_BLEND_MODES,
    supportedLayerKinds: ["raster", "group-folder"],
    preservesEditableVectorInk: false,
    preservesLiveScreentone: false,
    preservesEditableText: false,
    preservesAdjustmentCurve: false,
    preserves3dReference: false,
    supportsPassThroughGroup: false,
    supportsClippingMask: true,
    supportedBitDepths: [8],
    maxBitDepth: 8,
    nativeBlendNameByMode: pickNativeBlendLabels(PROCREATE_14_BLEND_MODES, {
      normal: "일반 (Normal)",
      "color-dodge": "색상 닷지 (Color Dodge)",
      "color-burn": "색상 번 (Color Burn)",
      "linear-dodge": "추가 (Add)",
    }),
  },
  "krita-kra": {
    dccId: "krita-kra",
    displayNameKo: "Krita (.kra)",
    shortLabel: "Krita",
    fileExtension: ".kra",
    supportedBlendModes: STANDARD_16_BLEND_MODES,
    supportedLayerKinds: ["raster", "adjustment-curve", "group-folder"],
    preservesEditableVectorInk: false,
    preservesLiveScreentone: false,
    preservesEditableText: false,
    preservesAdjustmentCurve: true,
    preserves3dReference: false,
    supportsPassThroughGroup: true,
    supportsClippingMask: true,
    supportedBitDepths: [8, 16, 32],
    maxBitDepth: 32,
    nativeBlendNameByMode: pickNativeBlendLabels(STANDARD_16_BLEND_MODES, {
      normal: "보통 (Normal)",
      "color-dodge": "색상 닷지 (Color Dodge)",
      "color-burn": "색상 번 (Color Burn)",
      "linear-dodge": "덧셈 (Addition)",
    }),
  },
};

/** 지정 DCC 포맷의 능력 프로필을 반환한다. */
export function getDccCapabilityProfile(dccId: DccFormatId): DccCapabilityProfile {
  return DCC_CAPABILITY_MATRIX[dccId];
}

/** 지정 DCC가 특정 블렌드모드를 네이티브로 지원하는지 판정한다. */
export function isBlendModeSupportedInDcc(
  dccId: DccFormatId,
  blendMode: CanonicalBlendMode,
): boolean {
  return DCC_CAPABILITY_MATRIX[dccId].supportedBlendModes.indexOf(blendMode) >= 0;
}
