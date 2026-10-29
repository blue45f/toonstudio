import { MToonMaterial } from "@pixiv/three-vrm";
import {
  BackSide, DoubleSide, LinearSRGBColorSpace, MeshStandardMaterial, NoBlending,
  OrthographicCamera, PerspectiveCamera, Plane, ShaderLib, Texture, Vector3, Vector4,
} from "three";
import { describe, expect, it, vi } from "vitest";

import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";
import { createStudioMToonWebGlGeometryPass, patchStudioMToonGeometryDepthShader } from "./studio-mtoon-webgl-geometry-pass";
import { StudioMToonMaterial } from "./studio-mtoon-webgl-runtime";

/** 실제 SDK compiler hook만 실행한다. GPU shader 컴파일·픽셀 검증을 대신하지 않는다. */
function compile(material: MToonMaterial, fragmentShader = material.fragmentShader) {
  const shader = { vertexShader: material.vertexShader, fragmentShader, uniforms: material.uniforms, defines: {} };
  Reflect.apply(material.onBeforeCompile, material, [shader, { outputColorSpace: LinearSRGBColorSpace }]);
  return shader;
}

describe("일회성 WebGL MToon 기하 패스", () => {
  it.each(["normal", "depth"] as const)("%s는 원본 coverage·UV 시각·side·clip을 보존하고 기하 법선만 사용한다", (kind) => {
    const map = new Texture(), mask = new Texture(), normalMap = new Texture();
    map.offset.set(.2, -.3); map.repeat.set(1.5, 2); map.rotation = .4;
    mask.offset.set(.1, .7); mask.center.set(.2, .6); mask.rotation = -.2;
    const source = new StudioMToonMaterial({ map, normalMap, uvAnimationMaskTexture: mask, side: DoubleSide, alphaTest: .37 });
    source.update(0);
    source.opacity = .61; source.flatShading = true;
    source.alphaTest = .49;
    source.clippingPlanes = [new Plane(new Vector3(0, 1, 0), -.3)]; source.clipIntersection = true;
    source.uniforms.uvAnimationScrollXOffset.value = .123;
    source.uniforms.uvAnimationScrollYOffset.value = -.234;
    source.uniforms.uvAnimationRotationPhase.value = .345;
    source.uvAnimationScrollXSpeedFactor = .7; source.uvAnimationRotationSpeedFactor = .8;
    // 속성이 바뀌었어도 beauty의 실제 live uniform은 update 이전 값을 쓰므로 그것을 복제해야 한다.
    map.offset.set(.8, -.9); mask.rotation = .6;
    map.matrix.identity(); mask.matrix.identity();
    const sourceMatrices = [map.matrix.toArray(), mask.matrix.toArray()];
    const sourceUniformMatrices = [source.uniforms.mapUvTransform.value.toArray(), source.uniforms.uvAnimationMaskTextureUvTransform.value.toArray()];
    const sourceShader = [source.vertexShader, source.fragmentShader, source.onBeforeCompile, source.customProgramCacheKey];
    const updateMap = vi.spyOn(map, "updateMatrix"), updateMask = vi.spyOn(mask, "updateMatrix");
    let originalTextureDisposals = 0;
    for (const texture of [map, mask, normalMap]) texture.addEventListener("dispose", () => { originalTextureDisposals += 1; });
    const pass = createStudioMToonWebGlGeometryPass(source, kind);
    try {
      expect(pass).toBeInstanceOf(MToonMaterial); expect(pass).not.toBeInstanceOf(StudioMToonMaterial);
      expect(pass.uniforms).not.toBe(source.uniforms); expect(pass.map).toBe(map); expect(pass.uvAnimationMaskTexture).toBe(mask);
      expect(pass.normalMap).toBeNull(); expect(source.normalMap).toBe(normalMap);
      expect(pass.side).toBe(DoubleSide); expect(pass.flatShading).toBe(true); expect(pass.isOutline).toBe(false);
      expect(Object.hasOwn(pass, "flatShading")).toBe(true);
      expect(pass.alphaTest).toBe(.49); expect(pass.uniforms.alphaTest.value).toBe(.37);
      expect(pass.opacity).toBe(.61); expect(pass.uniforms.opacity.value).toBe(1);
      expect(pass.clippingPlanes).toEqual(source.clippingPlanes); expect(pass.clippingPlanes).not.toBe(source.clippingPlanes);
      expect(pass.clippingPlanes?.[0]).not.toBe(source.clippingPlanes[0]); expect(pass.clipIntersection).toBe(true);
      expect(pass.blending).toBe(NoBlending); expect(pass.depthWrite).toBe(true); expect(pass.transparent).toBe(false);
      for (const key of ["uvAnimationScrollXOffset", "uvAnimationScrollYOffset", "uvAnimationRotationPhase"] as const) {
        expect(pass.uniforms[key].value).toBe(source.uniforms[key].value);
      }
      expect([pass.uniforms.mapUvTransform.value.toArray(), pass.uniforms.uvAnimationMaskTextureUvTransform.value.toArray()]).toEqual(sourceUniformMatrices);
      expect([map.matrix.toArray(), mask.matrix.toArray()]).toEqual(sourceMatrices);
      expect(updateMap).not.toHaveBeenCalled(); expect(updateMask).not.toHaveBeenCalled();
      expect([source.vertexShader, source.fragmentShader, source.onBeforeCompile, source.customProgramCacheKey]).toEqual(sourceShader);
      expect(source.uniforms.opacity.value).toBe(1); expect(source.uniforms.alphaTest.value).toBe(.37);
      expect(source.uniforms.uvAnimationScrollXOffset.value).toBe(.123);
      expect(readStudioMToonRuntimeIdentity(source)).toMatchObject({ backend: "webgl" });
      expect(readStudioMToonRuntimeIdentity(pass)).toBeNull();
      expect(pass.customProgramCacheKey()).toContain(`toonstudio-mtoon-webgl-geometry/1:${kind}:`);
      expect(pass.customProgramCacheKey()).not.toBe(source.customProgramCacheKey());
      const shader = compile(pass);
      expect(shader.fragmentShader).toContain("#define DEBUG_NORMAL true");
      expect(shader.fragmentShader).not.toContain("#define OUTLINE true");
      expect(shader.fragmentShader.indexOf("#include <alphatest_fragment>")).toBeLessThan(shader.fragmentShader.indexOf("#ifdef DEBUG_NORMAL"));
      expect(shader.fragmentShader.indexOf("#include <clipping_planes_fragment>")).toBeLessThan(shader.fragmentShader.indexOf("#ifdef DEBUG_NORMAL"));
      expect(shader.fragmentShader).toContain("texture2D( uvAnimationMaskTexture, uvAnimationMaskTextureUv ).b");
      expect(shader.fragmentShader).toContain("vec2 mapUv = ( mapUvTransform * vec3( uv, 1 ) ).xy;");
      expect(shader.fragmentShader).toContain("if ( a == b ) { return step( a, t ); }");
    } finally {
      pass.dispose(); source.dispose(); updateMap.mockRestore(); updateMask.mockRestore();
      expect(originalTextureDisposals).toBe(0);
      map.dispose(); mask.dispose(); normalMap.dispose();
    }
  });

  it("normal 출력은 SDK debug normal이며 원본 BackSide와 클리핑 기능을 유지한다", () => {
    const source = new StudioMToonMaterial({ side: BackSide }), pass = createStudioMToonWebGlGeometryPass(source, "normal");
    try {
      expect(pass.side).toBe(BackSide); expect(pass.clipping).toBe(true);
      const shader = compile(pass);
      expect(shader.fragmentShader).toContain("gl_FragColor = vec4( 0.5 + 0.5 * normal, 1.0 );\n    return;");
      expect(shader.fragmentShader).not.toContain("varying vec2 vHighPrecisionZW;");
      expect(shader.vertexShader).toContain("#include <morphtarget_vertex>");
      expect(shader.vertexShader).toContain("#include <skinning_vertex>");
    } finally { pass.dispose(); source.dispose(); }
  });

  it("depth는 실제 Three의 high precision·reverse 분기·RGBA packing을 사용한다", () => {
    const source = new StudioMToonMaterial(), pass = createStudioMToonWebGlGeometryPass(source, "depth");
    try {
      const shader = compile(pass);
      expect(shader.vertexShader.match(/varying vec2 vHighPrecisionZW;/gu)).toHaveLength(1);
      expect(shader.fragmentShader.match(/varying vec2 vHighPrecisionZW;/gu)).toHaveLength(1);
      expect(shader.vertexShader).toContain("#include <clipping_planes_vertex>\n  vHighPrecisionZW = gl_Position.zw;");
      const depthBlock = ShaderLib.depth.fragmentShader.match(/#ifdef USE_REVERSED_DEPTH_BUFFER[\s\S]*?#endif/u)?.[0];
      expect(depthBlock).toBeDefined(); expect(shader.fragmentShader).toContain(depthBlock);
      expect(shader.fragmentShader).toContain("gl_FragColor = packDepthToRGBA( fragCoordZ );\n    return;");
      expect(shader.fragmentShader).not.toContain("gl_FragColor = vec4( 0.5 + 0.5 * normal, 1.0 );");
      expect(shader.fragmentShader).toContain("#include <logdepthbuf_fragment>");
      expect(() => patchStudioMToonGeometryDepthShader(shader)).toThrow(/이미 적용/u);
    } finally { pass.dispose(); source.dispose(); }
  });

  it.each([new PerspectiveCamera(45, 1.7, .1, 100), new OrthographicCamera(-2, 2, 1, -1, .1, 100)])(
    "%s의 high precision clip z/w는 near=0·far=1이고 원근 중간값을 선형 거리로 바꾸지 않는다", (camera) => {
      const atDepth = (depth: number) => {
        const clip = new Vector4(0, 0, -depth, 1).applyMatrix4(camera.projectionMatrix);
        return .5 * clip.z / clip.w + .5;
      };
      expect(atDepth(.1)).toBeCloseTo(0, 12); expect(atDepth(100)).toBeCloseTo(1, 12);
      expect(atDepth(1)).toBeCloseTo(camera instanceof PerspectiveCamera ? .9009009009009008 : .009009009009009028, 12);
    },
  );

  it("공유 map/mask의 원본 Texture 참조와 독립 uniform 행렬을 함께 보존한다", () => {
    const texture = new Texture(), source = new StudioMToonMaterial({ map: texture, uvAnimationMaskTexture: texture });
    const pass = createStudioMToonWebGlGeometryPass(source, "normal");
    try {
      expect(pass.map).toBe(texture); expect(pass.uvAnimationMaskTexture).toBe(texture);
      expect(pass.uniforms.mapUvTransform.value).not.toBe(source.uniforms.mapUvTransform.value);
      expect(pass.uniforms.uvAnimationMaskTextureUvTransform.value).not.toBe(source.uniforms.uvAnimationMaskTextureUvTransform.value);
    } finally { pass.dispose(); source.dispose(); texture.dispose(); }
  });

  it("raw SDK·가짜 브랜드·outline·승인 후 변경된 source는 복제 전에 거부한다", () => {
    const raw = new MToonMaterial(), plain = new MeshStandardMaterial();
    plain.userData = { backend: "webgl" };
    const outline = new StudioMToonMaterial({ isOutline: true }), changed = new StudioMToonMaterial();
    changed.onBeforeCompile = () => {};
    try {
      for (const source of [raw, plain, outline, changed]) {
        expect(() => createStudioMToonWebGlGeometryPass(source, "normal")).toThrow(/승인된 WebGL MToon 본체/u);
      }
    } finally { raw.dispose(); plain.dispose(); outline.dispose(); changed.dispose(); }
  });

  it("실제 compiler 실패 이후 소유자가 두 번 dispose해도 pass event는 한 번이고 원본은 유지한다", () => {
    const source = new StudioMToonMaterial(), pass = createStudioMToonWebGlGeometryPass(source, "depth");
    let passDisposed = 0, sourceDisposed = 0;
    pass.addEventListener("dispose", () => { passDisposed += 1; }); source.addEventListener("dispose", () => { sourceDisposed += 1; });
    try {
      expect(() => compile(pass, pass.fragmentShader.replace("#ifdef DEBUG_NORMAL", "#ifdef CHANGED_NORMAL"))).toThrow(/원문/u);
      expect(passDisposed).toBe(1); expect(sourceDisposed).toBe(0);
      expect(() => compile(pass, pass.fragmentShader + pass.fragmentShader)).toThrow();
      pass.dispose();
      pass.dispose();
      expect(passDisposed).toBe(1); expect(readStudioMToonRuntimeIdentity(source)).toMatchObject({ backend: "webgl" });
      expect(sourceDisposed).toBe(0);
    } finally { source.dispose(); }
  });

  it("Three 공개 깊이 shader의 생성 전 불일치는 새 pass를 정리한다", () => {
    const source = new StudioMToonMaterial(), original = ShaderLib.depth.vertexShader;
    const dispose = vi.spyOn(MToonMaterial.prototype, "dispose");
    try {
      ShaderLib.depth.vertexShader = original.replace("varying vec2 vHighPrecisionZW;", "varying vec2 changedPrecision;");
      expect(() => createStudioMToonWebGlGeometryPass(source, "depth")).toThrow(/원문/u);
      expect(dispose).toHaveBeenCalledTimes(1); expect(dispose.mock.instances[0]).not.toBe(source);
      expect(readStudioMToonRuntimeIdentity(source)).toMatchObject({ backend: "webgl" });
    } finally { ShaderLib.depth.vertexShader = original; dispose.mockRestore(); source.dispose(); }
  });
});
