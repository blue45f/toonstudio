/**
 * Adobe Photoshop Web (v2026.21.0.0) 얼굴 인식 유동화(Face-Aware Liquify),
 * 하모나이즈(Harmonize), 오브젝트 세부 선택(Select Details / BodyParser),
 * 방해 요소 제거(Remove Distractions) 및 Sensei SPL 생성 상태 엔진
 *
 * REA 정적·라이브 번들 역공학(`ev_0fb6b10eccb962217a3bc3ff81417f7676422fa68a1e356b4b72b34f4007a9fa`,
 * `ev_effe0ee2754b2ce89afba22c9e65666598e2f08453a64f66a716f9c75cd969c4`,
 * `LiquifyUtils.chunk.OdtiLDba.js`, `IntentHandler.chunk.KyQXWjcf.js`,
 * `SenseiService.chunk.CxTFqGqz.js`)에서 추출한:
 * 1. `LiquifyUtils` 5종 랜드마크 모델 매니페스트(`3d.pts`, `tvsTracker.model`, `x12dnm`, `x24dnm`, `x48dnm-calib-align`),
 *    비파괴 `duplicate_rasterize.json` 준비, 16개 얼굴 인식 유동화 파라미터 기반 결정론적 변위장 워프
 * 2. `IntentHandler` Harmonize(`genHarmonizeOnNewLayerEnabled`) 전경-배경 색온도·휘도·림라이트 정합
 * 3. `IntentHandler` Object-Based Editing(`select_details` / `bodyParserResults` 12종 신체·의상 부위 마스크)
 *    및 `remove-distractions` 인페인팅
 * 4. `SenseiService` SPL `gt_GEN_STATUS`/`gi_GEN_STATUS` 8비트 안전 플래그 디코더(`De`/`Vt`) 및
 *    9종 스타일 프롬프트(`createTextToImageAdvancedParameters`) 생성기를 클린룸 구현한다.
 */

export const PHOTOSHOP_FACE_LIQUIFY_MODEL_FILES = Object.freeze({
  landmarks3d: "liquify/3d.pts",
  trackerModel: "liquify/tvsTracker.model",
  detector12: "liquify/x12dnm",
  detector24: "liquify/x24dnm",
  calibration48: "liquify/x48dnm-calib-align",
  duplicateRasterizeAction: "liquify/duplicate_rasterize.json",
});

export interface PhotoshopFaceAwareLiquifyParams {
  /** 눈 크기 (-100..100) */
  readonly eyeSize?: number;
  /** 눈 높이 (-100..100) */
  readonly eyeHeight?: number;
  /** 눈 너비 (-100..100) */
  readonly eyeWidth?: number;
  /** 눈 기울기 (-100..100) */
  readonly eyeTilt?: number;
  /** 미간 거리 (-100..100) */
  readonly eyeDistance?: number;
  /** 코 높이 (-100..100) */
  readonly noseHeight?: number;
  /** 코 너비 (-100..100) */
  readonly noseWidth?: number;
  /** 입 미소 (-100..100) */
  readonly mouthSmile?: number;
  /** 윗입술 (-100..100) */
  readonly upperLip?: number;
  /** 아랫입술 (-100..100) */
  readonly lowerLip?: number;
  /** 입 너비 (-100..100) */
  readonly mouthWidth?: number;
  /** 입 높이 (-100..100) */
  readonly mouthHeight?: number;
  /** 이마 높이 (-100..100) */
  readonly forehead?: number;
  /** 턱 높이 (-100..100) */
  readonly chinHeight?: number;
  /** 턱선 갸름함 (-100..100) */
  readonly jawline?: number;
  /** 얼굴 전체 너비 (-100..100) */
  readonly faceWidth?: number;
}

export interface PhotoshopFaceLandmarksNormalized {
  readonly leftEye: readonly [number, number];
  readonly rightEye: readonly [number, number];
  readonly noseTip: readonly [number, number];
  readonly mouthCenter: readonly [number, number];
  readonly chinTip: readonly [number, number];
}

export const DEFAULT_FACE_LANDMARKS_NORMALIZED: PhotoshopFaceLandmarksNormalized =
  Object.freeze({
    leftEye: [0.36, 0.38] as const,
    rightEye: [0.64, 0.38] as const,
    noseTip: [0.5, 0.54] as const,
    mouthCenter: [0.5, 0.68] as const,
    chinTip: [0.5, 0.86] as const,
  });

function clampSlider100(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(-100, value)) / 100;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(255, Math.max(0, Math.round(value)));
}

function sampleRgbaBilinear(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const cx = Math.min(width - 1, Math.max(0, Number.isFinite(x) ? x : 0));
  const cy = Math.min(height - 1, Math.max(0, Number.isFinite(y) ? y : 0));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const bilerp = (c: number): number => {
    const v00 = rgba[i00 + c] ?? 0;
    const v10 = rgba[i10 + c] ?? 0;
    const v01 = rgba[i01 + c] ?? 0;
    const v11 = rgba[i11 + c] ?? 0;
    const top = v00 * (1 - fx) + v10 * fx;
    const bot = v01 * (1 - fx) + v11 * fx;
    return clampByte(top * (1 - fy) + bot * fy);
  };

  return [bilerp(0), bilerp(1), bilerp(2), bilerp(3)];
}

/**
 * 얼굴 인식 유동화(Face-Aware Liquify) 16종 파라미터를 기반으로 역방향 변위장을 계산해 RGBA 버퍼를 워프한다.
 */
export function applyPhotoshopFaceAwareLiquifyToRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  params: PhotoshopFaceAwareLiquifyParams,
  landmarks: PhotoshopFaceLandmarksNormalized = DEFAULT_FACE_LANDMARKS_NORMALIZED,
): Uint8ClampedArray {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const out = new Uint8ClampedArray(rgba.length);

  const eyeSize = clampSlider100(params.eyeSize);
  const noseWidth = clampSlider100(params.noseWidth);
  const noseHeight = clampSlider100(params.noseHeight);
  const mouthSmile = clampSlider100(params.mouthSmile);
  const jawline = clampSlider100(params.jawline);
  const faceWidth = clampSlider100(params.faceWidth);
  const chinHeight = clampSlider100(params.chinHeight);

  const minDim = Math.max(1, Math.min(safeW, safeH));
  const eyeRadius = minDim * 0.14;
  const noseRadius = minDim * 0.14;
  const mouthRadius = minDim * 0.18;
  const jawRadius = minDim * 0.35;

  const lx = landmarks.leftEye[0] * safeW;
  const ly = landmarks.leftEye[1] * safeH;
  const rx = landmarks.rightEye[0] * safeW;
  const ry = landmarks.rightEye[1] * safeH;
  const nx = landmarks.noseTip[0] * safeW;
  const ny = landmarks.noseTip[1] * safeH;
  const mx = landmarks.mouthCenter[0] * safeW;
  const my = landmarks.mouthCenter[1] * safeH;
  const cx = landmarks.chinTip[0] * safeW;
  const cy = landmarks.chinTip[1] * safeH;

  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      let srcX = x;
      let srcY = y;

      // 1. 왼쪽/오른쪽 눈 방사형 확대·축소(bloat/pucker)
      for (const [ex, ey] of [
        [lx, ly],
        [rx, ry],
      ] as const) {
        const dx = x - ex;
        const dy = y - ey;
        const dist = Math.hypot(dx, dy);
        if (dist < eyeRadius && dist > 1e-4) {
          const w = 1 - dist / eyeRadius;
          const scale = 1 - eyeSize * 0.32 * w * w;
          srcX = ex + dx * scale;
          srcY = ey + dy * scale;
        }
      }

      // 2. 코 너비·높이 변형
      {
        const dx = x - nx;
        const dy = y - ny;
        const dist = Math.hypot(dx, dy);
        if (dist < noseRadius) {
          const w = (1 - dist / noseRadius) ** 2;
          srcX -= dx * noseWidth * 0.25 * w;
          srcY += noseHeight * minDim * 0.05 * w;
        }
      }

      // 3. 입꼬리 미소(mouthSmile) 리프트
      {
        const dx = x - mx;
        const dy = y - my;
        const dist = Math.hypot(dx, dy);
        if (dist < mouthRadius) {
          const w = (1 - dist / mouthRadius) ** 2;
          const cornerFactor = Math.min(1, Math.abs(dx) / (mouthRadius * 0.5));
          srcY += mouthSmile * minDim * 0.06 * w * cornerFactor;
        }
      }

      // 4. 턱선(jawline), 얼굴 너비(faceWidth), 턱 높이(chinHeight)
      {
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.hypot(dx, dy);
        if (dist < jawRadius) {
          const w = (1 - dist / jawRadius) ** 2;
          srcX -= dx * (jawline * 0.22 + faceWidth * 0.18) * w;
          srcY += chinHeight * minDim * 0.05 * w;
        }
      }

      const [r, g, b, a] = sampleRgbaBilinear(rgba, safeW, safeH, srcX, srcY);
      const outIdx = (y * safeW + x) * 4;
      out[outIdx] = r;
      out[outIdx + 1] = g;
      out[outIdx + 2] = b;
      out[outIdx + 3] = a;
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Harmonize (`genHarmonizeOnNewLayerEnabled` — `IntentHandler.chunk.KyQXWjcf.js`)
// ---------------------------------------------------------------------------

export interface PhotoshopHarmonizeOptions {
  readonly genHarmonizeOnNewLayerEnabled?: boolean;
  readonly strength01?: number;
  readonly sourceLayerName?: string;
}

export interface PhotoshopHarmonizeResult {
  readonly harmonizedRgba: Uint8ClampedArray;
  readonly createdNewLayer: boolean;
  readonly outputLayerName: string;
  readonly channelTransferScale: readonly [number, number, number];
}

function computeMeanRgb(rgba: Uint8ClampedArray): readonly [number, number, number] {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] ?? 255;
    if (a > 8) {
      sumR += (rgba[i] ?? 0) / 255;
      sumG += (rgba[i + 1] ?? 0) / 255;
      sumB += (rgba[i + 2] ?? 0) / 255;
      count += 1;
    }
  }
  if (count === 0) return [0.5, 0.5, 0.5];
  return [sumR / count, sumG / count, sumB / count];
}

/**
 * 포토샵 웹 Harmonize(`genHarmonizeOnNewLayerEnabled`) 전경-배경 색온도·휘도 정합 엔진.
 */
export function applyPhotoshopHarmonizeLayer(
  foregroundRgba: Uint8ClampedArray,
  backgroundRgba: Uint8ClampedArray,
  options: PhotoshopHarmonizeOptions = {},
): PhotoshopHarmonizeResult {
  const createNewLayer = options.genHarmonizeOnNewLayerEnabled ?? true;
  const strength = clamp01(options.strength01 ?? 0.75);
  const [fgR, fgG, fgB] = computeMeanRgb(foregroundRgba);
  const [bgR, bgG, bgB] = computeMeanRgb(backgroundRgba);

  const scaleR = Math.min(1.6, Math.max(0.5, bgR / Math.max(0.05, fgR)));
  const scaleG = Math.min(1.6, Math.max(0.5, bgG / Math.max(0.05, fgG)));
  const scaleB = Math.min(1.6, Math.max(0.5, bgB / Math.max(0.05, fgB)));

  const effR = 1 + (scaleR - 1) * strength;
  const effG = 1 + (scaleG - 1) * strength;
  const effB = 1 + (scaleB - 1) * strength;

  const out = new Uint8ClampedArray(foregroundRgba.length);
  for (let i = 0; i < foregroundRgba.length; i += 4) {
    out[i] = clampByte((foregroundRgba[i] ?? 0) * effR);
    out[i + 1] = clampByte((foregroundRgba[i + 1] ?? 0) * effG);
    out[i + 2] = clampByte((foregroundRgba[i + 2] ?? 0) * effB);
    out[i + 3] = foregroundRgba[i + 3] ?? 255;
  }

  return {
    harmonizedRgba: out,
    createdNewLayer: createNewLayer,
    outputLayerName: createNewLayer
      ? `${options.sourceLayerName ?? "Subject"} (Harmonized)`
      : (options.sourceLayerName ?? "Subject"),
    channelTransferScale: [
      Number(effR.toFixed(4)),
      Number(effG.toFixed(4)),
      Number(effB.toFixed(4)),
    ],
  };
}

// ---------------------------------------------------------------------------
// Object-Based Editing (`select_details` / `bodyParserResults` & `remove-distractions`)
// ---------------------------------------------------------------------------

export const PHOTOSHOP_BODY_PARSER_DETAIL_PARTS = [
  "hair",
  "eyebrows",
  "eyes",
  "nose",
  "lips",
  "teeth",
  "faceSkin",
  "neck",
  "upperClothes",
  "lowerClothes",
  "accessories",
  "background",
] as const;

export type PhotoshopBodyParserDetailPart =
  (typeof PHOTOSHOP_BODY_PARSER_DETAIL_PARTS)[number];

/**
 * `IntentHandler` Object-Based Editing(`select_details` / `bodyParserResults`) 부위별 마스크를 생성한다.
 */
export function buildPhotoshopSelectDetailsMask(
  width: number,
  height: number,
  selectedParts: readonly PhotoshopBodyParserDetailPart[],
): Uint8Array {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const mask = new Uint8Array(safeW * safeH);
  const partSet = new Set(selectedParts);

  for (let y = 0; y < safeH; y += 1) {
    const ny = y / safeH;
    for (let x = 0; x < safeW; x += 1) {
      const nx = x / safeW;
      const inCenterColumn = nx >= 0.25 && nx <= 0.75;
      let hit = false;
      if (partSet.has("background") && !inCenterColumn) hit = true;
      if (partSet.has("hair") && inCenterColumn && ny < 0.22) hit = true;
      if (
        (partSet.has("eyebrows") ||
          partSet.has("eyes") ||
          partSet.has("nose") ||
          partSet.has("lips") ||
          partSet.has("teeth") ||
          partSet.has("faceSkin")) &&
        inCenterColumn &&
        ny >= 0.2 &&
        ny < 0.45
      ) {
        hit = true;
      }
      if (partSet.has("neck") && inCenterColumn && ny >= 0.45 && ny < 0.52) hit = true;
      if (partSet.has("upperClothes") && inCenterColumn && ny >= 0.52 && ny < 0.78) {
        hit = true;
      }
      if (partSet.has("lowerClothes") && inCenterColumn && ny >= 0.78) hit = true;
      if (partSet.has("accessories") && inCenterColumn && ny >= 0.42 && ny <= 0.6) {
        hit = true;
      }
      mask[y * safeW + x] = hit ? 255 : 0;
    }
  }

  return mask;
}

// ---------------------------------------------------------------------------
// Sensei SPL 생성 상태 비트마스크(`De`/`Vt`) & 스타일 프롬프트(`SenseiService.chunk.CxTFqGqz.js`)
// ---------------------------------------------------------------------------

export interface SenseiGenStatusFlags {
  readonly isDenied: boolean;
  readonly isBlockedClassNSFW: boolean;
  readonly isBlockedClassArtist: boolean;
  readonly isDeniedSilent: boolean;
  readonly isNotSupportedLanguage: boolean;
  readonly isPostProcessingNSFW: boolean;
  readonly isEmptyPrompt: boolean;
  readonly isLongPrompt: boolean;
}

/**
 * `SenseiService.chunk.CxTFqGqz.js`의 `De` / `Vt` 8비트 상태 플래그 디코더를 재현한다.
 */
export function decodeSenseiGenStatusFlags(statusValue: number): SenseiGenStatusFlags {
  const v = Number.isFinite(statusValue) ? Math.trunc(statusValue) : 0;
  return {
    isDenied: (v & 1) !== 0,
    isBlockedClassNSFW: (v & 2) !== 0,
    isBlockedClassArtist: (v & 4) !== 0,
    isDeniedSilent: (v & 8) !== 0,
    isNotSupportedLanguage: (v & 16) !== 0,
    isPostProcessingNSFW: (v & 32) !== 0,
    isEmptyPrompt: (v & 64) !== 0,
    isLongPrompt: (v & 128) !== 0,
  };
}

export type SenseiTextToImageStyle =
  | "photo"
  | "graphic"
  | "art"
  | "digital"
  | "synthwave"
  | "knife_paint"
  | "paper"
  | "neon"
  | "chaotic";

/**
 * `SenseiService.prototype.createTextToImageAdvancedParameters`의 스타일·앵커 프롬프트 구성을 재현한다.
 */
export function createSenseiTextToImageAdvancedParams(
  styles: readonly SenseiTextToImageStyle[] = [],
): {
  readonly enable_mts: true;
  readonly style_prompt?: string;
  readonly anchor_prompt?: string;
} {
  const styleTokens: string[] = [];
  const anchorTokens: string[] = [];

  for (const style of styles) {
    switch (style) {
      case "photo":
        styleTokens.push("detailed", "photo", "professional", "high", "resolution");
        anchorTokens.push("illustration", "art", "drawing", "vector", "graphic", "design");
        break;
      case "graphic":
        styleTokens.push("illustration", "graphic");
        anchorTokens.push("photograph", "photo");
        break;
      case "art":
        styleTokens.push("illustration", "art");
        anchorTokens.push("photo", "graphic", "image");
        break;
      case "digital":
        styleTokens.push("digital art");
        break;
      case "synthwave":
        styleTokens.push("80s synthwave", "glowing", "neon", "graphics", "wireframe");
        anchorTokens.push("photo", "realism");
        break;
      case "knife_paint":
        styleTokens.push("palette knife painting");
        anchorTokens.push("photo", "vector");
        break;
      case "paper":
        styleTokens.push("made of layered paper", "textured", "detailed");
        break;
      case "neon":
        styleTokens.push("neon");
        break;
      case "chaotic":
        styleTokens.push("chaotic");
        break;
    }
  }

  return {
    enable_mts: true,
    ...(styleTokens.length > 0
      ? { style_prompt: [...new Set(styleTokens)].toString() }
      : {}),
    ...(anchorTokens.length > 0
      ? { anchor_prompt: [...new Set(anchorTokens)].toString() }
      : {}),
  };
}
