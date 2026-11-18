/**
 * CSP 레이어 속성(Layer Property) 비파괴 표현색·레이어 컬러·수채 경계 평가 엔진.
 *
 * Clip Studio Paint의 `layerpropsetcolortype`(컬러/그레이/모노크롬 표현색과 이미지·알파 이중 임계값),
 * `layerpropuselayercolor`(밑그림 파란선 등 주색·보조색 2색 휘도 리맵),
 * 그리고 수채 경계(`Watercolor edge`, 외곽 모세관 안료 응집 어둡게 하기)를
 * 원본 픽셀을 훼손하지 않는 순수 결정론적 RGBA 평가기로 구현한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import type { StudioImageDataLike } from "../studio-filters";

export const STUDIO_LAYER_EXPRESSION_MODES = [
  "color",
  "gray",
  "monochrome",
] as const;

export type StudioLayerExpressionMode =
  (typeof STUDIO_LAYER_EXPRESSION_MODES)[number];

export const STUDIO_LAYER_MONOCHROME_SUB_MODES = [
  "black-and-white",
  "black-only",
  "white-only",
] as const;

export type StudioLayerMonochromeSubMode =
  (typeof STUDIO_LAYER_MONOCHROME_SUB_MODES)[number];

export const STUDIO_LAYER_EXPRESSION_MODE_LABELS: Readonly<
  Record<StudioLayerExpressionMode, string>
> = Object.freeze({
  color: "컬러",
  gray: "그레이",
  monochrome: "모노크롬",
});

export const STUDIO_LAYER_EXPRESSION_MODE_BADGES: Readonly<
  Record<StudioLayerExpressionMode, string>
> = Object.freeze({
  color: "컬러",
  gray: "그레이",
  monochrome: "모노",
});

export interface StudioLayerColorTintSettings {
  readonly enabled: boolean;
  /** 어두운 먹/선(휘도 0)에 대응하는 주색 (#rrggbb). 밑그림용 기본값은 파란선. */
  readonly mainColor: string;
  /** 밝은 종이/하이라이트(휘도 1)에 대응하는 보조색 (#rrggbb). 기본값은 흰색. */
  readonly subColor: string;
}

export interface StudioLayerWatercolorEdgeSettings {
  readonly enabled: boolean;
  /** 실루엣 경계에서 안쪽으로 안료가 번지는 폭 (1..20px). */
  readonly rangePx: number;
  /** 수채 경계 적용 불투명도 (0..100%). */
  readonly opacity: number;
  /** 모세관 테두리 어두운 정도 (0..100%). */
  readonly darkness: number;
  /** 안료 테두리 부드러움 반경 (0..10px). */
  readonly blurPx: number;
}

export interface StudioLayerExpressionColorSettings {
  readonly expressionMode: StudioLayerExpressionMode;
  /** 모노크롬 흑/백 판정 휘도 임계값 (0..255). */
  readonly imageThreshold: number;
  /** 모노크롬 불투명/투명 이진화 알파 임계값 (0..255, 출력 알파는 항상 0 또는 255). */
  readonly alphaThreshold: number;
  /** 모노크롬 표현 시 출력 채널 구성 (흑백 모두 / 검정만 / 흰색만). */
  readonly monochromeSubMode: StudioLayerMonochromeSubMode;
  /** 레이어 컬러 (`layerpropuselayercolor`) 주색·보조색 리맵. */
  readonly layerColorTint: StudioLayerColorTintSettings;
  /** 수채 경계 (`Watercolor edge`) 외곽 안료 응집 다크닝. */
  readonly watercolorEdge: StudioLayerWatercolorEdgeSettings;
}

export const DEFAULT_STUDIO_LAYER_COLOR_TINT: StudioLayerColorTintSettings =
  Object.freeze({
    enabled: false,
    mainColor: "#2563eb",
    subColor: "#ffffff",
  });

export const DEFAULT_STUDIO_LAYER_WATERCOLOR_EDGE: StudioLayerWatercolorEdgeSettings =
  Object.freeze({
    enabled: false,
    rangePx: 4,
    opacity: 70,
    darkness: 45,
    blurPx: 2,
  });

export const DEFAULT_STUDIO_LAYER_EXPRESSION_COLOR_SETTINGS: StudioLayerExpressionColorSettings =
  Object.freeze({
    expressionMode: "color",
    imageThreshold: 128,
    alphaThreshold: 128,
    monochromeSubMode: "black-and-white",
    layerColorTint: DEFAULT_STUDIO_LAYER_COLOR_TINT,
    watercolorEdge: DEFAULT_STUDIO_LAYER_WATERCOLOR_EDGE,
  });

/** 웹툰 밑그림(러프) 레이어에서 원클릭으로 켜는 CSP식 파란선 프리셋. */
export const BLUE_LINE_ROUGH_LAYER_COLOR_PRESET: StudioLayerColorTintSettings =
  Object.freeze({
    enabled: true,
    mainColor: "#2563eb",
    subColor: "#ffffff",
  });

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  const m6 = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (m6) return `#${m6[1]!.toLowerCase()}`;
  const m3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(trimmed);
  if (m3) {
    const r = m3[1]!.toLowerCase();
    const g = m3[2]!.toLowerCase();
    const b = m3[3]!.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function parseHexRgb(hex: string): { readonly r: number; readonly g: number; readonly b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function isExpressionMode(value: unknown): value is StudioLayerExpressionMode {
  return (
    value === "color" ||
    value === "gray" ||
    value === "monochrome"
  );
}

function isMonochromeSubMode(value: unknown): value is StudioLayerMonochromeSubMode {
  return (
    value === "black-and-white" ||
    value === "black-only" ||
    value === "white-only"
  );
}

/**
 * 부분 입력이나 직렬화 설정을 안전한 완전 구조로 정규화한다.
 */
export function normalizeStudioLayerExpressionColorSettings(
  raw?: {
    readonly expressionMode?: StudioLayerExpressionMode;
    readonly imageThreshold?: number;
    readonly alphaThreshold?: number;
    readonly monochromeSubMode?: StudioLayerMonochromeSubMode;
    readonly layerColorTint?: Partial<StudioLayerColorTintSettings> | null;
    readonly watercolorEdge?: Partial<StudioLayerWatercolorEdgeSettings> | null;
  } | null,
): StudioLayerExpressionColorSettings {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawTint =
    source.layerColorTint && typeof source.layerColorTint === "object"
      ? source.layerColorTint
      : {};
  const rawEdge =
    source.watercolorEdge && typeof source.watercolorEdge === "object"
      ? source.watercolorEdge
      : {};

  return {
    expressionMode: isExpressionMode(source.expressionMode)
      ? source.expressionMode
      : DEFAULT_STUDIO_LAYER_EXPRESSION_COLOR_SETTINGS.expressionMode,
    imageThreshold: clampInt(source.imageThreshold, 0, 255, 128),
    alphaThreshold: clampInt(source.alphaThreshold, 0, 255, 128),
    monochromeSubMode: isMonochromeSubMode(source.monochromeSubMode)
      ? source.monochromeSubMode
      : "black-and-white",
    layerColorTint: {
      enabled: rawTint.enabled === true,
      mainColor: normalizeHexColor(
        rawTint.mainColor,
        DEFAULT_STUDIO_LAYER_COLOR_TINT.mainColor,
      ),
      subColor: normalizeHexColor(
        rawTint.subColor,
        DEFAULT_STUDIO_LAYER_COLOR_TINT.subColor,
      ),
    },
    watercolorEdge: {
      enabled: rawEdge.enabled === true,
      rangePx: clampInt(rawEdge.rangePx, 1, 20, DEFAULT_STUDIO_LAYER_WATERCOLOR_EDGE.rangePx),
      opacity: clampInt(rawEdge.opacity, 0, 100, DEFAULT_STUDIO_LAYER_WATERCOLOR_EDGE.opacity),
      darkness: clampInt(
        rawEdge.darkness,
        0,
        100,
        DEFAULT_STUDIO_LAYER_WATERCOLOR_EDGE.darkness,
      ),
      blurPx: clampInt(rawEdge.blurPx, 0, 10, DEFAULT_STUDIO_LAYER_WATERCOLOR_EDGE.blurPx),
    },
  };
}

/**
 * 모든 레이어 속성 효과가 꺼져 원본 RGBA를 그대로 통과시키는지 판정한다.
 */
export function isIdentityStudioLayerExpressionColorSettings(
  raw?: Parameters<typeof normalizeStudioLayerExpressionColorSettings>[0],
): boolean {
  const normalized = normalizeStudioLayerExpressionColorSettings(raw);
  const edgeActive =
    normalized.watercolorEdge.enabled &&
    normalized.watercolorEdge.opacity > 0 &&
    normalized.watercolorEdge.darkness > 0;
  return (
    normalized.expressionMode === "color" &&
    !normalized.layerColorTint.enabled &&
    !edgeActive
  );
}

/**
 * 레이어 행 스크린리더 메타데이터 및 툴팁용 한국어 상태 요약을 생성한다.
 * 기본(항등) 상태면 `null`을 반환해 일반 레이어 행 접근성 이름을 오염시키지 않는다.
 */
export function describeStudioLayerExpressionColorSummary(
  raw?: Parameters<typeof normalizeStudioLayerExpressionColorSettings>[0],
): string | null {
  if (!raw) return null;
  const normalized = normalizeStudioLayerExpressionColorSettings(raw);
  const parts: string[] = [];
  if (normalized.expressionMode !== "color") {
    parts.push(`표현색 ${STUDIO_LAYER_EXPRESSION_MODE_LABELS[normalized.expressionMode]}`);
  }
  if (normalized.layerColorTint.enabled) {
    parts.push(`레이어 컬러 ${normalized.layerColorTint.mainColor}`);
  }
  if (
    normalized.watercolorEdge.enabled &&
    normalized.watercolorEdge.opacity > 0 &&
    normalized.watercolorEdge.darkness > 0
  ) {
    parts.push("수채 경계");
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function edt1d(
  f: Float64Array,
  dt: Float64Array,
  n: number,
  v: Int32Array,
  z: Float64Array,
): void {
  let k = 0;
  v[0] = 0;
  z[0] = -1e20;
  z[1] = 1e20;
  for (let q = 1; q < n; q += 1) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k -= 1;
      if (k < 0) {
        k = 0;
        break;
      }
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = 1e20;
  }
  k = 0;
  for (let q = 0; q < n; q += 1) {
    while (z[k + 1]! < q) {
      k += 1;
    }
    const dx = q - v[k]!;
    dt[q] = dx * dx + f[v[k]!]!;
  }
}

function computeInteriorBoundaryDistance(
  alphaValues: Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const total = width * height;
  const grid = new Float64Array(total);
  const INF = 1e12;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOffset + x;
      const a = alphaValues[idx]!;
      if (a === 0) {
        grid[idx] = 0;
        continue;
      }
      // 4-이웃 중 투명(또는 현저히 낮은 알파) 픽셀과 맞닿은 외곽 테두리도 시드로 잡는다.
      const leftA = x > 0 ? alphaValues[idx - 1]! : a;
      const rightA = x + 1 < width ? alphaValues[idx + 1]! : a;
      const upA = y > 0 ? alphaValues[idx - width]! : a;
      const downA = y + 1 < height ? alphaValues[idx + width]! : a;
      const minNeighborA = Math.min(leftA, rightA, upA, downA);
      grid[idx] = minNeighborA * 2 < a ? 0 : INF;
    }
  }

  const maxDim = Math.max(width, height);
  const f = new Float64Array(maxDim);
  const dt = new Float64Array(maxDim);
  const v = new Int32Array(maxDim);
  const z = new Float64Array(maxDim + 1);

  for (let y = 0; y < height; y += 1) {
    const offset = y * width;
    for (let x = 0; x < width; x += 1) f[x] = grid[offset + x]!;
    edt1d(f, dt, width, v, z);
    for (let x = 0; x < width; x += 1) grid[offset + x] = dt[x]!;
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) f[y] = grid[y * width + x]!;
    edt1d(f, dt, height, v, z);
    for (let y = 0; y < height; y += 1) grid[y * width + x] = dt[y]!;
  }

  const distances = new Float32Array(total);
  for (let i = 0; i < total; i += 1) {
    distances[i] = Math.sqrt(Math.max(0, grid[i]!));
  }
  return distances;
}

function smoothScalarFieldBox(
  field: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  if (radius <= 0 || width <= 1 || height <= 1) return field;
  const temp = new Float32Array(field.length);
  const out = new Float32Array(field.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      for (let sx = x0; sx <= x1; sx += 1) {
        sum += field[row + sx]!;
        count += 1;
      }
      temp[row + x] = sum / count;
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let sum = 0;
      let count = 0;
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      for (let sy = y0; sy <= y1; sy += 1) {
        sum += temp[sy * width + x]!;
        count += 1;
      }
      out[y * width + x] = sum / count;
    }
  }

  return out;
}

function lumaBt709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 입력 RGBA 이미지를 변경하지 않고 CSP 레이어 속성(표현색·수채 경계·레이어 컬러)을
 * 평가한 새 `StudioImageDataLike` 버퍼를 반환한다.
 */
export function evaluateLayerExpressionColor(
  source: StudioImageDataLike,
  rawSettings?: Parameters<typeof normalizeStudioLayerExpressionColorSettings>[0],
): StudioImageDataLike {
  const { width, height, data } = source;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    data.length < width * height * 4
  ) {
    return { width, height, data: new Uint8ClampedArray(data) };
  }

  const settings = normalizeStudioLayerExpressionColorSettings(rawSettings);
  const totalPixels = width * height;
  const out = new Uint8ClampedArray(totalPixels * 4);

  if (isIdentityStudioLayerExpressionColorSettings(settings)) {
    out.set(data.subarray(0, totalPixels * 4));
    return { width, height, data: out };
  }

  // 1단계: 표현색(Expression Color: color / gray / monochrome) 평가
  const alphaSnapshot = new Uint8Array(totalPixels);
  for (let p = 0; p < totalPixels; p += 1) {
    const offset = p * 4;
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    const a = data[offset + 3]!;

    if (settings.expressionMode === "color") {
      out[offset] = r;
      out[offset + 1] = g;
      out[offset + 2] = b;
      out[offset + 3] = a;
      alphaSnapshot[p] = a;
      continue;
    }

    const luma = lumaBt709(r, g, b);
    if (settings.expressionMode === "gray") {
      const gray = Math.round(luma);
      out[offset] = gray;
      out[offset + 1] = gray;
      out[offset + 2] = gray;
      out[offset + 3] = a;
      alphaSnapshot[p] = a;
      continue;
    }

    // monochrome: 알파는 0 또는 255 이진값만 출력한다.
    if (a === 0 || a < settings.alphaThreshold) {
      out[offset] = 0;
      out[offset + 1] = 0;
      out[offset + 2] = 0;
      out[offset + 3] = 0;
      alphaSnapshot[p] = 0;
      continue;
    }

    const isBlackInk = luma <= settings.imageThreshold;
    if (settings.monochromeSubMode === "black-only") {
      if (isBlackInk) {
        out[offset] = 0;
        out[offset + 1] = 0;
        out[offset + 2] = 0;
        out[offset + 3] = 255;
        alphaSnapshot[p] = 255;
      } else {
        alphaSnapshot[p] = 0;
      }
    } else if (settings.monochromeSubMode === "white-only") {
      if (!isBlackInk) {
        out[offset] = 255;
        out[offset + 1] = 255;
        out[offset + 2] = 255;
        out[offset + 3] = 255;
        alphaSnapshot[p] = 255;
      } else {
        alphaSnapshot[p] = 0;
      }
    } else {
      const inkVal = isBlackInk ? 0 : 255;
      out[offset] = inkVal;
      out[offset + 1] = inkVal;
      out[offset + 2] = inkVal;
      out[offset + 3] = 255;
      alphaSnapshot[p] = 255;
    }
  }

  // 2단계: 수채 경계(Watercolor edge) 외곽 안료 응집 다크닝
  const edge = settings.watercolorEdge;
  if (edge.enabled && edge.opacity > 0 && edge.darkness > 0) {
    const dist = computeInteriorBoundaryDistance(alphaSnapshot, width, height);
    const rawFringe = new Float32Array(totalPixels);
    const range = Math.max(1, edge.rangePx);
    for (let p = 0; p < totalPixels; p += 1) {
      if (alphaSnapshot[p]! === 0) continue;
      const d = dist[p]!;
      if (d <= range) {
        const cosineFalloff = 0.5 * (1 + Math.cos((d / range) * Math.PI));
        rawFringe[p] = cosineFalloff;
      }
    }
    const smoothedFringe = smoothScalarFieldBox(rawFringe, width, height, edge.blurPx);
    const maxDarkenGain = (edge.opacity / 100) * (edge.darkness / 100) * 0.78;

    for (let p = 0; p < totalPixels; p += 1) {
      if (alphaSnapshot[p]! === 0) continue;
      const f = smoothedFringe[p]!;
      if (f <= 0) continue;
      const offset = p * 4;
      const scale = Math.max(0, 1 - f * maxDarkenGain);
      out[offset] = Math.round(out[offset]! * scale);
      out[offset + 1] = Math.round(out[offset + 1]! * scale);
      out[offset + 2] = Math.round(out[offset + 2]! * scale);
    }
  }

  // 3단계: 레이어 컬러(layerpropuselayercolor) 주색·보조색 2색 휘도 리맵
  if (settings.layerColorTint.enabled) {
    const mainRgb = parseHexRgb(settings.layerColorTint.mainColor);
    const subRgb = parseHexRgb(settings.layerColorTint.subColor);
    for (let p = 0; p < totalPixels; p += 1) {
      const offset = p * 4;
      const a = out[offset + 3]!;
      if (a === 0) continue;
      const t = lumaBt709(out[offset]!, out[offset + 1]!, out[offset + 2]!) / 255;
      out[offset] = Math.round(mainRgb.r + (subRgb.r - mainRgb.r) * t);
      out[offset + 1] = Math.round(mainRgb.g + (subRgb.g - mainRgb.g) * t);
      out[offset + 2] = Math.round(mainRgb.b + (subRgb.b - mainRgb.b) * t);
    }
  }

  return { width, height, data: out };
}

/**
 * 제자리(in-place) 파이프라인 어댑터. 내부적으로 `evaluateLayerExpressionColor`를 호출해 복사 반영한다.
 */
export function applyLayerExpressionColorInPlace(
  target: StudioImageDataLike,
  rawSettings?: Parameters<typeof normalizeStudioLayerExpressionColorSettings>[0],
): void {
  const evaluated = evaluateLayerExpressionColor(target, rawSettings);
  target.data.set(evaluated.data);
}
