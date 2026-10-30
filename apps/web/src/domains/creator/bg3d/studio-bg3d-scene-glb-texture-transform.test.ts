import { Matrix3, Texture, Vector2 } from "three";
import { describe, expect, it } from "vitest";
import { normalizeStudioBg3dSceneGlbTextureTransform } from "./studio-bg3d-scene-glb-texture-transform";

function sameUv(actual: Matrix3, expected: Matrix3): void {
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 12));
  for (const uv of [[0, 0], [1, 1], [0.23, 0.77], [-3, 5]]) {
    const a = new Vector2(...uv).applyMatrix3(actual), b = new Vector2(...uv).applyMatrix3(expected);
    expect(a.distanceTo(b)).toBeLessThan(1e-12);
  }
}
/** 설치 GLTFLoader의 KHR_texture_transform 분기와 같은 T×R×S 행렬. */
function khrMatrix(texture: Texture): Matrix3 {
  const c = Math.cos(texture.rotation), s = Math.sin(texture.rotation);
  return new Matrix3().set(texture.repeat.x * c, texture.repeat.y * s, texture.offset.x,
    -texture.repeat.x * s, texture.repeat.y * c, texture.offset.y, 0, 0, 1);
}
describe("GLB texture center/manual matrix의 동등 KHR 파라미터", () => {
  it("center·회전·offset·반복을 center0 파라미터에 보존한다", () => {
    const texture = new Texture(); texture.center.set(0.5, 0.5); texture.rotation = 0.2;
    texture.offset.set(0.17, -0.23); texture.repeat.set(0.7, 0.7);
    const expected = new Matrix3().setUvTransform(0.17, -0.23, 0.7, 0.7, 0.2, 0.5, 0.5);
    normalizeStudioBg3dSceneGlbTextureTransform(texture, "model-one");
    expect(texture.center.toArray()).toEqual([0, 0]); expect(texture.matrixAutoUpdate).toBe(false);
    sameUv(texture.matrix, expected); sameUv(khrMatrix(texture), expected);
  });
  it.each([[2, -3], [-2, 3], [-2, -3], [0, 3], [2, 0], [0, 0]])("음수/0 UV 배율(%s,%s)을 auto/manual 양쪽에서 보존한다", (sx, sy) => {
    for (const manual of [false, true]) {
      const texture = new Texture(); texture.offset.set(-0.2, 0.6); texture.repeat.set(sx, sy); texture.rotation = manual ? 0.63 : 0; texture.center.set(0, 0);
      texture.matrixAutoUpdate = !manual; const expected = khrMatrix(texture); texture.matrix.copy(expected);
      normalizeStudioBg3dSceneGlbTextureTransform(texture, "model-one");
      expect(texture.center.toArray()).toEqual([0, 0]); sameUv(texture.matrix, expected); sameUv(khrMatrix(texture), expected);
    }
  });
  it("manual matrix를 오래된 별도 params와 구분해 실제 행렬로 분해한다", () => {
    const texture = new Texture(); texture.matrixAutoUpdate = false;
    texture.offset.set(70, 80); texture.repeat.set(9, 8); texture.rotation = 2.8; texture.center.set(3, 4);
    const source = new Texture(); source.offset.set(0.2, -0.3); source.repeat.set(-1.4, 2.1); source.rotation = -0.7;
    const expected = khrMatrix(source); texture.matrix.copy(expected);
    normalizeStudioBg3dSceneGlbTextureTransform(texture, "model-one");
    sameUv(texture.matrix, expected); sameUv(khrMatrix(texture), expected);
    expect(texture.offset.toArray()).toEqual([0.2, -0.3]);
  });
  it("auto의 비균일 scale+회전은 KHR 열축에서 shear이므로 거부한다", () => {
    const texture = new Texture(); texture.repeat.set(0.75, 0.5); texture.rotation = 0.2; texture.center.set(0.5, 0.5);
    expect(() => normalizeStudioBg3dSceneGlbTextureTransform(texture, "model-one"))
      .toThrow(expect.objectContaining({ code: "unsupported-feature", nodeIds: ["model-one"], reason: "texture-uv-shear-or-decomposition" }));
  });
  it.each([
    [new Matrix3().set(1, 0.2, 0, 0, 1, 0, 0, 0, 1), "texture-uv-shear-or-decomposition"],
    [new Matrix3().set(1, 0, 0, 0, 1, 0, 1e-12, 0, 1), "texture-uv-projective-matrix"],
    [new Matrix3().set(1, 0, 0, 0, 1, 0, 0, 0, 2), "texture-uv-projective-matrix"],
    [new Matrix3().set(Number.NaN, 0, 0, 0, 1, 0, 0, 0, 1), "texture-uv-matrix-not-finite"],
  ] as const)("표현 불가 행렬은 원래 nodeId와 원인으로 거부한다", (matrix, reason) => {
    const texture = new Texture(); texture.matrixAutoUpdate = false; texture.matrix.copy(matrix);
    const original = texture.matrix.toArray();
    expect(() => normalizeStudioBg3dSceneGlbTextureTransform(texture, "model-one"))
      .toThrow(expect.objectContaining({ code: "unsupported-feature", nodeIds: ["model-one"], reason }));
    expect(texture.matrix.toArray()).toEqual(original);
  });
});
