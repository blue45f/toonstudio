import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { StudioOilDeviceRect } from "../brush/studio-oil-readback-plan";
import { StudioLiveOilSnapshotTiles } from "./studio-live-oil-snapshot-tiles";

function pixels(width: number, height: number, seed: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  const alphas = [0, 1, 32, 128, 220, 254, 255];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = (x * 19 + y * 29 + seed) % 256;
      data[i + 1] = (x * 37 + y * 7 + seed * 3) % 256;
      data[i + 2] = (x * 11 + y * 43 + seed * 5) % 256;
      data[i + 3] = alphas[(x + y * 3 + seed) % alphas.length] ?? 0;
    }
  }
  return { width, height, data };
}

function crop(source: ReturnType<typeof pixels>, rect: StudioOilDeviceRect) {
  const data = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const start = ((rect.y + y) * source.width + rect.x) * 4;
    data.set(source.data.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, data };
}

function fixture(width = 521, height = 269) {
  const frozen = pixels(width, height, 11);
  const painted = pixels(width, height, 97);
  const read = vi.fn((rect: StudioOilDeviceRect) => crop(frozen, rect));
  const tiles = new StudioLiveOilSnapshotTiles(width, height, read);
  return { frozen, painted, read, tiles };
}

describe("유화 고정 바닥의 필요한 타일만 읽기", () => {
  it("첫 작은 접촉은 전체 viewport 대신 64KiB 한 타일만 읽는다", () => {
    const { frozen, painted, read, tiles } = fixture();
    expect(read).not.toHaveBeenCalled();
    const rect = { x: 20, y: 30, width: 8, height: 9 };
    tiles.contribute(crop(painted, rect), rect);
    expect(read.mock.calls).toEqual([[{ x: 0, y: 0, width: 128, height: 128 }]]);
    const readBytes = read.mock.calls.reduce((sum, [r]) => sum + r.width * r.height * 4, 0);
    expect(readBytes).toBe(65_536);
    expect(readBytes).toBeLessThan(frozen.data.length);
  });

  // 1271c23의 기존 전체 before 버퍼 함수로 고정한 원본 byte 해시다.
  // 현재 tiled/일반 함수가 같은 실수를 공유해도 이 정본은 함께 바뀌지 않는다.
  it.each([
    [{ x: 117, y: 123, width: 142, height: 17 }, "ca862bdae18ab47b2168a5a6731319ce7c2ffb4facd30467354189d9d7a273d8"],
    [{ x: 509, y: 257, width: 12, height: 12 }, "b5a205da0728ffc2ae0d69dbace43dd889890c1dc4b23d5586b19622a0e57fbe"],
    [{ x: 0, y: 0, width: 521, height: 269 }, "f1c5a93e8be190d66787f8f3d1165ea654e8ddd6da311b23f81e069523a102f2"],
  ] as const)("타일/행/부분 끝 경계를 지나도 기존 혼색 byte가 같다: %j", (rect, digest) => {
    const { frozen, painted, tiles } = fixture();
    const beforeCopy = frozen.data.slice();
    const after = crop(painted, rect);
    tiles.contribute(after, rect);
    expect(createHash("sha256").update(after.data).digest("hex")).toBe(digest);
    expect(frozen.data).toEqual(beforeCopy);
  });

  it("길게 확장·왕복한 획도 타일을 재읽지 않고 전체 픽셀 수를 상한으로 둔다", () => {
    const { frozen, painted, read, tiles } = fixture();
    for (let i = 0; i < 20; i += 1) {
      const rect = { x: 5, y: 7, width: 40 + i * 25, height: 30 + i * 12 };
      tiles.contribute(crop(painted, rect), rect);
    }
    const all = { x: 0, y: 0, width: frozen.width, height: frozen.height };
    tiles.contribute(crop(painted, all), all);
    const callsAtFullCoverage = read.mock.calls.length;
    for (let i = 0; i < 120; i += 1) {
      const x = (i % 5) * 128;
      const y = (Math.floor(i / 5) % 3) * 128;
      const rect = { x, y, width: Math.min(8, frozen.width - x), height: Math.min(8, frozen.height - y) };
      tiles.contribute(crop(painted, rect), rect);
    }
    expect(read).toHaveBeenCalledTimes(callsAtFullCoverage);
    expect(callsAtFullCoverage).toBe(15);
    expect(new Set(read.mock.calls.map(([rect]) => `${rect.x}:${rect.y}`)).size).toBe(15);
    expect(read.mock.calls.reduce((sum, [r]) => sum + r.width * r.height * 4, 0))
      .toBe(frozen.data.length);
    for (const [rect] of read.mock.calls) {
      expect(rect.x + rect.width).toBeLessThanOrEqual(frozen.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(frozen.height);
    }
  });

  it("viewport 끝의 1×1 타일은 바깥 128×128까지 읽지 않는다", () => {
    const { painted, read, tiles } = fixture(257, 129);
    const rect = { x: 256, y: 128, width: 1, height: 1 };
    tiles.contribute(crop(painted, rect), rect);
    expect(read.mock.calls).toEqual([[rect]]);
  });

  it("변하지 않은 바닥은 경계 양쪽 모두 투명 기여분으로 남기며 캐시를 손상하지 않는다", () => {
    const { frozen, read, tiles } = fixture();
    const rect = { x: 120, y: 120, width: 30, height: 30 };
    for (let repeat = 0; repeat < 3; repeat += 1) {
      const after = crop(frozen, rect);
      tiles.contribute(after, rect);
      expect(after.data.every(value => value === 0)).toBe(true);
    }
    expect(read).toHaveBeenCalledTimes(4);
    expect(frozen.data.some(value => value !== 0)).toBe(true);
  });

  it("다른 snapshot 인스턴스는 같은 좌표여도 앞 획의 캐시를 공유하지 않는다", () => {
    const { frozen, painted, read, tiles } = fixture();
    const rect = { x: 20, y: 30, width: 8, height: 9 };
    tiles.contribute(crop(painted, rect), rect);
    const nextFrozen = pixels(frozen.width, frozen.height, 31);
    const nextRead = vi.fn((r: StudioOilDeviceRect) => crop(nextFrozen, r));
    const next = new StudioLiveOilSnapshotTiles(frozen.width, frozen.height, nextRead);
    const after = crop(nextFrozen, rect);
    next.contribute(after, rect);
    expect(after.data.every(value => value === 0)).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(nextRead).toHaveBeenCalledTimes(1);
  });

  it("읽기 오류나 잘린 타일을 성공한 캐시로 숨기지 않는다", () => {
    const { frozen, painted } = fixture();
    const rect = { x: 20, y: 30, width: 8, height: 9 };
    const read = vi.fn((r: StudioOilDeviceRect) => crop(frozen, r));
    read.mockImplementationOnce(() => { throw new Error("읽기 실패"); });
    read.mockImplementationOnce(() => ({ width: 128, height: 128, data: new Uint8ClampedArray(4) }));
    const tiles = new StudioLiveOilSnapshotTiles(frozen.width, frozen.height, read);
    expect(() => tiles.contribute(crop(painted, rect), rect)).toThrow("읽기 실패");
    expect(() => tiles.contribute(crop(painted, rect), rect)).toThrow("완전하게 읽지 못했습니다");
    tiles.contribute(crop(painted, rect), rect);
    tiles.contribute(crop(painted, rect), rect);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("잘못된 영역은 읽기나 부분 혼색 전에 거부한다", () => {
    const { read, tiles } = fixture();
    expect(() => tiles.contribute(pixels(2, 2, 0), { x: -1, y: 0, width: 2, height: 2 })).toThrow();
    expect(() => tiles.contribute(pixels(2, 2, 0), { x: 520, y: 268, width: 2, height: 2 })).toThrow();
    expect(() => tiles.contribute(pixels(2, 2, 0), { x: 0, y: 0, width: 1, height: 2 })).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(() => new StudioLiveOilSnapshotTiles(0, 100, read)).toThrow();
  });
});
