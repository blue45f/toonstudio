/**
 * Ghidra 검증 CSP 먼지 제거(`PIDust` / `Remove dust`) 및 먼지 선택 마스크 엔진.
 *
 * 8-연결(8-connected) 플러드필 컴포넌트 분석을 수행하여 다음 두 조건을 동시에 만족하는
 * 고립 성분만 먼지(dust)로 판정한다:
 * 1) 외접 바운딩 박스의 가로·세로 크기가 **모두** `dustSize` 이하 (`bboxWidth <= dustSize && bboxHeight <= dustSize`)
 * 2) 대상 영역 바깥으로 확장한 `(dustSize + 1)` 패딩 외곽 경계 밖으로 이어지지 않음
 *
 * 지원 모드 4종:
 * - `"remove-from-transparency"`: 투명 배경 위의 작은 불투명 티끌 제거
 * - `"remove-from-white"`: 흰색 배경 위의 작은 유색·먹 티끌을 흰색으로 제거
 * - `"fill-gaps-surrounding"`: 작은 투명 구멍을 1px 외곽 둘레 최빈(majority) 색상 히스토그램으로 메움
 * - `"fill-gaps-foreground"`: 작은 투명 구멍을 지정 전경색으로 메움
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_15e228e28971596b30e7ed81ed1948b9b94a4f9f1077f50da55441fb336580be
 * - evidence_id: ev_4f970b12670bb3db0bd75cc35c039d7a757606a7655565c3acfe41c7a8741e42
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 */

import type { StudioImageDataLike } from "../studio-filters";

export const STUDIO_DUST_REMOVAL_MODES = [
  "remove-from-transparency",
  "remove-from-white",
  "fill-gaps-surrounding",
  "fill-gaps-foreground",
] as const;

export type DustRemovalMode = (typeof STUDIO_DUST_REMOVAL_MODES)[number];

export const STUDIO_DUST_REMOVAL_MODE_LABELS: Readonly<Record<DustRemovalMode, string>> =
  Object.freeze({
    "remove-from-transparency": "투명 부분에서 먼지 제거",
    "remove-from-white": "흰색 배경에서 먼지 제거",
    "fill-gaps-surrounding": "주변 색으로 빈틈 메우기",
    "fill-gaps-foreground": "전경색으로 빈틈 메우기",
  });

export interface DustRoiRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DustRemovalOptions {
  /** 먼지 판정 최대 외접 폭·높이 (1..64px, 기본 3). */
  readonly dustSize?: number;
  /** 먼지 제거 동작 모드 (기본 `"remove-from-transparency"`). */
  readonly mode?: DustRemovalMode;
  /** 투명 픽셀 판정 알파 상한 (0..254, 기본 0 -> alpha === 0만 완전 투명). */
  readonly alphaThreshold?: number;
  /** 흰색 배경 판정 채널 허용 오차 (0..128, 기본 24). */
  readonly whiteTolerance?: number;
  /** `"fill-gaps-foreground"` 모드에서 채울 전경색 (#rrggbb, 기본 `"#000000"`). */
  readonly foregroundColor?: string;
  /** 선택 영역 ROI 사각형. 지정 시 `(dustSize + 1)` 외곽 패딩 문맥까지 연결성을 검사한다. */
  readonly roi?: DustRoiRect | null;
}

export interface DustComponentSummary {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly bboxWidth: number;
  readonly bboxHeight: number;
  readonly pixelCount: number;
}

export interface DustMaskSelectionResult {
  readonly width: number;
  readonly height: number;
  /** 먼지로 판정된 픽셀은 `255`, 나머지는 `0`인 단일 채널 마스크. */
  readonly mask: Uint8Array;
  readonly componentCount: number;
  readonly pixelCount: number;
  readonly components: readonly DustComponentSummary[];
}

interface InternalDetectedDust {
  readonly summary: DustComponentSummary;
  readonly inRoiPixels: readonly number[];
  readonly allPixels: readonly number[];
}

const NEIGHBOR_DX = [-1, 0, 1, -1, 1, -1, 0, 1] as const;
const NEIGHBOR_DY = [-1, -1, -1, 0, 0, 1, 1, 1] as const;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function parseHexColor(hex: string | undefined): readonly [number, number, number] {
  if (typeof hex === "string") {
    const m6 = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex.trim());
    if (m6) {
      return [parseInt(m6[1]!, 16), parseInt(m6[2]!, 16), parseInt(m6[3]!, 16)];
    }
    const m3 = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(hex.trim());
    if (m3) {
      return [
        parseInt(m3[1]! + m3[1]!, 16),
        parseInt(m3[2]! + m3[2]!, 16),
        parseInt(m3[3]! + m3[3]!, 16),
      ];
    }
  }
  return [0, 0, 0];
}

function isCandidatePixel(
  data: Uint8ClampedArray,
  pixelIndex: number,
  mode: DustRemovalMode,
  alphaThreshold: number,
  whiteTolerance: number,
): boolean {
  const offset = pixelIndex * 4;
  const r = data[offset]!;
  const g = data[offset + 1]!;
  const b = data[offset + 2]!;
  const a = data[offset + 3]!;

  switch (mode) {
    case "remove-from-transparency":
      return a > alphaThreshold;
    case "remove-from-white": {
      if (a <= alphaThreshold) return false;
      const whiteFloor = 255 - whiteTolerance;
      const isWhite = r >= whiteFloor && g >= whiteFloor && b >= whiteFloor;
      return !isWhite;
    }
    case "fill-gaps-surrounding":
    case "fill-gaps-foreground":
      return a <= alphaThreshold;
  }
}

function analyzeDustComponents(
  source: StudioImageDataLike,
  options: DustRemovalOptions,
): {
  readonly dustSize: number;
  readonly mode: DustRemovalMode;
  readonly alphaThreshold: number;
  readonly whiteTolerance: number;
  readonly components: readonly InternalDetectedDust[];
} {
  const { width, height, data } = source;
  const dustSize = clampInt(options.dustSize, 1, 64, 3);
  const mode: DustRemovalMode = STUDIO_DUST_REMOVAL_MODES.includes(options.mode as DustRemovalMode)
    ? (options.mode as DustRemovalMode)
    : "remove-from-transparency";
  const alphaThreshold = clampInt(options.alphaThreshold, 0, 254, 0);
  const whiteTolerance = clampInt(options.whiteTolerance, 0, 128, 24);

  const roiX0 = options.roi ? clampInt(options.roi.x, 0, width - 1, 0) : 0;
  const roiY0 = options.roi ? clampInt(options.roi.y, 0, height - 1, 0) : 0;
  const roiX1 = options.roi
    ? clampInt(options.roi.x + options.roi.width - 1, roiX0, width - 1, width - 1)
    : width - 1;
  const roiY1 = options.roi
    ? clampInt(options.roi.y + options.roi.height - 1, roiY0, height - 1, height - 1)
    : height - 1;

  // PIDust 규약: ROI 바깥으로 (dustSize + 1) 패딩 보더까지 스캔하여 절단된 선 끝 오탐을 막는다.
  const pad = dustSize + 1;
  const padMinX = roiX0 - pad;
  const padMinY = roiY0 - pad;
  const padMaxX = roiX1 + pad;
  const padMaxY = roiY1 + pad;

  const scanX0 = Math.max(0, padMinX);
  const scanY0 = Math.max(0, padMinY);
  const scanX1 = Math.min(width - 1, padMaxX);
  const scanY1 = Math.min(height - 1, padMaxY);

  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const detected: InternalDetectedDust[] = [];

  for (let sy = roiY0; sy <= roiY1; sy += 1) {
    for (let sx = roiX0; sx <= roiX1; sx += 1) {
      const seedIdx = sy * width + sx;
      if (visited[seedIdx] !== 0) continue;
      visited[seedIdx] = 1;
      if (!isCandidatePixel(data, seedIdx, mode, alphaThreshold, whiteTolerance)) continue;

      let head = 0;
      let tail = 0;
      queue[tail] = seedIdx;
      tail += 1;

      let minX = sx;
      let maxX = sx;
      let minY = sy;
      let maxY = sy;
      let touchesPaddedOuterBorder = false;
      const allPixels: number[] = [];
      const inRoiPixels: number[] = [];

      while (head < tail) {
        const curr = queue[head]!;
        head += 1;
        allPixels.push(curr);

        const cx = curr % width;
        const cy = (curr - cx) / width;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        if (cx >= roiX0 && cx <= roiX1 && cy >= roiY0 && cy <= roiY1) {
          inRoiPixels.push(curr);
        }

        // 패딩 외곽 경계선(ROI 바깥 거리 dustSize + 1)에 도달하면 외부로 이어지는 선분이다.
        if (
          (padMinX >= 0 && cx <= padMinX) ||
          (padMaxX < width && cx >= padMaxX) ||
          (padMinY >= 0 && cy <= padMinY) ||
          (padMaxY < height && cy >= padMaxY)
        ) {
          touchesPaddedOuterBorder = true;
        }

        for (let dir = 0; dir < 8; dir += 1) {
          const nx = cx + NEIGHBOR_DX[dir]!;
          const ny = cy + NEIGHBOR_DY[dir]!;
          if (nx < scanX0 || nx > scanX1 || ny < scanY0 || ny > scanY1) continue;
          const nIdx = ny * width + nx;
          if (visited[nIdx] !== 0) continue;
          visited[nIdx] = 1;
          if (isCandidatePixel(data, nIdx, mode, alphaThreshold, whiteTolerance)) {
            queue[tail] = nIdx;
            tail += 1;
          }
        }
      }

      const bboxWidth = maxX - minX + 1;
      const bboxHeight = maxY - minY + 1;
      if (
        touchesPaddedOuterBorder ||
        bboxWidth > dustSize ||
        bboxHeight > dustSize ||
        inRoiPixels.length === 0
      ) {
        continue;
      }

      detected.push({
        summary: {
          minX,
          minY,
          maxX,
          maxY,
          bboxWidth,
          bboxHeight,
          pixelCount: inRoiPixels.length,
        },
        inRoiPixels,
        allPixels,
      });
    }
  }

  return { dustSize, mode, alphaThreshold, whiteTolerance, components: detected };
}

function resolveMajorityPerimeterColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  componentPixels: readonly number[],
  componentSet: ReadonlySet<number>,
  alphaThreshold: number,
): readonly [number, number, number, number] | null {
  const seenPerimeter = new Set<number>();
  const histogram = new Map<
    number,
    { count: number; r: number; g: number; b: number; a: number }
  >();

  for (const idx of componentPixels) {
    const cx = idx % width;
    const cy = (idx - cx) / width;
    for (let dir = 0; dir < 8; dir += 1) {
      const nx = cx + NEIGHBOR_DX[dir]!;
      const ny = cy + NEIGHBOR_DY[dir]!;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (componentSet.has(nIdx) || seenPerimeter.has(nIdx)) continue;
      seenPerimeter.add(nIdx);

      const off = nIdx * 4;
      const a = data[off + 3]!;
      if (a <= alphaThreshold) continue;
      const r = data[off]!;
      const g = data[off + 1]!;
      const b = data[off + 2]!;
      const packed = (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
      const entry = histogram.get(packed);
      if (entry) {
        entry.count += 1;
      } else {
        histogram.set(packed, { count: 1, r, g, b, a });
      }
    }
  }

  let best: { count: number; r: number; g: number; b: number; a: number } | null = null;
  for (const candidate of histogram.values()) {
    if (!best || candidate.count > best.count) {
      best = candidate;
    }
  }
  return best ? [best.r, best.g, best.b, best.a] : null;
}

/**
 * 픽셀을 수정하지 않고 `PIDust` 조건을 만족하는 먼지·빈틈 마스크(`0` 또는 `255`)와 성분 목록을 반환한다.
 */
export function selectDustMask(
  source: StudioImageDataLike,
  options: DustRemovalOptions = {},
): DustMaskSelectionResult {
  const { width, height, data } = source;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return {
      width: Math.max(0, width),
      height: Math.max(0, height),
      mask: new Uint8Array(Math.max(0, width * height)),
      componentCount: 0,
      pixelCount: 0,
      components: [],
    };
  }

  const analysis = analyzeDustComponents(source, options);
  const mask = new Uint8Array(width * height);
  const summaries: DustComponentSummary[] = [];
  let pixelCount = 0;

  for (const comp of analysis.components) {
    summaries.push(comp.summary);
    for (const pIdx of comp.inRoiPixels) {
      mask[pIdx] = 255;
      pixelCount += 1;
    }
  }

  return {
    width,
    height,
    mask,
    componentCount: summaries.length,
    pixelCount,
    components: summaries,
  };
}

/**
 * Ghidra 검증 `PIDust` 규약에 따라 먼지 제거 또는 빈틈 메우기를 수행한 새 RGBA 이미지를 반환한다.
 */
export function applyDustRemoval(
  source: StudioImageDataLike,
  options: DustRemovalOptions = {},
): StudioImageDataLike {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width, height, data: out };
  }

  const analysis = analyzeDustComponents(source, options);
  const [fgR, fgG, fgB] = parseHexColor(options.foregroundColor);

  for (const comp of analysis.components) {
    switch (analysis.mode) {
      case "remove-from-transparency":
        for (const pIdx of comp.inRoiPixels) {
          const off = pIdx * 4;
          out[off] = 0;
          out[off + 1] = 0;
          out[off + 2] = 0;
          out[off + 3] = 0;
        }
        break;
      case "remove-from-white":
        for (const pIdx of comp.inRoiPixels) {
          const off = pIdx * 4;
          out[off] = 255;
          out[off + 1] = 255;
          out[off + 2] = 255;
          out[off + 3] = 255;
        }
        break;
      case "fill-gaps-surrounding": {
        const compSet = new Set<number>(comp.allPixels);
        const majority = resolveMajorityPerimeterColor(
          data,
          width,
          height,
          comp.allPixels,
          compSet,
          analysis.alphaThreshold,
        );
        if (!majority) break;
        for (const pIdx of comp.inRoiPixels) {
          const off = pIdx * 4;
          out[off] = majority[0];
          out[off + 1] = majority[1];
          out[off + 2] = majority[2];
          out[off + 3] = majority[3];
        }
        break;
      }
      case "fill-gaps-foreground":
        for (const pIdx of comp.inRoiPixels) {
          const off = pIdx * 4;
          out[off] = fgR;
          out[off + 1] = fgG;
          out[off + 2] = fgB;
          out[off + 3] = 255;
        }
        break;
    }
  }

  return { width, height, data: out };
}
