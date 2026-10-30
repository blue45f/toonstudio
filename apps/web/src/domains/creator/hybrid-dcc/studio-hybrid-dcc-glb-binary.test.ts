import { describe, expect, it } from "vitest";

import { encodeStudioHybridDccGlbBinary, type StudioHybridDccGlbVertexStreams } from "./studio-hybrid-dcc-glb-binary";

const triangle: StudioHybridDccGlbVertexStreams = {
  positions: [-0, 0, 0, 2, 0, 0, 0, 1, 0],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2],
};
const encode = (source: StudioHybridDccGlbVertexStreams) => {
  const result = encodeStudioHybridDccGlbBinary(source);
  if (!result.ok) throw new Error(result.detail);
  return result.value;
};

describe("GLB 정점 스트림의 독립 바이트 작성", () => {
  it("UV가 없으면 기존 POSITION/NORMAL/indices 순서·정렬과 양의 0을 유지한다", () => {
    const output = encode(triangle);
    expect(output.positionOffset).toBe(0);
    expect(output.normalOffset).toBe(36);
    expect(output.indexOffset).toBe(72);
    expect(output.bytes.byteLength).toBe(84);
    expect(output).not.toHaveProperty("texcoordOffset");
    expect(output.boundsMin).toEqual([0, 0, 0]);
    expect(output.boundsMax).toEqual([2, 1, 0]);
    const view = new DataView(output.bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0);
    expect([0, 1, 2].map((index) => view.getUint32(output.indexOffset + index * 4, true))).toEqual([0, 1, 2]);
    expect(view.getFloat32(12, true)).toBe(2);
    expect(view.getFloat32(output.normalOffset + 8, true)).toBe(1);
  });

  it("비대칭·음수·타일 밖 UV를 정점과 같은 순서로 쓰고 기존 스트림은 바꾸지 않는다", () => {
    const source = { ...triangle, texcoords: [0.1, 0.8, -0.25, -0.5, 2.5, 3] };
    const output = encode(source);
    const original = encode(triangle);
    expect(output.bytes.slice(0, original.bytes.byteLength)).toEqual(original.bytes);
    expect(output.texcoordOffset).toBe(84);
    expect(output.texcoordByteLength).toBe(24);
    const view = new DataView(output.bytes.buffer);
    expect(Array.from({ length: 6 }, (_, index) => view.getFloat32(84 + index * 4, true)))
      .toEqual(source.texcoords.map(Math.fround));
  });

  it.each([
    { ...triangle, texcoords: [0, 0] },
    { ...triangle, texcoords: [0, 0, 1, Infinity, 1, 1] },
    { ...triangle, texcoords: [0, 0, 1, 1, 1e100, 1] },
  ])("잘못된 UV 길이나 Float32 범위를 바이트 작성 전에 거부한다", (source) => {
    expect(encodeStudioHybridDccGlbBinary(source)).toMatchObject({ ok: false, code: "uv-coordinate-invalid" });
  });

  it.each([
    { source: { ...triangle, positions: [NaN, ...triangle.positions.slice(1)] }, code: "position-float32-overflow" },
    { source: { ...triangle, normals: [Infinity, ...triangle.normals.slice(1)] }, code: "normal-unresolved" },
    { source: { ...triangle, indices: [0, 1, 3] }, code: "invalid-input" },
    { source: { ...triangle, normals: [0, 0, 1] }, code: "invalid-input" },
  ])("위치·법선·인덱스의 손상도 실패로 돌려준다", ({ source, code }) => {
    expect(encodeStudioHybridDccGlbBinary(source)).toMatchObject({ ok: false, code });
  });
});
