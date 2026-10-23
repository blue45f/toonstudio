/**
 * 이미지 한 장의 가벼운 특징 — 색 분포(Lab 히스토그램), 전체 주요색 팔레트, 실루엣·비율, 구조 해시(dHash).
 *
 * 입력은 `ImageData` 와 같은 모양의 RGBA 래스터다. 큰 이미지는 분석 전에 긴 변 256px 로 줄인다. 모든 계산은 이 기기 안의
 * 순수 함수이고(DOM·네트워크 없음), Worker 에서도 같은 함수를 돌린다.
 *
 * 하지 않는 것: 얼굴·신체 검출, 특징점·임베딩 추출, 사람 식별. 이 특징들로는 같은 캐릭터인지 판정할 수 없다.
 */

import { srgbToHex, labToSrgb } from "./anchor-color-lab";
import { computeAnchorColorStats, type AnchorColorStats } from "./anchor-color-stats";
import { extractAnchorPalette, type AnchorPaletteEntry } from "./anchor-palette";
import {
  ANCHOR_ANALYSIS_LIMITS,
  AnchorFeatureError,
  downscaleAnchorRaster,
  type AnchorRaster,
} from "./anchor-raster";
import { computeAnchorSilhouette, type AnchorSilhouette } from "./anchor-silhouette";
import { computeAnchorStructureHash, type AnchorHashRegion, type AnchorStructureHash } from "./anchor-structure-hash";
import { anchorColorMask, separateAnchorSubject, toAnchorLabImage, type AnchorSubjectMode } from "./anchor-subject-mask";

export const ANCHOR_FEATURES_VERSION = 1 as const;

/** L* 표준편차가 이 값보다 작으면 거의 단색 이미지로 본다(휴리스틱). */
export const ANCHOR_LOW_CONTRAST_STD_L = 3;

export interface AnchorSubjectInfo {
  readonly mode: AnchorSubjectMode;
  /** 피사체(또는 보이는 픽셀)가 화면에서 차지하는 비율. */
  readonly coverage: number;
  /** 가장자리 띠가 한 색인 정도. */
  readonly backgroundFlatness: number;
  /** 단색 배경으로 본 색(background 모드에서만). */
  readonly backgroundHex: string | null;
}

export interface AnchorImageFeatures {
  readonly version: typeof ANCHOR_FEATURES_VERSION;
  /** 분석에 쓴(줄인) 래스터 크기. */
  readonly width: number;
  readonly height: number;
  readonly subject: AnchorSubjectInfo;
  /** 피사체를 분리하지 못했으면 null(실루엣·비율 비교를 하지 않는다). */
  readonly silhouette: AnchorSilhouette | null;
  readonly color: AnchorColorStats;
  readonly palette: readonly AnchorPaletteEntry[];
  readonly structure: AnchorStructureHash;
  readonly lowContrast: boolean;
}

export interface ExtractAnchorFeaturesOptions {
  /** 분석 래스터의 긴 변 상한. 기본 256. */
  readonly maxEdge?: number;
  /** true 를 돌려주면 AnchorFeatureError("cancelled") 로 멈춘다. 단계 사이에서 확인한다. */
  readonly isCancelled?: () => boolean;
}

function padRegion(box: AnchorSilhouette["bbox"], width: number, height: number): AnchorHashRegion {
  const padX = Math.max(1, Math.round((box.x1 - box.x0 + 1) * 0.04));
  const padY = Math.max(1, Math.round((box.y1 - box.y0 + 1) * 0.04));
  return {
    x0: Math.max(0, box.x0 - padX),
    y0: Math.max(0, box.y0 - padY),
    x1: Math.min(width - 1, box.x1 + padX),
    y1: Math.min(height - 1, box.y1 + padY),
  };
}

/** 이미지 한 장의 특징을 계산한다. 입력 래스터는 바꾸지 않는다. */
export function extractAnchorFeatures(raster: AnchorRaster, options: ExtractAnchorFeaturesOptions = {}): AnchorImageFeatures {
  const checkpoint = (): void => {
    if (options.isCancelled?.()) throw new AnchorFeatureError("cancelled");
  };
  checkpoint();
  const analysisRaster = downscaleAnchorRaster(raster, options.maxEdge ?? ANCHOR_ANALYSIS_LIMITS.maxEdge);
  checkpoint();
  const image = toAnchorLabImage(analysisRaster);
  checkpoint();
  const subject = separateAnchorSubject(image);
  const colorMask = anchorColorMask(subject, image.width, image.height);
  const color = computeAnchorColorStats(image, colorMask);
  if (!color) throw new AnchorFeatureError("empty-image");
  checkpoint();
  const palette = extractAnchorPalette(image, colorMask);
  checkpoint();
  const silhouette = subject.mode === "whole-image" ? null : computeAnchorSilhouette(subject.mask, image.width, image.height);
  const structure = computeAnchorStructureHash(image, {
    mask: silhouette ? subject.mask : null,
    region: silhouette ? padRegion(silhouette.bbox, image.width, image.height) : null,
  });
  const backgroundHex = subject.backgroundLab
    ? srgbToHex(...labToSrgb(subject.backgroundLab[0], subject.backgroundLab[1], subject.backgroundLab[2]))
    : null;
  return Object.freeze({
    version: ANCHOR_FEATURES_VERSION,
    width: image.width,
    height: image.height,
    subject: Object.freeze({
      mode: subject.mode,
      coverage: Math.round(subject.coverage * 1000) / 1000,
      backgroundFlatness: Math.round(subject.backgroundFlatness * 1000) / 1000,
      backgroundHex,
    }),
    silhouette,
    color,
    palette,
    structure,
    lowContrast: color.stdL < ANCHOR_LOW_CONTRAST_STD_L,
  });
}
