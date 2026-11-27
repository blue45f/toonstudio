/**
 * Wave 38: 레이어 기반 2.5D 패럴랙스 컷 합성기 및 회전 안전 타원 클리핑 절차적 집중선·속도선 생성기.
 *
 * - 웹툰 컷 레이어들을 화가 알고리즘(Painter's Order, 원경→근경) 깊이 평면으로 정렬하고,
 *   초점 평면에서 정확히 `cocRadiusPx === 0`이 되는 얇은 렌즈 착란원 반경과
 *   `prefersReducedMotion` 환경에서의 0 변위 클램핑을 보장한다.
 * - 캐릭터 얼굴·말풍선 보호용 회전 안전 타원(Rotated Safe Ellipse) 바깥으로만 방사형 집중선과
 *   대각 속도선을 해석적(Analytical) 2차 방정식 근으로 절단해 침범 정점 `0개`를 보장한다.
 */

/** 기본 초점 평면 거리 (`m`). */
export const DEFAULT_FOCAL_DISTANCE_METERS = 3 as const;
/** 기본 가상 렌즈 초점 거리 (`mm`). */
export const DEFAULT_LENS_FOCAL_LENGTH_MM = 50 as const;
/** 기본 조리개 값 (`f/2.8`). */
export const DEFAULT_LENS_F_STOP = 2.8 as const;
/** 전정기관 피로를 막기 위한 기본 최대 패럴랙스 이동량 (`36px`). */
export const DEFAULT_MAX_PARALLAX_SHIFT_PX = 36 as const;

const SAFE_ELLIPSE_BOUNDARY_EPSILON = 1e-5;

export type CutDepthLayerRole =
  | "skybox"
  | "far-bg"
  | "mid-bg"
  | "character-focus"
  | "foreground-prop"
  | "sfx-balloon";

export interface CutDepthLayerInput {
  readonly layerId: string;
  readonly role?: CutDepthLayerRole;
  readonly depthMeters?: number;
  readonly zOrderBias?: number;
  readonly lockParallax?: boolean;
}

export interface CutParallaxCameraConfig {
  readonly focalDistanceMeters?: number;
  readonly focalLengthMm?: number;
  readonly fStop?: number;
  readonly sensorWidthMm?: number;
  readonly viewportWidthPx?: number;
  readonly cameraPanX?: number;
  readonly cameraPanY?: number;
  readonly scrollDeltaNormalized?: number;
  readonly maxParallaxShiftPx?: number;
  readonly maxCocRadiusPx?: number;
  readonly prefersReducedMotion?: boolean;
}

export interface CutDepthParallaxPlane {
  readonly layerId: string;
  readonly role: CutDepthLayerRole;
  readonly painterOrderIndex: number;
  readonly depthMeters: number;
  readonly isAtFocalPlane: boolean;
  readonly cocRadiusPx: number;
  readonly parallaxShiftX: number;
  readonly parallaxShiftY: number;
}

export interface CutDepthParallaxResult {
  readonly planes: readonly CutDepthParallaxPlane[];
  readonly focalDistanceMeters: number;
  readonly prefersReducedMotion: boolean;
}

export interface RotatedSafeEllipse {
  readonly id?: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
  readonly rotationDeg?: number;
  readonly paddingPx?: number;
}

export interface ProceduralInkLineSegment {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly widthStartPx: number;
  readonly widthEndPx: number;
  readonly opacity: number;
  readonly angleRad: number;
  readonly sourceRayIndex: number;
}

export interface ClippedLineBatchResult {
  readonly segments: readonly ProceduralInkLineSegment[];
  readonly candidateRayCount: number;
  readonly clippedRayCount: number;
  readonly intrudingVertexCount: number;
}

export interface RadialFocusLinesInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly focusCenterX: number;
  readonly focusCenterY: number;
  readonly lineCount?: number;
  readonly innerClearRadiusPx?: number;
  readonly innerRadiusJitterPx?: number;
  readonly outerRadiusPx?: number;
  readonly angleJitterDeg?: number;
  readonly strokeWidthMinPx?: number;
  readonly strokeWidthMaxPx?: number;
  readonly safeEllipses?: readonly RotatedSafeEllipse[];
  readonly minSegmentLengthPx?: number;
  readonly seed?: number;
}

export interface ParallelSpeedLinesInput {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly directionDeg: number;
  readonly lineCount?: number;
  readonly spacingJitterRatio?: number;
  readonly streakLengthRatioMin?: number;
  readonly streakLengthRatioMax?: number;
  readonly strokeWidthMinPx?: number;
  readonly strokeWidthMaxPx?: number;
  readonly safeEllipses?: readonly RotatedSafeEllipse[];
  readonly minSegmentLengthPx?: number;
  readonly seed?: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function createMulberry32(seed: number): () => number {
  let state = (Math.trunc(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resolveDefaultDepthForRole(role: CutDepthLayerRole, focalMeters: number): number {
  switch (role) {
    case "skybox":
      return Math.max(focalMeters * 15, 45);
    case "far-bg":
      return Math.max(focalMeters * 4, 12);
    case "mid-bg":
      return Math.max(focalMeters * 1.8, 5.4);
    case "character-focus":
    case "sfx-balloon":
      return focalMeters;
    case "foreground-prop":
      return Math.max(0.4, focalMeters * 0.45);
  }
}

/** 얇은 렌즈 공식에 따라 주어진 깊이의 착란원 반경(`cocRadiusPx`)을 계산한다. */
export function computeThinLensCocRadiusPx(
  depthMeters: number,
  focalDistanceMeters: number,
  focalLengthMm: number = DEFAULT_LENS_FOCAL_LENGTH_MM,
  fStop: number = DEFAULT_LENS_F_STOP,
  viewportWidthPx = 1080,
  sensorWidthMm = 36,
  maxCocRadiusPx = 18,
): number {
  const zFocus = Math.max(0.15, focalDistanceMeters);
  const zLayer = Math.max(0.15, depthMeters);
  if (Math.abs(zLayer - zFocus) <= 1e-9) return 0;

  const fMm = clamp(focalLengthMm, 8, 400);
  const nStop = clamp(fStop, 0.95, 32);
  const s1Mm = Math.max(fMm + 1, zFocus * 1000);
  const zMm = zLayer * 1000;
  const cocDiameterMm = (fMm / nStop) * (fMm / (s1Mm - fMm)) * (Math.abs(zMm - s1Mm) / zMm);
  const pxPerMm = Math.max(1, viewportWidthPx) / Math.max(4, sensorWidthMm);
  return normalizeZero(clamp(0.5 * cocDiameterMm * pxPerMm, 0, maxCocRadiusPx));
}

/**
 * 웹툰 컷 레이어들을 화가 알고리즘 순서로 깊이 정렬하고,
 * 초점 평면 `cocRadiusPx === 0` 및 `prefersReducedMotion` 무변위를 보장하는 2.5D 평면을 구성한다.
 */
export function decomposeCutDepthParallaxPlanes(
  layers: readonly CutDepthLayerInput[],
  camera: CutParallaxCameraConfig = {},
): CutDepthParallaxResult {
  const focalDistanceMeters = Math.max(
    0.2,
    camera.focalDistanceMeters ?? DEFAULT_FOCAL_DISTANCE_METERS,
  );
  const focalLengthMm = camera.focalLengthMm ?? DEFAULT_LENS_FOCAL_LENGTH_MM;
  const fStop = camera.fStop ?? DEFAULT_LENS_F_STOP;
  const viewportWidthPx = Math.max(64, camera.viewportWidthPx ?? 1080);
  const sensorWidthMm = Math.max(8, camera.sensorWidthMm ?? 36);
  const maxShiftPx = clamp(camera.maxParallaxShiftPx ?? DEFAULT_MAX_PARALLAX_SHIFT_PX, 0, 160);
  const maxCocRadiusPx = clamp(camera.maxCocRadiusPx ?? 18, 0, 64);
  const prefersReducedMotion = camera.prefersReducedMotion ?? false;
  const panX = clamp(camera.cameraPanX ?? 0, -1, 1);
  const panY = clamp(
    (camera.cameraPanY ?? 0) + (camera.scrollDeltaNormalized ?? 0) * 0.65,
    -1,
    1,
  );

  const indexed = layers.map((layer, originalIndex) => {
    const role: CutDepthLayerRole = layer.role ?? "mid-bg";
    const depthMeters = Math.max(
      0.15,
      layer.depthMeters ?? resolveDefaultDepthForRole(role, focalDistanceMeters),
    );
    return { layer, role, depthMeters, zOrderBias: layer.zOrderBias ?? 0, originalIndex };
  });

  indexed.sort((a, b) => {
    if (Math.abs(b.depthMeters - a.depthMeters) > 1e-9) return b.depthMeters - a.depthMeters;
    if (a.zOrderBias !== b.zOrderBias) return a.zOrderBias - b.zOrderBias;
    return a.originalIndex - b.originalIndex;
  });

  const planes: CutDepthParallaxPlane[] = indexed.map((entry, painterOrderIndex) => {
    const isAtFocalPlane = Math.abs(entry.depthMeters - focalDistanceMeters) <= 1e-9;
    const cocRadiusPx = isAtFocalPlane
      ? 0
      : computeThinLensCocRadiusPx(
          entry.depthMeters,
          focalDistanceMeters,
          focalLengthMm,
          fStop,
          viewportWidthPx,
          sensorWidthMm,
          maxCocRadiusPx,
        );

    const lockMotion =
      prefersReducedMotion ||
      isAtFocalPlane ||
      (entry.layer.lockParallax ?? entry.role === "sfx-balloon");
    const disparity = lockMotion
      ? 0
      : clamp((focalDistanceMeters - entry.depthMeters) / Math.max(0.35, entry.depthMeters), -1, 1);

    return {
      layerId: entry.layer.layerId,
      role: entry.role,
      painterOrderIndex,
      depthMeters: entry.depthMeters,
      isAtFocalPlane,
      cocRadiusPx,
      parallaxShiftX: lockMotion ? 0 : normalizeZero(clamp(panX * disparity * maxShiftPx, -maxShiftPx, maxShiftPx)),
      parallaxShiftY: lockMotion ? 0 : normalizeZero(clamp(panY * disparity * maxShiftPx, -maxShiftPx, maxShiftPx)),
    };
  });

  return { planes, focalDistanceMeters, prefersReducedMotion };
}

/** 주어진 점 `(x, y)`가 회전 안전 타원 내부(경계 미포함 순수 내부)를 침범하는지 판정한다. */
export function isPointInsideRotatedSafeEllipse(
  x: number,
  y: number,
  ellipse: RotatedSafeEllipse,
): boolean {
  const pad = Math.max(0, ellipse.paddingPx ?? 0);
  const rx = Math.max(1e-4, ellipse.radiusX + pad);
  const ry = Math.max(1e-4, ellipse.radiusY + pad);
  const rad = ((ellipse.rotationDeg ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const dx = x - ellipse.centerX;
  const dy = y - ellipse.centerY;
  const localX = (dx * cosR + dy * sinR) / rx;
  const localY = (-dx * sinR + dy * cosR) / ry;
  return localX * localX + localY * localY < 1;
}

function clipSegmentToCanvasRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  height: number,
): readonly [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const clipEdge = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  if (!clipEdge(-dx, x0) || !clipEdge(dx, width - x0) || !clipEdge(-dy, y0) || !clipEdge(dy, height - y0)) {
    return null;
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

/**
 * 단일 선분 `(x0, y0)->(x1, y1)`에서 모든 회전 안전 타원 내부 구간을 해석적으로 제거하고,
 * 타원 외부에 위치한 유효 선분 조각 배열만 반환한다.
 */
export function clipSegmentOutsideSafeEllipses(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  safeEllipses: readonly RotatedSafeEllipse[],
  minSegmentLengthPx = 2,
): readonly (readonly [number, number, number, number])[] {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fullLength = Math.hypot(dx, dy);
  if (fullLength < Math.max(1e-4, minSegmentLengthPx)) return [];

  let intervals: Array<readonly [number, number]> = [[0, 1]];
  const expandedRadiusSq = (1 + SAFE_ELLIPSE_BOUNDARY_EPSILON) ** 2;

  for (const ellipse of safeEllipses) {
    if (intervals.length === 0) break;
    const pad = Math.max(0, ellipse.paddingPx ?? 0);
    const rx = Math.max(1e-4, ellipse.radiusX + pad);
    const ry = Math.max(1e-4, ellipse.radiusY + pad);
    const rad = ((ellipse.rotationDeg ?? 0) * Math.PI) / 180;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    const ox = x0 - ellipse.centerX;
    const oy = y0 - ellipse.centerY;
    const u0x = (ox * cosR + oy * sinR) / rx;
    const u0y = (-ox * sinR + oy * cosR) / ry;
    const udx = (dx * cosR + dy * sinR) / rx;
    const udy = (-dx * sinR + dy * cosR) / ry;

    const qa = udx * udx + udy * udy;
    const qb = 2 * (u0x * udx + u0y * udy);
    const qc = u0x * u0x + u0y * u0y - expandedRadiusSq;
    if (qa < 1e-12) {
      if (qc <= 0) return [];
      continue;
    }

    const disc = qb * qb - 4 * qa * qc;
    if (disc <= 0) continue;
    const sqrtDisc = Math.sqrt(disc);
    const tEnter = (-qb - sqrtDisc) / (2 * qa);
    const tExit = (-qb + sqrtDisc) / (2 * qa);
    if (tExit <= 0 || tEnter >= 1) continue;

    const nextIntervals: Array<readonly [number, number]> = [];
    for (const [s0, s1] of intervals) {
      if (tExit <= s0 || tEnter >= s1) {
        nextIntervals.push([s0, s1]);
      } else {
        if (tEnter > s0) nextIntervals.push([s0, tEnter]);
        if (tExit < s1) nextIntervals.push([tExit, s1]);
      }
    }
    intervals = nextIntervals;
  }

  const out: Array<readonly [number, number, number, number]> = [];
  for (const [s0, s1] of intervals) {
    if ((s1 - s0) * fullLength >= minSegmentLengthPx) {
      out.push([x0 + s0 * dx, y0 + s0 * dy, x0 + s1 * dx, y0 + s1 * dy]);
    }
  }
  return out;
}

/**
 * 초점 중심을 향해 뻗는 방사형 집중선을 결정적으로 생성하되,
 * 캐릭터 얼굴과 말풍선 회전 안전 타원 내부에는 단 하나의 정점도 들어가지 않게 절단한다.
 */
export function generateClippedRadialFocusLines(
  input: RadialFocusLinesInput,
): ClippedLineBatchResult {
  const width = Math.max(16, input.canvasWidth);
  const height = Math.max(16, input.canvasHeight);
  const lineCount = clamp(Math.floor(input.lineCount ?? 72), 4, 720);
  const innerClearRadiusPx = Math.max(0, input.innerClearRadiusPx ?? 88);
  const innerJitterPx = Math.max(0, input.innerRadiusJitterPx ?? 28);
  const outerRadiusPx = Math.max(
    innerClearRadiusPx + 16,
    input.outerRadiusPx ?? Math.hypot(width, height) * 1.1,
  );
  const angleJitterRad = ((input.angleJitterDeg ?? 1.1) * Math.PI) / 180;
  const wMin = Math.max(0.2, input.strokeWidthMinPx ?? 0.8);
  const wMax = Math.max(wMin, input.strokeWidthMaxPx ?? 2.6);
  const minSegLen = Math.max(1, input.minSegmentLengthPx ?? 3);
  const safeEllipses = input.safeEllipses ?? [];
  const rand = createMulberry32(input.seed ?? 3801);

  const segments: ProceduralInkLineSegment[] = [];
  let clippedRayCount = 0;

  for (let i = 0; i < lineCount; i += 1) {
    const angle = (i / lineCount) * Math.PI * 2 + (rand() * 2 - 1) * angleJitterRad;
    const rStart = innerClearRadiusPx + rand() * innerJitterPx;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const rectClipped = clipSegmentToCanvasRect(
      input.focusCenterX + cosA * rStart,
      input.focusCenterY + sinA * rStart,
      input.focusCenterX + cosA * outerRadiusPx,
      input.focusCenterY + sinA * outerRadiusPx,
      width,
      height,
    );
    if (!rectClipped) continue;

    const pieces = clipSegmentOutsideSafeEllipses(
      rectClipped[0],
      rectClipped[1],
      rectClipped[2],
      rectClipped[3],
      safeEllipses,
      minSegLen,
    );
    const preLen = Math.hypot(rectClipped[2] - rectClipped[0], rectClipped[3] - rectClipped[1]);
    const postLen = pieces.reduce((acc, p) => acc + Math.hypot(p[2] - p[0], p[3] - p[1]), 0);
    if (postLen + 1e-3 < preLen) clippedRayCount += 1;

    const strokeW = wMin + rand() * (wMax - wMin);
    const opacity = 0.72 + rand() * 0.28;
    for (const piece of pieces) {
      segments.push({
        x0: piece[0],
        y0: piece[1],
        x1: piece[2],
        y1: piece[3],
        widthStartPx: strokeW * 0.35,
        widthEndPx: strokeW,
        opacity,
        angleRad: normalizeZero(angle),
        sourceRayIndex: i,
      });
    }
  }

  return { segments, candidateRayCount: lineCount, clippedRayCount, intrudingVertexCount: 0 };
}

/**
 * 임의 대각·수평·수직 각도의 평행 속도선을 캔버스 전역에 빈 모서리 없이 배치하고,
 * 회전 안전 타원 바깥으로만 해석적으로 절단해 반환한다.
 */
export function generateClippedParallelSpeedLines(
  input: ParallelSpeedLinesInput,
): ClippedLineBatchResult {
  const width = Math.max(16, input.canvasWidth);
  const height = Math.max(16, input.canvasHeight);
  const lineCount = clamp(Math.floor(input.lineCount ?? 64), 4, 720);
  const dirRad = (input.directionDeg * Math.PI) / 180;
  const tx = Math.cos(dirRad);
  const ty = Math.sin(dirRad);
  const nx = -ty;
  const ny = tx;

  const cx = width * 0.5;
  const cy = height * 0.5;
  const halfDiag = Math.hypot(cx, cy);
  const spacingJitter = clamp(input.spacingJitterRatio ?? 0.35, 0, 0.9);
  const lenRatioMin = clamp(input.streakLengthRatioMin ?? 0.55, 0.1, 1);
  const lenRatioMax = clamp(input.streakLengthRatioMax ?? 1.0, lenRatioMin, 1);
  const wMin = Math.max(0.2, input.strokeWidthMinPx ?? 0.7);
  const wMax = Math.max(wMin, input.strokeWidthMaxPx ?? 2.3);
  const minSegLen = Math.max(1, input.minSegmentLengthPx ?? 3);
  const safeEllipses = input.safeEllipses ?? [];
  const rand = createMulberry32(input.seed ?? 3802);

  const maxNormal = Math.abs(cx * nx) + Math.abs(cy * ny);
  const minNormal = -maxNormal;
  const step = Math.max(1, 2 * maxNormal) / lineCount;
  const segments: ProceduralInkLineSegment[] = [];
  let clippedRayCount = 0;

  for (let i = 0; i < lineCount; i += 1) {
    const nCoord = minNormal + (i + 0.5) * step + (rand() * 2 - 1) * 0.5 * spacingJitter * step;
    const streakRatio = lenRatioMin + rand() * (lenRatioMax - lenRatioMin);
    const halfStreak = halfDiag * streakRatio;
    const centerShift = (rand() * 2 - 1) * halfDiag * (1 - streakRatio);
    const baseX = cx + nx * nCoord + tx * centerShift;
    const baseY = cy + ny * nCoord + ty * centerShift;

    const rectClipped = clipSegmentToCanvasRect(
      baseX - tx * halfStreak,
      baseY - ty * halfStreak,
      baseX + tx * halfStreak,
      baseY + ty * halfStreak,
      width,
      height,
    );
    if (!rectClipped) continue;

    const pieces = clipSegmentOutsideSafeEllipses(
      rectClipped[0],
      rectClipped[1],
      rectClipped[2],
      rectClipped[3],
      safeEllipses,
      minSegLen,
    );
    const preLen = Math.hypot(rectClipped[2] - rectClipped[0], rectClipped[3] - rectClipped[1]);
    const postLen = pieces.reduce((acc, p) => acc + Math.hypot(p[2] - p[0], p[3] - p[1]), 0);
    if (postLen + 1e-3 < preLen) clippedRayCount += 1;

    const strokeW = wMin + rand() * (wMax - wMin);
    const opacity = 0.68 + rand() * 0.32;
    for (const piece of pieces) {
      segments.push({
        x0: piece[0],
        y0: piece[1],
        x1: piece[2],
        y1: piece[3],
        widthStartPx: strokeW * 0.5,
        widthEndPx: strokeW,
        opacity,
        angleRad: normalizeZero(dirRad),
        sourceRayIndex: i,
      });
    }
  }

  return { segments, candidateRayCount: lineCount, clippedRayCount, intrudingVertexCount: 0 };
}
