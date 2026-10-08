import { describe, expect, it } from "vitest";
import { minimumCutPath, periodizeHorizontally, periodizeTile, seamRatio, transposeImage } from "./seamless-tile.mjs";

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

/** 주기가 period인 무늬를 오프셋 없이 width×height만큼 잘라 낸다. */
function periodicImage(period, width, height, channels = 3, seed = 7) {
  const next = random(seed);
  const table = Uint8Array.from({ length: period * period * channels }, () => Math.floor(next() * 256));
  const data = new Uint8Array(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let c = 0; c < channels; c += 1) data[(y * width + x) * channels + c] = table[((y % period) * period + (x % period)) * channels + c];
    }
  }
  return { image: { data, width, height, channels }, table, period };
}

function randomImage(width, height, channels = 3, seed = 3) {
  const next = random(seed);
  return { data: Uint8Array.from({ length: width * height * channels }, () => Math.floor(next() * 256)), width, height, channels };
}

const pixel = (image, x, y) => [...image.data.slice((y * image.width + x) * image.channels, (y * image.width + x + 1) * image.channels)];

describe("minimumCutPath", () => {
  it("오차가 0인 경로를 따라가고 행마다 열이 한 칸 넘게 바뀌지 않는다", () => {
    const rows = 6, cols = 5;
    const error = new Float64Array(rows * cols).fill(100);
    const wanted = [1, 1, 2, 3, 3, 2];
    wanted.forEach((column, y) => { error[y * cols + column] = 0; });
    const path = minimumCutPath(error, rows, cols);
    expect([...path]).toEqual(wanted);
    for (let y = 1; y < rows; y += 1) expect(Math.abs(path[y] - path[y - 1])).toBeLessThanOrEqual(1);
  });

  it("지나갈 수 없는 칸(Infinity)은 피한다", () => {
    const rows = 4, cols = 3;
    const error = new Float64Array(rows * cols);
    for (let y = 0; y < rows; y += 1) error[y * cols] = Number.POSITIVE_INFINITY;
    const path = minimumCutPath(error, rows, cols);
    expect([...path].every((column) => column >= 1)).toBe(true);
  });
});

describe("periodizeHorizontally", () => {
  it("폭이 겹침만큼 줄고 높이·채널은 그대로다", () => {
    const image = randomImage(24, 10, 3);
    const out = periodizeHorizontally(image, 6);
    expect([out.width, out.height, out.channels, out.data.length]).toEqual([18, 10, 3, 18 * 10 * 3]);
  });

  it("겹침 밖은 원본 그대로이고, 겹침 안은 끝에서 이어지는 쪽 또는 원본 중 하나이며 0열은 항상 끝에서 이어지는 쪽이다", () => {
    const image = randomImage(24, 10, 3);
    const overlap = 6;
    const out = periodizeHorizontally(image, overlap);
    const outWidth = out.width;
    for (let y = 0; y < out.height; y += 1) {
      // 끝에서 이어지는 쪽이 한 열 이상 남아야 끝·처음이 원본의 이웃 열로 이어진다.
      expect(pixel(out, 0, y)).toEqual(pixel(image, outWidth, y));
      for (let x = 0; x < outWidth; x += 1) {
        const fromTail = pixel(image, outWidth + x, y), fromHead = pixel(image, x, y);
        const actual = pixel(out, x, y);
        if (x >= overlap) expect(actual).toEqual(fromHead);
        else expect([fromTail, fromHead]).toContainEqual(actual);
      }
    }
  });

  it("겹침이 너무 작거나 타일 폭의 절반을 넘으면 거부한다", () => {
    const image = randomImage(24, 10);
    expect(() => periodizeHorizontally(image, 1)).toThrow(RangeError);
    expect(() => periodizeHorizontally(image, 13)).toThrow(RangeError);
    expect(() => periodizeHorizontally(image, 2.5)).toThrow(RangeError);
  });
});

describe("periodizeTile", () => {
  it("크기가 가로·세로 모두 겹침만큼 줄어든다", () => {
    const out = periodizeTile(randomImage(30, 26, 3), 5);
    expect([out.width, out.height]).toEqual([25, 21]);
  });

  it("이미 주기가 맞는 무늬를 한 주기 + 겹침만큼 잘라 넣으면 그 주기 타일이 그대로 나온다", () => {
    const { image, table, period } = periodicImage(16, 16 + 5, 16 + 5);
    const out = periodizeTile(image, 5);
    expect([out.width, out.height]).toEqual([period, period]);
    expect(out.data).toEqual(table);
  });

  it("끝과 처음이 맞지 않던 타일의 이음이 이웃 열 수준으로 줄어든다", () => {
    // 가로로 완만히 밝아지는 무늬에 잔무늬를 얹어 좌우 가장자리가 크게 다르게 만든다.
    const next = random(11);
    const width = 64, height = 64, channels = 3;
    const data = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        for (let c = 0; c < channels; c += 1) data[(y * width + x) * channels + c] = Math.min(255, Math.floor(x * 2 + y * 1.5 + next() * 20));
      }
    }
    const source = { data, width, height, channels };
    const before = seamRatio(source);
    const after = seamRatio(periodizeTile(source, 12));
    expect(before.horizontal).toBeGreaterThan(8);
    expect(before.vertical).toBeGreaterThan(8);
    expect(after.horizontal).toBeLessThan(2);
    expect(after.vertical).toBeLessThan(2);
  });
});

describe("transposeImage", () => {
  it("두 번 바꾸면 원본이고 한 번 바꾸면 (x,y)가 (y,x)로 옮겨진다", () => {
    const image = randomImage(7, 5, 3);
    const flipped = transposeImage(image);
    expect([flipped.width, flipped.height]).toEqual([5, 7]);
    expect(pixel(flipped, 2, 4)).toEqual(pixel(image, 4, 2));
    expect(transposeImage(flipped).data).toEqual(image.data);
  });
});
