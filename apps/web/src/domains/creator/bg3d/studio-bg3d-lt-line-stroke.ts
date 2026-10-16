/**
 * LT 선의 연속 픽셀 폭 단계(stroke).
 *
 * 입력은 "한 픽셀 두께 중심선" 반응(0..255)이다. 이 모듈은 그 중심선을 사용자가 정한 선 폭
 * `widthPx`(0.25..8px)만큼 두껍게 칠한다. 예전에는 폭을 `ceil((w-1)/2)` 정수 반경(0..4 의 5단계)으로
 * 끊어 최대값 팽창(max filter)을 했기 때문에 슬라이더의 미세한 값이 결과를 바꾸지 못했고 두께도 항상
 * 설정값의 약 2배였다.
 *
 * 방식: 거리 기반 서브픽셀 가중치(분석적 안티앨리어싱).
 * - 중심선 픽셀에서 유클리드 거리 d 만큼 떨어진 픽셀의 덮임 비율은 `clamp(w/2 + 0.5 - d, 0, 1)` 이다.
 *   축 정렬 선에서는 정수 오프셋의 덮임 합이 정확히 w 가 되므로(예: w=1.5 → 1 + 2×0.25) "평균 선 두께 = 설정값"이
 *   성립하고, w 가 조금만 변해도 가장자리 픽셀의 농도가 연속적으로 변한다.
 * - 1px 미만은 폭 1 로 그리되 농도를 w 배로 줄인다(머리카락 선 표현의 표준 방식). w=1 에서 두 식이 이어진다.
 * - 8-연결로 이어진 대각선은 격자 점까지의 거리만 쓰면 축 정렬 선보다 얇아 보이므로(45°에서 약 0.71배),
 *   대각 이웃 두 픽셀 사이 중점을 가상 표본으로 더해 "선분까지의 거리"에 가깝게 만든다. 비스듬한 선의
 *   두께 오차는 폭 1 근처에서 대략 +16% 이내, 폭 3 이상에서 +8% 이내다(문서 참조).
 * - 겹치는 기여는 합이 아니라 최대값으로 합친다(기존 팽창과 같은 규칙이라 농도가 넘치지 않는다).
 *
 * 순수 타입 배열 연산이며 DOM·캔버스를 쓰지 않는다. 입력은 바꾸지 않는다. 한 픽셀이 받는 영향은
 * `studioBg3dLtStrokeReach(widthPx)` 픽셀 이내의 입력뿐이라(대각 중점 표본은 +1) 타일 경계 보정(헤일로)
 * 계산에 쓸 수 있다.
 */

export const STUDIO_BG3D_LT_STROKE_MIN_WIDTH_PX = 0.25;
/**
 * 칠하기 함수가 받는 폭의 상한. 사용자 설정 상한은 8px 이고, 16 은 물체 안쪽으로만 그리는 윤곽(폭 `2w - 1`)을
 * 위한 내부 여유다.
 */
export const STUDIO_BG3D_LT_STROKE_MAX_WIDTH_PX = 16;

/** 덮임 비율을 0..256 정수로 양자화하는 배율(정수 연산으로 플랫폼 차이를 없앤다). */
const WEIGHT_SCALE = 256;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function assertWidthPx(widthPx: number): void {
  if (
    typeof widthPx !== "number" ||
    !Number.isFinite(widthPx) ||
    widthPx < STUDIO_BG3D_LT_STROKE_MIN_WIDTH_PX ||
    widthPx > STUDIO_BG3D_LT_STROKE_MAX_WIDTH_PX
  ) {
    throw new RangeError(
      `LT stroke width must be a finite number in [${STUDIO_BG3D_LT_STROKE_MIN_WIDTH_PX}, ${STUDIO_BG3D_LT_STROKE_MAX_WIDTH_PX}].`
    );
  }
}

/**
 * 중심선에서 `distance`px 떨어진 픽셀 중심이 폭 `widthPx` 선에서 받는 덮임 비율(0..1).
 * 1px 미만 폭은 폭 1 형태에 농도 `widthPx` 를 곱한다.
 */
export function studioBg3dLtStrokeCoverage(distance: number, widthPx: number): number {
  const geometric = clamp01(Math.max(widthPx, 1) / 2 + 0.5 - distance);
  return widthPx < 1 ? geometric * widthPx : geometric;
}

/** 덮임 비율이 0 보다 큰 가장 먼 정수 오프셋(타일 헤일로 예산 계산용). */
export function studioBg3dLtStrokeReach(widthPx: number): number {
  assertWidthPx(widthPx);
  return Math.max(0, Math.ceil(Math.max(widthPx, 1) / 2 + 0.5) - 1);
}

/** 한 번의 칠하기에 쓰는 오프셋·가중치 표(타입 배열로 평평하게 펴 둔다). */
interface SplatTable {
  readonly count: number;
  readonly dx: Int8Array;
  readonly dy: Int8Array;
  readonly weight: Uint16Array;
}

function quantizedCoverage(distance: number, widthPx: number): number {
  return Math.round(studioBg3dLtStrokeCoverage(distance, widthPx) * WEIGHT_SCALE);
}

function tableFrom(entries: readonly (readonly [number, number, number])[]): SplatTable {
  return {
    count: entries.length,
    dx: Int8Array.from(entries, (entry) => entry[0]),
    dy: Int8Array.from(entries, (entry) => entry[1]),
    weight: Uint16Array.from(entries, (entry) => entry[2]),
  };
}

function centerTable(widthPx: number, reach: number): SplatTable {
  const entries: [number, number, number][] = [];
  for (let dy = -reach; dy <= reach; dy += 1) {
    for (let dx = -reach; dx <= reach; dx += 1) {
      const weight = quantizedCoverage(Math.hypot(dx, dy), widthPx);
      if (weight > 0) entries.push([dx, dy, weight]);
    }
  }
  return tableFrom(entries);
}

/**
 * 대각 이웃 (x, y)–(x+sideways, y+1) 사이 중점에 대한 표. 끝점 표본이 이미 주는 값보다 큰 곳만 넣어
 * 작업량을 줄인다(그렇지 않은 곳은 최대값 규칙상 결과에 영향이 없다).
 */
function midpointTable(widthPx: number, reach: number, sideways: 1 | -1): SplatTable {
  const entries: [number, number, number][] = [];
  const midX = sideways * 0.5;
  for (let dy = -reach; dy <= reach + 1; dy += 1) {
    for (let dx = -reach - 1; dx <= reach + 1; dx += 1) {
      const weight = quantizedCoverage(Math.hypot(dx - midX, dy - 0.5), widthPx);
      if (weight <= 0) continue;
      const endpointBest = Math.max(
        quantizedCoverage(Math.hypot(dx, dy), widthPx),
        quantizedCoverage(Math.hypot(dx - sideways, dy - 1), widthPx)
      );
      if (weight > endpointBest) entries.push([dx, dy, weight]);
    }
  }
  return tableFrom(entries);
}

function tableMargin(table: SplatTable): number {
  let margin = 0;
  for (let k = 0; k < table.count; k += 1) {
    margin = Math.max(margin, Math.abs(table.dx[k]!), Math.abs(table.dy[k]!));
  }
  return margin;
}

/**
 * 한 중심선 픽셀(`value`, 위치 x,y)에서 표의 모든 오프셋으로 `output` 에 최대값 규칙으로 칠한다.
 * `interior` 이면 경계 검사를 생략한다(표 최대 오프셋 안쪽 픽셀).
 */
function splat(
  output: Uint8ClampedArray,
  table: SplatTable,
  width: number,
  height: number,
  x: number,
  y: number,
  value: number,
  interior: boolean
): void {
  const base = y * width + x;
  for (let k = 0; k < table.count; k += 1) {
    const dx = table.dx[k]!;
    const dy = table.dy[k]!;
    if (!interior) {
      const tx = x + dx;
      const ty = y + dy;
      if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
    }
    const target = base + dy * width + dx;
    const candidate = (value * table.weight[k]! + WEIGHT_SCALE / 2) >> 8;
    if (candidate > output[target]!) output[target] = candidate;
  }
}

export interface StudioBg3dLtStrokeOptions {
  /**
   * 8-연결 대각 이웃 사이 중점을 가상 표본으로 쓸지(기본 true). 이어진 선분에는 켜고, 서로 이어지지 않은
   * 반점(재질선)에는 끈다.
   */
  readonly diagonalMidpoints?: boolean;
}

/**
 * 한 줄 중심선 반응(`response`, 행 우선 width×height)을 폭 `widthPx` 의 선으로 칠한 새 배열을 돌려준다.
 * 입력 배열은 바꾸지 않고 항상 새 배열을 돌려준다.
 */
export function strokeStudioBg3dLtResponse(
  response: Uint8ClampedArray,
  width: number,
  height: number,
  widthPx: number,
  options: StudioBg3dLtStrokeOptions = {}
): Uint8ClampedArray {
  assertWidthPx(widthPx);
  if (response.length !== width * height) {
    throw new RangeError("LT stroke response length must equal width * height.");
  }
  const reach = studioBg3dLtStrokeReach(widthPx);
  const center = centerTable(widthPx, reach);
  const useMidpoints = options.diagonalMidpoints !== false;
  const diagonal = useMidpoints ? midpointTable(widthPx, reach, 1) : tableFrom([]);
  const antiDiagonal = useMidpoints ? midpointTable(widthPx, reach, -1) : tableFrom([]);
  const margin = Math.max(tableMargin(center), tableMargin(diagonal), tableMargin(antiDiagonal));
  const output = new Uint8ClampedArray(response.length);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const rowInterior = y >= margin && y < height - margin;
    for (let x = 0; x < width; x += 1) {
      const index = row + x;
      const value = response[index]!;
      if (value === 0) continue;
      const interior = rowInterior && x >= margin && x < width - margin;
      splat(output, center, width, height, x, y, value, interior);
      if (y + 1 >= height) continue;
      if (diagonal.count > 0 && x + 1 < width) {
        const other = response[index + width + 1]!;
        if (other !== 0) {
          splat(output, diagonal, width, height, x, y, (value + other) >> 1, interior);
        }
      }
      if (antiDiagonal.count > 0 && x >= 1) {
        const other = response[index + width - 1]!;
        if (other !== 0) {
          splat(output, antiDiagonal, width, height, x, y, (value + other) >> 1, interior);
        }
      }
    }
  }
  return output;
}
