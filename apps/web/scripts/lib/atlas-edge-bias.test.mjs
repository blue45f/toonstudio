import { describe, expect, it } from "vitest";
import { atlasEdgeBias } from "./atlas-edge-bias.mjs";

const CELL = 16, COLUMNS = 3, ROWS = 2, CHANNELS = 3;
const layout = { width: CELL * COLUMNS, height: CELL * ROWS, cell: CELL, channels: CHANNELS };

/** 결정적 의사 난수(mulberry32). */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function atlas(seed = 5) {
  const next = random(seed);
  return Uint8Array.from({ length: layout.width * layout.height * CHANNELS }, () => 40 + Math.floor(next() * 170));
}

/** (x, y)의 채널별로 delta를 더한 복사본. */
function tinted(source, pixels, delta) {
  const copy = Uint8Array.from(source);
  for (const [x, y] of pixels) for (let c = 0; c < CHANNELS; c += 1) copy[(y * layout.width + x) * CHANNELS + c] += delta[c];
  return copy;
}

const rowOf = (cellColumn, cellRow, y) => Array.from({ length: CELL }, (_, k) => [cellColumn * CELL + k, cellRow * CELL + y]);
const columnOf = (cellColumn, cellRow, x) => Array.from({ length: CELL }, (_, k) => [cellColumn * CELL + x, cellRow * CELL + k]);

describe("atlasEdgeBias", () => {
  it("원본과 같으면 0이다", () => {
    const truth = atlas();
    expect(atlasEdgeBias(truth, Uint8Array.from(truth), layout)).toBe(0);
  });

  it("칸의 마지막 행만 이웃 색으로 틀어지면 그 편향의 크기를 돌려준다(돌길 마지막 행 R+10 G-2.5 B-14 사례)", () => {
    const truth = atlas();
    const decoded = tinted(truth, rowOf(0, 1, CELL - 1), [10, -3, -14]);
    expect(atlasEdgeBias(truth, decoded, layout)).toBeCloseTo(14, 5);
  });

  it("첫 열이나 마지막 열, 첫 행이 틀어져도 잡아낸다", () => {
    const truth = atlas(9);
    expect(atlasEdgeBias(truth, tinted(truth, columnOf(2, 0, CELL - 1), [0, 8, 0]), layout)).toBeCloseTo(8, 5);
    expect(atlasEdgeBias(truth, tinted(truth, columnOf(1, 1, 0), [-6, 0, 0]), layout)).toBeCloseTo(6, 5);
    expect(atlasEdgeBias(truth, tinted(truth, rowOf(1, 0, 0), [0, 0, 5]), layout)).toBeCloseTo(5, 5);
  });

  it("칸 전체가 같은 만큼 틀어진 것(가장자리 오염이 아닌 색 이동)은 안쪽과 상쇄되어 0이다", () => {
    const truth = atlas(3);
    const shifted = tinted(truth, Array.from({ length: CELL * CELL }, (_, i) => [(i % CELL) + CELL, Math.floor(i / CELL)]), [7, 7, 7]);
    expect(atlasEdgeBias(truth, shifted, layout)).toBe(0);
  });

  it("가장자리와 안쪽에 고르게 퍼진 인코딩 잡음은 편향으로 치지 않는다", () => {
    const truth = atlas(11);
    const next = random(77);
    const noisy = Uint8Array.from(truth, (value) => Math.max(0, Math.min(255, value + Math.round((next() - 0.5) * 8))));
    expect(atlasEdgeBias(truth, noisy, layout)).toBeLessThan(2);
  });

  it("원본과 복원 이미지의 크기가 다르면 오류를 낸다", () => {
    expect(() => atlasEdgeBias(atlas(), new Uint8Array(10), layout)).toThrow("크기가 다릅니다");
  });
});
