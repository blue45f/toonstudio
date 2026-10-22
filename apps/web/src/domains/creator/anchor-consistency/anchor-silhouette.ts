/**
 * 실루엣·비율 특징 — 피사체 마스크의 바깥 상자, 면적 분포, 12×16 점유 격자, 위·중·하 세 구간의 질량.
 *
 * 몸의 부위(머리·팔·다리)를 가정하지 않는다. 마스크가 얼마나 어디에 있는지만 본다. 포즈가 다르면 실루엣은 크게 달라지므로
 * 이 값은 "포즈가 같은 컷끼리 비율이 비슷한가"를 보는 보조 신호이고, 같은 캐릭터인지의 판정이 아니다.
 */

export const ANCHOR_SILHOUETTE_GRID = Object.freeze({ cols: 12, rows: 16 });

export interface AnchorSilhouette {
  /** 분석 래스터 좌표의 바깥 상자(끝 픽셀 포함). */
  readonly bbox: Readonly<{ x0: number; y0: number; x1: number; y1: number }>;
  /** 바깥 상자의 가로·세로가 화면에서 차지하는 비율. */
  readonly widthFrac: number;
  readonly heightFrac: number;
  /** 바깥 상자 중심의 화면 안 위치(0~1). */
  readonly centerX: number;
  readonly centerY: number;
  /** 바깥 상자의 가로÷세로. */
  readonly aspect: number;
  /** 마스크 면적 ÷ 바깥 상자 면적. */
  readonly fill: number;
  /** 바깥 상자를 세로로 삼등분했을 때 각 구간이 가진 마스크 면적의 비율(합 1). */
  readonly thirds: readonly [number, number, number];
  /** 바깥 상자 안의 점유율 격자(행 우선, 길이 cols×rows, 각 0~1). */
  readonly grid: readonly number[];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 마스크가 비어 있으면 null. */
export function computeAnchorSilhouette(mask: Uint8Array, width: number, height: number): AnchorSilhouette | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let area = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x] !== 1) continue;
      area += 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (area === 0) return null;
  const boxWidth = x1 - x0 + 1;
  const boxHeight = y1 - y0 + 1;
  const { cols, rows } = ANCHOR_SILHOUETTE_GRID;
  const cellOn = new Float64Array(cols * rows);
  const cellAll = new Float64Array(cols * rows);
  const bands = [0, 0, 0];
  for (let y = y0; y <= y1; y += 1) {
    const row = Math.min(rows - 1, Math.floor(((y - y0) * rows) / boxHeight));
    const band = Math.min(2, Math.floor(((y - y0) * 3) / boxHeight));
    for (let x = x0; x <= x1; x += 1) {
      const col = Math.min(cols - 1, Math.floor(((x - x0) * cols) / boxWidth));
      const cell = row * cols + col;
      cellAll[cell] = (cellAll[cell] ?? 0) + 1;
      if (mask[y * width + x] === 1) {
        cellOn[cell] = (cellOn[cell] ?? 0) + 1;
        bands[band] = (bands[band] ?? 0) + 1;
      }
    }
  }
  const grid: number[] = [];
  for (let cell = 0; cell < cols * rows; cell += 1) {
    const all = cellAll[cell] ?? 0;
    grid.push(all === 0 ? 0 : round3((cellOn[cell] ?? 0) / all));
  }
  return Object.freeze({
    bbox: Object.freeze({ x0, y0, x1, y1 }),
    widthFrac: round3(boxWidth / width),
    heightFrac: round3(boxHeight / height),
    centerX: round3((x0 + boxWidth / 2) / width),
    centerY: round3((y0 + boxHeight / 2) / height),
    aspect: round3(boxWidth / boxHeight),
    fill: round3(area / (boxWidth * boxHeight)),
    thirds: Object.freeze([round3((bands[0] ?? 0) / area), round3((bands[1] ?? 0) / area), round3((bands[2] ?? 0) / area)] as const),
    grid: Object.freeze(grid),
  });
}

export interface AnchorSilhouetteSimilarity {
  /** 0~1. 아래 부분 점수를 가중 평균한 뒤 가로세로 비 불일치로 깎은 값(가중치는 휴리스틱). */
  readonly score: number;
  /** 점유 격자의 겹침 정도(soft IoU). 좌우를 뒤집은 쪽이 더 비슷하면 그 값을 쓴다. */
  readonly gridOverlap: number;
  readonly mirrored: boolean;
  readonly aspect: number;
  readonly thirds: number;
  readonly fill: number;
}

/**
 * 부분 점수 가중치(합 1). 근거 있는 값이 아니라 판단으로 정한 값이다.
 * 점유 격자는 바깥 상자 안에서 정규화하므로 가로세로 비를 잃는다. 그래서 가로세로 비는 가중 평균에 더하지 않고, 평균을
 * 깎는 계수로 따로 쓴다(`ANCHOR_SILHOUETTE_ASPECT_FLOOR`).
 */
export const ANCHOR_SILHOUETTE_WEIGHTS = Object.freeze({ gridOverlap: 0.55, thirds: 0.3, fill: 0.15 });

/** 가로세로 비가 2배 이상 어긋나면 평균이 이 비율까지 깎인다(1 이면 깎지 않음). 휴리스틱. */
export const ANCHOR_SILHOUETTE_ASPECT_FLOOR = 0.5;

function softIou(left: readonly number[], right: readonly number[], mirrorRight: boolean): number {
  const { cols } = ANCHOR_SILHOUETTE_GRID;
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < left.length; index += 1) {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const a = left[index] ?? 0;
    const b = right[mirrorRight ? row * cols + (cols - 1 - col) : index] ?? 0;
    intersection += Math.min(a, b);
    union += Math.max(a, b);
  }
  return union === 0 ? 1 : intersection / union;
}

export function compareAnchorSilhouettes(left: AnchorSilhouette, right: AnchorSilhouette): AnchorSilhouetteSimilarity {
  const direct = softIou(left.grid, right.grid, false);
  const flipped = softIou(left.grid, right.grid, true);
  const mirrored = flipped > direct;
  const gridOverlap = Math.max(direct, flipped);
  const aspect = 1 - Math.min(1, Math.abs(Math.log(left.aspect / right.aspect)) / Math.log(2));
  const thirds = Math.min(1, Math.max(0, 1 - 0.5 * left.thirds.reduce((sum, value, index) => sum + Math.abs(value - (right.thirds[index] ?? 0)), 0)));
  const fill = 1 - Math.min(1, Math.abs(left.fill - right.fill) / 0.3);
  const weights = ANCHOR_SILHOUETTE_WEIGHTS;
  const base = weights.gridOverlap * gridOverlap + weights.thirds * thirds + weights.fill * fill;
  const score = base * (ANCHOR_SILHOUETTE_ASPECT_FLOOR + (1 - ANCHOR_SILHOUETTE_ASPECT_FLOOR) * aspect);
  return Object.freeze({ score: Math.min(1, Math.max(0, score)), gridOverlap, mirrored, aspect, thirds, fill });
}
