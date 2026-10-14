/**
 * Studio Wrap-around — 라이브 랩 드로잉 순수 기하 모델 (Krita Wrap-around 방식).
 *
 * 패턴 타일을 "그리는 동안" 3×3 고스트로 이음새를 확인하고, 경계를 넘는 획을
 * 타일 안에 들어가는 조각들로 나눠 저장하기 위한 모델이다. 기존
 * studio-seamless-tile은 "다 그린 타일을 심리스로 변환"하는 후처리 전용이라
 * 역할이 다르며(그쪽의 feather·이음새 점수는 그대로 유지), 이 모듈은 그리기
 * 중의 기하만 담당한다. 전부 결정적·입력 무변이·DOM 무의존 순수 함수다.
 *
 * 좌표 규약:
 *  - 타일은 [0, width] × [0, height] 직사각형. 저장되는 획은 항상 이 안에 있다.
 *  - 그리는 중의 획은 고스트 영역까지 확장된 좌표(-width..2*width 등)를 가질 수
 *    있다. 렌더러는 ghostWrapStrokes로 필요한 오프셋 복사본만 받아 그리고,
 *    저장 시에는 splitStrokeAtTileEdges로 타일 안 조각들로 확정한다.
 */

export interface WrapAroundTileSize {
  readonly width: number;
  readonly height: number;
}

export interface WrapAroundPoint {
  readonly x: number;
  readonly y: number;
}

export interface WrapAroundOffset {
  readonly dx: number;
  readonly dy: number;
}

/** 고스트 렌더용 획 복사본 — 어느 타일 오프셋으로 이동한 복사본인지 함께 돌려준다. */
export interface WrapAroundGhostStroke {
  readonly offset: WrapAroundOffset;
  readonly points: readonly WrapAroundPoint[];
}

export interface WrapAroundBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const EPS = 1e-6;

/** 3×3 오프셋 전체 — dy 바깥 루프, dx 안쪽 루프 순(행 우선). */
export const WRAP_AROUND_OFFSETS: readonly WrapAroundOffset[] = (() => {
  const out: WrapAroundOffset[] = [];
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) out.push({ dx, dy });
  return out;
})();

function assertWrapTileSize(tile: WrapAroundTileSize, context: string): void {
  if (!Number.isFinite(tile.width) || !Number.isFinite(tile.height) || tile.width <= 0 || tile.height <= 0) {
    throw new Error(`${context}: 타일 크기가 잘못되었습니다 (${tile.width}×${tile.height}).`);
  }
}

/** 점을 타일 안 정규 위치로 감싼다. 정확히 가장자리(width/height)에 있는 점은 0으로 감긴다. */
export function wrapPointIntoTile(p: WrapAroundPoint, tile: WrapAroundTileSize): WrapAroundPoint {
  assertWrapTileSize(tile, "wrapPointIntoTile");
  const x = ((p.x % tile.width) + tile.width) % tile.width;
  const y = ((p.y % tile.height) + tile.height) % tile.height;
  return { x, y };
}

/** 점들의 경계 상자. 빈 배열이면 null. */
export function wrapStrokeBounds(points: readonly WrapAroundPoint[]): WrapAroundBounds | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 획의 경계 상자가 닿는 오프셋만 돌려준다 (9개 전부 그리는 낭비 방지).
 * 경계에 걸치지 않은 획은 중앙 오프셋 {0,0} 1개만 받는다. 경계에 정확히
 * 닿기만 한 경우(maxX === width 등)는 고스트가 필요 없어 포함하지 않는다.
 */
export function visibleWrapOffsets(
  bounds: WrapAroundBounds,
  tile: WrapAroundTileSize,
): readonly WrapAroundOffset[] {
  assertWrapTileSize(tile, "visibleWrapOffsets");
  const xs = [0];
  const ys = [0];
  if (bounds.minX < 0) xs.push(1);
  if (bounds.maxX > tile.width) xs.push(-1);
  if (bounds.minY < 0) ys.push(1);
  if (bounds.maxY > tile.height) ys.push(-1);
  const out: WrapAroundOffset[] = [];
  for (const dy of ys) for (const dx of xs) out.push({ dx, dy });
  return out;
}

/** 오프셋을 적용한 점 복사본 (고스트 렌더용). 입력은 변이하지 않는다. */
export function translateWrapPoints(
  points: readonly WrapAroundPoint[],
  offset: WrapAroundOffset,
  tile: WrapAroundTileSize,
): readonly WrapAroundPoint[] {
  return points.map((p) => ({
    x: p.x + offset.dx * tile.width,
    y: p.y + offset.dy * tile.height,
  }));
}

/**
 * 그리는 중인 획을 화면에 그릴 고스트 복사본들.
 * 경계를 넘는 획은 반대편 가장자리에 이어진 복사본이 함께 돌아와, 사용자는
 * 이음새가 어떻게 맞물리는지 그리면서 볼 수 있다.
 */
export function ghostWrapStrokes(
  points: readonly WrapAroundPoint[],
  tile: WrapAroundTileSize,
): readonly WrapAroundGhostStroke[] {
  assertWrapTileSize(tile, "ghostWrapStrokes");
  const bounds = wrapStrokeBounds(points);
  if (bounds == null) return [];
  return visibleWrapOffsets(bounds, tile).map((offset) => ({
    offset,
    points: translateWrapPoints(points, offset, tile),
  }));
}

/** 점이 전부 타일 경계 안(가장자리 포함)에 있는지 — 저장 확정 전 검수용. */
export function isWrapStrokeInsideTile(
  points: readonly WrapAroundPoint[],
  tile: WrapAroundTileSize,
): boolean {
  assertWrapTileSize(tile, "isWrapStrokeInsideTile");
  return points.every(
    (p) => p.x >= -EPS && p.x <= tile.width + EPS && p.y >= -EPS && p.y <= tile.height + EPS,
  );
}

function clipSegmentToTile(
  a: WrapAroundPoint,
  b: WrapAroundPoint,
  tile: WrapAroundTileSize,
): readonly [WrapAroundPoint, WrapAroundPoint] | null {
  // Liang–Barsky: 구간 [0,1]을 타일 직사각형으로 자른다.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [a.x, tile.width - a.x, a.y, tile.height - a.y];
  for (let i = 0; i < 4; i += 1) {
    const pi = p[i]!;
    const qi = q[i]!;
    if (pi === 0) {
      if (qi < 0) return null;
      continue;
    }
    const r = qi / pi;
    if (pi < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  if (t1 < t0) return null;
  // 보간 부동소수점 오차로 경계 밖으로 ε만큼 새는 것을 막는다 — 저장 조각은
  // 정확히 타일 안에 들어가는 것이 계약이라 끝점을 경계로 클램프한다.
  const clampX = (x: number): number => Math.min(tile.width, Math.max(0, x));
  const clampY = (y: number): number => Math.min(tile.height, Math.max(0, y));
  return [
    { x: clampX(a.x + t0 * dx), y: clampY(a.y + t0 * dy) },
    { x: clampX(a.x + t1 * dx), y: clampY(a.y + t1 * dy) },
  ];
}

function samePoint(a: WrapAroundPoint, b: WrapAroundPoint): boolean {
  return Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
}

/**
 * 경계를 넘나드는 획을 타일 안에 들어가는 조각들로 나눈다.
 * 각 구간을 9개 오프셋으로 이동한 뒤 타일로 잘라, 살아남은 조각을 모은다 —
 * 저장 포맷은 "타일 안 조각들"이 되어 패턴 채우기와 그대로 맞물린다.
 * 조각의 모든 점은 [0, width] × [0, height] 안에 있고, 원래 획의 타일 안
 * 부분과 길이가 보존된다(구간이 경계에 점으로만 닿는 0길이 조각은 버린다).
 * 점 1개짜리 획(점 찍기)은 정규 위치로 감싼 1점 조각으로 돌려준다.
 */
export function splitStrokeAtTileEdges(
  points: readonly WrapAroundPoint[],
  tile: WrapAroundTileSize,
): readonly (readonly WrapAroundPoint[])[] {
  assertWrapTileSize(tile, "splitStrokeAtTileEdges");
  if (points.length === 0) return [];
  if (points.length === 1) return [[wrapPointIntoTile(points[0]!, tile)]];

  const pieces: WrapAroundPoint[][] = [];
  let current: WrapAroundPoint[] = [];
  const flush = () => {
    if (current.length >= 2) pieces.push(current);
    current = [];
  };
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    let produced = false;
    for (const offset of WRAP_AROUND_OFFSETS) {
      const shiftedA: WrapAroundPoint = {
        x: a.x + offset.dx * tile.width,
        y: a.y + offset.dy * tile.height,
      };
      const shiftedB: WrapAroundPoint = {
        x: b.x + offset.dx * tile.width,
        y: b.y + offset.dy * tile.height,
      };
      const clipped = clipSegmentToTile(shiftedA, shiftedB, tile);
      if (clipped == null) continue;
      const [start, end] = clipped;
      if (samePoint(start, end)) continue; // 경계에 점으로만 닿은 구간 — 그릴 게 없다.
      produced = true;
      if (current.length === 0) {
        current = [start, end];
      } else if (samePoint(current[current.length - 1]!, start)) {
        current.push(end);
      } else {
        flush();
        current = [start, end];
      }
    }
    if (!produced) flush();
  }
  flush();
  return pieces;
}
