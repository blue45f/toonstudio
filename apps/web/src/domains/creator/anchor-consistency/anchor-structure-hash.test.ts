import { describe, expect, it } from "vitest";

import { ANCHOR_DHASH, compareAnchorStructureHashes, computeAnchorStructureHash, hammingDistanceHex } from "./anchor-structure-hash";
import { toAnchorLabImage } from "./anchor-subject-mask";
import { figureRaster, flipRasterHorizontally, noiseRaster } from "./anchor-synthetic-raster";

const hashOf = (raster: Parameters<typeof toAnchorLabImage>[0]) =>
  computeAnchorStructureHash(toAnchorLabImage(raster), { mask: null, region: null });

describe("구조 해시(dHash)", () => {
  it("16자리 소문자 hex(64비트)를 만들고 같은 입력은 같은 값이다", () => {
    const hash = hashOf(noiseRaster(64, 64, 1));
    expect(hash.dHash).toMatch(/^[0-9a-f]{16}$/u);
    expect(hash.dHashMirrored).toMatch(/^[0-9a-f]{16}$/u);
    expect(hash.region).toBe("image");
    expect(hashOf(noiseRaster(64, 64, 1))).toEqual(hash);
    expect(ANCHOR_DHASH.bits).toBe(64);
  });

  it("좌우로 뒤집은 이미지의 해시는 원본의 뒤집은 해시와 같다", () => {
    const original = figureRaster({ mirror: false });
    const flipped = flipRasterHorizontally(original);
    expect(hashOf(flipped).dHash).toBe(hashOf(original).dHashMirrored);
    expect(hashOf(flipped).dHashMirrored).toBe(hashOf(original).dHash);
  });

  it("해밍 거리: 같으면 0, 모든 비트가 다르면 64, 길이가 다르면 최대", () => {
    expect(hammingDistanceHex("0000000000000000", "0000000000000000")).toBe(0);
    expect(hammingDistanceHex("0000000000000000", "ffffffffffffffff")).toBe(64);
    expect(hammingDistanceHex("0000000000000001", "0000000000000000")).toBe(1);
    expect(hammingDistanceHex("abc", "abcd")).toBe(64);
    expect(hammingDistanceHex("", "")).toBe(64);
    expect(hammingDistanceHex("zzzzzzzzzzzzzzzz", "0000000000000000")).toBe(64);
  });

  it("비교 점수: 같은 구조 1, 좌우 반전은 같은 구조로 보고, 무관한 이미지는 0 근처다", () => {
    const base = hashOf(figureRaster());
    expect(compareAnchorStructureHashes(base, base)).toMatchObject({ distance: 0, similarity: 1, mirrored: false });
    const mirror = compareAnchorStructureHashes(base, hashOf(flipRasterHorizontally(figureRaster())));
    expect(mirror.distance).toBe(0);
    const unrelated = compareAnchorStructureHashes(hashOf(noiseRaster(64, 64, 3)), hashOf(noiseRaster(64, 64, 9)));
    expect(unrelated.similarity).toBeLessThan(0.45);
    expect(compareAnchorStructureHashes({ ...base, dHash: "0000000000000000", dHashMirrored: "0000000000000000" }, { ...base, dHash: "ffffffffffffffff", dHashMirrored: "ffffffffffffffff" }).similarity).toBe(0);
  });

  it("마스크를 주면 피사체 밖의 배경이 달라도 같은 구조 해시가 나온다", () => {
    const maskOfFigure = (background: readonly [number, number, number]) => {
      const raster = figureRaster({ background });
      const image = toAnchorLabImage(raster);
      const mask = new Uint8Array(image.alpha.length);
      const base = figureRaster({ background: [191, 191, 191] });
      for (let index = 0; index < mask.length; index += 1) {
        const differs = (raster.data[index * 4] ?? 0) !== background[0] || (raster.data[index * 4 + 1] ?? 0) !== background[1];
        mask[index] = differs ? 1 : 0;
      }
      return { image, mask, base };
    };
    const gray = maskOfFigure([191, 191, 191]);
    const dark = maskOfFigure([30, 30, 30]);
    const grayHash = computeAnchorStructureHash(gray.image, { mask: gray.mask, region: null });
    const darkHash = computeAnchorStructureHash(dark.image, { mask: dark.mask, region: null });
    expect(compareAnchorStructureHashes(grayHash, darkHash).distance).toBeLessThanOrEqual(8);
  });
});
