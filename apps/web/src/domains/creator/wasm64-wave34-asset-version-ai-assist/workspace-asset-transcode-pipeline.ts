/**
 * Wasm64 Wave 34: ToonStudio 다중 워크스페이스 에셋 무손실 변환·정합 파이프라인
 * (`workspace-asset-transcode-pipeline`).
 *
 * - `2D 캔버스`(`2d-canvas`) ↔ `3D 스테이지`(`3d-stage`) ↔ `브러시 스튜디오`(`brush-studio`) ↔
 *   `캐릭터 셰이퍼`(`character-shaper`) 이동 시 색 틀어짐, 알파 경계 해일로(Halo), 투시 왜곡을 원천 차단한다.
 * - IEC 61966-2-1 sRGB ↔ Linear sRGB ↔ Björn Ottosson(2020) Oklab/OKLCH 정밀 왕복 변환으로
 *   물리 기반 선형 광원 연산과 지각적 색상각(Hue)·채도(Chroma) 정합을 달성한다.
 * - 브러시 스탬프 정규화 시 투명 경계 색 확산(Edge Color Bleed) 후 선형 Premultiplied 공간에서
 *   분리형 Bilinear / Lanczos2 리샘플링을 수행해 경계 검은 테두리 오염을 제거한다.
 * - 3D 카메라 렌즈(수직·수평 FOV, 센서 비율, Yaw·Pitch·Roll)와 2D 컷 투시 가이드(1·2·3점 소실점·호라이즌)를
 *   사영 기하학으로 무손실 상호 변환한다. 색상 문자열은 CSS 표준 `oklch(...)`만 생성한다.
 */

export type StudioWorkspaceKind = "2d-canvas" | "3d-stage" | "brush-studio" | "character-shaper";

/** 감마 인코딩 표준 sRGB 색상 (일반 범위 0..1, 광색역 왕복을 위해 부호 있는 실수 허용). */
export interface SrgbColor { readonly r: number; readonly g: number; readonly b: number }
/** 물리 광량 연산용 선형 sRGB 색상 (D65 백색점 기준). */
export interface LinearSrgbColor { readonly r: number; readonly g: number; readonly b: number }
/** Björn Ottosson(2020) 지각 균등 Oklab 직교 좌표. */
export interface OklabColor { readonly l: number; readonly a: number; readonly b: number }
/** 지각 균등 원통형 OKLCH 좌표 (`l`: 0..1, `c`: >= 0, `h`: 0..360°). */
export interface OklchColor { readonly l: number; readonly c: number; readonly h: number }
/** 캐릭터 파츠별 기준 알베도 슬롯 입력. */
export interface CharacterPaletteSlotInput {
  readonly slotId: string; readonly partLabelKo: string; readonly albedoSrgb: SrgbColor;
}
/** 3D/셰이퍼 스테이지의 주광원(Key Light) 및 주변광(Ambient) 설정. */
export interface StageKeyLightRig {
  readonly keyLightSrgb: SrgbColor; readonly keyIntensity: number; readonly exposureEv: number;
  readonly ambientSrgb: SrgbColor; readonly ambientStrength: number; readonly preservePerceptualHue?: number;
}
/** 워크스페이스 간 정합이 완료된 캐릭터 컬러 슬롯 결과. */
export interface HarmonizedPaletteSlot {
  readonly slotId: string; readonly partLabelKo: string;
  readonly albedoSrgb: SrgbColor; readonly albedoLinear: LinearSrgbColor;
  readonly albedoOklab: OklabColor; readonly albedoCssOklch: string;
  readonly stageLitLinear: LinearSrgbColor;
  readonly celBaseSrgb: SrgbColor; readonly celShadowSrgb: SrgbColor; readonly celHighlightSrgb: SrgbColor;
  readonly celBaseCssOklch: string; readonly celShadowCssOklch: string;
  readonly roundtripMaxChannelError: number;
}

export type BrushResampleFilter = "bilinear" | "lanczos2";
/** Straight RGBA [0..1] 부동소수점 텍스처 버퍼 (`rgba.length === width * height * 4`). */
export interface RgbaFloatTexture { readonly width: number; readonly height: number; readonly rgba: Float32Array }
/** 브러시 스탬프 정규화 옵션. */
export interface BrushStampNormalizeOptions {
  readonly targetWidth: number; readonly targetHeight: number; readonly filter: BrushResampleFilter;
  readonly edgeBleedIterations?: number; readonly alphaCutoff?: number; readonly expectedForegroundSrgb?: SrgbColor;
}
/** 정규화된 브러시 스탬프 결과 버퍼 및 품질 지표. */
export interface NormalizedBrushStampResult {
  readonly width: number; readonly height: number;
  readonly rgba: Float32Array; readonly premultipliedLinearRgba: Float32Array;
  readonly filter: BrushResampleFilter; readonly haloContaminationRms: number; readonly opaquePixelCount: number;
}

export interface CanvasPoint2D { readonly x: number; readonly y: number }
export type CutPerspectiveMode = "1-point" | "2-point" | "3-point";
/** 유한 소실점 또는 무한원 평행 방향 벡터를 표현하는 사영 소실점. */
export interface ProjectedVanishingPoint {
  readonly axis: "x" | "y" | "z"; readonly isAtInfinity: boolean;
  readonly pointPx: CanvasPoint2D | null; readonly directionUnit: CanvasPoint2D;
}
/** 3D 스테이지 카메라 렌즈 및 회전 명세. */
export interface Camera3dLensSpec {
  readonly verticalFovDeg: number; readonly aspectRatio: number;
  readonly yawDeg: number; readonly pitchDeg: number; readonly rollDeg: number;
  readonly sensorHeightMm?: number; readonly principalPointNormalized?: CanvasPoint2D;
}
/** 2D 캔버스 컷의 투시 자(Ruler) 및 호라이즌 가이드. */
export interface CutPerspective2dGuide {
  readonly cutWidthPx: number; readonly cutHeightPx: number; readonly mode: CutPerspectiveMode;
  readonly principalPointPx: CanvasPoint2D; readonly horizonAnchorPx: CanvasPoint2D; readonly horizonTiltDeg: number;
  readonly primaryVanishingPoint: ProjectedVanishingPoint;
  readonly secondaryVanishingPoint: ProjectedVanishingPoint;
  readonly verticalVanishingPoint: ProjectedVanishingPoint;
  readonly calibratedFocalLengthPx: number;
}
/** 복원된 3D 카메라 렌즈 정보 및 환산 지표. */
export interface ResolvedCamera3dLens extends Camera3dLensSpec {
  readonly horizontalFovDeg: number; readonly focalLengthMmEquivalent35mm: number; readonly focalLengthPx: number;
}

export type WorkspaceAssetPayload =
  | { readonly kind: "character-palette-rig"; readonly assetId: string; readonly slots: readonly CharacterPaletteSlotInput[]; readonly keyLightRig: StageKeyLightRig }
  | { readonly kind: "brush-stamp"; readonly assetId: string; readonly texture: RgbaFloatTexture; readonly normalizeOptions: BrushStampNormalizeOptions }
  | { readonly kind: "scene-camera-cut"; readonly assetId: string; readonly cutWidthPx: number; readonly cutHeightPx: number; readonly camera3d?: Camera3dLensSpec; readonly perspective2d?: CutPerspective2dGuide };

/** 워크스페이스 간 에셋 변환 결과 및 정합 감사 지표. */
export interface WorkspaceAssetTranscodeResult {
  readonly assetId: string; readonly sourceWorkspace: StudioWorkspaceKind; readonly targetWorkspace: StudioWorkspaceKind;
  readonly payloadKind: WorkspaceAssetPayload["kind"];
  readonly harmonizedPalette?: readonly HarmonizedPaletteSlot[];
  readonly normalizedBrush?: NormalizedBrushStampResult;
  readonly convertedPerspective2d?: CutPerspective2dGuide;
  readonly convertedCamera3d?: ResolvedCamera3dLens;
  readonly maxColorRoundtripError: number; readonly haloContaminationRms: number; readonly cameraFovRoundtripErrorDeg: number;
  readonly losslessVerified: boolean; readonly summaryKo: string;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FULL_FRAME_SENSOR_HEIGHT_MM = 24;
const INFINITE_VP_AXIS_SIN_THRESHOLD = Math.sin(0.75 * DEG_TO_RAD);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** IEC 61966-2-1 단일 채널 sRGB -> 선형 sRGB 변환. */
export function srgbChannelToLinear(channel: number): number {
  if (!Number.isFinite(channel)) return 0;
  const sign = channel < 0 ? -1 : 1;
  const abs = Math.abs(channel);
  return abs <= 0.04045 ? channel / 12.92 : sign * (((abs + 0.055) / 1.055) ** 2.4);
}

/** IEC 61966-2-1 단일 채널 선형 sRGB -> sRGB 변환. */
export function linearChannelToSrgb(channel: number): number {
  if (!Number.isFinite(channel)) return 0;
  const sign = channel < 0 ? -1 : 1;
  const abs = Math.abs(channel);
  return abs <= 0.0031308 ? channel * 12.92 : sign * (1.055 * (abs ** (1 / 2.4)) - 0.055);
}

/** sRGB 색상을 선형 sRGB로 변환한다. */
export function srgbToLinearSrgb(color: SrgbColor): LinearSrgbColor {
  return {
    r: srgbChannelToLinear(color.r),
    g: srgbChannelToLinear(color.g),
    b: srgbChannelToLinear(color.b),
  };
}

/** 선형 sRGB 색상을 sRGB로 변환한다 (`clampGamut === true`이면 `[0, 1]` 제한). */
export function linearSrgbToSrgb(color: LinearSrgbColor, clampGamut = false): SrgbColor {
  const r = linearChannelToSrgb(color.r);
  const g = linearChannelToSrgb(color.g);
  const b = linearChannelToSrgb(color.b);
  return clampGamut ? { r: clamp01(r), g: clamp01(g), b: clamp01(b) } : { r, g, b };
}

/** 선형 sRGB를 Björn Ottosson(2020) Oklab 색공간으로 변환한다. */
export function linearSrgbToOklab(color: LinearSrgbColor): OklabColor {
  const l = 0.4122214708 * color.r + 0.5363325363 * color.g + 0.0514459929 * color.b;
  const m = 0.2119034982 * color.r + 0.6806995451 * color.g + 0.1073969566 * color.b;
  const s = 0.0883024619 * color.r + 0.2817188376 * color.g + 0.6299787005 * color.b;
  const lP = Math.cbrt(l);
  const mP = Math.cbrt(m);
  const sP = Math.cbrt(s);
  return {
    l: 0.2104542553 * lP + 0.793617785 * mP - 0.0040720468 * sP,
    a: 1.9779984951 * lP - 2.428592205 * mP + 0.4505937099 * sP,
    b: 0.0259040371 * lP + 0.7827717662 * mP - 0.808675766 * sP,
  };
}

/** Oklab 색상을 선형 sRGB로 역변환한다. */
export function oklabToLinearSrgb(color: OklabColor): LinearSrgbColor {
  const lP = color.l + 0.3963377774 * color.a + 0.2158037573 * color.b;
  const mP = color.l - 0.1055613458 * color.a - 0.0638541728 * color.b;
  const sP = color.l - 0.0894841775 * color.a - 1.291485548 * color.b;
  const l = lP * lP * lP;
  const m = mP * mP * mP;
  const s = sP * sP * sP;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** sRGB -> Oklab 직접 변환. */
export function srgbToOklab(color: SrgbColor): OklabColor {
  return linearSrgbToOklab(srgbToLinearSrgb(color));
}

/** Oklab -> sRGB 직접 변환. */
export function oklabToSrgb(color: OklabColor, clampGamut = false): SrgbColor {
  return linearSrgbToSrgb(oklabToLinearSrgb(color), clampGamut);
}

/** Oklab 직교 좌표를 원통형 OKLCH 좌표로 변환한다. */
export function oklabToOklch(color: OklabColor): OklchColor {
  const c = Math.hypot(color.a, color.b);
  const rawHue = c < 1e-10 ? 0 : Math.atan2(color.b, color.a) * RAD_TO_DEG;
  const h = ((rawHue % 360) + 360) % 360;
  return { l: color.l, c, h: h === 0 ? 0 : h };
}

/** OKLCH 원통형 좌표를 Oklab 직교 좌표로 변환한다. */
export function oklchToOklab(color: OklchColor): OklabColor {
  const hRad = color.h * DEG_TO_RAD;
  return { l: color.l, a: color.c * Math.cos(hRad), b: color.c * Math.sin(hRad) };
}

/** 디자인 토큰 정책을 준수하는 CSS 표준 `oklch(...)` 문자열로 포맷한다. */
export function formatOklchCss(color: OklchColor): string {
  const lPct = (clamp01(color.l) * 100).toFixed(2);
  const cVal = Math.max(0, color.c).toFixed(4);
  const hVal = (((color.h % 360) + 360) % 360).toFixed(2);
  return `oklch(${lPct}% ${cVal} ${hVal})`;
}

/**
 * 캐릭터 알베도 팔레트와 키라이트 리그를 정합하여 채도 탁해짐 없는 2D 셀 베이스·그림자·하이라이트를 생성한다.
 */
export function harmonizeCharacterPaletteWithKeyLight(
  slots: readonly CharacterPaletteSlotInput[],
  rig: StageKeyLightRig,
): readonly HarmonizedPaletteSlot[] {
  const keyLin = srgbToLinearSrgb(rig.keyLightSrgb);
  const ambLin = srgbToLinearSrgb(rig.ambientSrgb);
  const keyScale = Math.max(0, rig.keyIntensity) * (2 ** clamp(rig.exposureEv, -6, 6));
  const ambScale = Math.max(0, rig.ambientStrength);
  const hueLock = clamp01(rig.preservePerceptualHue ?? 0.75);

  return slots.map((slot) => {
    const albedoLinear = srgbToLinearSrgb(slot.albedoSrgb);
    const albedoOklab = linearSrgbToOklab(albedoLinear);
    const rtSrgb = oklabToSrgb(albedoOklab, false);
    const roundtripMaxChannelError = Math.max(
      Math.abs(rtSrgb.r - slot.albedoSrgb.r),
      Math.abs(rtSrgb.g - slot.albedoSrgb.g),
      Math.abs(rtSrgb.b - slot.albedoSrgb.b),
    );

    const stageLitLinear: LinearSrgbColor = {
      r: albedoLinear.r * (ambLin.r * ambScale + keyLin.r * keyScale),
      g: albedoLinear.g * (ambLin.g * ambScale + keyLin.g * keyScale),
      b: albedoLinear.b * (ambLin.b * ambScale + keyLin.b * keyScale),
    };
    const rawLitOklab = linearSrgbToOklab({
      r: Math.max(0, stageLitLinear.r),
      g: Math.max(0, stageLitLinear.g),
      b: Math.max(0, stageLitLinear.b),
    });
    const celBaseOklab: OklabColor = {
      l: clamp01(rawLitOklab.l),
      a: rawLitOklab.a * (1 - hueLock) + albedoOklab.a * hueLock,
      b: rawLitOklab.b * (1 - hueLock) + albedoOklab.b * hueLock,
    };

    const ambFill = Math.max(0.25, ambScale);
    const ambientLab = linearSrgbToOklab({
      r: Math.max(0, albedoLinear.r * ambLin.r * ambFill),
      g: Math.max(0, albedoLinear.g * ambLin.g * ambFill),
      b: Math.max(0, albedoLinear.b * ambLin.b * ambFill),
    });
    const celShadowOklab: OklabColor = {
      l: clamp01(celBaseOklab.l * 0.76),
      a: celBaseOklab.a * 0.82 + ambientLab.a * 0.24,
      b: celBaseOklab.b * 0.82 + ambientLab.b * 0.24,
    };
    const celHighlightOklab: OklabColor = {
      l: clamp01(celBaseOklab.l + (1 - celBaseOklab.l) * 0.28),
      a: celBaseOklab.a * 0.88 + rawLitOklab.a * 0.12,
      b: celBaseOklab.b * 0.88 + rawLitOklab.b * 0.12,
    };

    return {
      slotId: slot.slotId,
      partLabelKo: slot.partLabelKo,
      albedoSrgb: slot.albedoSrgb,
      albedoLinear,
      albedoOklab,
      albedoCssOklch: formatOklchCss(oklabToOklch(albedoOklab)),
      stageLitLinear,
      celBaseSrgb: oklabToSrgb(celBaseOklab, true),
      celShadowSrgb: oklabToSrgb(celShadowOklab, true),
      celHighlightSrgb: oklabToSrgb(celHighlightOklab, true),
      celBaseCssOklch: formatOklchCss(oklabToOklch(celBaseOklab)),
      celShadowCssOklch: formatOklchCss(oklabToOklch(celShadowOklab)),
      roundtripMaxChannelError,
    };
  });
}

function sincNormalized(x: number): number {
  const absX = Math.abs(x);
  if (absX < 1e-8) return 1;
  const piX = Math.PI * absX;
  return Math.sin(piX) / piX;
}

function evaluateResampleWeight(distance: number, filter: BrushResampleFilter): number {
  const absD = Math.abs(distance);
  if (filter === "bilinear") return absD >= 1 ? 0 : 1 - absD;
  return absD >= 2 ? 0 : sincNormalized(absD) * sincNormalized(absD * 0.5);
}

const NEIGHBOR_8_OFFSETS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
] as const;

/**
 * 완전 투명 픽셀에 인접 유효 픽셀의 RGB를 반복 확산해 리샘플링 경계 검은 테두리(Halo)를 예방한다.
 */
export function bleedTransparentEdgeColors(
  rgba: Float32Array,
  width: number,
  height: number,
  iterations = 6,
  alphaCutoff = 1e-4,
): Float32Array {
  const totalPixels = width * height;
  const current = new Float32Array(rgba);
  const validMask = new Uint8Array(totalPixels);
  for (let i = 0; i < totalPixels; i += 1) {
    if ((current[i * 4 + 3] ?? 0) > alphaCutoff) validMask[i] = 1;
  }

  const maxSteps = Math.max(1, Math.floor(iterations));
  for (let step = 0; step < maxSteps; step += 1) {
    let filledAny = false;
    const nextBuffer = new Float32Array(current);
    const nextMask = new Uint8Array(validMask);

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (validMask[idx] === 1) continue;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumW = 0;

        for (const [dx, dy] of NEIGHBOR_8_OFFSETS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (validMask[nIdx] === 0) continue;
          const w = (dx !== 0 && dy !== 0 ? 0.70710678 : 1) * Math.max(alphaCutoff, current[nIdx * 4 + 3] ?? alphaCutoff);
          sumR += (current[nIdx * 4] ?? 0) * w;
          sumG += (current[nIdx * 4 + 1] ?? 0) * w;
          sumB += (current[nIdx * 4 + 2] ?? 0) * w;
          sumW += w;
        }

        if (sumW > 0) {
          const base = idx * 4;
          nextBuffer[base] = sumR / sumW;
          nextBuffer[base + 1] = sumG / sumW;
          nextBuffer[base + 2] = sumB / sumW;
          nextMask[idx] = 1;
          filledAny = true;
        }
      }
    }
    current.set(nextBuffer);
    validMask.set(nextMask);
    if (!filledAny) break;
  }
  return current;
}

function resamplePremultiplied1D(
  src: Float32Array,
  srcWidth: number,
  srcHeight: number,
  dstLength: number,
  horizontal: boolean,
  filter: BrushResampleFilter,
): Float32Array {
  const outWidth = horizontal ? dstLength : srcWidth;
  const outHeight = horizontal ? srcHeight : dstLength;
  const srcLength = horizontal ? srcWidth : srcHeight;
  const out = new Float32Array(outWidth * outHeight * 4);
  const scale = srcLength / dstLength;
  const filterScale = Math.max(1, scale);
  const support = (filter === "bilinear" ? 1 : 2) * filterScale;

  for (let y = 0; y < outHeight; y += 1) {
    for (let x = 0; x < outWidth; x += 1) {
      const srcCenter = ((horizontal ? x : y) + 0.5) * scale - 0.5;
      const start = Math.floor(srcCenter - support);
      const end = Math.ceil(srcCenter + support);
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;
      let wSum = 0;

      for (let k = start; k <= end; k += 1) {
        const w = evaluateResampleWeight((k - srcCenter) / filterScale, filter);
        if (w === 0) continue;
        const ck = clamp(k, 0, srcLength - 1);
        const sBase = ((horizontal ? y : ck) * srcWidth + (horizontal ? ck : x)) * 4;
        accR += (src[sBase] ?? 0) * w;
        accG += (src[sBase + 1] ?? 0) * w;
        accB += (src[sBase + 2] ?? 0) * w;
        accA += (src[sBase + 3] ?? 0) * w;
        wSum += w;
      }

      const invW = wSum !== 0 ? 1 / wSum : 0;
      const finalA = clamp01(accA * invW);
      const outBase = (y * outWidth + x) * 4;
      out[outBase] = clamp(accR * invW, 0, finalA);
      out[outBase + 1] = clamp(accG * invW, 0, finalA);
      out[outBase + 2] = clamp(accB * invW, 0, finalA);
      out[outBase + 3] = finalA;
    }
  }
  return out;
}

/** 브러시 스탬프 텍스처를 지정 해상도로 정규화하고 알파 경계 해일로를 제거한다. */
export function normalizeBrushStampTexture(
  source: RgbaFloatTexture,
  options: BrushStampNormalizeOptions,
): NormalizedBrushStampResult {
  const srcW = Math.max(1, Math.floor(source.width));
  const srcH = Math.max(1, Math.floor(source.height));
  const dstW = Math.max(1, Math.floor(options.targetWidth));
  const dstH = Math.max(1, Math.floor(options.targetHeight));
  const cutoff = Math.max(1e-6, options.alphaCutoff ?? 1e-4);
  const bleedSteps = options.edgeBleedIterations ?? 6;

  const bledSrgb = bleedTransparentEdgeColors(source.rgba, srcW, srcH, bleedSteps, cutoff);
  const srcPremulLin = new Float32Array(srcW * srcH * 4);
  let fgSumR = 0;
  let fgSumG = 0;
  let fgSumB = 0;
  let fgCount = 0;

  for (let i = 0; i < srcW * srcH; i += 1) {
    const b = i * 4;
    const a = clamp01(bledSrgb[b + 3] ?? 0);
    srcPremulLin[b] = clamp01(srgbChannelToLinear(clamp01(bledSrgb[b] ?? 0))) * a;
    srcPremulLin[b + 1] = clamp01(srgbChannelToLinear(clamp01(bledSrgb[b + 1] ?? 0))) * a;
    srcPremulLin[b + 2] = clamp01(srgbChannelToLinear(clamp01(bledSrgb[b + 2] ?? 0))) * a;
    srcPremulLin[b + 3] = a;
    if (a >= 0.9) {
      fgSumR += bledSrgb[b] ?? 0;
      fgSumG += bledSrgb[b + 1] ?? 0;
      fgSumB += bledSrgb[b + 2] ?? 0;
      fgCount += 1;
    }
  }

  const hPass = resamplePremultiplied1D(srcPremulLin, srcW, srcH, dstW, true, options.filter);
  const premultipliedLinearRgba = resamplePremultiplied1D(hPass, dstW, srcH, dstH, false, options.filter);
  const rawStraight = new Float32Array(dstW * dstH * 4);
  let opaquePixelCount = 0;

  for (let i = 0; i < dstW * dstH; i += 1) {
    const b = i * 4;
    const a = premultipliedLinearRgba[b + 3] ?? 0;
    if (a > cutoff) {
      opaquePixelCount += 1;
      rawStraight[b] = clamp01(linearChannelToSrgb(clamp01((premultipliedLinearRgba[b] ?? 0) / a)));
      rawStraight[b + 1] = clamp01(linearChannelToSrgb(clamp01((premultipliedLinearRgba[b + 1] ?? 0) / a)));
      rawStraight[b + 2] = clamp01(linearChannelToSrgb(clamp01((premultipliedLinearRgba[b + 2] ?? 0) / a)));
      rawStraight[b + 3] = a;
    }
  }

  const cleanOutRgba = bleedTransparentEdgeColors(rawStraight, dstW, dstH, Math.max(2, Math.ceil(bleedSteps * 0.5)), cutoff);
  const refFg: SrgbColor =
    options.expectedForegroundSrgb ??
    (fgCount > 0 ? { r: fgSumR / fgCount, g: fgSumG / fgCount, b: fgSumB / fgCount } : { r: 0, g: 0, b: 0 });

  let edgeErrSqSum = 0;
  let edgeCount = 0;
  if (options.expectedForegroundSrgb !== undefined || fgCount > 0) {
    for (let i = 0; i < dstW * dstH; i += 1) {
      const b = i * 4;
      const a = cleanOutRgba[b + 3] ?? 0;
      if (a > 0.02 && a < 0.98) {
        const dr = (cleanOutRgba[b] ?? 0) - refFg.r;
        const dg = (cleanOutRgba[b + 1] ?? 0) - refFg.g;
        const db = (cleanOutRgba[b + 2] ?? 0) - refFg.b;
        edgeErrSqSum += (dr * dr + dg * dg + db * db) / 3;
        edgeCount += 1;
      }
    }
  }

  return {
    width: dstW,
    height: dstH,
    rgba: cleanOutRgba,
    premultipliedLinearRgba,
    filter: options.filter,
    haloContaminationRms: edgeCount > 0 ? Math.sqrt(edgeErrSqSum / edgeCount) : 0,
    opaquePixelCount,
  };
}

/** 수직 화각(도)과 종횡비로부터 수평 화각(도)을 계산한다. */
export function verticalFovToHorizontalFovDeg(verticalFovDeg: number, aspectRatio: number): number {
  const safeVFov = clamp(verticalFovDeg, 1, 175) * DEG_TO_RAD;
  return 2 * Math.atan(Math.tan(safeVFov * 0.5) * Math.max(1e-4, aspectRatio)) * RAD_TO_DEG;
}

/** 수평 화각(도)과 종횡비로부터 수직 화각(도)을 계산한다. */
export function horizontalFovToVerticalFovDeg(horizontalFovDeg: number, aspectRatio: number): number {
  const safeHFov = clamp(horizontalFovDeg, 1, 175) * DEG_TO_RAD;
  return 2 * Math.atan(Math.tan(safeHFov * 0.5) / Math.max(1e-4, aspectRatio)) * RAD_TO_DEG;
}

/** 센서 높이(mm)와 초점 거리(mm)로부터 수직 화각(도)을 계산한다. */
export function focalLengthMmToVerticalFovDeg(focalLengthMm: number, sensorHeightMm = FULL_FRAME_SENSOR_HEIGHT_MM): number {
  return 2 * Math.atan(Math.max(1, sensorHeightMm) / (2 * Math.max(0.5, focalLengthMm))) * RAD_TO_DEG;
}

/** 수직 화각(도)과 센서 높이(mm)로부터 등가 초점 거리(mm)를 계산한다. */
export function verticalFovDegToFocalLengthMm(verticalFovDeg: number, sensorHeightMm = FULL_FRAME_SENSOR_HEIGHT_MM): number {
  return Math.max(1, sensorHeightMm) / (2 * Math.tan(clamp(verticalFovDeg, 1, 175) * 0.5 * DEG_TO_RAD));
}

function projectWorldAxisToCanvas(
  axisName: "x" | "y" | "z",
  worldDir: readonly [number, number, number],
  yawRad: number,
  pitchRad: number,
  rollRad: number,
  cx: number,
  cy: number,
  focalPx: number,
): ProjectedVanishingPoint {
  const [wx, wy, wz] = worldDir;
  const x1 = wx * Math.cos(yawRad) - wz * Math.sin(yawRad);
  const z1 = wx * Math.sin(yawRad) + wz * Math.cos(yawRad);
  const y2 = wy * Math.cos(pitchRad) + z1 * Math.sin(pitchRad);
  const z2 = -wy * Math.sin(pitchRad) + z1 * Math.cos(pitchRad);
  const vx = x1 * Math.cos(rollRad) + y2 * Math.sin(rollRad);
  const vy = -x1 * Math.sin(rollRad) + y2 * Math.cos(rollRad);

  if (Math.abs(z2) <= INFINITE_VP_AXIS_SIN_THRESHOLD) {
    const norm = Math.hypot(vx, -vy) || 1;
    return { axis: axisName, isAtInfinity: true, pointPx: null, directionUnit: { x: vx / norm, y: -vy / norm } };
  }
  const px = cx - focalPx * (vx / z2);
  const py = cy + focalPx * (vy / z2);
  const len = Math.hypot(px - cx, py - cy);
  return {
    axis: axisName,
    isAtInfinity: false,
    pointPx: { x: px, y: py },
    directionUnit: len > 1e-9 ? { x: (px - cx) / len, y: (py - cy) / len } : { x: 1, y: 0 },
  };
}

/** 3D 스테이지 카메라 명세를 2D 웹툰 컷의 1·2·3점 투시 소실점 및 호라이즌 가이드로 정밀 변환한다. */
export function camera3dToCutPerspective2d(
  camera: Camera3dLensSpec,
  cutWidthPx: number,
  cutHeightPx: number,
): CutPerspective2dGuide {
  const safeW = Math.max(1, cutWidthPx);
  const safeH = Math.max(1, cutHeightPx);
  const vFovDeg = clamp(camera.verticalFovDeg, 5, 160);
  const yawDeg = clamp(camera.yawDeg, -89, 89);
  const pitchDeg = clamp(camera.pitchDeg, -84, 84);
  const rollDeg = clamp(camera.rollDeg, -89, 89);

  const normP = camera.principalPointNormalized ?? { x: 0.5, y: 0.5 };
  const cx = normP.x * safeW;
  const cy = normP.y * safeH;
  const focalPx = (0.5 * safeH) / Math.tan(vFovDeg * 0.5 * DEG_TO_RAD);
  const yawRad = yawDeg * DEG_TO_RAD;
  const pitchRad = pitchDeg * DEG_TO_RAD;
  const rollRad = rollDeg * DEG_TO_RAD;

  const vpZ = projectWorldAxisToCanvas("z", [0, 0, -1], yawRad, pitchRad, rollRad, cx, cy, focalPx);
  const vpX = projectWorldAxisToCanvas("x", [1, 0, 0], yawRad, pitchRad, rollRad, cx, cy, focalPx);
  const vpY = projectWorldAxisToCanvas("y", [0, 1, 0], yawRad, pitchRad, rollRad, cx, cy, focalPx);
  const perpDistPx = focalPx * Math.tan(pitchRad);

  const mode: CutPerspectiveMode = !vpY.isAtInfinity
    ? "3-point"
    : !vpX.isAtInfinity && !vpZ.isAtInfinity
      ? "2-point"
      : "1-point";

  return {
    cutWidthPx: safeW,
    cutHeightPx: safeH,
    mode,
    principalPointPx: { x: cx, y: cy },
    horizonAnchorPx: { x: cx - perpDistPx * Math.sin(rollRad), y: cy + perpDistPx * Math.cos(rollRad) },
    horizonTiltDeg: rollDeg,
    primaryVanishingPoint: vpZ,
    secondaryVanishingPoint: vpX,
    verticalVanishingPoint: vpY,
    calibratedFocalLengthPx: focalPx,
  };
}

/** 2D 컷 투시 가이드의 직교 소실점 기하학과 호라이즌으로부터 3D 카메라 화각·회전을 역산한다. */
export function cutPerspective2dToCamera3d(
  guide: CutPerspective2dGuide,
  sensorHeightMm = FULL_FRAME_SENSOR_HEIGHT_MM,
): ResolvedCamera3dLens {
  const safeW = Math.max(1, guide.cutWidthPx);
  const safeH = Math.max(1, guide.cutHeightPx);
  const aspectRatio = safeW / safeH;
  const { x: cx, y: cy } = guide.principalPointPx;
  const pZ = guide.primaryVanishingPoint.pointPx;
  const pX = guide.secondaryVanishingPoint.pointPx;
  const pY = guide.verticalVanishingPoint.pointPx;

  let focalPx = Math.max(1, guide.calibratedFocalLengthPx);
  if (pZ && pX) {
    const negDot = -((pZ.x - cx) * (pX.x - cx) + (pZ.y - cy) * (pX.y - cy));
    if (negDot > 1) focalPx = Math.sqrt(negDot);
  } else if (pZ && pY) {
    const negDot = -((pZ.x - cx) * (pY.x - cx) + (pZ.y - cy) * (pY.y - cy));
    if (negDot > 1) focalPx = Math.sqrt(negDot);
  }

  const rollDeg = clamp(guide.horizonTiltDeg, -89, 89);
  const rollRad = rollDeg * DEG_TO_RAD;
  const perpDistPx =
    (guide.horizonAnchorPx.x - cx) * -Math.sin(rollRad) + (guide.horizonAnchorPx.y - cy) * Math.cos(rollRad);
  const pitchRad = Math.atan2(perpDistPx, focalPx);
  const pitchDeg = clamp(pitchRad * RAD_TO_DEG, -84, 84);

  let yawDeg = 0;
  if (pZ) {
    const rzX = (pZ.x - cx) / focalPx;
    const rzY = -(pZ.y - cy) / focalPx;
    const r2X = rzX * Math.cos(rollRad) - rzY * Math.sin(rollRad);
    const r2Y = rzX * Math.sin(rollRad) + rzY * Math.cos(rollRad);
    const r1Z = r2Y * Math.sin(pitchRad) - Math.cos(pitchRad);
    yawDeg = clamp(Math.atan2(r2X, -r1Z) * RAD_TO_DEG, -89, 89);
  }

  const verticalFovDeg = 2 * Math.atan((0.5 * safeH) / focalPx) * RAD_TO_DEG;
  return {
    verticalFovDeg,
    horizontalFovDeg: verticalFovToHorizontalFovDeg(verticalFovDeg, aspectRatio),
    aspectRatio,
    yawDeg,
    pitchDeg,
    rollDeg,
    sensorHeightMm,
    principalPointNormalized: { x: cx / safeW, y: cy / safeH },
    focalLengthMmEquivalent35mm: verticalFovDegToFocalLengthMm(verticalFovDeg, sensorHeightMm),
    focalLengthPx: focalPx,
  };
}

/** 출발·도착 워크스페이스 간 에셋을 변환하고 색차·해일로·화각 왕복 오차를 검증해 반환한다. */
export function transcodeWorkspaceAsset(
  sourceWorkspace: StudioWorkspaceKind,
  targetWorkspace: StudioWorkspaceKind,
  payload: WorkspaceAssetPayload,
): WorkspaceAssetTranscodeResult {
  if (payload.kind === "character-palette-rig") {
    const harmonized = harmonizeCharacterPaletteWithKeyLight(payload.slots, payload.keyLightRig);
    const maxErr = harmonized.reduce((acc, item) => Math.max(acc, item.roundtripMaxChannelError), 0);
    return {
      assetId: payload.assetId,
      sourceWorkspace,
      targetWorkspace,
      payloadKind: payload.kind,
      harmonizedPalette: harmonized,
      maxColorRoundtripError: maxErr,
      haloContaminationRms: 0,
      cameraFovRoundtripErrorDeg: 0,
      losslessVerified: maxErr < 1e-5,
      summaryKo: `${sourceWorkspace} → ${targetWorkspace} 캐릭터 팔레트 ${harmonized.length}슬롯 정합 완료`,
    };
  }

  if (payload.kind === "brush-stamp") {
    const normalized = normalizeBrushStampTexture(payload.texture, payload.normalizeOptions);
    return {
      assetId: payload.assetId,
      sourceWorkspace,
      targetWorkspace,
      payloadKind: payload.kind,
      normalizedBrush: normalized,
      maxColorRoundtripError: 0,
      haloContaminationRms: normalized.haloContaminationRms,
      cameraFovRoundtripErrorDeg: 0,
      losslessVerified: normalized.haloContaminationRms < 0.02,
      summaryKo: `${sourceWorkspace} → ${targetWorkspace} 브러시 ${normalized.width}×${normalized.height} 정규화 완료`,
    };
  }

  const baseCam: Camera3dLensSpec =
    payload.camera3d ??
    (payload.perspective2d
      ? cutPerspective2dToCamera3d(payload.perspective2d)
      : { verticalFovDeg: 45, aspectRatio: payload.cutWidthPx / Math.max(1, payload.cutHeightPx), yawDeg: 0, pitchDeg: 0, rollDeg: 0 });
  const convertedPerspective2d =
    payload.perspective2d ?? camera3dToCutPerspective2d(baseCam, payload.cutWidthPx, payload.cutHeightPx);
  const convertedCamera3d = cutPerspective2dToCamera3d(convertedPerspective2d);
  const rtCam = cutPerspective2dToCamera3d(
    camera3dToCutPerspective2d(convertedCamera3d, payload.cutWidthPx, payload.cutHeightPx),
  );
  const cameraFovRoundtripErrorDeg = Math.max(
    Math.abs(rtCam.verticalFovDeg - convertedCamera3d.verticalFovDeg),
    Math.abs(rtCam.yawDeg - convertedCamera3d.yawDeg),
    Math.abs(rtCam.pitchDeg - convertedCamera3d.pitchDeg),
    Math.abs(rtCam.rollDeg - convertedCamera3d.rollDeg),
  );

  return {
    assetId: payload.assetId,
    sourceWorkspace,
    targetWorkspace,
    payloadKind: payload.kind,
    convertedPerspective2d,
    convertedCamera3d,
    maxColorRoundtripError: 0,
    haloContaminationRms: 0,
    cameraFovRoundtripErrorDeg,
    losslessVerified: cameraFovRoundtripErrorDeg < 1e-4,
    summaryKo: `${sourceWorkspace} → ${targetWorkspace} ${convertedPerspective2d.mode} 투시·카메라 정합 완료`,
  };
}
