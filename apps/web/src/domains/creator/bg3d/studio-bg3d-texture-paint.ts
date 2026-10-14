/**
 * Studio BG3D 3D 표면 직접 그리기 1단계 — 프리미티브 UV 텍스처 페인팅 엔진 (순수 모듈).
 *
 * 설계 근거: csp-feature-gap NOTES.md 설계 C / 패리티 §4 "부분 가능성" 완료 조건
 * (UV hit-test, brush projection, texture undo, texture export, device lost 복구).
 *
 * 핵심 결정 — 획(stroke) 벡터가 정본, 래스터 텍스처는 캐시다.
 * - 씬 문서 예산(320KiB) 안에서 저장/재열기를 보장하려면 PNG data URL을 문서에 넣을 수 없다.
 *   대신 UV 공간의 획 목록(색·굵기·불투명도·점열)만 문서에 저장하고, 텍스처는 언제든
 *   획으로부터 결정적으로 다시 래스터화한다. 이 구조가 곧 device lost 복구 계약이다:
 *   GPU 텍스처가 사라져도 획이 남아 있으면 픽셀 단위로 같은 텍스처를 복원할 수 있다.
 * - 1단계 범위: 프리미티브(box·cylinder 등 전 종류 — Three 지오메트리가 UV를 제공한다)의
 *   베이스 컬러 맵 페인팅만. 캐릭터 스킨·심(seam) 보정·모델(GLB) 텍스처는 2단계.
 * - 이 모듈은 Three.js/DOM/React에 의존하지 않는다. 캔버스는 최소 2D 컨텍스트 인터페이스와
 *   팩토리 주입으로 추상화해 Node에서도 검증할 수 있다.
 */

import type {
  StudioBg3dTexturePaint,
  StudioBg3dTexturePaintPoint,
  StudioBg3dTexturePaintStroke,
} from "./studio-bg3d-scene-document-types";

export type {
  StudioBg3dTexturePaint,
  StudioBg3dTexturePaintPoint,
  StudioBg3dTexturePaintStroke,
} from "./studio-bg3d-scene-document-types";

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
/** 획 점열 최소 간격(UV). 이보다 가까운 포인터 샘플은 버려 점열 폭증을 막는다. */
const MIN_POINT_DISTANCE = 0.0015;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function normalizedPaintColor(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !HEX_COLOR_PATTERN.test(value)) return fallback;
  const hex = value.slice(1).toLowerCase();
  return hex.length === 3
    ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
    : `#${hex}`;
}

function boundedPaintNumber(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

function clampUv(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** UV 좌표 정밀도를 1/4096로 양자화해 문서 바이트를 줄이고 동등 비교를 안정시킨다. */
function quantizeUv(value: number): number {
  return Math.round(clampUv(value) * 4096) / 4096;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePaintPoint(value: unknown): StudioBg3dTexturePaintPoint | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [u, v] = value as [unknown, unknown];
  if (
    typeof u !== "number" || !Number.isFinite(u)
    || typeof v !== "number" || !Number.isFinite(v)
  ) {
    return null;
  }
  return [quantizeUv(u), quantizeUv(v)];
}

function normalizePaintStroke(value: unknown): StudioBg3dTexturePaintStroke | null {
  if (!isRecord(value) || !Array.isArray(value.points)) return null;
  const points: StudioBg3dTexturePaintPoint[] = [];
  for (const candidate of value.points) {
    if (points.length >= STUDIO_BG3D_TEXTURE_PAINT_MAX_POINTS_PER_STROKE) break;
    const point = normalizePaintPoint(candidate);
    if (!point) continue;
    const last = points[points.length - 1];
    if (last && last[0] === point[0] && last[1] === point[1]) continue;
    points.push(point);
  }
  if (points.length === 0) return null;
  return {
    color: normalizedPaintColor(value.color, "#e11d48"),
    size: boundedPaintNumber(
      value.size,
      0.04,
      STUDIO_BG3D_TEXTURE_PAINT_MIN_BRUSH_SIZE,
      STUDIO_BG3D_TEXTURE_PAINT_MAX_BRUSH_SIZE,
    ),
    opacity: boundedPaintNumber(value.opacity, 1, 0.05, 1),
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
    const stroke = normalizePaintStroke(candidate);
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
  const normalized = normalizePaintStroke(stroke);
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

/**
 * 레이캐스트 교차(Three Intersection / R3F ThreeEvent)에서 UV를 뽑는다.
 * `uv`가 없는 지오메트리(UV 미제공)에 닿으면 null — 그리기 불가 표면을 정직하게 구분한다.
 */
export function extractStudioBg3dTexturePaintUv(
  intersection: unknown,
): StudioBg3dTexturePaintPoint | null {
  if (!isRecord(intersection)) return null;
  const uv = intersection.uv;
  if (isRecord(uv) && typeof uv.x === "number" && typeof uv.y === "number") {
    if (!Number.isFinite(uv.x) || !Number.isFinite(uv.y)) return null;
    return [quantizeUv(uv.x), quantizeUv(uv.y)];
  }
  if (Array.isArray(uv) && uv.length === 2) return normalizePaintPoint(uv);
  return null;
}

/** 진행 중 획 초안. 포인터 다운에서 시작해 무브 샘플을 쌓고 업에서 확정한다. */
export interface StudioBg3dTexturePaintStrokeDraft {
  readonly color: string;
  readonly size: number;
  readonly opacity: number;
  readonly points: readonly StudioBg3dTexturePaintPoint[];
}

export function beginStudioBg3dTexturePaintStroke(input: {
  readonly color: string;
  readonly size: number;
  readonly opacity?: number;
  readonly uv: StudioBg3dTexturePaintPoint;
}): StudioBg3dTexturePaintStrokeDraft {
  return {
    color: normalizedPaintColor(input.color, "#e11d48"),
    size: boundedPaintNumber(
      input.size,
      0.04,
      STUDIO_BG3D_TEXTURE_PAINT_MIN_BRUSH_SIZE,
      STUDIO_BG3D_TEXTURE_PAINT_MAX_BRUSH_SIZE,
    ),
    opacity: boundedPaintNumber(input.opacity ?? 1, 1, 0.05, 1),
    points: [[quantizeUv(input.uv[0]), quantizeUv(input.uv[1])]],
  };
}

export function extendStudioBg3dTexturePaintStroke(
  draft: StudioBg3dTexturePaintStrokeDraft,
  uv: StudioBg3dTexturePaintPoint,
): StudioBg3dTexturePaintStrokeDraft {
  if (draft.points.length >= STUDIO_BG3D_TEXTURE_PAINT_MAX_POINTS_PER_STROKE) return draft;
  const point: StudioBg3dTexturePaintPoint = [quantizeUv(uv[0]), quantizeUv(uv[1])];
  const last = draft.points[draft.points.length - 1]!;
  const distance = Math.hypot(point[0] - last[0], point[1] - last[1]);
  if (distance < MIN_POINT_DISTANCE) return draft;
  return { ...draft, points: [...draft.points, point] };
}

/** 점 1개짜리 획도 유효하다(도트 찍기). 점이 없으면 null. */
export function finishStudioBg3dTexturePaintStroke(
  draft: StudioBg3dTexturePaintStrokeDraft,
): StudioBg3dTexturePaintStroke | null {
  if (draft.points.length === 0) return null;
  return {
    color: draft.color,
    size: draft.size,
    opacity: draft.opacity,
    points: draft.points,
  };
}

/** 최소 2D 컨텍스트 계약 — 실제 CanvasRenderingContext2D가 구조적으로 만족한다. */
export interface StudioBg3dPaintCanvas2d {
  fillStyle: string;
  strokeStyle: string;
  globalAlpha: number;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  fillRect(x: number, y: number, width: number, height: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number): void;
  fill(): void;
}

export interface StudioBg3dPaintCanvas {
  width: number;
  height: number;
  getContext(contextId: "2d"): StudioBg3dPaintCanvas2d | null;
  toDataURL?: (type?: string) => string;
}

export type StudioBg3dPaintCanvasFactory = (width: number, height: number) => StudioBg3dPaintCanvas;

export function resolveStudioBg3dTexturePaintResolution(value: unknown): number {
  return typeof value === "number" && (STUDIO_BG3D_TEXTURE_PAINT_RESOLUTIONS as readonly number[]).includes(value)
    ? value
    : STUDIO_BG3D_TEXTURE_PAINT_DEFAULT_RESOLUTION;
}

/**
 * 획 목록을 캔버스 2D 컨텍스트에 결정적으로 그린다.
 * 좌표 변환: UV 원점(0,0)은 텍스처 왼쪽 아래(Three 관례), 캔버스 y는 아래가 양수이므로
 * y = (1 - v) * height 로 뒤집는다. CanvasTexture(flipY 기본 true)와 짝을 이룬다.
 */
function paintOneStroke(
  context: StudioBg3dPaintCanvas2d,
  stroke: StudioBg3dTexturePaintStroke,
  width: number,
  height: number,
): void {
  context.strokeStyle = stroke.color;
  context.fillStyle = stroke.color;
  context.globalAlpha = stroke.opacity;
  context.lineWidth = Math.max(1, stroke.size * width);
  context.lineCap = "round";
  context.lineJoin = "round";
  if (stroke.points.length === 1) {
    const [u, v] = stroke.points[0]!;
    context.beginPath();
    context.arc(u * width, (1 - v) * height, Math.max(0.5, (stroke.size * width) / 2), 0, Math.PI * 2);
    context.fill();
    return;
  }
  context.beginPath();
  stroke.points.forEach(([u, v], index) => {
    const x = u * width;
    const y = (1 - v) * height;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

export function paintStudioBg3dTexture(
  context: StudioBg3dPaintCanvas2d,
  paint: StudioBg3dTexturePaint | null | undefined,
  options: {
    readonly width: number;
    readonly height: number;
    /** 프리미티브 기본 색 — 페인트 아래에 깔리는 바탕. */
    readonly baseColor: string;
  },
): void {
  const { width, height } = options;
  context.globalAlpha = 1;
  context.fillStyle = normalizedPaintColor(options.baseColor, "#b8b8c2");
  context.fillRect(0, 0, width, height);
  if (!paint) return;
  for (const stroke of paint.strokes) paintOneStroke(context, stroke, width, height);
  context.globalAlpha = 1;
}

/**
 * 페인트 표면 — 캔버스 + 정본 획을 함께 들고, 텍스처를 재생성·복구·내보내기하는 단위.
 * device lost 복구: `recoverFromContextLoss()`가 저장된 획으로 캔버스를 통째로 다시 그린다.
 * GPU 텍스처 객체 자체는 호출자(Three 어댑터)가 이 캔버스를 소스로 다시 올리면 된다.
 */
export class StudioBg3dTexturePaintSurface {
  readonly canvas: StudioBg3dPaintCanvas;
  private readonly context: StudioBg3dPaintCanvas2d;
  private paint: StudioBg3dTexturePaint | null;
  private readonly baseColor: string;
  private readonly resolution: number;

  constructor(input: {
    readonly createCanvas: StudioBg3dPaintCanvasFactory;
    readonly baseColor: string;
    readonly resolution?: number;
    readonly paint?: StudioBg3dTexturePaint | null;
  }) {
    this.resolution = resolveStudioBg3dTexturePaintResolution(input.resolution);
    this.baseColor = normalizedPaintColor(input.baseColor, "#b8b8c2");
    this.canvas = input.createCanvas(this.resolution, this.resolution);
    const context = this.canvas.getContext("2d");
    if (!context) throw new Error("studio-bg3d texture paint: 2d context unavailable");
    this.context = context;
    this.paint = input.paint ? normalizeStudioBg3dTexturePaint(input.paint) : null;
    this.repaintAll();
  }

  get currentPaint(): StudioBg3dTexturePaint | null {
    return this.paint;
  }

  get size(): number {
    return this.resolution;
  }

  private repaintAll(): void {
    paintStudioBg3dTexture(this.context, this.paint, {
      width: this.resolution,
      height: this.resolution,
      baseColor: this.baseColor,
    });
  }

  /** 획 1개를 확정하고 캔버스에 즉시 반영한다(바탕을 다시 깔지 않는 증분 그리기). */
  commitStroke(stroke: StudioBg3dTexturePaintStroke): boolean {
    const next = appendStudioBg3dTexturePaintStroke(this.paint, stroke);
    if (!next) return false;
    this.paint = next;
    paintOneStroke(this.context, next.strokes[next.strokes.length - 1]!, this.resolution, this.resolution);
    this.context.globalAlpha = 1;
    return true;
  }

  /** 저장된 페인트 전체를 교체한다(문서 열기·Undo·Redo·전체 지우기 공용). */
  setPaint(paint: StudioBg3dTexturePaint | null): void {
    this.paint = paint ? normalizeStudioBg3dTexturePaint(paint) : null;
    this.repaintAll();
  }

  undoLastStroke(): StudioBg3dTexturePaintStroke | null {
    const { paint, removed } = removeLastStudioBg3dTexturePaintStroke(this.paint);
    if (!removed) return null;
    this.paint = paint;
    this.repaintAll();
    return removed;
  }

  /** WebGL 컨텍스트 상실 후 복구: 정본 획으로 캔버스를 재생성한다. 손실 전과 픽셀 동등. */
  recoverFromContextLoss(): void {
    this.repaintAll();
  }

  /** 텍스처 내보내기(판정 기준): 현재 페인트를 PNG data URL로 직렬화한다. */
  exportPngDataUrl(): string {
    if (typeof this.canvas.toDataURL !== "function") {
      throw new Error("studio-bg3d texture paint: canvas export unsupported");
    }
    return this.canvas.toDataURL(STUDIO_BG3D_TEXTURE_PAINT_PNG_MIME);
  }
}
