/**
 * Studio Shading Assist — 광원 방향 미리보기형 음영 초안 생성기.
 *
 * 보유 검증(2026-10-14, main 실측): 광원 방향 지정 UI(StudioLightShadowPanel —
 * 3D 씬 방위각/고도각), 음영 "색" 생성(StudioWebtoonCelShadePanel — 색상별
 * hue-shift 팔레트), 명암 보정(studio-shadow-highlight — 사진 톤 보정)은 있으나,
 * 2D 플랫 채색 이미지에 광원 방향을 지정하면 음영 초안(그림자 마스크 레이어)을
 * 만들어 주는 기능은 없었다. 이 모듈이 그 빈틈이다(CSP Shading Assist 대응).
 *
 * 방식(결정적·순수·외부 호출 없음):
 *  - 불투명 영역(alpha>0)의 바운딩 박스를 기준으로, 각 픽셀 위치를 광원 방향
 *    축에 투영해 0..1로 정규화한다. 광원에 가까운 쪽이 밝고 먼 쪽이 음영이다.
 *  - 음영 경계(coverage)와 부드러움(softness)으로 smoothstep 전이를 만들고,
 *    toneSteps>=2면 셀식 단차로 양자화한다.
 *  - 산출은 두 가지: (1) 음영 마스크 — 별도 레이어로 얹을 수 있는 단일 음영색
 *    이미지(알파=음영량×강도×원본 알파), (2) 미리보기 — 원본 위에 마스크를
 *    일반 합성한 결과. 호스트는 마스크를 새 레이어로 커밋하면 작가가 그 위에
 *    다듬는 "초안" 동선이 된다.
 *  - 입력은 절대 변형하지 않는다. 투명 픽셀은 마스크·미리보기 모두 원본 유지
 *    (마스크 알파 0).
 *
 * 광원 방위각 규약(화면 공간): 0°=위쪽 광원, 시계 방향 증가(90°=오른쪽,
 * 180°=아래쪽, 270°=왼쪽). 3D용 studio-light-shadow-gizmo의 구면 규약과
 * 다르므로 이 모듈 안에서만 쓴다.
 */

import type { StudioImageDataLike } from "./studio-filters";

// ---------------------------------------------------------------------------
// 옵션 타입·기본값·범위
// ---------------------------------------------------------------------------

export interface ShadingAssistOptions {
  /** 광원 방위각(도, 화면 공간: 0=위·90=오른쪽·180=아래·270=왼쪽). */
  readonly azimuthDeg: number;
  /** 음영 강도 0..100 — 마스크 알파 상한(%). */
  readonly strength: number;
  /** 음영 경계 0..100 — 불투명 영역 투영 구간의 몇 % 지점부터 음영인지. */
  readonly coverage: number;
  /** 경계 부드러움 0..100 — 전이 구간 너비. */
  readonly softness: number;
  /** 음영 단차: 0=부드러운 그라데이션, 2/3=셀식 단차. */
  readonly toneSteps: 0 | 2 | 3;
  /** 음영색 RGB(0..255 각 채널). 기본은 차가운 보라 — 웹툰 음영 관례. */
  readonly shadowColor: readonly [number, number, number];
}

/** 기본값: 왼쪽 위 광원(315°), 중간 강도·경계, 2단 셀 음영. */
export const DEFAULT_SHADING_ASSIST_OPTIONS: ShadingAssistOptions = {
  azimuthDeg: 315,
  strength: 55,
  coverage: 50,
  softness: 40,
  toneSteps: 2,
  shadowColor: [88, 80, 160],
};

export const SHADING_ASSIST_STRENGTH_RANGE = { min: 0, max: 100, step: 1 } as const;
export const SHADING_ASSIST_COVERAGE_RANGE = { min: 0, max: 100, step: 1 } as const;
export const SHADING_ASSIST_SOFTNESS_RANGE = { min: 0, max: 100, step: 1 } as const;

/** 한 번에 처리할 최대 픽셀 수 — 자동채색 힌트 예산(8MP)의 2배까지 허용. */
export const SHADING_ASSIST_MAX_PIXELS = 16 * 1024 * 1024;

// ---------------------------------------------------------------------------
// 결과 타입
// ---------------------------------------------------------------------------

export type ShadingAssistRefusalReason =
  | "invalid-source"
  | "source-too-large"
  | "no-opaque-pixels";

export type ShadingAssistDraft =
  | {
      readonly status: "created";
      /** 별도 레이어로 얹는 음영 마스크(음영색 + 알파=음영량). */
      readonly mask: StudioImageDataLike;
      /** 원본 위에 마스크를 합성한 미리보기(원본 크기·불변 복사본 기반). */
      readonly preview: StudioImageDataLike;
      readonly opaquePixelCount: number;
      readonly shadedPixelCount: number;
      /** 불투명 픽셀 중 음영이 조금이라도 걸린 비율 0..1. */
      readonly coverageRatio: number;
      readonly options: ShadingAssistOptions;
    }
  | {
      readonly status: "refused";
      readonly reason: ShadingAssistRefusalReason;
      readonly detail: string;
    };

// ---------------------------------------------------------------------------
// 정규화
// ---------------------------------------------------------------------------

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function normalizeChannel(value: number, fallback: number): number {
  return Math.round(clampNumber(value, 0, 255, fallback));
}

export function normalizeShadingAssistOptions(
  partial?: Partial<ShadingAssistOptions> | null,
): ShadingAssistOptions {
  const base = DEFAULT_SHADING_ASSIST_OPTIONS;
  if (!partial) return base;
  const azimuthRaw = partial.azimuthDeg ?? base.azimuthDeg;
  const azimuth = Number.isFinite(azimuthRaw)
    ? ((azimuthRaw % 360) + 360) % 360
    : base.azimuthDeg;
  const toneStepsRaw = partial.toneSteps ?? base.toneSteps;
  const toneSteps: ShadingAssistOptions["toneSteps"] =
    toneStepsRaw === 2 || toneStepsRaw === 3 ? toneStepsRaw : 0;
  const color = partial.shadowColor ?? base.shadowColor;
  return {
    azimuthDeg: azimuth,
    strength: clampNumber(partial.strength ?? base.strength, 0, 100, base.strength),
    coverage: clampNumber(partial.coverage ?? base.coverage, 0, 100, base.coverage),
    softness: clampNumber(partial.softness ?? base.softness, 0, 100, base.softness),
    toneSteps,
    shadowColor: [
      normalizeChannel(color[0], base.shadowColor[0]),
      normalizeChannel(color[1], base.shadowColor[1]),
      normalizeChannel(color[2], base.shadowColor[2]),
    ],
  };
}

/** 방위각(화면 공간) → 광원이 위치한 방향의 단위 벡터 [dx, dy] (y는 아래가 +). */
export function shadingAssistLightVector(azimuthDeg: number): readonly [number, number] {
  const rad = ((azimuthDeg % 360) * Math.PI) / 180;
  // 0°=위쪽(0,-1), 90°=오른쪽(1,0) — 시계 방향.
  return [Math.sin(rad), -Math.cos(rad)];
}

// ---------------------------------------------------------------------------
// 초안 생성
// ---------------------------------------------------------------------------

export function buildStudioShadingAssistDraft(
  source: StudioImageDataLike,
  options?: Partial<ShadingAssistOptions> | null,
): ShadingAssistDraft {
  const opts = normalizeShadingAssistOptions(options);
  const { width, height, data } = source;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    !data ||
    data.length < width * height * 4
  ) {
    return {
      status: "refused",
      reason: "invalid-source",
      detail: "이미지 크기나 픽셀 데이터가 올바르지 않습니다.",
    };
  }
  if (width * height > SHADING_ASSIST_MAX_PIXELS) {
    return {
      status: "refused",
      reason: "source-too-large",
      detail: `이미지가 너무 큽니다(최대 ${SHADING_ASSIST_MAX_PIXELS.toLocaleString()}픽셀).`,
    };
  }

  // 불투명 영역 바운딩 박스 — 투영 정규화 기준.
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaquePixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3]! > 0) {
        opaquePixelCount += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (opaquePixelCount === 0) {
    return {
      status: "refused",
      reason: "no-opaque-pixels",
      detail: "채색된(불투명한) 영역이 없어 음영 초안을 만들 수 없습니다.",
    };
  }

  const [lx, ly] = shadingAssistLightVector(opts.azimuthDeg);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // 바운딩 박스 네 모서리의 투영 최소/최대 — 정규화 구간.
  let pMin = Number.POSITIVE_INFINITY;
  let pMax = Number.NEGATIVE_INFINITY;
  for (const [px, py] of [
    [minX, minY],
    [maxX, minY],
    [minX, maxY],
    [maxX, maxY],
  ] as const) {
    const p = (px - cx) * lx + (py - cy) * ly;
    if (p < pMin) pMin = p;
    if (p > pMax) pMax = p;
  }
  const pSpan = pMax - pMin;

  const boundary = opts.coverage / 100; // 투영 t(이 값보다 작으면 음영)에서 경계
  const soft = 0.02 + (opts.softness / 100) * 0.96; // 전이 너비(t 단위)
  const strengthRatio = opts.strength / 100;
  const [sr, sg, sb] = opts.shadowColor;

  const maskData = new Uint8ClampedArray(width * height * 4);
  const previewData = new Uint8ClampedArray(data); // 원본 복사 — 입력 불변 보장
  let shadedPixelCount = 0;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const idx = (y * width + x) * 4;
      const alpha = data[idx + 3]!;
      if (alpha <= 0) continue;
      // t: 1=광원에 가장 가까움, 0=가장 멂. 단면(선) 영역은 0.5.
      const t = pSpan > 0 ? ((x - cx) * lx + (y - cy) * ly - pMin) / pSpan : 0.5;
      let factor = (boundary - t) / soft + 0.5;
      factor = Math.min(1, Math.max(0, factor));
      if (opts.toneSteps >= 2) {
        const levels = opts.toneSteps - 1;
        factor = Math.round(factor * levels) / levels;
      }
      if (factor <= 0) continue;
      shadedPixelCount += 1;
      const maskAlpha = Math.round(factor * strengthRatio * alpha);
      maskData[idx] = sr;
      maskData[idx + 1] = sg;
      maskData[idx + 2] = sb;
      maskData[idx + 3] = maskAlpha;
      // 미리보기: 마스크를 일반 알파 합성(호스트 레이어 합성과 동일 결과).
      const a = maskAlpha / 255;
      previewData[idx] = Math.round(sr * a + data[idx]! * (1 - a));
      previewData[idx + 1] = Math.round(sg * a + data[idx + 1]! * (1 - a));
      previewData[idx + 2] = Math.round(sb * a + data[idx + 2]! * (1 - a));
      previewData[idx + 3] = alpha;
    }
  }

  return {
    status: "created",
    mask: { data: maskData, width, height },
    preview: { data: previewData, width, height },
    opaquePixelCount,
    shadedPixelCount,
    coverageRatio: shadedPixelCount / opaquePixelCount,
    options: opts,
  };
}
