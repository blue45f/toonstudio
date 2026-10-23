/**
 * 종이 결(paper grain) 타일 — 결정적(mulberry32 + fnv1a32 시드), 이음매 없이 반복되는 8bit 회색 바이트(2026-10-23 CORE-1).
 * 같은 바이트를 뷰포트 후처리(R-4)와 내보내기 CPU 곱(X-1)이 함께 쓴다(설계 §3.1 "같은 바이트") — 외부 텍스처가 없다(라이선스 0).
 *
 * 값 의미: 255 = 흰 종이(곱 1), 낮을수록 결이 어둡다. 합성은 `color × paperGrainFactor(byte, look.paper.strength)`.
 * 생성: 격자 주기가 타일 크기를 나누는 값 노이즈(smoothstep 보간) 옥타브 합이라 가장자리가 이어진다(타일 반복에 이음매 없음).
 * - print: 고운 인쇄 용지(짧은 주기 2옥타브)
 * - watercolor: 냉압 수채지(큰 얼룩 + 중간 결)
 * - ink-wash: 화선지 섬유(가로·세로로 늘인 이방성 결 + 고운 결)
 * `Math.random`을 쓰지 않는다(architecture.test.ts). 같은 (kind, seed, size) → 같은 바이트.
 */
import { mulberry32, seedFromString } from "./prng";

export const PAPER_GRAIN_KINDS = ["watercolor", "ink-wash", "print"] as const;
export type PaperGrainKind = (typeof PAPER_GRAIN_KINDS)[number];

export const PAPER_GRAIN_DEFAULT_SIZE = 256;
export const PAPER_GRAIN_MIN_SIZE = 16;
export const PAPER_GRAIN_MAX_SIZE = 1024;

interface Octave {
  /** 가로·세로 격자 수(한 타일에 격자 칸이 몇 개인지). 타일 경계에서 격자가 감기므로 이음매가 없다. */
  readonly periodX: number;
  readonly periodY: number;
  readonly amplitude: number;
}

interface GrainRecipe {
  /** 결의 최대 깊이(0..1): 값 = 1 − depth · noise */
  readonly depth: number;
  /** 타일 크기 대비 격자 수(가로·세로)와 진폭 */
  readonly octaves: readonly { readonly cellsX: number; readonly cellsY: number; readonly amplitude: number }[];
}

/** 종류별 결 구성(격자 수는 크기 16에서도 나눠지는 2의 거듭제곱) */
export const PAPER_GRAIN_RECIPES: Readonly<Record<PaperGrainKind, GrainRecipe>> = Object.freeze({
  print: Object.freeze({ depth: 0.1, octaves: Object.freeze([{ cellsX: 8, cellsY: 8, amplitude: 0.45 }, { cellsX: 16, cellsY: 16, amplitude: 0.55 }]) }),
  watercolor: Object.freeze({
    depth: 0.18,
    octaves: Object.freeze([
      { cellsX: 2, cellsY: 2, amplitude: 0.45 },
      { cellsX: 4, cellsY: 4, amplitude: 0.3 },
      { cellsX: 16, cellsY: 16, amplitude: 0.25 },
    ]),
  }),
  "ink-wash": Object.freeze({
    depth: 0.15,
    octaves: Object.freeze([
      { cellsX: 2, cellsY: 16, amplitude: 0.35 },
      { cellsX: 16, cellsY: 2, amplitude: 0.35 },
      { cellsX: 16, cellsY: 16, amplitude: 0.3 },
    ]),
  }),
});

export interface PaperGrainOptions {
  readonly kind: PaperGrainKind;
  /** uint32(레시피 `look.paper.seed`) */
  readonly seed: number;
  /** 타일 한 변(16~1024, 2의 거듭제곱). 기본 256 */
  readonly size?: number;
}

export interface PaperGrainTile {
  readonly kind: PaperGrainKind;
  readonly seed: number;
  readonly size: number;
  /** size × size, 행 우선(top-down), 255 = 흰 종이 */
  readonly bytes: Uint8Array;
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value > 0 && (value & (value - 1)) === 0;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

function lattice(cellsX: number, cellsY: number, seed: number): Float64Array {
  const random = mulberry32(seed);
  const values = new Float64Array(cellsX * cellsY);
  for (let i = 0; i < values.length; i += 1) values[i] = random();
  return values;
}

/** 격자를 감싸는(주기적) 값 노이즈 한 옥타브 → [0, 1] */
function sampleOctave(values: Float64Array, octave: Octave, x: number, y: number, size: number): number {
  const gx = (x / size) * octave.periodX;
  const gy = (y / size) * octave.periodY;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = fade(gx - ix);
  const fy = fade(gy - iy);
  const x0 = ((ix % octave.periodX) + octave.periodX) % octave.periodX;
  const y0 = ((iy % octave.periodY) + octave.periodY) % octave.periodY;
  const x1 = (x0 + 1) % octave.periodX;
  const y1 = (y0 + 1) % octave.periodY;
  const at = (cx: number, cy: number): number => values[cy * octave.periodX + cx] ?? 0;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return top + (bottom - top) * fy;
}

/** 결정적 종이 결 타일을 만든다. 크기·시드가 규약 밖이면 throw(무음 대체 금지). */
export function createPaperGrain(options: PaperGrainOptions): PaperGrainTile {
  const size = options.size ?? PAPER_GRAIN_DEFAULT_SIZE;
  if (!isPowerOfTwo(size) || size < PAPER_GRAIN_MIN_SIZE || size > PAPER_GRAIN_MAX_SIZE) {
    throw new Error(`종이 결 타일 크기는 ${PAPER_GRAIN_MIN_SIZE}~${PAPER_GRAIN_MAX_SIZE}의 2의 거듭제곱이어야 합니다: ${size}`);
  }
  if (!Number.isInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff) {
    throw new Error(`종이 결 시드는 0~4294967295 정수여야 합니다: ${options.seed}`);
  }
  const recipe = PAPER_GRAIN_RECIPES[options.kind];
  if (recipe === undefined) throw new Error(`종이 결 종류가 아닙니다: ${String(options.kind)}`);
  const octaves = recipe.octaves.map((octave, index) => ({
    octave: { periodX: octave.cellsX, periodY: octave.cellsY, amplitude: octave.amplitude },
    values: lattice(octave.cellsX, octave.cellsY, seedFromString(`paper-grain:${options.kind}:${options.seed}:${index}`)),
  }));
  const total = recipe.octaves.reduce((sum, octave) => sum + octave.amplitude, 0);
  const bytes = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let noise = 0;
      for (const { octave, values } of octaves) noise += octave.amplitude * sampleOctave(values, octave, x, y, size);
      const value = 1 - recipe.depth * (noise / total);
      bytes[y * size + x] = Math.round(Math.min(1, Math.max(0, value)) * 255);
    }
  }
  return { kind: options.kind, seed: options.seed, size, bytes };
}

/** 타일 반복(감싸기) 쌍선형 표본. 좌표는 텍셀 단위(실수). */
export function samplePaperGrain(tile: PaperGrainTile, x: number, y: number): number {
  const { size, bytes } = tile;
  const wrap = (value: number): number => ((value % size) + size) % size;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const x0 = wrap(ix);
  const y0 = wrap(iy);
  const x1 = wrap(ix + 1);
  const y1 = wrap(iy + 1);
  const at = (cx: number, cy: number): number => bytes[cy * size + cx] ?? 255;
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return top + (bottom - top) * fy;
}

/** 곱 배율: mix(1, byte/255, strength). strength 0이면 1(종이 없음). */
export function paperGrainFactor(byte: number, strength: number): number {
  const s = Math.min(1, Math.max(0, strength));
  return 1 + (Math.min(255, Math.max(0, byte)) / 255 - 1) * s;
}

/** 출력 높이에서 1080p 기준 결 크기(px)를 텍셀 간격으로: 화면 1 px당 텍셀 수 = 1 / (grainPx1080 · height / 1080) */
export function paperGrainTexelsPerPixel(grainPx1080: number, outputHeight: number): number {
  if (!(grainPx1080 > 0) || !(outputHeight > 0)) throw new Error(`결 크기와 출력 높이는 양수여야 합니다: ${grainPx1080}, ${outputHeight}`);
  return 1 / ((grainPx1080 * outputHeight) / 1080);
}
