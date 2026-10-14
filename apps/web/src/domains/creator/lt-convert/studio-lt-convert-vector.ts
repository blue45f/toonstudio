/**
 * LT 변환 벡터 출력 실험 — 래스터 LT의 "주선" 채널을 이미지 트레이스 경로에 연결.
 *
 * 근거: csp-feature-gap REPORT §4 / NOTES.md 설계 D.
 * 현재 LT(`studio-lt-convert.ts`)는 선화·톤을 모두 래스터 ImageData로만 내놓고,
 * geometry 기반 벡터 LT는 장기 엔진으로 분리돼 있다. 이 모듈은 그 사이 단계의
 * 실험이다: LT 결과의 주선(lineLayer, 검은 선 + 투명 배경 = 알파가 곧 주선
 * 마스크)을 이미지 트레이스의 착지 파이프라인에 태워, 편집 가능한 벡터 패스가
 * 남는 경로를 만든다.
 *
 * 파이프라인 (전부 순수·동기 — OpenCV/WASM을 새로 타지 않는다):
 *  1. 주선 마스크 추출: lineLayer 알파(>=128)를 255 마스크로 읽는다. 휘도 기반인
 *     일반 트레이스의 잉크 판정과 달리 LT 선화는 RGB가 항상 검정이라 알파만이
 *     채널의 의미다 — 투명 픽셀의 검정 RGB를 선으로 오인하지 않는다.
 *  2. 윤곽 추출: 픽셀 경계 간선(boundary edge)을 방향성 있게 이어 닫힌 링을
 *     만든다. 마칭 스퀘어/OpenCV 없이 결정적으로 동작하고, 구멍(링 안쪽
 *     경계)도 별도 링으로 나온다. 직선 구간의 공선(collinear) 정점은 접고,
 *     옵션 허용 오차로 Douglas–Peucker 단순화를 거되, 면적이 크게 변하면
 *     원본 링을 유지해 가는 선(리본)이 무너지는 것을 막는다.
 *  3. 착지: 링 집합을 이미지 트레이스와 같은 `traceContoursToPieces`
 *     (불리언 착지·키홀 평탄화)에 넣어 구멍 의미가 보존된 조각을 얻고,
 *     조각마다 (a) SVG 패스 문자열과 (b) 닫힌 직선 큐빅 VectorStroke를 만든다.
 *     VectorStroke 묶음은 `createVectorLayer`의 VectorLayer — 벡터 레이어
 *     편집 도구(제어점·선폭 편집)가 그대로 받는 값이라 "편집 가능한 패스"가
 *     판정 그대로 성립한다. 곡선 피팅(베지어)은 트레이스 후속 레인의
 *     `studio-image-trace-bezier`가 맡을 자리이며, 여기서는 폴리곤과 기하가
 *     정확히 일치하는 직선 큐빅으로 남긴다(모양 왜곡 없음).
 *
 * 좌표 계약: 입력 픽셀 좌표가 기본이며, `scale`/`offsetX`/`offsetY`로 호스트가
 * 캔버스 배치 좌표로 옮길 수 있다. 단순화 허용 오차는 입력(픽셀) 좌표 기준이다.
 * 실제 문서 커밋은 기존 LT 레이어 경계와 같이 호출 측(호스트) 몫이다 —
 * 이 모듈은 커밋 가능한 값(VectorLayer·SVG·조각 수)까지를 보장한다.
 */

import {
  buildStudioImageTraceSvg,
  traceContoursToPieces,
  tracePieceToSvgPathData,
  type StudioImageTraceSvgLayer,
} from "../studio-image-trace";
import {
  createVectorLayer,
  createVectorStroke,
  VECTOR_STROKE_MIN_WIDTH_PX,
  type VectorCubicSegment,
  type VectorLayer,
  type VectorPoint2D,
  type VectorStroke,
} from "../vector-layer/vector-layer-model";
import {
  STUDIO_LT_CONVERT_MAX_PIXELS,
  StudioLtConvertError,
  type StudioLtConvertPixelSource,
  type StudioLtConvertResult,
} from "./studio-lt-convert";

/** 주선으로 인정할 알파 하한. LT 엔진은 선을 255로 쓰므로 여유를 둔 값이다. */
export const STUDIO_LT_VECTOR_LINE_ALPHA_THRESHOLD = 128;

/** 단순화 허용 오차(px) 기본값 — 계단 경계의 미세 요철만 접는 수준. */
export const STUDIO_LT_VECTOR_DEFAULT_SIMPLIFY_TOLERANCE = 0.75;

export interface StudioLtLineMask {
  /** width×height, 255 = 주선 픽셀. */
  readonly mask: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly pixelCount: number;
}

export interface StudioLtVectorContour {
  /** 평탄한 [x, y, …] 정점열. 첫 정점은 끝에 반복되지 않는다. */
  readonly points: number[];
  readonly closed: true;
}

export interface StudioLtVectorLineOptions {
  /** VectorLayer id. 기본 "lt-vector-line". */
  readonly id?: string;
  /** VectorLayer 이름. 기본 "LT 주선 · 벡터". */
  readonly name?: string;
  /** 벡터 패스 색. LT 주선은 검정이 기본이다. */
  readonly color?: string;
  /** 스트로크 굵기(px). 기본 1. */
  readonly strokeWidth?: number;
  /** Douglas–Peucker 허용 오차(입력 px). 0이면 공선 접기만 한다. */
  readonly simplifyTolerance?: number;
  /** 출력 좌표 배율. 기본 1. */
  readonly scale?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

export interface StudioLtVectorLineConversion {
  readonly layer: VectorLayer;
  /** 레이어별 C/L 명령이 아닌 직선 SVG 문서(트레이스 SVG와 같은 조립). */
  readonly svg: string;
  readonly pieceCount: number;
  readonly contourCount: number;
  readonly holeCount: number;
  readonly linePixelCount: number;
  /** 앵커 3개 미만이라 스트로크가 되지 못한 조각 수. */
  readonly skippedCount: number;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

// ---------------------------------------------------------------------------
// 1) 주선 마스크 추출
// ---------------------------------------------------------------------------

/**
 * LT 선화 레이어(ImageData 형태) → 주선 마스크.
 * 알파만이 판정 근거이며 RGB는 읽지 않는다.
 *
 * @throws {StudioLtConvertError} 크기·버퍼가 올바르지 않거나 예산 초과.
 */
export function extractStudioLtLineMask(
  lineLayer: StudioLtConvertPixelSource,
): StudioLtLineMask {
  if (!lineLayer || typeof lineLayer !== "object") {
    throw new StudioLtConvertError("invalid-input", "LT 선화 레이어가 필요합니다.");
  }
  const { width, height } = lineLayer;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
  ) {
    throw new StudioLtConvertError(
      "invalid-input",
      `LT 선화 레이어 크기가 올바르지 않습니다(${String(width)}x${String(height)}).`,
    );
  }
  const pixels = width * height;
  if (pixels > STUDIO_LT_CONVERT_MAX_PIXELS) {
    throw new StudioLtConvertError(
      "budget-exceeded",
      `LT 변환 이미지 예산을 초과했습니다(${pixels.toLocaleString("ko-KR")}px).`,
    );
  }
  const data = lineLayer.data;
  if (!data || typeof data.length !== "number" || data.length < pixels * 4) {
    throw new StudioLtConvertError("invalid-input", "LT 선화 레이어 픽셀 버퍼가 올바르지 않습니다.");
  }
  const mask = new Uint8Array(pixels);
  let pixelCount = 0;
  for (let index = 0; index < pixels; index += 1) {
    const alpha = data[index * 4 + 3] ?? 0;
    if (Number.isFinite(alpha) && alpha >= STUDIO_LT_VECTOR_LINE_ALPHA_THRESHOLD) {
      mask[index] = 255;
      pixelCount += 1;
    }
  }
  return { mask, width, height, pixelCount };
}

// ---------------------------------------------------------------------------
// 2) 경계 간선 체이닝 → 닫힌 링
// ---------------------------------------------------------------------------

function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * 마스크의 픽셀 경계를 방향성 간선으로 이어 닫힌 링 목록을 만든다.
 * 전경 픽셀의 네 변 중 배경과 맞닿은 변이 간선이 되며, 간선 방향은 링을
 * 따라가면 전경이 항상 같은 쪽에 남도록 통일한다(바깥 링과 구멍 링이
 * 반대 방향으로 감기는 것은 착지 단계가 포함 관계로 재판정하므로 무해).
 * 좌표는 픽셀 모서리 정수 좌표다(픽셀 (x,y)는 [x,x+1]×[y,y+1] 정사각형).
 */
export function traceStudioLtLineMaskToContours(
  mask: Uint8Array | readonly number[],
  width: number,
  height: number,
): StudioLtVectorContour[] {
  const pixelTotal = Math.max(0, Math.floor(width) * Math.floor(height));
  if (pixelTotal === 0 || mask.length < pixelTotal) return [];
  const isForeground = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    return (mask[y * width + x] ?? 0) >= STUDIO_LT_VECTOR_LINE_ALPHA_THRESHOLD;
  };

  // 시작점 → 도착점 큐. 한 정점에서 간선이 여럿 갈라지는(대각 접촉) 경우에도
  // 큐 순서대로 이어 결정성을 유지한다.
  const outgoing = new Map<string, { x: number; y: number }[]>();
  const addEdge = (x0: number, y0: number, x1: number, y1: number): void => {
    const key = pointKey(x0, y0);
    const list = outgoing.get(key);
    if (list) list.push({ x: x1, y: y1 });
    else outgoing.set(key, [{ x: x1, y: y1 }]);
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isForeground(x, y)) continue;
      if (!isForeground(x, y - 1)) addEdge(x + 1, y, x, y); // 위쪽 변
      if (!isForeground(x + 1, y)) addEdge(x + 1, y + 1, x + 1, y); // 오른쪽 변
      if (!isForeground(x, y + 1)) addEdge(x, y + 1, x + 1, y + 1); // 아래쪽 변
      if (!isForeground(x - 1, y)) addEdge(x, y, x, y + 1); // 왼쪽 변
    }
  }

  const contours: StudioLtVectorContour[] = [];
  for (const [startKey, startList] of outgoing) {
    while (startList.length > 0) {
      const first = startList.shift()!;
      const [startX, startY] = startKey.split(",").map(Number) as [number, number];
      const points: number[] = [startX, startY, first.x, first.y];
      let current = first;
      let guard = mask.length + 4;
      while (!(current.x === startX && current.y === startY) && guard > 0) {
        guard -= 1;
        const list = outgoing.get(pointKey(current.x, current.y));
        if (!list || list.length === 0) break;
        const next = list.shift()!;
        if (!(next.x === startX && next.y === startY)) {
          points.push(next.x, next.y);
        }
        current = next;
      }
      if (current.x === startX && current.y === startY && points.length >= 6) {
        contours.push({ points: removeCollinearPoints(points), closed: true });
      }
    }
  }
  return contours;
}

/** 직선 구간 중간의 공선 정점을 접는다(닫힌 링, 감기 방향 무관). */
function removeCollinearPoints(points: number[]): number[] {
  let current = points;
  let changed = true;
  while (changed && current.length > 6) {
    changed = false;
    const kept: number[] = [];
    const count = current.length / 2;
    for (let i = 0; i < count; i += 1) {
      const prev = ((i - 1 + count) % count) * 2;
      const next = ((i + 1) % count) * 2;
      const ax = current[prev]!;
      const ay = current[prev + 1]!;
      const bx = current[i * 2]!;
      const by = current[i * 2 + 1]!;
      const cx = current[next]!;
      const cy = current[next + 1]!;
      const cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
      const dot = (bx - ax) * (cx - bx) + (by - ay) * (cy - by);
      if (cross === 0 && dot > 0) {
        changed = true;
        continue;
      }
      kept.push(bx, by);
    }
    if (kept.length >= 6) current = kept;
    else break;
  }
  return current;
}

function ringSignedArea(points: readonly number[]): number {
  let area = 0;
  const count = points.length / 2;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    area += points[i * 2]! * points[j * 2 + 1]! - points[j * 2]! * points[i * 2 + 1]!;
  }
  return area / 2;
}

function perpendicularDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return Math.hypot(px - ax, py - ay);
  return Math.abs((py - ay) * dx - (px - ax) * dy) / length;
}

/** 열린 폴리라인 Douglas–Peucker. 양 끝점은 항상 유지한다. */
function simplifyOpenChain(points: readonly VectorPoint2D[], tolerance: number): VectorPoint2D[] {
  if (points.length <= 2) return [...points];
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop()!;
    const a = points[from]!;
    const b = points[to]!;
    let maxDistance = 0;
    let maxIndex = -1;
    for (let i = from + 1; i < to; i += 1) {
      const distance = perpendicularDistance(points[i]!.x, points[i]!.y, a.x, a.y, b.x, b.y);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    if (maxIndex >= 0 && maxDistance > tolerance) {
      keep[maxIndex] = true;
      stack.push([from, maxIndex], [maxIndex, to]);
    }
  }
  return points.filter((_, index) => keep[index]);
}

/**
 * 닫힌 링 단순화: 첫 정점에서 가장 먼 정점에서 링을 펼쳐 두 개의 열린
 * 체인으로 나눠 각각 Douglas–Peucker를 적용한다. 단순화로 면적이 25% 넘게
 * 변하거나 정점이 3개 미만이 되면 원본 링을 유지한다(가는 선 보호).
 */
export function simplifyStudioLtVectorContour(
  points: readonly number[],
  tolerance: number,
): number[] {
  const flat = [...points];
  if (!(tolerance > 0) || flat.length <= 8) return flat;
  const ring: VectorPoint2D[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    ring.push({ x: flat[i]!, y: flat[i + 1]! });
  }
  const origin = ring[0]!;
  let farIndex = 0;
  let farDistance = -1;
  ring.forEach((point, index) => {
    const distance = Math.hypot(point.x - origin.x, point.y - origin.y);
    if (distance > farDistance) {
      farDistance = distance;
      farIndex = index;
    }
  });
  if (farIndex === 0) return flat;
  const chainA = ring.slice(0, farIndex + 1);
  const chainB = [...ring.slice(farIndex), ring[0]!];
  const simplified = [
    ...simplifyOpenChain(chainA, tolerance).slice(0, -1),
    ...simplifyOpenChain(chainB, tolerance).slice(0, -1),
  ];
  if (simplified.length < 3) return flat;
  const simplifiedFlat = simplified.flatMap((point) => [point.x, point.y]);
  const originalArea = Math.abs(ringSignedArea(flat));
  const simplifiedArea = Math.abs(ringSignedArea(simplifiedFlat));
  if (originalArea === 0 || Math.abs(simplifiedArea - originalArea) / originalArea > 0.25) {
    return flat;
  }
  return simplifiedFlat;
}

// ---------------------------------------------------------------------------
// 3) 착지 — 조각 → VectorStroke / SVG
// ---------------------------------------------------------------------------

/** 평탄한 점열 → 앵커 목록. 연속 중복과 닫힘 반복을 제거한다. */
function piecePointsToAnchors(points: readonly number[]): VectorPoint2D[] {
  const anchors: VectorPoint2D[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]!;
    const y = points[i + 1]!;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const last = anchors[anchors.length - 1];
    if (last && last.x === x && last.y === y) continue;
    anchors.push({ x, y });
  }
  if (anchors.length > 1) {
    const first = anchors[0]!;
    const last = anchors[anchors.length - 1]!;
    if (first.x === last.x && first.y === last.y) anchors.pop();
  }
  return anchors;
}

/** 앵커 폴리곤 → 닫힌 직선 큐빅 세그먼트(폴리곤과 기하 정확 일치). */
function anchorsToClosedSegments(anchors: readonly VectorPoint2D[]): VectorCubicSegment[] {
  const segments: VectorCubicSegment[] = [];
  for (let i = 0; i < anchors.length; i += 1) {
    const a = anchors[i]!;
    const b = anchors[(i + 1) % anchors.length]!;
    segments.push({
      p0: { x: a.x, y: a.y },
      p1: { x: a.x + (b.x - a.x) / 3, y: a.y + (b.y - a.y) / 3 },
      p2: { x: a.x + ((b.x - a.x) * 2) / 3, y: a.y + ((b.y - a.y) * 2) / 3 },
      p3: { x: b.x, y: b.y },
    });
  }
  return segments;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * LT 변환 결과의 주선을 편집 가능한 벡터 패스로 변환한다.
 * 주선이 없으면 빈 레이어와 pieceCount 0을 돌려준다(호출 측이 안내를 띄운다).
 *
 * @throws {StudioLtConvertError} 선화 레이어 입력이 올바르지 않으면 발생.
 */
export function convertStudioLtResultToVectorLine(
  result: StudioLtConvertResult,
  options: StudioLtVectorLineOptions = {},
): StudioLtVectorLineConversion {
  if (!result || typeof result !== "object") {
    throw new StudioLtConvertError("invalid-input", "LT 변환 결과가 필요합니다.");
  }
  const id = options.id ?? "lt-vector-line";
  const name = options.name ?? "LT 주선 · 벡터";
  const color = options.color ?? "#000000";
  const rawWidth = finiteOr(options.strokeWidth, 1);
  const strokeWidth = Math.max(VECTOR_STROKE_MIN_WIDTH_PX, rawWidth);
  const tolerance = Math.max(
    0,
    finiteOr(options.simplifyTolerance, STUDIO_LT_VECTOR_DEFAULT_SIMPLIFY_TOLERANCE),
  );
  const scale = finiteOr(options.scale, 1);
  const offsetX = finiteOr(options.offsetX, 0);
  const offsetY = finiteOr(options.offsetY, 0);

  const empty = (
    linePixelCount: number,
    contourCount: number,
  ): StudioLtVectorLineConversion =>
    Object.freeze({
      layer: createVectorLayer({ id, name, strokes: [] }),
      svg: "",
      pieceCount: 0,
      contourCount,
      holeCount: 0,
      linePixelCount,
      skippedCount: 0,
      bounds: null,
    });

  const lineMask = extractStudioLtLineMask(result.lineLayer);
  if (lineMask.pixelCount === 0) return empty(0, 0);

  const rawContours = traceStudioLtLineMaskToContours(
    lineMask.mask,
    lineMask.width,
    lineMask.height,
  );
  if (rawContours.length === 0) return empty(lineMask.pixelCount, 0);

  const contours = rawContours.map((contour) => {
    const simplified = simplifyStudioLtVectorContour(contour.points, tolerance);
    return {
      closed: true as const,
      points: simplified.map((value, index) =>
        index % 2 === 0 ? value * scale + offsetX : value * scale + offsetY,
      ),
    };
  });

  const traced = traceContoursToPieces(contours);
  if (!traced.ok) return empty(lineMask.pixelCount, rawContours.length);

  const strokes: VectorStroke[] = [];
  const pathDataParts: string[] = [];
  let skippedCount = 0;
  let holeCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  traced.pieces.forEach((piece, pieceIndex) => {
    holeCount += piece.holeCount;
    pathDataParts.push(tracePieceToSvgPathData(piece));
    minX = Math.min(minX, piece.bounds.x);
    minY = Math.min(minY, piece.bounds.y);
    maxX = Math.max(maxX, piece.bounds.x + piece.bounds.width);
    maxY = Math.max(maxY, piece.bounds.y + piece.bounds.height);
    const anchors = piecePointsToAnchors(piece.points);
    if (anchors.length < 3) {
      skippedCount += 1;
      return;
    }
    const segments = anchorsToClosedSegments(anchors);
    strokes.push(
      createVectorStroke({
        id: `${id}-stroke-${pieceIndex}`,
        segments,
        widths: Array.from({ length: segments.length + 1 }, () => strokeWidth),
        color,
        opacity: 1,
        closed: true,
      }),
    );
  });

  const layer = createVectorLayer({ id, name, strokes });
  const pathData = pathDataParts.filter((part) => part.length > 0).join(" ");
  const bounds =
    strokes.length > 0 || pathData.length > 0
      ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      : null;
  const svgLayers: StudioImageTraceSvgLayer[] = pathData
    ? [{ color, pathData }]
    : [];
  return Object.freeze({
    layer,
    svg: bounds ? buildStudioImageTraceSvg(svgLayers, bounds) : "",
    pieceCount: traced.pieces.length,
    contourCount: rawContours.length,
    holeCount,
    linePixelCount: lineMask.pixelCount,
    skippedCount,
    bounds,
  });
}
