/**
 * Studio Raster Gradient — CSP `그라데이션(Gradient, vars 195~211)`,
 * `만화 그라데이션(Manga gradient, var 497)`, `그라데이션 지우개(Gradient erase, var 541)` 순수 래스터 엔진.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 *
 * 선형(`linear`)·원형(`radial`)·타원(`elliptical`) 기하 투영, 끝단 반복(`clamp` | `repeat` | `reflect`),
 * 4×4 Bayer 순서 디더링, 선택 마스크 클리핑, 그리고 3가지 출력 모드(`normal` / `erase` / `manga-halftone`)를 제공한다.
 */

export type RasterGradientShape = "linear" | "radial" | "elliptical";
export type RasterGradientRepeatMode = "clamp" | "repeat" | "reflect";
export type RasterGradientOutputMode = "normal" | "erase" | "manga-halftone";

export type RasterRgbaTuple = readonly [red: number, green: number, blue: number, alpha: number];

export interface RasterGradientStop {
  /** 정규화 위치(0..1). */
  readonly offset: number;
  /** 각 채널 0..255 RGBA. */
  readonly color: RasterRgbaTuple;
}

export interface RasterGradientImageLike {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface RasterGradientRenderRequest {
  readonly target: RasterGradientImageLike;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly shape?: RasterGradientShape;
  /** 타원(`elliptical`) 단축/장축 비율(0.05..20). 기본 0.5. */
  readonly ellipseAspectRatio?: number;
  readonly repeatMode?: RasterGradientRepeatMode;
  readonly outputMode?: RasterGradientOutputMode;
  readonly stops: readonly RasterGradientStop[];
  /** 4×4 Bayer 순서 디더링 활성화 여부. 기본 true. */
  readonly dither?: boolean;
  /** 디더링 진폭(채널 단위, 기본 1.5). */
  readonly ditherAmplitude?: number;
  /** 선택 영역 클리핑 마스크(길이 width*height, 0..255 가중치). */
  readonly selectionMask?: Uint8Array;
  /** `manga-halftone` 모드 망점 선수(LPI). 기본 60. */
  readonly halftoneLpi?: number;
  /** `manga-halftone` 모드 기준 해상도(DPI). 기본 600. */
  readonly halftoneDpi?: number;
  /** `manga-halftone` 모드 회전 각도(도). 기본 45. */
  readonly halftoneAngleDeg?: number;
  /** `manga-halftone` 모드 망점 잉크 색상. 기본 불투명 검정 `[0, 0, 0, 255]`. */
  readonly halftoneInkColor?: RasterRgbaTuple;
}

export interface RasterGradientRenderResult {
  readonly imageData: {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
  };
  readonly affectedPixelCount: number;
}

export interface StudioRasterFreeformGradientUiState {
  readonly outputMode: RasterGradientOutputMode;
  readonly shape: RasterGradientShape;
  readonly repeatMode: RasterGradientRepeatMode;
  readonly dither: boolean;
  readonly halftoneLpi: number;
  readonly halftoneAngleDeg: number;
  readonly freeformMethod: "shepard" | "harmonic";
  readonly contourCurve: "linear" | "smoothstep" | "ease-in" | "ease-out";
}

export const DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE: Readonly<StudioRasterFreeformGradientUiState> =
  Object.freeze({
    outputMode: "normal",
    shape: "linear",
    repeatMode: "clamp",
    dither: true,
    halftoneLpi: 60,
    halftoneAngleDeg: 45,
    freeformMethod: "shepard",
    contourCurve: "smoothstep",
  });

/** 표준 4×4 Bayer 순서 디더링 행렬 (0..15). */
const BAYER_4X4: readonly number[] = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clampByte(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}

/**
 * 원시 투영 파라미터 `rawT`에 `clamp` / `repeat` / `reflect` 반복 규칙을 적용한다.
 */
export function wrapGradientParameter(rawT: number, mode: RasterGradientRepeatMode): number {
  if (!Number.isFinite(rawT)) return 0;
  if (mode === "clamp") return clamp(rawT, 0, 1);
  if (mode === "repeat") {
    const f = rawT - Math.floor(rawT);
    return f < 0 ? f + 1 : f;
  }
  // reflect: 주기 2 삼각파 0 → 1 → 0
  const period2 = ((rawT % 2) + 2) % 2;
  return period2 <= 1 ? period2 : 2 - period2;
}

function normalizeSortedStops(stops: readonly RasterGradientStop[]): RasterGradientStop[] {
  if (stops.length === 0) {
    return [
      { offset: 0, color: [0, 0, 0, 255] },
      { offset: 1, color: [0, 0, 0, 0] },
    ];
  }
  const cleaned = stops.map((s) => ({
    offset: clamp(s.offset, 0, 1),
    color: [
      clampByte(s.color[0]),
      clampByte(s.color[1]),
      clampByte(s.color[2]),
      clampByte(s.color[3]),
    ] as const,
  }));
  cleaned.sort((a, b) => a.offset - b.offset);
  if (cleaned.length === 1) {
    return [cleaned[0]!, { offset: 1, color: cleaned[0]!.color }];
  }
  return cleaned;
}

/**
 * 정렬된 스톱 목록에서 위치 `t`(0..1)의 보간 RGBA(0..255 실수)를 평가한다.
 * 반투명 스톱 간 색 번짐을 막기 위해 프리멀티플라이드 알파 공간에서 선형 보간한다.
 */
export function sampleGradientStopsAt(
  sortedStops: readonly RasterGradientStop[],
  t: number,
): readonly [number, number, number, number] {
  const u = clamp(t, 0, 1);
  const first = sortedStops[0]!;
  const last = sortedStops[sortedStops.length - 1]!;
  if (u <= first.offset) return first.color;
  if (u >= last.offset) return last.color;

  for (let i = 0; i < sortedStops.length - 1; i++) {
    const a = sortedStops[i]!;
    const b = sortedStops[i + 1]!;
    if (u <= b.offset || i === sortedStops.length - 2) {
      const span = b.offset - a.offset;
      const frac = span > 1e-9 ? clamp((u - a.offset) / span, 0, 1) : 0;
      const aAlpha = a.color[3] / 255;
      const bAlpha = b.color[3] / 255;
      const outAlpha = aAlpha + (bAlpha - aAlpha) * frac;
      if (outAlpha <= 1e-7) {
        return [
          a.color[0] + (b.color[0] - a.color[0]) * frac,
          a.color[1] + (b.color[1] - a.color[1]) * frac,
          a.color[2] + (b.color[2] - a.color[2]) * frac,
          0,
        ];
      }
      const pr = a.color[0] * aAlpha + (b.color[0] * bAlpha - a.color[0] * aAlpha) * frac;
      const pg = a.color[1] * aAlpha + (b.color[1] * bAlpha - a.color[1] * aAlpha) * frac;
      const pb = a.color[2] * aAlpha + (b.color[2] * bAlpha - a.color[2] * aAlpha) * frac;
      return [pr / outAlpha, pg / outAlpha, pb / outAlpha, outAlpha * 255];
    }
  }
  return last.color;
}

/**
 * 회전된 정방형 망점 격자에서 농도 `density`(0..1)가 픽셀 `(px, py)`를 덮는지 판정한다.
 */
export function evaluateMangaHalftoneDot(
  px: number,
  py: number,
  density: number,
  pitchPx: number,
  angleRad: number,
): boolean {
  const d = clamp(density, 0, 1);
  if (d <= 1e-4) return false;
  if (d >= 1 - 1e-4) return true;

  const safePitch = Math.max(2, pitchPx);
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const rx = (px * cosA + py * sinA) / safePitch;
  const ry = (-px * sinA + py * cosA) / safePitch;
  // 셀 중심 기준 [-0.5, 0.5) 로컬 좌표
  const ux = rx - Math.floor(rx) - 0.5;
  const uy = ry - Math.floor(ry) - 0.5;
  const distSq = ux * ux + uy * uy;
  // 셀 전체 대각선 반경 제곱 최대치 = 0.5 (ux=±0.5, uy=±0.5)
  // 저~중농도는 원형 면적(d / pi)을 따르고 고농도에서는 모서리(0.5)까지 연속 포화시킨다.
  const thresholdSq = d <= 0.75
    ? d / Math.PI
    : (0.75 / Math.PI) + ((d - 0.75) / 0.25) * (0.5 - 0.75 / Math.PI);
  return distSq <= thresholdSq;
}

/**
 * RGBA `ImageData` 사본 위에 CSP 호환 래스터 그라데이션을 렌더링한다.
 */
export function renderStudioRasterGradient(
  request: RasterGradientRenderRequest,
): RasterGradientRenderResult {
  const { target } = request;
  const w = Math.max(0, Math.floor(target.width));
  const h = Math.max(0, Math.floor(target.height));
  const total = w * h;
  const outData = new Uint8ClampedArray(target.data);
  if (w === 0 || h === 0 || target.data.length < total * 4) {
    return { imageData: { data: outData, width: w, height: h }, affectedPixelCount: 0 };
  }

  const shape = request.shape ?? "linear";
  const repeatMode = request.repeatMode ?? "clamp";
  const outputMode = request.outputMode ?? "normal";
  const sortedStops = normalizeSortedStops(request.stops);
  const useDither = request.dither ?? true;
  const ditherAmp = Math.max(0, request.ditherAmplitude ?? 1.5);
  const mask = request.selectionMask && request.selectionMask.length === total
    ? request.selectionMask
    : null;

  const vx = request.end.x - request.start.x;
  const vy = request.end.y - request.start.y;
  const spanLen = Math.hypot(vx, vy);
  const safeSpan = Math.max(1e-6, spanLen);
  const dirX = spanLen > 1e-6 ? vx / spanLen : 1;
  const dirY = spanLen > 1e-6 ? vy / spanLen : 0;
  const aspect = clamp(request.ellipseAspectRatio ?? 0.5, 0.05, 20);

  const lpi = Math.max(5, request.halftoneLpi ?? 60);
  const dpi = Math.max(72, request.halftoneDpi ?? 600);
  const pitchPx = Math.max(2, dpi / lpi);
  const angleRad = ((request.halftoneAngleDeg ?? 45) * Math.PI) / 180;
  const inkColor: RasterRgbaTuple = request.halftoneInkColor ?? [0, 0, 0, 255];

  let affectedPixelCount = 0;

  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    const bayerRow = (y & 3) * 4;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const maskWeight = mask ? mask[idx]! / 255 : 1;
      if (maskWeight <= 0) continue;

      const px = x + 0.5;
      const dx = px - request.start.x;
      const dy = py - request.start.y;

      let rawT: number;
      if (shape === "linear") {
        rawT = spanLen > 1e-6 ? (dx * dirX + dy * dirY) / safeSpan : 0;
      } else if (shape === "radial") {
        rawT = spanLen > 1e-6 ? Math.hypot(dx, dy) / safeSpan : 0;
      } else {
        // elliptical: 주축은 start→end 방향, 단축은 수직 방향을 ellipseAspectRatio로 스케일링
        const major = dx * dirX + dy * dirY;
        const minor = (-dx * dirY + dy * dirX) / aspect;
        rawT = spanLen > 1e-6 ? Math.hypot(major, minor) / safeSpan : 0;
      }

      const bayerNoise = useDither
        ? ((BAYER_4X4[bayerRow + (x & 3)]! + 0.5) / 16 - 0.5)
        : 0;
      const t = wrapGradientParameter(
        rawT + (useDither && safeSpan > 1 ? (bayerNoise * ditherAmp) / safeSpan : 0),
        repeatMode,
      );
      const [sr, sg, sb, sa] = sampleGradientStopsAt(sortedStops, t);
      const off = idx * 4;

      if (outputMode === "erase") {
        // 그라데이션 지우개: RGB 채널은 원본 그대로 보존하고 알파만 `1 - opacity(t)` 비율로 감쇠
        const eraseFactor = clamp((sa / 255) * maskWeight, 0, 1);
        if (eraseFactor <= 0) continue;
        const prevA = outData[off + 3]!;
        const nextA = clampByte(prevA * (1 - eraseFactor));
        if (nextA !== prevA) {
          outData[off + 3] = nextA;
          affectedPixelCount++;
        }
        continue;
      }

      if (outputMode === "manga-halftone") {
        // 만화 망점 그라데이션: 불투명도와 명도로부터 잉크 농도를 계산해 회전 망점 셀을 찍는다.
        const lum01 = (0.2126 * sr + 0.7152 * sg + 0.0722 * sb) / 255;
        const density = clamp((sa / 255) * (1 - lum01 * 0.85 + 0.85 * (sa / 255 > 0 ? 1 - lum01 : 0)), 0, 1);
        const effDensity = sa > 0 ? clamp((sa / 255) * Math.max(1 - lum01, sa / 255), 0, 1) : 0;
        const dotOn = evaluateMangaHalftoneDot(px, py, Math.max(density, effDensity), pitchPx, angleRad);
        if (!dotOn) continue;

        const srcA = (inkColor[3] / 255) * maskWeight;
        const dstA = outData[off + 3]! / 255;
        const outA = srcA + dstA * (1 - srcA);
        if (outA > 1e-6) {
          outData[off] = clampByte((inkColor[0] * srcA + outData[off]! * dstA * (1 - srcA)) / outA + bayerNoise * 0);
          outData[off + 1] = clampByte((inkColor[1] * srcA + outData[off + 1]! * dstA * (1 - srcA)) / outA);
          outData[off + 2] = clampByte((inkColor[2] * srcA + outData[off + 2]! * dstA * (1 - srcA)) / outA);
          outData[off + 3] = clampByte(outA * 255);
          affectedPixelCount++;
        }
        continue;
      }

      // normal 모드: Porter-Duff source-over + 4×4 Bayer 미세 디더링
      const srcA = clamp((sa / 255) * maskWeight, 0, 1);
      if (srcA <= 0) continue;
      const dstA = outData[off + 3]! / 255;
      const outA = srcA + dstA * (1 - srcA);
      if (outA > 1e-6) {
        const ditherChannel = bayerNoise * ditherAmp;
        outData[off] = clampByte((sr * srcA + outData[off]! * dstA * (1 - srcA)) / outA + ditherChannel);
        outData[off + 1] = clampByte((sg * srcA + outData[off + 1]! * dstA * (1 - srcA)) / outA + ditherChannel);
        outData[off + 2] = clampByte((sb * srcA + outData[off + 2]! * dstA * (1 - srcA)) / outA + ditherChannel);
        outData[off + 3] = clampByte(outA * 255);
        affectedPixelCount++;
      }
    }
  }

  return {
    imageData: { data: outData, width: w, height: h },
    affectedPixelCount,
  };
}
