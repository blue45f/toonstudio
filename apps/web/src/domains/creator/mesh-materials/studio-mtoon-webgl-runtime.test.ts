import { MToonMaterial, MToonMaterialOutlineWidthMode } from "@pixiv/three-vrm";
import { BackSide, Color, DataTexture, LinearSRGBColorSpace, MeshStandardMaterial } from "three";
import { describe, expect, it } from "vitest";

import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";
import { StudioMToonMaterial } from "./studio-mtoon-webgl-runtime";

/** SDK compiler hook이 읽는 필드만 제공한다. WebGL shader 컴파일·GPU 제출 검증과 구분한다. */
function compileHook(material: MToonMaterial) {
  const shader = { vertexShader: material.vertexShader, fragmentShader: material.fragmentShader, uniforms: {}, defines: {} };
  Reflect.apply(material.onBeforeCompile, material, [shader, { outputColorSpace: LinearSRGBColorSpace }]);
  return shader;
}

describe("복제 가능한 WebGL MToon compiler 계약", () => {
  it("생성·clone·copy 대상마다 두 보정과 runtime identity를 유지한다", () => {
    const source = new StudioMToonMaterial({ shadingToonyFactor: 1, outlineWidthMode: MToonMaterialOutlineWidthMode.ScreenCoordinates, outlineWidthFactor: .006 });
    const cloned = source.clone(), copied = new StudioMToonMaterial().copy(source);
    try {
      for (const material of [source, cloned, copied]) {
        const shader = compileHook(material);
        expect(shader.fragmentShader).toContain("if ( a == b ) { return step( a, t ); }");
        expect(shader.vertexShader).toContain("projectionMatrix[ 3 ][ 3 ] == 0.0 ? vViewPosition.z : 1.0");
        expect(material.shadingToonyFactor).toBe(1); expect(material.outlineWidthFactor).toBe(.006);
        expect(readStudioMToonRuntimeIdentity(material)).toMatchObject({ backend: "webgl" });
        expect(material.customProgramCacheKey()).toContain("toonstudio-mtoon-equal-boundary/1");
      }
      expect(cloned.onBeforeCompile).not.toBe(source.onBeforeCompile);
      expect(copied.onBeforeCompile).not.toBe(source.onBeforeCompile);
      expect(cloned.uniforms).not.toBe(source.uniforms);
      expect(copied.uniforms).not.toBe(source.uniforms);
    } finally { copied.dispose(); cloned.dispose(); source.dispose(); }
  });

  it("원본 body callback을 복사하지 않고 대상 outline의 define과 프로그램 키를 계산한다", () => {
    const body = new StudioMToonMaterial({ isOutline: false, outlineWidthMode: MToonMaterialOutlineWidthMode.ScreenCoordinates });
    const outline = body.clone(); outline.isOutline = true; outline.side = BackSide;
    const sibling = outline.clone();
    try {
      expect(compileHook(body).vertexShader).not.toContain("#define OUTLINE true");
      expect(compileHook(outline).vertexShader).toContain("#define OUTLINE true");
      expect(compileHook(sibling).vertexShader).toContain("#define OUTLINE true");
      expect(body.customProgramCacheKey()).toContain("OUTLINE:false");
      expect(outline.customProgramCacheKey()).toContain("OUTLINE:true");
      expect(sibling.customProgramCacheKey()).toBe(outline.customProgramCacheKey());
      expect(body.isOutline).toBe(false); expect(body.side).not.toBe(BackSide);
      sibling.color.copy(new Color(.1, .2, .3)); expect(sibling.color).not.toBe(outline.color);
      expect(outline.color).not.toEqual(sibling.color);
    } finally { sibling.dispose(); outline.dispose(); body.dispose(); }
  });

  it("복사된 일반 SDK 재질도 대상 소유 보정을 유지하고 원본은 변경하지 않는다", () => {
    const source = new MToonMaterial({ isOutline: true, outlineWidthMode: MToonMaterialOutlineWidthMode.WorldCoordinates });
    const target = new StudioMToonMaterial().copy(source);
    const originalCompiler = source.onBeforeCompile;
    try {
      expect(readStudioMToonRuntimeIdentity(source)).toBeNull();
      expect(readStudioMToonRuntimeIdentity(target)).toMatchObject({ backend: "webgl" });
      expect(compileHook(target).vertexShader).toContain("#define OUTLINE true");
      expect(source.onBeforeCompile).toBe(originalCompiler);
      expect(source.fragmentShader).not.toContain("if ( a == b ) { return step( a, t ); }");
    } finally { target.dispose(); source.dispose(); }
  });

  it("actual clone과 copy가 공유 이미지의 갱신 세대·Texture 행렬을 바꾸지 않고 live UV·flat normal을 보존한다", () => {
    const map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1), source = new StudioMToonMaterial({ map });
    source.flatShading = true; source.uvAnimationScrollXSpeedFactor = .4; source.update(.25);
    map.offset.set(.7, .4);
    const original = { textureVersion: map.version, sourceVersion: map.source.version, matrix: map.matrix.clone() };
    const clone = source.clone(), target = new StudioMToonMaterial().copy(source);
    try {
      expect(map.version).toBe(original.textureVersion); expect(map.source.version).toBe(original.sourceVersion); expect(map.matrix).toEqual(original.matrix);
      for (const material of [clone, target]) {
        expect(material.map).toBe(map); expect(material.flatShading).toBe(true);
        expect(material.uniforms.mapUvTransform?.value).toEqual(source.uniforms.mapUvTransform?.value);
        expect(material.uniforms.uvAnimationScrollXOffset?.value).toBeCloseTo(.1);
        expect(readStudioMToonRuntimeIdentity(material)?.backend).toBe("webgl");
      }
      expect(clone.uniforms.mapUvTransform?.value).not.toBe(source.uniforms.mapUvTransform?.value);
    } finally { clone.dispose(); target.dispose(); source.dispose(); map.dispose(); }
  });

  it("업로드 가능한 userData 표식을 승인하지 않고 callback·shader 변경을 감지한다", () => {
    const plain = new MeshStandardMaterial(); plain.userData = { backend: "webgl", revision: "toonstudio-mtoon-equal-boundary/1" };
    const material = new StudioMToonMaterial(), cloned = material.clone();
    try {
      expect(readStudioMToonRuntimeIdentity(plain)).toBeNull();
      cloned.fragmentShader = "void main() {}";
      expect(readStudioMToonRuntimeIdentity(cloned)).toBeNull();
      expect(() => compileHook(cloned)).toThrow(/일치하지 않거나 중복/u);
      material.onBeforeCompile = () => {};
      expect(readStudioMToonRuntimeIdentity(material)).toBeNull();
    } finally { plain.dispose(); cloned.dispose(); material.dispose(); }
  });

  it.each(["update", "onBeforeRender", "copy"] as const)("%s 교체를 승인하지 않고 원래 callback을 복원하면 다시 검증한다", (method) => {
    const material = new StudioMToonMaterial(), original = material[method];
    try {
      Reflect.set(material, method, () => {});
      expect(readStudioMToonRuntimeIdentity(material)).toBeNull();
      Reflect.set(material, method, original);
      expect(readStudioMToonRuntimeIdentity(material)).toMatchObject({ backend: "webgl" });
    } finally { material.dispose(); }
  });

  it.each([
    ["shadingShiftFactor", Number.NaN], ["shadingShiftFactor", 2],
    ["shadingToonyFactor", -1], ["shadingToonyFactor", Number.POSITIVE_INFINITY],
    ["outlineWidthFactor", -1], ["outlineWidthFactor", Number.MAX_VALUE], ["outlineWidthMode", "custom"],
  ] as const)("유효하지 않은 %s 값 %s을 거부한다", (property, value) => {
    const material = new StudioMToonMaterial();
    try { Reflect.set(material, property, value); expect(readStudioMToonRuntimeIdentity(material)).toBeNull(); }
    finally { material.dispose(); }
  });
});
