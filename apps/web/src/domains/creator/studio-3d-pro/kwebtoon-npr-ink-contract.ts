/**
 * 한국 웹툰 3D NPR 단일 잉크 계약(Single Ink Contract) 및 히어로 에셋·아키타입 브리지 엔진.
 *
 * - Three.js 0.184+ / `@pixiv/three-vrm 3.5.3+` 정본 계약 구현:
 *   1) MToon WebGL(`isMToonMaterial`)과 WebGPU(`isMToonNodeMaterial`) 자동 플래그 판별(`instanceof` 금지)
 *   2) `ScreenCoordinates` 모드 전환(`outlineWidthFactor = INK_PX * 2 / viewportHeightPx`) 및
 *      WebGPU `MToonNodeMaterial`용 `needsUpdate = true` 강제 플래그
 *   3) 3D 배경 프롭용 종횡비 보정 등방성 외곽선(`norm.x / aspect`)으로 16:9·21:9·9:16·1:1 전 화면비 1.0000x 등방 유지
 *   4) sRGB 3/4단 셀 셰이딩 램프(`RGBAFormat` + `UnsignedByteType` + `NearestFilter` + `SRGBColorSpace`)
 *   5) Blender 5.3 실측 생성 히어로 GLB 4종 + `apps/character-lab` 10종 K-웹툰 아키타입 ↔ 메인 BG3D 브리지
 */

export type RgbUnitTuple = readonly [number, number, number];

export type KWebtoonCelPresetId =
  | "rofan-pastel"
  | "hunter-neon"
  | "daily-warm-sun"
  | "noir-deep-ink";

export type InkLightingMode = "flat" | "lit";

export interface UnifiedInkContract {
  /** 화면 고정 목표 선 굵기(디바이스 px). 캐릭터(MToon)와 배경 프롭이 동일한 값을 공유한다. */
  readonly inkPx: number;
  /** 선화 조명 혼합 방식. 0(flat) 또는 1(lit) 중 하나로 전역 통일한다(혼용 금지). */
  readonly lightingMode: InkLightingMode;
  /** 3단 또는 4단 한국 웹툰 셀 셰이딩 계조 수. */
  readonly toneBandCount: 3 | 4;
  /** 선화 기본 색상(선형 RGB 0..1). */
  readonly inkColorRgb: RgbUnitTuple;
  /** WebGL ↔ WebGPU 패리티 기준(NoToneMapping + sRGB + MSAA 0|4). */
  readonly parity: {
    readonly outputColorSpace: "srgb";
    readonly toneMapping: "NoToneMapping";
    readonly toneMappingExposure: 1.0;
    readonly msaaSamples: 0 | 4;
  };
}

export interface KWebtoonCelPreset {
  readonly id: KWebtoonCelPresetId;
  readonly labelKo: string;
  readonly moodKo: string;
  readonly badgeOklch: string;
  readonly toneBandCount: 3 | 4;
  readonly linearLuminanceStops: readonly number[];
  readonly srgbRampBytes: readonly number[];
  readonly inkPx: number;
  readonly lightingMode: InkLightingMode;
  readonly inkColorRgb: RgbUnitTuple;
  readonly shadowTintRgb: RgbUnitTuple;
  readonly rimColorRgb: RgbUnitTuple;
  readonly rimThreshold: readonly [number, number];
  readonly halftoneRankEnabled: boolean;
}

export interface MToonMaterialLike {
  readonly isMToonMaterial?: boolean;
  readonly isMToonNodeMaterial?: boolean;
  readonly isOutline?: boolean;
  outlineWidthMode?: "none" | "worldCoordinates" | "screenCoordinates";
  outlineWidthFactor?: number;
  outlineLightingMixFactor?: number;
  needsUpdate?: boolean;
  name?: string;
}

export interface SceneTraverseObjectLike {
  readonly material?: MToonMaterialLike | readonly MToonMaterialLike[] | null;
  readonly traverse?: (visitor: (node: SceneTraverseObjectLike) => void) => void;
  readonly children?: readonly SceneTraverseObjectLike[];
}

export interface MToonInkConversionReport {
  readonly convertedCount: number;
  readonly webglMaterialCount: number;
  readonly webgpuNodeMaterialCount: number;
  readonly skippedNoneModeCount: number;
  readonly unifiedOutlineWidthFactor: number;
  readonly outlineLightingMixFactor: 0 | 1;
  readonly warningsKo: readonly string[];
}

export interface IsotropicClipPushResult {
  readonly pushedClip: readonly [number, number, number, number];
  readonly aspectRatio: number;
  readonly normalizedDir: readonly [number, number, number, number];
  readonly effectiveThicknessFactor: number;
}

export interface SrgbRampTextureDescriptor {
  readonly width: number;
  readonly height: 1;
  readonly format: "RGBAFormat";
  readonly type: "UnsignedByteType";
  readonly magFilter: "NearestFilter";
  readonly minFilter: "NearestFilter";
  readonly colorSpace: "srgb";
  readonly generateMipmaps: false;
  readonly linearStops: readonly number[];
  readonly srgbChannelBytes: readonly number[];
  readonly rgbaBytes: Uint8Array;
}

export type KWebtoonHeroGlbId =
  | "rofan-imperial-arch-chandelier"
  | "seoul-rooftop-cafe-terrace"
  | "murim-jade-sword-altar"
  | "kwebtoon-bust-mannequin-atelier";

export interface KWebtoonHeroGlbAsset {
  readonly id: KWebtoonHeroGlbId;
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly category: "environment" | "prop" | "character";
  readonly recommendedPresetId: KWebtoonCelPresetId;
  readonly glbUrl: string;
  readonly previewUrl: string;
  readonly triangles: number;
  readonly vertices: number;
  readonly drawCalls: number;
  readonly glbBytes: number;
  readonly dimensionsMeters: readonly [number, number, number];
  readonly glbforgeDesktopScore: 100;
  readonly glbforgeMobileScore: 100;
  readonly blenderVersion: "5.3.0";
}

export type KWebtoonArchetypeBridgeId =
  | "kwebtoon-rofan-princess"
  | "kwebtoon-northern-duke"
  | "kwebtoon-academy-heroine"
  | "kwebtoon-academy-hero"
  | "kwebtoon-srank-hunter"
  | "kwebtoon-srank-healer"
  | "kwebtoon-office-ceo"
  | "kwebtoon-modern-heroine"
  | "kwebtoon-murim-swordsman"
  | "kwebtoon-sd-mascot";

export interface KWebtoonArchetypeStageBridgeItem {
  readonly archetypeId: KWebtoonArchetypeBridgeId;
  readonly shortLabelKo: string;
  readonly genreKo: string;
  readonly headsTall: number;
  readonly recommendedHeroGlbId: KWebtoonHeroGlbId;
  readonly recommendedCelPresetId: KWebtoonCelPresetId;
  readonly defaultInkPx: number;
  readonly characterLabHref: string;
}

export interface StageBridgePlacementPayload {
  readonly archetypeId: KWebtoonArchetypeBridgeId;
  readonly heroGlbId: KWebtoonHeroGlbId;
  readonly heroGlbUrl: string;
  readonly celPresetId: KWebtoonCelPresetId;
  readonly contract: UnifiedInkContract;
  readonly outlineWidthFactorAt1080p: number;
  readonly characterHeightScaleMeters: number;
}

/** 선형 휘도(0..1)를 sRGB 인코딩 바이트(0..255)로 정확 변환한다. */
export function linearToSrgbByte(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  const encoded =
    clamped <= 0.0031308
      ? clamped * 12.92
      : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/** sRGB 바이트(0..255)를 선형 휘도(0..1)로 복원한다(byte 128 -> ~0.2159). */
export function srgbByteToLinear(byteValue: number): number {
  const s = Math.max(0, Math.min(255, byteValue)) / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/**
 * MToon `ScreenCoordinates` 공식: `INK_PX * 2 / viewportHeightPx`.
 * 카메라 거리와 FOV에 무관하게 모든 방향에서 등방성 픽셀 굵기를 유지한다.
 */
export function computeScreenSpaceOutlineFactor(
  inkPx: number,
  viewportHeightPx: number,
): number {
  if (!Number.isFinite(inkPx) || inkPx <= 0) return 0;
  const safeHeight = Math.max(1, viewportHeightPx);
  return (inkPx * 2) / safeHeight;
}

/**
 * 3D 배경 프롭용 종횡비 보정 등방성 클립 공간 외곽선 푸시(`norm.x / aspect`).
 * 기본 `toonOutlinePass`가 가로/세로 굵기 차이를 만드는 결함을 제거해 MToon과 정확히 일치시킨다.
 */
export function computeIsotropicClipSpacePush(
  posClip: readonly [number, number, number, number],
  normClip: readonly [number, number, number, number],
  viewportWidthPx: number,
  viewportHeightPx: number,
  thicknessFactor: number,
): IsotropicClipPushResult {
  const safeW = Math.max(1, viewportWidthPx);
  const safeH = Math.max(1, viewportHeightPx);
  const aspectRatio = safeW / safeH;

  const len = Math.hypot(normClip[0], normClip[1], normClip[2], normClip[3]);
  const invLen = len > 1e-8 ? 1 / len : 0;
  const nx = normClip[0] * invLen;
  const ny = normClip[1] * invLen;
  const nz = normClip[2] * invLen;
  const nw = normClip[3] * invLen;

  const dir: readonly [number, number, number, number] = [
    nx / aspectRatio,
    ny,
    nz,
    nw,
  ];
  const scale = thicknessFactor * posClip[3];
  const pushedClip: readonly [number, number, number, number] = [
    posClip[0] + dir[0] * scale,
    posClip[1] + dir[1] * scale,
    posClip[2] + dir[2] * scale,
    posClip[3] + dir[3] * scale,
  ];

  return {
    pushedClip,
    aspectRatio,
    normalizedDir: dir,
    effectiveThicknessFactor: thicknessFactor,
  };
}

/**
 * 특정 2D 방향각(`angleRad`)에서의 등방성 프롭 외곽선 실제 픽셀 굵기를 측정한다.
 * 어떤 화면비(16:9, 21:9, 9:16, 1:1)에서도 `thicknessFactor * H / 2 === inkPx`로 일정하다.
 */
export function measureIsotropicOutlinePxAtAngle(
  angleRad: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  thicknessFactor: number,
): number {
  const posW = 6.0;
  const push = computeIsotropicClipSpacePush(
    [0, 0, 0, posW],
    [Math.cos(angleRad), Math.sin(angleRad), 0, 0],
    viewportWidthPx,
    viewportHeightPx,
    thicknessFactor,
  );
  const ndcDx = push.pushedClip[0] / push.pushedClip[3];
  const ndcDy = push.pushedClip[1] / push.pushedClip[3];
  const pxDx = ndcDx * (viewportWidthPx * 0.5);
  const pxDy = ndcDy * (viewportHeightPx * 0.5);
  return Math.hypot(pxDx, pxDy);
}

/**
 * `instanceof MToonMaterial` 금지 규칙을 준수하는 WebGL/WebGPU 플래그 판별기.
 */
export function detectMToonMaterialKind(
  material: MToonMaterialLike | null | undefined,
): "webgl-mtoon" | "webgpu-mtoon-node" | "other" {
  if (!material) return "other";
  if (material.isMToonNodeMaterial === true) return "webgpu-mtoon-node";
  if (material.isMToonMaterial === true) return "webgl-mtoon";
  return "other";
}

function collectSceneObjects(root: SceneTraverseObjectLike): SceneTraverseObjectLike[] {
  const nodes: SceneTraverseObjectLike[] = [];
  if (typeof root.traverse === "function") {
    root.traverse((node) => nodes.push(node));
    return nodes;
  }
  const stack: SceneTraverseObjectLike[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    nodes.push(current);
    if (current.children) {
      for (const child of current.children) stack.push(child);
    }
  }
  return nodes;
}

/**
 * 로드 완료된 VRM 씬 전체의 MToon 아웃라인 머티리얼을 단일 잉크 계약으로 일괄 변환한다.
 * - `isMToonMaterial || isMToonNodeMaterial` 동시 판별
 * - `outlineWidthMode = "screenCoordinates"`, `outlineWidthFactor = INK_PX * 2 / H`
 * - `outlineLightingMixFactor` 전역 통일 (`0` 또는 `1`)
 * - WebGPU `MToonNodeMaterial` 셰이더 재컴파일을 위해 `needsUpdate = true` 필수 설정
 */
export function applyUnifiedMToonInkContract(
  root: SceneTraverseObjectLike,
  contract: UnifiedInkContract,
  viewportHeightPx: number,
): MToonInkConversionReport {
  const factor = computeScreenSpaceOutlineFactor(contract.inkPx, viewportHeightPx);
  const lightingMix: 0 | 1 = contract.lightingMode === "lit" ? 1 : 0;
  const visited = new Set<MToonMaterialLike>();

  let convertedCount = 0;
  let webglMaterialCount = 0;
  let webgpuNodeMaterialCount = 0;
  let skippedNoneModeCount = 0;
  const warningsKo: string[] = [];

  for (const node of collectSceneObjects(root)) {
    const rawMats = node.material;
    if (!rawMats) continue;
    const matList = Array.isArray(rawMats) ? rawMats : [rawMats];
    for (const mat of matList) {
      if (!mat || visited.has(mat)) continue;
      visited.add(mat);

      const kind = detectMToonMaterialKind(mat);
      if (kind === "other") continue;

      if (mat.isOutline !== true) {
        if (mat.outlineWidthMode === "none") {
          skippedNoneModeCount += 1;
        }
        continue;
      }

      if (mat.outlineWidthMode === "none") {
        skippedNoneModeCount += 1;
        continue;
      }

      mat.outlineWidthMode = "screenCoordinates";
      mat.outlineWidthFactor = factor;
      mat.outlineLightingMixFactor = lightingMix;
      mat.needsUpdate = true;

      convertedCount += 1;
      if (kind === "webgpu-mtoon-node") {
        webgpuNodeMaterialCount += 1;
      } else {
        webglMaterialCount += 1;
      }
    }
  }

  if (convertedCount === 0) {
    warningsKo.push(
      "변환된 외곽선 재질이 없습니다. 원본 VRM에 외곽선이 없는 경우 배경과 같은 통합 외곽선 패스를 사용하세요.",
    );
  }
  if (skippedNoneModeCount > 0) {
    warningsKo.push(
      `외곽선이 비활성(none)으로 저장된 재질 ${skippedNoneModeCount}개는 별도 헐 외곽선 패스가 필요합니다.`,
    );
  }

  return {
    convertedCount,
    webglMaterialCount,
    webgpuNodeMaterialCount,
    skippedNoneModeCount,
    unifiedOutlineWidthFactor: factor,
    outlineLightingMixFactor: lightingMix,
    warningsKo,
  };
}

/**
 * `SRGBColorSpace` + `RGBAFormat` + `UnsignedByteType` + `NearestFilter` 정본 툰 램프 바이트 생성기.
 * (예: `[0.15, 0.35, 0.60, 1.00]` -> `[108, 160, 203, 255]`)
 */
export function buildSrgbToonRampDescriptor(
  linearLuminanceStops: readonly number[],
): SrgbRampTextureDescriptor {
  const safeStops = linearLuminanceStops.length > 0 ? linearLuminanceStops : [0.35, 1.0];
  const srgbChannelBytes = safeStops.map((stop) => linearToSrgbByte(stop));
  const rgbaBytes = new Uint8Array(srgbChannelBytes.length * 4);
  for (let i = 0; i < srgbChannelBytes.length; i += 1) {
    const v = srgbChannelBytes[i] ?? 255;
    rgbaBytes[i * 4] = v;
    rgbaBytes[i * 4 + 1] = v;
    rgbaBytes[i * 4 + 2] = v;
    rgbaBytes[i * 4 + 3] = 255;
  }

  return {
    width: srgbChannelBytes.length,
    height: 1,
    format: "RGBAFormat",
    type: "UnsignedByteType",
    magFilter: "NearestFilter",
    minFilter: "NearestFilter",
    colorSpace: "srgb",
    generateMipmaps: false,
    linearStops: [...safeStops],
    srgbChannelBytes,
    rgbaBytes,
  };
}

/**
 * Three.js 기본 `posterize(x, N)`의 하이라이트 소실(`(N-1)/N` 상한) 버그를 보정한 계조 양자화.
 * N개의 계조가 `[0..1]` 전 구간과 1.0 순백 하이라이트에 도달한다.
 */
export function posterizeRankHighlightSafe(value: number, steps: number): number {
  const safeSteps = Math.max(2, Math.floor(steps));
  const clamped = Math.max(0, Math.min(1, value));
  if (clamped >= 1) return 1;
  const rank = Math.floor(clamped * safeSteps);
  return Math.max(0, Math.min(1, rank / (safeSteps - 1)));
}

/** 4종 한국 웹툰 3/4단 셀 셰이딩 프리셋 */
export const KWEBTOON_CEL_PRESETS: Readonly<Record<KWebtoonCelPresetId, KWebtoonCelPreset>> =
  Object.freeze({
    "rofan-pastel": {
      id: "rofan-pastel",
      labelKo: "로판 파스텔",
      moodKo: "화사한 복숭아·라벤더 3단 명암과 부드러운 보랏빛 외곽선",
      badgeOklch: "oklch(0.76 0.11 330)",
      toneBandCount: 3,
      linearLuminanceStops: [0.30, 0.64, 1.0],
      srgbRampBytes: [0.30, 0.64, 1.0].map(linearToSrgbByte),
      inkPx: 1.5,
      lightingMode: "flat",
      inkColorRgb: [0.18, 0.12, 0.22],
      shadowTintRgb: [0.84, 0.68, 0.80],
      rimColorRgb: [1.0, 0.92, 0.80],
      rimThreshold: [0.55, 0.72],
      halftoneRankEnabled: false,
    },
    "hunter-neon": {
      id: "hunter-neon",
      labelKo: "헌터 네온",
      moodKo: "강렬한 4단 고대비 명암과 마나 시안 테두리 빛",
      badgeOklch: "oklch(0.68 0.16 225)",
      toneBandCount: 4,
      linearLuminanceStops: [0.15, 0.35, 0.60, 1.0],
      srgbRampBytes: [0.15, 0.35, 0.60, 1.0].map(linearToSrgbByte),
      inkPx: 1.9,
      lightingMode: "flat",
      inkColorRgb: [0.06, 0.09, 0.16],
      shadowTintRgb: [0.46, 0.56, 0.78],
      rimColorRgb: [0.34, 0.90, 1.0],
      rimThreshold: [0.50, 0.68],
      halftoneRankEnabled: true,
    },
    "daily-warm-sun": {
      id: "daily-warm-sun",
      labelKo: "일상 따뜻한 햇살",
      moodKo: "포근한 살구빛 3단 햇살과 깔끔한 코코아 선화",
      badgeOklch: "oklch(0.78 0.12 65)",
      toneBandCount: 3,
      linearLuminanceStops: [0.34, 0.68, 1.0],
      srgbRampBytes: [0.34, 0.68, 1.0].map(linearToSrgbByte),
      inkPx: 1.4,
      lightingMode: "flat",
      inkColorRgb: [0.19, 0.14, 0.14],
      shadowTintRgb: [0.88, 0.74, 0.68],
      rimColorRgb: [1.0, 0.90, 0.70],
      rimThreshold: [0.56, 0.75],
      halftoneRankEnabled: false,
    },
    "noir-deep-ink": {
      id: "noir-deep-ink",
      labelKo: "느와르 딥잉크",
      moodKo: "묵직한 4단 먹선 명암과 계조 망점 톤 강조",
      badgeOklch: "oklch(0.42 0.04 260)",
      toneBandCount: 4,
      linearLuminanceStops: [0.10, 0.32, 0.62, 1.0],
      srgbRampBytes: [0.10, 0.32, 0.62, 1.0].map(linearToSrgbByte),
      inkPx: 2.2,
      lightingMode: "flat",
      inkColorRgb: [0.04, 0.05, 0.08],
      shadowTintRgb: [0.36, 0.40, 0.50],
      rimColorRgb: [0.76, 0.86, 0.98],
      rimThreshold: [0.52, 0.66],
      halftoneRankEnabled: true,
    },
  });

export const KWEBTOON_CEL_PRESET_LIST: readonly KWebtoonCelPreset[] = Object.freeze([
  KWEBTOON_CEL_PRESETS["rofan-pastel"],
  KWEBTOON_CEL_PRESETS["hunter-neon"],
  KWEBTOON_CEL_PRESETS["daily-warm-sun"],
  KWEBTOON_CEL_PRESETS["noir-deep-ink"],
]);

/** 선택한 프리셋과 사용자 선 굵기에서 단일 잉크 계약을 생성한다. */
export function createUnifiedInkContract(
  presetId: KWebtoonCelPresetId,
  overrides?: { readonly inkPx?: number; readonly lightingMode?: InkLightingMode },
): UnifiedInkContract {
  const preset = KWEBTOON_CEL_PRESETS[presetId];
  return {
    inkPx: Math.max(0.6, Math.min(4.0, overrides?.inkPx ?? preset.inkPx)),
    lightingMode: overrides?.lightingMode ?? preset.lightingMode,
    toneBandCount: preset.toneBandCount,
    inkColorRgb: preset.inkColorRgb,
    parity: {
      outputColorSpace: "srgb",
      toneMapping: "NoToneMapping",
      toneMappingExposure: 1.0,
      msaaSamples: 4,
    },
  };
}

/** Blender 5.3 실측 생성 + GLBForge 100/100 검증 완료 한국 웹툰 히어로 3D 에셋 4종 */
export const KWEBTOON_HERO_GLB_CATALOG: readonly KWebtoonHeroGlbAsset[] = Object.freeze([
  {
    id: "rofan-imperial-arch-chandelier",
    titleKo: "로판 제국 대저택 아치·샹들리에",
    subtitleKo: "플루티드 대리석 기둥 · 보수아르 아치 · 2단 크리스탈 샹들리에",
    category: "environment",
    recommendedPresetId: "rofan-pastel",
    glbUrl: "/models/kwebtoon-hero/rofan-imperial-arch-chandelier.glb",
    previewUrl: "/models/kwebtoon-hero/rofan-imperial-arch-chandelier.png",
    triangles: 17792,
    vertices: 9274,
    drawCalls: 4,
    glbBytes: 639900,
    dimensionsMeters: [3.26, 1.376, 3.855],
    glbforgeDesktopScore: 100,
    glbforgeMobileScore: 100,
    blenderVersion: "5.3.0",
  },
  {
    id: "seoul-rooftop-cafe-terrace",
    titleKo: "서울 감성 루프탑 카페 테라스",
    subtitleKo: "우드 데크 · 아치 퍼걸러 스트링 라이트 · 테라조 테이블·의자",
    category: "environment",
    recommendedPresetId: "daily-warm-sun",
    glbUrl: "/models/kwebtoon-hero/seoul-rooftop-cafe-terrace.glb",
    previewUrl: "/models/kwebtoon-hero/seoul-rooftop-cafe-terrace.png",
    triangles: 16780,
    vertices: 8660,
    drawCalls: 4,
    glbBytes: 559268,
    dimensionsMeters: [2.7, 1.98, 2.51],
    glbforgeDesktopScore: 100,
    glbforgeMobileScore: 100,
    blenderVersion: "5.3.0",
  },
  {
    id: "murim-jade-sword-altar",
    titleKo: "무협·판타지 청옥보검 룬 제단",
    subtitleKo: "3단 팔각 현무암 기단 · 팔괘 마법진 · 청옥보검과 붉은 검수",
    category: "prop",
    recommendedPresetId: "hunter-neon",
    glbUrl: "/models/kwebtoon-hero/murim-jade-sword-altar.glb",
    previewUrl: "/models/kwebtoon-hero/murim-jade-sword-altar.png",
    triangles: 6552,
    vertices: 3390,
    drawCalls: 4,
    glbBytes: 238300,
    dimensionsMeters: [1.996, 2.128, 1.933],
    glbforgeDesktopScore: 100,
    glbforgeMobileScore: 100,
    blenderVersion: "5.3.0",
  },
  {
    id: "kwebtoon-bust-mannequin-atelier",
    titleKo: "웹툰 미형 흉상·볼륨 헤어 마네킹",
    subtitleKo: "V라인 턱선 · 커튼 뱅 레이어드 헤어 · 하이칼라 블레이저 브로치",
    category: "character",
    recommendedPresetId: "rofan-pastel",
    glbUrl: "/models/kwebtoon-hero/kwebtoon-bust-mannequin-atelier.glb",
    previewUrl: "/models/kwebtoon-hero/kwebtoon-bust-mannequin-atelier.png",
    triangles: 20404,
    vertices: 10262,
    drawCalls: 4,
    glbBytes: 535464,
    dimensionsMeters: [0.43, 0.326, 0.863],
    glbforgeDesktopScore: 100,
    glbforgeMobileScore: 100,
    blenderVersion: "5.3.0",
  },
]);

/** `apps/character-lab` 10종 K-웹툰 아키타입 ↔ 메인 BG3D 스테이지 실시간 브리지 카탈로그 */
export const KWEBTOON_ARCHETYPE_STAGE_BRIDGE: readonly KWebtoonArchetypeStageBridgeItem[] =
  Object.freeze([
    {
      archetypeId: "kwebtoon-rofan-princess",
      shortLabelKo: "로판 황녀",
      genreKo: "로맨스 판타지",
      headsTall: 7.8,
      recommendedHeroGlbId: "rofan-imperial-arch-chandelier",
      recommendedCelPresetId: "rofan-pastel",
      defaultInkPx: 1.5,
      characterLabHref: "/studio/character?archetype=kwebtoon-rofan-princess",
    },
    {
      archetypeId: "kwebtoon-northern-duke",
      shortLabelKo: "북부 대공",
      genreKo: "로맨스 판타지",
      headsTall: 8.8,
      recommendedHeroGlbId: "rofan-imperial-arch-chandelier",
      recommendedCelPresetId: "noir-deep-ink",
      defaultInkPx: 2.0,
      characterLabHref: "/studio/character?archetype=kwebtoon-northern-duke",
    },
    {
      archetypeId: "kwebtoon-academy-heroine",
      shortLabelKo: "학원 여주",
      genreKo: "학원 로맨스",
      headsTall: 7.5,
      recommendedHeroGlbId: "seoul-rooftop-cafe-terrace",
      recommendedCelPresetId: "daily-warm-sun",
      defaultInkPx: 1.4,
      characterLabHref: "/studio/character?archetype=kwebtoon-academy-heroine",
    },
    {
      archetypeId: "kwebtoon-academy-hero",
      shortLabelKo: "학원 남주",
      genreKo: "학원 로맨스",
      headsTall: 8.1,
      recommendedHeroGlbId: "seoul-rooftop-cafe-terrace",
      recommendedCelPresetId: "daily-warm-sun",
      defaultInkPx: 1.5,
      characterLabHref: "/studio/character?archetype=kwebtoon-academy-hero",
    },
    {
      archetypeId: "kwebtoon-srank-hunter",
      shortLabelKo: "S급 헌터 남",
      genreKo: "헌터 액션",
      headsTall: 8.6,
      recommendedHeroGlbId: "murim-jade-sword-altar",
      recommendedCelPresetId: "hunter-neon",
      defaultInkPx: 1.9,
      characterLabHref: "/studio/character?archetype=kwebtoon-srank-hunter",
    },
    {
      archetypeId: "kwebtoon-srank-healer",
      shortLabelKo: "S급 힐러 여",
      genreKo: "헌터 판타지",
      headsTall: 7.8,
      recommendedHeroGlbId: "rofan-imperial-arch-chandelier",
      recommendedCelPresetId: "rofan-pastel",
      defaultInkPx: 1.5,
      characterLabHref: "/studio/character?archetype=kwebtoon-srank-healer",
    },
    {
      archetypeId: "kwebtoon-office-ceo",
      shortLabelKo: "오피스 대표",
      genreKo: "현대 로맨스",
      headsTall: 8.5,
      recommendedHeroGlbId: "seoul-rooftop-cafe-terrace",
      recommendedCelPresetId: "noir-deep-ink",
      defaultInkPx: 1.7,
      characterLabHref: "/studio/character?archetype=kwebtoon-office-ceo",
    },
    {
      archetypeId: "kwebtoon-modern-heroine",
      shortLabelKo: "현대 웹툰 여주",
      genreKo: "현대 로맨스",
      headsTall: 7.8,
      recommendedHeroGlbId: "kwebtoon-bust-mannequin-atelier",
      recommendedCelPresetId: "daily-warm-sun",
      defaultInkPx: 1.4,
      characterLabHref: "/studio/character?archetype=kwebtoon-modern-heroine",
    },
    {
      archetypeId: "kwebtoon-murim-swordsman",
      shortLabelKo: "무협 협객",
      genreKo: "정통 무협",
      headsTall: 8.3,
      recommendedHeroGlbId: "murim-jade-sword-altar",
      recommendedCelPresetId: "noir-deep-ink",
      defaultInkPx: 2.1,
      characterLabHref: "/studio/character?archetype=kwebtoon-murim-swordsman",
    },
    {
      archetypeId: "kwebtoon-sd-mascot",
      shortLabelKo: "SD 마스코트",
      genreKo: "SD · 개그 · 일상",
      headsTall: 3.5,
      recommendedHeroGlbId: "kwebtoon-bust-mannequin-atelier",
      recommendedCelPresetId: "rofan-pastel",
      defaultInkPx: 2.0,
      characterLabHref: "/studio/character?archetype=kwebtoon-sd-mascot",
    },
  ]);

/** 선택한 K-웹툰 아키타입과 현재 배경 세트를 단일 잉크 계약 페이로드로 결합한다. */
export function buildStageBridgePayload(
  archetypeId: KWebtoonArchetypeBridgeId,
  overrideHeroGlbId?: KWebtoonHeroGlbId,
  overrideCelPresetId?: KWebtoonCelPresetId,
  viewportHeightPx = 1080,
): StageBridgePlacementPayload {
  const bridge =
    KWEBTOON_ARCHETYPE_STAGE_BRIDGE.find((item) => item.archetypeId === archetypeId) ??
    KWEBTOON_ARCHETYPE_STAGE_BRIDGE[0];
  const heroGlbId = overrideHeroGlbId ?? bridge.recommendedHeroGlbId;
  const heroAsset =
    KWEBTOON_HERO_GLB_CATALOG.find((item) => item.id === heroGlbId) ??
    KWEBTOON_HERO_GLB_CATALOG[0];
  const celPresetId = overrideCelPresetId ?? bridge.recommendedCelPresetId;
  const contract = createUnifiedInkContract(celPresetId, { inkPx: bridge.defaultInkPx });

  // 7.8~8.8등신 웹툰 인체 기준 1.65~1.88m, SD(3.5등신) ~0.92m
  const characterHeightScaleMeters = Number(
    (bridge.headsTall <= 4.0 ? 0.92 : 1.56 + (bridge.headsTall - 7.2) * 0.19).toFixed(2),
  );

  return {
    archetypeId: bridge.archetypeId,
    heroGlbId: heroAsset.id,
    heroGlbUrl: heroAsset.glbUrl,
    celPresetId,
    contract,
    outlineWidthFactorAt1080p: computeScreenSpaceOutlineFactor(contract.inkPx, viewportHeightPx),
    characterHeightScaleMeters,
  };
}
