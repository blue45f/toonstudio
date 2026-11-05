import { describe, expect, it } from "vitest";

import { latentPigmentPackedAtlasLayout, packLatentPigmentFloat32Atlas } from "./latent-pigment-float32-atlas";
import { bakeLatentPigmentTable } from "./latent-pigment-table";

function bits(values: Float32Array): number[] {
  const view = new DataView(new ArrayBuffer(4));
  return Array.from(values, (value) => { view.setFloat32(0, value, true); return view.getUint32(0, true); });
}

describe("안료 Float32 바이트 아틀라스", () => {
  it("성분을 양자화하지 않고 -0·서브노멀·일반 Float32를 little-endian 바이트로 정확히 보존한다", () => {
    const table = bakeLatentPigmentTable(2);
    const values = new Float32Array(table.concentrations.length);
    const source = new DataView(new ArrayBuffer(4));
    const patterns = [0x00000000, 0x80000000, 0x00000001, 0x007fffff, 0x00800000, 0x3eaaaaab, 0x3f000000, 0x3f800000];
    values.forEach((_, index) => { source.setUint32(0, patterns[index % patterns.length], true); values[index] = source.getFloat32(0, true); });
    const packed = packLatentPigmentFloat32Atlas({ ...table, concentrations: values });
    const encoded = new DataView(packed.data.buffer);
    expect(Array.from({ length: values.length }, (_, index) => encoded.getUint32(index * 4, true))).toEqual(bits(values));
    expect(Array.from(packed.data.slice(28, 32))).toEqual([0, 0, 128, 63]);
    const restored = new Float32Array(values.length);
    restored.forEach((_, index) => { restored[index] = encoded.getFloat32(index * 4, true); });
    expect(bits(restored)).toEqual(bits(values));
    expect(Object.is(restored[1], -0)).toBe(true);
    expect(packed.data.slice(values.byteLength).every((value) => value === 0)).toBe(true);
  });

  it("생성 표 전체를 자연 voxel 순서 그대로 포장하며 원본을 바꾸지 않는다", () => {
    const table = bakeLatentPigmentTable(5), before = bits(table.concentrations);
    const packed = packLatentPigmentFloat32Atlas(table), view = new DataView(packed.data.buffer);
    expect(Array.from({ length: table.concentrations.length }, (_, index) => view.getUint32(index * 4, true))).toEqual(before);
    expect(bits(table.concentrations)).toEqual(before);
  });

  it("기본 33과 최대 65의 고정 배치는 WebGL1 최소 텍스처 예산에 맞는다", () => {
    expect(latentPigmentPackedAtlasLayout(33)).toEqual({ width: 380, height: 379, floatCount: 143748 });
    expect(latentPigmentPackedAtlasLayout(65)).toEqual({ width: 1049, height: 1048, floatCount: 1098500 });
    for (let size = 2; size <= 65; size += 1) {
      const layout = latentPigmentPackedAtlasLayout(size);
      expect(layout.width).toBeLessThanOrEqual(2048);
      expect(layout.height).toBeLessThanOrEqual(2048);
      expect(layout.width * layout.height).toBeGreaterThanOrEqual(size ** 3 * 4);
    }
  });

  it("표 크기·revision·길이·비유한값을 조용히 줄이거나 유효 표로 바꾸지 않는다", () => {
    for (const size of [1, 66, 2.5, Number.NaN]) expect(() => latentPigmentPackedAtlasLayout(size)).toThrow();
    const table = bakeLatentPigmentTable(2);
    expect(() => packLatentPigmentFloat32Atlas({ ...table, concentrations: new Float32Array(3) })).toThrow();
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
      const concentrations = new Float32Array(table.concentrations); concentrations[0] = value;
      expect(() => packLatentPigmentFloat32Atlas({ ...table, concentrations })).toThrow();
    }
  });
});
