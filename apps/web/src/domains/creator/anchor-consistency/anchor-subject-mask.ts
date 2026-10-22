/**
 * 피사체 분리 — 이미지에서 "배경이 아닌 부분"을 가볍게 가려낸다.
 *
 * 얼굴·인체를 인식하지 않는다. 가려내는 근거는 두 가지뿐이다.
 * 1. 투명 PNG 처럼 알파 채널에 투명한 곳이 충분히 있으면 알파가 있는 곳을 피사체로 본다(mode "alpha").
 * 2. 불투명 이미지는 가장자리 띠의 색이 거의 한 색(단색 배경)이면 그 색과 충분히 다른 곳을 피사체로 본다
 *    (mode "background"). 앵커 규약의 단색 배경 캡처가 이 경우다.
 * 어느 쪽도 믿을 수 없으면(배경이 복잡하거나 화면을 가득 채움) 분리하지 않고 이미지 전체를 쓴다(mode "whole-image").
 * 이때 실루엣·비율 비교는 쓰지 않는다.
 *
 * 아래 임계값은 합성 이미지로 시험해 사람이 정한 값이며 실제 작품 모음으로 검증한 값이 아니다
 * (docs/features/anchor-consistency.md "휴리스틱 임계값").
 */

import { srgbToLab, deltaE76, type LabColor } from "./anchor-color-lab";
import { AnchorFeatureError, assertAnchorRaster, type AnchorRaster } from "./anchor-raster";

export const ANCHOR_SUBJECT_THRESHOLDS = Object.freeze({
  /** 이 알파 이상이면 보이는 픽셀로 본다. */
  visibleAlpha: 128,
  /** 알파가 이 값 미만인 픽셀이 이만큼 이상이면 알파 모드로 본다. */
  translucentAlpha: 250,
  translucentShareForAlphaMode: 0.05,
  /** 배경색과 이 ΔE 보다 멀면 피사체. */
  backgroundDeltaE: 14,
  /** 가장자리 띠 픽셀이 중앙값 색과 이 ΔE 이내면 "배경과 같은 색". */
  borderDeltaE: 10,
  /** 가장자리 띠의 70% 이상이 한 색이어야 단색 배경으로 믿는다. */
  minBackgroundFlatness: 0.7,
  /** 분리 결과 면적 비율이 이 범위를 벗어나면 믿지 않는다. */
  minCoverage: 0.02,
  maxCoverage: 0.9,
  /** 알파 모드는 투명한 곳이 있으니 더 넓은 범위를 받는다. */
  alphaMinCoverage: 0.01,
  alphaMaxCoverage: 0.97,
  /** 가장자리 띠 두께(짧은 변 대비). */
  ringFraction: 0.03,
  /** 전체 면적의 이 비율보다 작은 떨어진 조각은 잡티로 보고 지운다. */
  minComponentShare: 0.0025,
});

export type AnchorSubjectMode = "alpha" | "background" | "whole-image";

/** 픽셀 단위 Lab 이미지. 분석 전체가 이 표현을 한 번만 만들어 공유한다. */
export interface AnchorLabImage {
  readonly width: number;
  readonly height: number;
  readonly lightness: Float32Array;
  readonly a: Float32Array;
  readonly b: Float32Array;
  readonly alpha: Uint8Array;
}

export function toAnchorLabImage(raster: AnchorRaster): AnchorLabImage {
  assertAnchorRaster(raster);
  const count = raster.width * raster.height;
  const lightness = new Float32Array(count);
  const a = new Float32Array(count);
  const b = new Float32Array(count);
  const alpha = new Uint8Array(count);
  const data = raster.data;
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const lab = srgbToLab(data[offset] ?? 0, data[offset + 1] ?? 0, data[offset + 2] ?? 0);
    lightness[index] = lab[0];
    a[index] = lab[1];
    b[index] = lab[2];
    alpha[index] = data[offset + 3] ?? 0;
  }
  return { width: raster.width, height: raster.height, lightness, a, b, alpha };
}

export interface AnchorSubjectMask {
  readonly mode: AnchorSubjectMode;
  /** 1 이면 피사체(whole-image 모드에서는 보이는 픽셀). 길이 width×height. */
  readonly mask: Uint8Array;
  /** mask 가 1 인 픽셀 비율. */
  readonly coverage: number;
  /** 단색 배경으로 본 색(background 모드에서만). */
  readonly backgroundLab: LabColor | null;
  /** 가장자리 띠가 한 색인 정도(0~1). 알파 모드는 투명한 가장자리 비율. */
  readonly backgroundFlatness: number;
}

function median(values: Float32Array | number[]): number {
  const sorted = Float32Array.from(values).sort();
  const middle = sorted.length >> 1;
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function majorityFilter(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          on += mask[ny * width + nx] ?? 0;
        }
      }
      out[y * width + x] = on >= 5 ? 1 : 0;
    }
  }
  return out;
}

/** 4-연결 조각 중 너무 작은 것을 지운다. */
function dropSmallComponents(mask: Uint8Array, width: number, height: number, minArea: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const members = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] !== 1 || seen[start] === 1) continue;
    let top = 0;
    let size = 0;
    stack[top++] = start;
    seen[start] = 1;
    while (top > 0) {
      const index = stack[--top] ?? 0;
      members[size++] = index;
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0 && mask[index - 1] === 1 && seen[index - 1] === 0) { seen[index - 1] = 1; stack[top++] = index - 1; }
      if (x < width - 1 && mask[index + 1] === 1 && seen[index + 1] === 0) { seen[index + 1] = 1; stack[top++] = index + 1; }
      if (y > 0 && mask[index - width] === 1 && seen[index - width] === 0) { seen[index - width] = 1; stack[top++] = index - width; }
      if (y < height - 1 && mask[index + width] === 1 && seen[index + width] === 0) { seen[index + width] = 1; stack[top++] = index + width; }
    }
    if (size >= minArea) for (let m = 0; m < size; m += 1) out[members[m] ?? 0] = 1;
  }
  return out;
}

export function countAnchorMask(mask: Uint8Array): number {
  let on = 0;
  for (let index = 0; index < mask.length; index += 1) on += mask[index] ?? 0;
  return on;
}

const countOn = countAnchorMask;

/** 4방향 이웃이 모두 피사체인 픽셀만 남긴다(경계 한 겹을 벗긴다). */
export function erodeAnchorMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (mask[index] === 1 && mask[index - 1] === 1 && mask[index + 1] === 1 && mask[index - width] === 1 && mask[index + width] === 1) {
        out[index] = 1;
      }
    }
  }
  return out;
}

/** 경계를 벗겨 낸 뒤에도 원래 면적의 이만큼 이상 남아야 색 통계에 벗긴 마스크를 쓴다(가는 부분이 많으면 원래 마스크). */
export const ANCHOR_INTERIOR_MIN_KEEP = 0.35;

/**
 * 색 통계·팔레트에 쓸 픽셀. 피사체와 배경의 경계는 두 색이 섞인 안티앨리어싱 픽셀이라 해상도에 따라 비중이 달라지고
 * 배경색이 피사체 통계로 번진다. 분리에 성공했을 때는 경계 한 겹을 벗긴 안쪽 픽셀만 쓴다.
 */
export function anchorColorMask(subject: AnchorSubjectMask, width: number, height: number): Uint8Array {
  if (subject.mode === "whole-image") return subject.mask;
  const interior = erodeAnchorMask(subject.mask, width, height);
  return countOn(interior) >= ANCHOR_INTERIOR_MIN_KEEP * countOn(subject.mask) ? interior : subject.mask;
}

function cleanMask(mask: Uint8Array, width: number, height: number): Uint8Array {
  const smoothed = majorityFilter(mask, width, height);
  const minArea = Math.max(8, Math.round(width * height * ANCHOR_SUBJECT_THRESHOLDS.minComponentShare));
  return dropSmallComponents(smoothed, width, height, minArea);
}

function visibleMask(image: AnchorLabImage): { mask: Uint8Array; visible: number } {
  const mask = new Uint8Array(image.alpha.length);
  let visible = 0;
  for (let index = 0; index < image.alpha.length; index += 1) {
    if ((image.alpha[index] ?? 0) >= ANCHOR_SUBJECT_THRESHOLDS.visibleAlpha) {
      mask[index] = 1;
      visible += 1;
    }
  }
  return { mask, visible };
}

/** 가장자리 띠의 Lab 중앙값과 그 색과 가까운 픽셀 비율을 구한다. 보이는 띠 픽셀이 없으면 null. */
function borderBackground(image: AnchorLabImage): { lab: LabColor; flatness: number } | null {
  const { width, height } = image;
  const thickness = Math.max(1, Math.round(Math.min(width, height) * ANCHOR_SUBJECT_THRESHOLDS.ringFraction));
  const indices: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const edgeRow = y < thickness || y >= height - thickness;
    for (let x = 0; x < width; x += 1) {
      if (!edgeRow && x >= thickness && x < width - thickness) continue;
      const index = y * width + x;
      if ((image.alpha[index] ?? 0) >= ANCHOR_SUBJECT_THRESHOLDS.visibleAlpha) indices.push(index);
    }
  }
  if (indices.length === 0) return null;
  const lab: LabColor = [
    median(indices.map((index) => image.lightness[index] ?? 0)),
    median(indices.map((index) => image.a[index] ?? 0)),
    median(indices.map((index) => image.b[index] ?? 0)),
  ];
  let near = 0;
  for (const index of indices) {
    const distance = deltaE76([image.lightness[index] ?? 0, image.a[index] ?? 0, image.b[index] ?? 0], lab);
    if (distance <= ANCHOR_SUBJECT_THRESHOLDS.borderDeltaE) near += 1;
  }
  return { lab, flatness: near / indices.length };
}

/**
 * 피사체를 가려낸다. 보이는 픽셀이 하나도 없으면 AnchorFeatureError("empty-image").
 * 결과 mode 가 whole-image 이면 mask 는 "보이는 픽셀"이고 실루엣 비교를 하지 않는 것이 맞다.
 */
export function separateAnchorSubject(image: AnchorLabImage): AnchorSubjectMask {
  const total = image.alpha.length;
  const everything = visibleMask(image);
  if (everything.visible === 0) throw new AnchorFeatureError("empty-image");
  const whole: AnchorSubjectMask = {
    mode: "whole-image",
    mask: everything.mask,
    coverage: everything.visible / total,
    backgroundLab: null,
    backgroundFlatness: 0,
  };

  let translucent = 0;
  for (let index = 0; index < total; index += 1) {
    if ((image.alpha[index] ?? 0) < ANCHOR_SUBJECT_THRESHOLDS.translucentAlpha) translucent += 1;
  }
  if (translucent / total >= ANCHOR_SUBJECT_THRESHOLDS.translucentShareForAlphaMode) {
    const cleaned = cleanMask(everything.mask, image.width, image.height);
    const coverage = countOn(cleaned) / total;
    if (coverage < ANCHOR_SUBJECT_THRESHOLDS.alphaMinCoverage || coverage > ANCHOR_SUBJECT_THRESHOLDS.alphaMaxCoverage) {
      return { ...whole, backgroundFlatness: 1 - everything.visible / total };
    }
    return { mode: "alpha", mask: cleaned, coverage, backgroundLab: null, backgroundFlatness: 1 - everything.visible / total };
  }

  const border = borderBackground(image);
  if (!border || border.flatness < ANCHOR_SUBJECT_THRESHOLDS.minBackgroundFlatness) {
    return { ...whole, backgroundFlatness: border?.flatness ?? 0 };
  }
  const raw = new Uint8Array(total);
  for (let index = 0; index < total; index += 1) {
    if ((image.alpha[index] ?? 0) < ANCHOR_SUBJECT_THRESHOLDS.visibleAlpha) continue;
    const distance = deltaE76([image.lightness[index] ?? 0, image.a[index] ?? 0, image.b[index] ?? 0], border.lab);
    if (distance > ANCHOR_SUBJECT_THRESHOLDS.backgroundDeltaE) raw[index] = 1;
  }
  const cleaned = cleanMask(raw, image.width, image.height);
  const coverage = countOn(cleaned) / total;
  if (coverage < ANCHOR_SUBJECT_THRESHOLDS.minCoverage || coverage > ANCHOR_SUBJECT_THRESHOLDS.maxCoverage) {
    return { ...whole, backgroundFlatness: border.flatness };
  }
  return { mode: "background", mask: cleaned, coverage, backgroundLab: border.lab, backgroundFlatness: border.flatness };
}
