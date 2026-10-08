import { describe, expect, it } from "vitest";

import { srgbToLinear } from "../../core/color";
import { createBandMixer, KM_TABLE_8 } from "../../pigment/km-mix";
import { TILE_SIZE } from "../../raster/tile-binning";

import { commitWetTile, ParticleSplat, resolveWetTile } from "./splat";

import type { WetResolveParams } from "./splat";

const W = 48;
const H = 40;

function makeSplat(over: Partial<ConstructorParameters<typeof ParticleSplat>[0]> = {}): ParticleSplat {
  return new ParticleSplat({
    widthPx: W,
    heightPx: H,
    sigmaPx: 1.6,
    spacingPx: 1.2,
    lowFraction: 0.04,
    highFraction: 0.1,
    capacityTiles: 12,
    ...over,
  });
}

/** 누적 타일에서 픽셀의 [밀도, ΣR, ΣG, ΣB]를 읽는다. */
function accumAt(splat: ParticleSplat, x: number, y: number): number[] {
  const tile = Math.floor(y / TILE_SIZE) * splat.tilesX + Math.floor(x / TILE_SIZE);
  const found = splat.tiles().find(([t]) => t === tile);
  if (!found) return [0, 0, 0, 0];
  const o = ((y % TILE_SIZE) * TILE_SIZE + (x % TILE_SIZE)) * 4;
  return [found[1][o], found[1][o + 1], found[1][o + 2], found[1][o + 3]];
}

/** 캔버스 전체를 해석해 [premultiplied RGBA] 이미지를 만든다. */
function resolveAll(splat: ParticleSplat, doc: Float32Array, p: WetResolveParams): Float32Array {
  const out = new Float32Array(doc);
  const scratch = new Float32Array(TILE_SIZE * TILE_SIZE * 4);
  for (const [tile, accum] of splat.tiles()) {
    const tx = tile % splat.tilesX;
    const ty = Math.floor(tile / splat.tilesX);
    resolveWetTile(doc, W, H, tx, ty, accum, p, scratch);
    commitWetTile(out, W, H, tx, ty, scratch);
  }
  return out;
}

const px = (img: Float32Array, x: number, y: number): number[] => {
  const o = (y * W + x) * 4;
  return [img[o], img[o + 1], img[o + 2], img[o + 3]];
};

/** 채운 사각형 영역에 간격 1.2px 격자 입자를 쌓는다. */
function fillRect(splat: ParticleSplat, x0: number, y0: number, x1: number, y1: number, rgb: readonly [number, number, number]): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let y = y0; y <= y1; y += 1.2) {
    for (let x = x0; x <= x1; x += 1.2) {
      xs.push(x);
      ys.push(y);
    }
  }
  const colors = new Float32Array(xs.length * 3);
  for (let i = 0; i < xs.length; i += 1) colors.set(rgb, i * 3);
  splat.accumulate(xs, ys, colors, xs.length);
  return xs.length;
}

const EMPTY_DOC = (): Float32Array => new Float32Array(W * H * 4);

describe("ParticleSplat 누적", () => {
  it("한 입자는 σ 1.6의 가우시안(사칙 근사)을 대칭으로 남기고 3σ 밖은 0이다", () => {
    const splat = makeSplat();
    // 입자를 픽셀 모서리(정수 좌표)에 두면 주변 4픽셀이 대칭이다.
    splat.accumulate([24], [20], [1, 1, 1], 1);
    const a = accumAt(splat, 23, 19)[0];
    expect(accumAt(splat, 24, 19)[0]).toBeCloseTo(a, 6);
    expect(accumAt(splat, 23, 20)[0]).toBeCloseTo(a, 6);
    expect(accumAt(splat, 24, 20)[0]).toBeCloseTo(a, 6);
    let maxErr = 0;
    for (let y = 12; y <= 28; y += 1) {
      for (let x = 16; x <= 32; x += 1) {
        const dx = x + 0.5 - 24;
        const dy = y + 0.5 - 20;
        const r2 = dx * dx + dy * dy;
        const want = r2 / (2 * 1.6 * 1.6) < 4.5 ? Math.exp(-r2 / (2 * 1.6 * 1.6)) : 0;
        maxErr = Math.max(maxErr, Math.abs(accumAt(splat, x, y)[0] - want));
      }
    }
    // (1 − x/16)¹⁶ 근사: 구간 x∈[0, 4.5]에서 exp(−x)와의 최대 절대 오차는 약 0.017이다(측정).
    expect(maxErr).toBeLessThan(0.02);
    // 3σ(4.8px) 바깥은 0이다.
    expect(accumAt(splat, 24 + 6, 20)[0]).toBe(0);
  });

  it("색은 선형 공간에서 밀도 가중 평균이다(두 입자 사이 중점 = 두 색의 평균)", () => {
    const splat = makeSplat();
    const red: [number, number, number] = [0.8, 0.05, 0.02];
    const green: [number, number, number] = [0.04, 0.7, 0.1];
    splat.accumulate([20, 25], [20, 20], [...red, ...green], 2);
    const mid = accumAt(splat, 22, 20); // 픽셀 중심 22.5 = 두 입자의 한가운데
    expect(mid[0]).toBeGreaterThan(0.5);
    for (let c = 0; c < 3; c += 1) expect(mid[c + 1] / mid[0]).toBeCloseTo((red[c] + green[c]) / 2, 5);
  });

  it("누적은 입자 순서와 무관하게 결정적이다(같은 입력 → 같은 타일)", () => {
    const a = makeSplat();
    const b = makeSplat();
    fillRect(a, 10, 8, 30, 26, [0.2, 0.3, 0.4]);
    fillRect(b, 10, 8, 30, 26, [0.2, 0.3, 0.4]);
    expect(a.tiles().map(([t, d]) => [t, Array.from(d)])).toEqual(b.tiles().map(([t, d]) => [t, Array.from(d)]));
  });

  it("타일 풀이 모자라면 그 입자를 통째로 건너뛰고 센다(던지지 않는다)", () => {
    const splat = makeSplat({ capacityTiles: 1 });
    splat.accumulate([4, 40], [4, 30], [1, 1, 1, 1, 1, 1], 2);
    expect(splat.pool.used()).toBe(1);
    expect(splat.skippedParticles).toBe(1);
    splat.clear();
    expect(splat.skippedParticles).toBe(0);
    expect(splat.pool.used()).toBe(0);
  });

  it("생성 인자를 검증한다", () => {
    expect(() => makeSplat({ sigmaPx: 0 })).toThrow(RangeError);
    expect(() => makeSplat({ lowFraction: 0.2, highFraction: 0.1 })).toThrow(RangeError);
  });
});

describe("resolveWetTile: 문턱 알파", () => {
  const splat = makeSplat();
  const T = splat.wetThresholds;
  const params: WetResolveParams = { thresholds: T, opacity: 1, mixer: null };

  it("꽉 찬 영역 안쪽은 알파 1·원색, 멀리는 0, 가장자리는 그 사이(메타볼)", () => {
    const s = makeSplat();
    fillRect(s, 14.3, 12, 34, 28, [0.3, 0.5, 0.2]);
    const img = resolveAll(s, EMPTY_DOC(), params);
    const inside = px(img, 24, 20);
    expect(inside[3]).toBeCloseTo(1, 6);
    expect(inside[0]).toBeCloseTo(0.3, 5);
    expect(inside[1]).toBeCloseTo(0.5, 5);
    expect(px(img, 4, 20)[3]).toBe(0);
    // 왼쪽 가장자리(입자 영역 바깥)를 따라 알파가 단조 감소하며 중간값을 지난다.
    const edge: number[] = [];
    for (let x = 10; x <= 16; x += 1) edge.push(px(img, x, 20)[3]);
    expect(edge.some((a) => a > 0.05 && a < 0.95)).toBe(true);
    for (let i = 1; i < edge.length; i += 1) expect(edge[i]).toBeGreaterThanOrEqual(edge[i - 1] - 1e-6);
    // premultiplied: 색 = 원색 × 알파
    const e = edge.findIndex((a) => a > 0.2 && a < 0.8);
    const o = px(img, 10 + e, 20);
    expect(o[1] / o[3]).toBeCloseTo(0.5, 4);
  });

  it("불투명도 배율이 알파 상한이 된다", () => {
    const s = makeSplat();
    fillRect(s, 14, 12, 34, 28, [0.3, 0.5, 0.2]);
    const img = resolveAll(s, EMPTY_DOC(), { ...params, opacity: 0.4 });
    expect(px(img, 24, 20)[3]).toBeCloseTo(0.4, 6);
  });

  it("문턱 아래 픽셀은 문서를 그대로 둔다", () => {
    const s = makeSplat();
    fillRect(s, 14, 12, 34, 28, [0.3, 0.5, 0.2]);
    const doc = EMPTY_DOC();
    for (let i = 0; i < W * H; i += 1) {
      doc[i * 4] = 0.1;
      doc[i * 4 + 1] = 0.2;
      doc[i * 4 + 2] = 0.3;
      doc[i * 4 + 3] = 1;
    }
    const img = resolveAll(s, doc, params);
    expect(px(img, 2, 2)).toEqual([expect.closeTo(0.1, 6), expect.closeTo(0.2, 6), expect.closeTo(0.3, 6), 1]);
  });
});

describe("resolveWetTile: 문서 위 KM 혼색", () => {
  const mixer = createBandMixer(KM_TABLE_8);
  const yellow: [number, number, number] = [srgbToLinear(0.95), srgbToLinear(0.85), srgbToLinear(0.08)];
  const blue: [number, number, number] = [srgbToLinear(0.08), srgbToLinear(0.2), srgbToLinear(0.85)];

  function solidDoc(rgb: readonly [number, number, number]): Float32Array {
    const doc = new Float32Array(W * H * 4);
    for (let i = 0; i < W * H; i += 1) {
      doc[i * 4] = rgb[0];
      doc[i * 4 + 1] = rgb[1];
      doc[i * 4 + 2] = rgb[2];
      doc[i * 4 + 3] = 1;
    }
    return doc;
  }

  it("노랑 문서 위에 반투명 파랑을 올리면 초록이 우세하고, 단순 합성은 초록이 아니다", () => {
    const s = makeSplat();
    fillRect(s, 8, 8, 40, 32, blue);
    const doc = solidDoc(yellow);
    const kmImg = resolveAll(s, doc, { thresholds: s.wetThresholds, opacity: 0.5, mixer });
    const plainImg = resolveAll(s, doc, { thresholds: s.wetThresholds, opacity: 0.5, mixer: null });
    const km = px(kmImg, 24, 20);
    const plain = px(plainImg, 24, 20);
    expect(km[3]).toBeCloseTo(1, 6);
    // KM: 초록 채널이 빨강·파랑보다 크다.
    expect(km[1]).toBeGreaterThan(km[0] * 1.3);
    expect(km[1]).toBeGreaterThan(km[2] * 1.3);
    // 단순 over(선형 평균): 빨강이 초록보다 크거나 비슷해 초록 우세가 아니다.
    expect(plain[1]).toBeLessThan(plain[0] * 1.3);
  });

  it("불투명 물감(알파 1)은 아래 색을 완전히 덮는다", () => {
    const s = makeSplat();
    fillRect(s, 8, 8, 40, 32, blue);
    const img = resolveAll(s, solidDoc(yellow), { thresholds: s.wetThresholds, opacity: 1, mixer });
    const c = px(img, 24, 20);
    for (let k = 0; k < 3; k += 1) expect(c[k]).toBeCloseTo(blue[k], 5);
  });

  it("같은 색 위에는 혼색 왕복 오차를 섞지 않고 색이 그대로다", () => {
    const s = makeSplat();
    fillRect(s, 8, 8, 40, 32, yellow);
    const img = resolveAll(s, solidDoc(yellow), { thresholds: s.wetThresholds, opacity: 0.6, mixer });
    const c = px(img, 24, 20);
    for (let k = 0; k < 3; k += 1) expect(c[k]).toBeCloseTo(yellow[k], 5);
    expect(c[3]).toBeCloseTo(1, 6);
  });

  it("투명한 문서 위에서는 혼색 없이 물감 색 그대로 알파만 얹는다", () => {
    const s = makeSplat();
    fillRect(s, 8, 8, 40, 32, blue);
    const img = resolveAll(s, EMPTY_DOC(), { thresholds: s.wetThresholds, opacity: 0.5, mixer });
    const c = px(img, 24, 20);
    expect(c[3]).toBeCloseTo(0.5, 6);
    expect(c[2]).toBeCloseTo(blue[2] * 0.5, 5);
  });
});

describe("commitWetTile", () => {
  it("캔버스 밖 열·행은 쓰지 않는다(16의 배수가 아닌 크기에서 왼쪽 가장자리를 오염시키지 않는다)", () => {
    const w = 20;
    const h = 18;
    const doc = new Float32Array(w * h * 4).fill(0.5);
    const tile = new Float32Array(TILE_SIZE * TILE_SIZE * 4).fill(1);
    commitWetTile(doc, w, h, 1, 1, tile); // 타일 (1,1): 열 16..19, 행 16..17만 캔버스 안
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const inside = x >= 16 && y >= 16;
        expect(doc[(y * w + x) * 4], `(${x},${y})`).toBe(inside ? 1 : 0.5);
      }
    }
    expect(doc.length).toBe(w * h * 4);
  });
});
