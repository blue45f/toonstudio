/**
 * Ghidra 검증 CSP 선화 정리 3종 엔진:
 * 1) 휘도를 투명도로 변환 (`applyBrightnessToAlpha`: `alpha' = round(alpha * (1 - luma))`, `RGB = inkColor`)
 * 2) 선 색을 그리기색으로 변경 (`applyChangeLineColor`: 선택 마스크 지원, 알파 무손실 보존 RGB 치환)
 * 3) 선 폭 수정 (`applyAdjustLineWidth`: `thicken` 최근접 불투명 RGB 전파 / `narrow` `atLeastOnePixel`
 *    활성 시 8-연결 중심축 브리지·끝점 `isTopologicalCorePixel` 보존으로 1px 선 끊김 원천 방지)
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_15e228e28971596b30e7ed81ed1948b9b94a4f9f1077f50da55441fb336580be
 * - evidence_id: ev_4f970b12670bb3db0bd75cc35c039d7a757606a7655565c3acfe41c7a8741e42
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 */

import type { StudioImageDataLike } from "../studio-filters";

export interface BrightnessToAlphaOptions {
  /** 추출된 선 픽셀에 입힐 잉크 색상 (#rrggbb, 기본 `"#000000"`). */
  readonly inkColor?: string;
}

export interface ChangeLineColorOptions {
  /** 변경할 목표 선 색상 (#rrggbb). */
  readonly targetColor: string;
  /** 선택 영역 단일 채널 마스크 (`width * height`, 0..255). 생략 시 전체 픽셀 적용. */
  readonly selectionMask?: Uint8Array | Uint8ClampedArray | null;
  /** 색상 교체 혼합 강도 (0..1, 기본 1). */
  readonly blendStrength?: number;
}

export type AdjustLineWidthMode = "thicken" | "narrow";

export interface AdjustLineWidthOptions {
  readonly mode: AdjustLineWidthMode;
  /** 두께 조절 반경 (1..16px). */
  readonly scalePx: number;
  /** `narrow` 모드에서 1픽셀 중심선을 남겨 선이 끊기거나 소실되지 않게 보호할지 여부. */
  readonly atLeastOnePixel?: boolean;
  /** 선 픽셀 판정 최소 알파 임계값 (0..254, 기본 0 -> alpha > 0). */
  readonly alphaThreshold?: number;
}

const RING_DX = [0, 1, 1, 1, 0, -1, -1, -1] as const;
const RING_DY = [-1, -1, 0, 1, 1, 1, 0, -1] as const;

function parseHexRgb(hex: string | undefined): readonly [number, number, number] {
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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * 스캔 원고·흰 종이 배경 그림의 밝기(휘도)를 투명도로 변환한다 (`editactionbrightnesstoopacity`).
 * 수식: `alpha' = round(alpha * (1 - luma))`, `RGB = inkColor`.
 */
export function applyBrightnessToAlpha(
  source: StudioImageDataLike,
  options: BrightnessToAlphaOptions = {},
): StudioImageDataLike {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width, height, data: out };
  }

  const [inkR, inkG, inkB] = parseHexRgb(options.inkColor ?? "#000000");
  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    const r = data[off]!;
    const g = data[off + 1]!;
    const b = data[off + 2]!;
    const a = data[off + 3]!;
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const nextAlpha = Math.max(0, Math.min(255, Math.round(a * (1 - luma))));

    out[off] = inkR;
    out[off + 1] = inkG;
    out[off + 2] = inkB;
    out[off + 3] = nextAlpha;
  }

  return { width, height, data: out };
}

/**
 * 안티에일리어싱 알파를 1바이트 오차 없이 보존하면서 선의 RGB 색상만 교체한다 (`editactionchangelinecolor`).
 */
export function applyChangeLineColor(
  source: StudioImageDataLike,
  options: ChangeLineColorOptions,
): StudioImageDataLike {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width, height, data: out };
  }

  const [targetR, targetG, targetB] = parseHexRgb(options.targetColor);
  const strength =
    typeof options.blendStrength === "number" && Number.isFinite(options.blendStrength)
      ? Math.max(0, Math.min(1, options.blendStrength))
      : 1;
  const mask = options.selectionMask;
  const hasValidMask = mask != null && mask.length >= width * height;

  const total = width * height;
  for (let p = 0; p < total; p += 1) {
    const off = p * 4;
    const alpha = data[off + 3]!;
    if (alpha === 0) continue;

    const maskWeight = hasValidMask ? mask[p]! / 255 : 1;
    const t = maskWeight * strength;
    if (t <= 0) continue;

    out[off] = Math.round(data[off]! + (targetR - data[off]!) * t);
    out[off + 1] = Math.round(data[off + 1]! + (targetG - data[off + 1]!) * t);
    out[off + 2] = Math.round(data[off + 2]! + (targetB - data[off + 2]!) * t);
    out[off + 3] = alpha;
  }

  return { width, height, data: out };
}

/**
 * 8-연결 이진 전경 마스크에서 `(x, y)` 픽셀이 제거 불가능한 위상 핵심(끝점·고립점·브리지·내부점)인지 판정한다.
 * - 활성 8-이웃이 1개 이하이면 고립점/선 끝점이므로 보호(`true`)
 * - 4방향(상·하·좌·우) 중 빈 배경에 노출된 변이 없으면 내부 구멍 생성을 막기 위해 보호(`true`)
 * - 중심 픽셀을 뺀 3x3 고리의 활성 이웃들이 8-연결 기준 2개 이상의 분리 성분이면 연결 브리지이므로 보호(`true`)
 */
export function isTopologicalCorePixel(
  binaryMask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (x < 0 || x >= width || y < 0 || y >= height) return false;
  if (binaryMask[y * width + x] === 0) return false;

  const activeIndices: number[] = [];
  for (let k = 0; k < 8; k += 1) {
    const nx = x + RING_DX[k]!;
    const ny = y + RING_DY[k]!;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height && binaryMask[ny * width + nx] !== 0) {
      activeIndices.push(k);
    }
  }

  // 고립 픽셀(0) 또는 1px 선의 끝점(1)은 절대 깎지 않는다.
  if (activeIndices.length <= 1) return true;

  // 상(0), 우(2), 하(4), 좌(6) 4방향 이웃이 모두 채워져 있으면 외곽 경계가 아닌 내부 픽셀이다.
  const nUp = activeIndices.includes(0);
  const nRight = activeIndices.includes(2);
  const nDown = activeIndices.includes(4);
  const nLeft = activeIndices.includes(6);
  if (nUp && nRight && nDown && nLeft) return true;

  // 3x3 고리의 활성 이웃들이 중심 없이 단일 8-연결 성분을 이루는지 BFS로 확인한다.
  let visitedBits = 1 << 0;
  const stack: number[] = [0];
  let reached = 0;

  while (stack.length > 0) {
    const uPos = stack.pop()!;
    reached += 1;
    const uk = activeIndices[uPos]!;
    const ux = RING_DX[uk]!;
    const uy = RING_DY[uk]!;

    for (let vPos = 0; vPos < activeIndices.length; vPos += 1) {
      if ((visitedBits & (1 << vPos)) !== 0) continue;
      const vk = activeIndices[vPos]!;
      const vx = RING_DX[vk]!;
      const vy = RING_DY[vk]!;
      if (Math.abs(ux - vx) <= 1 && Math.abs(uy - vy) <= 1) {
        visitedBits |= 1 << vPos;
        stack.push(vPos);
      }
    }
  }

  return reached < activeIndices.length;
}

function applyThickenLineWidth(
  source: StudioImageDataLike,
  scalePx: number,
  alphaThreshold: number,
): StudioImageDataLike {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  const rSqMax = scalePx * scalePx;

  // 유클리드 반경 내 오프셋을 거리 오름차순으로 사전 정렬해 첫 히트가 곧 최근접 불투명 픽셀이 되게 한다.
  const offsets: Array<{ readonly dx: number; readonly dy: number; readonly dSq: number }> = [];
  for (let dy = -scalePx; dy <= scalePx; dy += 1) {
    for (let dx = -scalePx; dx <= scalePx; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const dSq = dx * dx + dy * dy;
      if (dSq <= rSqMax) offsets.push({ dx, dy, dSq });
    }
  }
  offsets.sort((a, b) => a.dSq - b.dSq || a.dy - b.dy || a.dx - b.dx);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dstOff = (y * width + x) * 4;
      const origA = data[dstOff + 3]!;
      if (origA === 255) continue;

      let nearestOff = -1;
      let maxNeighborAlpha = origA;

      for (const { dx, dy } of offsets) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue;
        const srcOff = (sy * width + sx) * 4;
        const srcA = data[srcOff + 3]!;
        if (srcA <= alphaThreshold) continue;
        if (nearestOff < 0) nearestOff = srcOff;
        if (srcA > maxNeighborAlpha) maxNeighborAlpha = srcA;
        if (maxNeighborAlpha === 255) break;
      }

      if (nearestOff >= 0) {
        if (origA <= alphaThreshold) {
          out[dstOff] = data[nearestOff]!;
          out[dstOff + 1] = data[nearestOff + 1]!;
          out[dstOff + 2] = data[nearestOff + 2]!;
        }
        out[dstOff + 3] = maxNeighborAlpha;
      }
    }
  }

  return { width, height, data: out };
}

function hasEmptyCardinalDirection(
  mask: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  dir: 0 | 1 | 2 | 3,
): boolean {
  if (dir === 0) return y === 0 || mask[(y - 1) * width + x] === 0; // 상
  if (dir === 1) return y + 1 >= height || mask[(y + 1) * width + x] === 0; // 하
  if (dir === 2) return x === 0 || mask[y * width + (x - 1)] === 0; // 좌
  return x + 1 >= width || mask[y * width + (x + 1)] === 0; // 우
}

function applyNarrowLineWidth(
  source: StudioImageDataLike,
  scalePx: number,
  atLeastOnePixel: boolean,
  alphaThreshold: number,
): StudioImageDataLike {
  const { width, height, data } = source;
  const total = width * height;
  const mask = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    mask[i] = data[i * 4 + 3]! > alphaThreshold ? 1 : 0;
  }

  for (let step = 0; step < scalePx; step += 1) {
    if (!atLeastOnePixel) {
      const snapshot = mask.slice();
      let changed = false;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (snapshot[idx] === 0) continue;
          const onBoundary =
            x === 0 ||
            x + 1 >= width ||
            y === 0 ||
            y + 1 >= height ||
            snapshot[idx - 1] === 0 ||
            snapshot[idx + 1] === 0 ||
            snapshot[idx - width] === 0 ||
            snapshot[idx + width] === 0;
          if (onBoundary) {
            mask[idx] = 0;
            changed = true;
          }
        }
      }
      if (!changed) break;
      continue;
    }

    // atLeastOnePixel === true: 상·하·좌·우 4방향 경계 후보를 수집한 뒤 라이브 마스크에서
    // 위상 핵심 픽셀(isTopologicalCorePixel) 여부를 재검증하며 한 겹씩 안전하게 깎는다.
    let passChanged = false;
    const dirs: readonly (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];
    for (const dir of dirs) {
      const candidates: number[] = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (mask[idx] === 0) continue;
          if (hasEmptyCardinalDirection(mask, width, height, x, y, dir)) {
            candidates.push(idx);
          }
        }
      }
      for (const idx of candidates) {
        const x = idx % width;
        const y = (idx - x) / width;
        if (!isTopologicalCorePixel(mask, width, height, x, y)) {
          mask[idx] = 0;
          passChanged = true;
        }
      }
    }
    if (!passChanged) break;
  }

  const out = new Uint8ClampedArray(data);
  for (let i = 0; i < total; i += 1) {
    if (mask[i] === 0 && data[i * 4 + 3]! > alphaThreshold) {
      const off = i * 4;
      out[off] = 0;
      out[off + 1] = 0;
      out[off + 2] = 0;
      out[off + 3] = 0;
    }
  }
  return { width, height, data: out };
}

/**
 * CSP `선 폭 수정`(`LineWidthCorrect.bundle`) 규약에 맞춰 선을 굵게 하거나 가늘게 조절한다.
 */
export function applyAdjustLineWidth(
  source: StudioImageDataLike,
  options: AdjustLineWidthOptions,
): StudioImageDataLike {
  const { width, height, data } = source;
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return { width, height, data: new Uint8ClampedArray(data) };
  }

  const scalePx = clampInt(options.scalePx, 1, 16, 1);
  const alphaThreshold = clampInt(options.alphaThreshold, 0, 254, 0);
  if (options.mode === "thicken") {
    return applyThickenLineWidth(source, scalePx, alphaThreshold);
  }
  return applyNarrowLineWidth(
    source,
    scalePx,
    options.atLeastOnePixel === true,
    alphaThreshold,
  );
}
