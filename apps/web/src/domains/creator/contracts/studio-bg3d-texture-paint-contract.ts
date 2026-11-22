/**
 * Studio BG3D UV 텍스처 페인트 경량 데이터 계약·정규화 모듈.
 * 캔버스 래스터화기(`bg3d/studio-bg3d-texture-paint.ts`)와 분리해
 * 씬 문서 파서가 페인트 엔진을 초기 정적 그래프에 끌어오지 않도록 격리한다.
 */

import type {
  StudioBg3dTexturePaint,
  StudioBg3dTexturePaintPoint,
  StudioBg3dTexturePaintStroke,
} from "../bg3d/studio-bg3d-scene-document-types";

export type {
  StudioBg3dTexturePaint,
  StudioBg3dTexturePaintPoint,
  StudioBg3dTexturePaintStroke,
} from "../bg3d/studio-bg3d-scene-document-types";

/** 문서 예산 보호 한도. 정규화·추가 모두 이 한도를 강제한다. */
export const STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES = 256;
export const STUDIO_BG3D_TEXTURE_PAINT_MAX_POINTS_PER_STROKE = 512;
export const STUDIO_BG3D_TEXTURE_PAINT_MAX_TOTAL_POINTS = 8192;
/** 브러시 지름(UV 단위) 하한/상한. 1 = 텍스처 한 변 전체. */
export const STUDIO_BG3D_TEXTURE_PAINT_MIN_BRUSH_SIZE = 0.004;
export const STUDIO_BG3D_TEXTURE_PAINT_MAX_BRUSH_SIZE = 0.5;
/** 래스터화 해상도 정책: 허용 해상도만 쓰고 기본은 512(프리미티브 표면용으로 충분, 메모리 상한 예측 가능). */
export const STUDIO_BG3D_TEXTURE_PAINT_RESOLUTIONS = [256, 512, 1024] as const;
export const STUDIO_BG3D_TEXTURE_PAINT_DEFAULT_RESOLUTION = 512;
export const STUDIO_BG3D_TEXTURE_PAINT_PNG_MIME = "image/png" as const;

/** 호스트(뷰포트 포인터 핸들러)와 패널이 공유하는 브러시 상태. */
export interface StudioBg3dTexturePaintBrush {
  readonly color: string;
  /** 브러시 지름(UV 단위). */
  readonly size: number;
  readonly opacity: number;
}

export const DEFAULT_STUDIO_BG3D_TEXTURE_PAINT_BRUSH: StudioBg3dTexturePaintBrush = {
  color: "#e11d48",
  size: 0.04,
  opacity: 1,
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeStudioBg3dTexturePaintColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) return fallback;
  const hex = value.slice(1).toLowerCase();
  return hex.length === 3
    ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    : `#${hex}`;
}

export function clampStudioBg3dTexturePaintNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function clampUv(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** UV 좌표 정밀도를 1/4096로 양자화해 문서 바이트를 줄이고 동등 비교를 안정시킨다. */
export function quantizeStudioBg3dTexturePaintUv(value: number): number {
  return Math.round(clampUv(value) * 4096) / 4096;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeStudioBg3dTexturePaintPoint(
  value: unknown,
): StudioBg3dTexturePaintPoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [u, v] = value as [unknown, unknown];
  if (
    typeof u !== "number" || !Number.isFinite(u)
    || typeof v !== "number" || !Number.isFinite(v)
  ) {
    return null;
  }
  return [quantizeStudioBg3dTexturePaintUv(u), quantizeStudioBg3dTexturePaintUv(v)];
}

export function normalizeStudioBg3dTexturePaintStroke(
  value: unknown,
): StudioBg3dTexturePaintStroke | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const points: StudioBg3dTexturePaintPoint[] = [];
  for (const candidate of value.points) {
    if (points.length >= STUDIO_BG3D_TEXTURE_PAINT_MAX_POINTS_PER_STROKE) break;
    const point = normalizeStudioBg3dTexturePaintPoint(candidate);
    if (!point) continue;
    const last = points[points.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    points.push(point);
  }
  if (points.length === 0) return null;
  return {
    color: normalizeStudioBg3dTexturePaintColor(value.color, "#e11d48"),
    size: clampStudioBg3dTexturePaintNumber(
      value.size,
      0.04,
      STUDIO_BG3D_TEXTURE_PAINT_MIN_BRUSH_SIZE,
      STUDIO_BG3D_TEXTURE_PAINT_MAX_BRUSH_SIZE,
    ),
    opacity: clampStudioBg3dTexturePaintNumber(value.opacity, 1, 0.05, 1),
    points,
  };
}

/**
 * 문서/외부 입력에서 페인트를 정규화한다. 유효한 획이 하나도 없으면 null —
 * "페인트 없음"과 "빈 페인트"를 문서에서 구분하지 않기 위해서다(선택 필드 생략과 동등).
 */
export function normalizeStudioBg3dTexturePaint(
  raw: unknown,
): StudioBg3dTexturePaint | null {
  if (!isRecord(raw) || !Array.isArray(raw.strokes)) return null;
  const strokes: StudioBg3dTexturePaintStroke[] = [];
  let totalPoints = 0;
  for (const candidate of raw.strokes) {
    if (strokes.length >= STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES) break;
    const stroke = normalizeStudioBg3dTexturePaintStroke(candidate);
    if (!stroke) continue;
    if (totalPoints + stroke.points.length > STUDIO_BG3D_TEXTURE_PAINT_MAX_TOTAL_POINTS) break;
    strokes.push(stroke);
    totalPoints += stroke.points.length;
  }
  if (strokes.length === 0) return null;
  return { version: 1, strokes };
}

export function createEmptyStudioBg3dTexturePaint(): StudioBg3dTexturePaint {
  return { version: 1, strokes: [] };
}

export function countStudioBg3dTexturePaintPoints(
  paint: StudioBg3dTexturePaint | null | undefined,
): number {
  if (!paint) return 0;
  return paint.strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

/** 한도에 닿으면 null을 반환한다 — 조용히 자르지 않고 호출자(패널)가 사용자에게 알릴 수 있게. */
export function appendStudioBg3dTexturePaintStroke(
  paint: StudioBg3dTexturePaint | null | undefined,
  stroke: StudioBg3dTexturePaintStroke,
): StudioBg3dTexturePaint | null {
  const normalized = normalizeStudioBg3dTexturePaintStroke(stroke);
  if (!normalized) return paint ?? null;
  const base = paint ?? createEmptyStudioBg3dTexturePaint();
  if (base.strokes.length >= STUDIO_BG3D_TEXTURE_PAINT_MAX_STROKES) return null;
  if (
    countStudioBg3dTexturePaintPoints(base) + normalized.points.length
    > STUDIO_BG3D_TEXTURE_PAINT_MAX_TOTAL_POINTS
  ) {
    return null;
  }
  return { version: 1, strokes: [...base.strokes, normalized] };
}

/** 텍스처 Undo: 마지막 획을 분리한다. redo 스택은 호출자가 `removed`를 들고 있는 방식으로 충분하다. */
export function removeLastStudioBg3dTexturePaintStroke(
  paint: StudioBg3dTexturePaint | null | undefined,
): {
  readonly paint: StudioBg3dTexturePaint | null;
  readonly removed: StudioBg3dTexturePaintStroke | null;
} {
  if (!paint || paint.strokes.length === 0) return { paint: paint ?? null, removed: null };
  const removed = paint.strokes[paint.strokes.length - 1]!;
  const rest = paint.strokes.slice(0, -1);
  return { paint: rest.length > 0 ? { version: 1, strokes: rest } : null, removed };
}

export function clearStudioBg3dTexturePaint(): null {
  return null;
}
