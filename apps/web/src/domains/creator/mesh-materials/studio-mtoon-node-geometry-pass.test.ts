// @vitest-environment jsdom
import { MToonNodeMaterial } from "@pixiv/three-vrm/nodes";
import { BoxGeometry, DataTexture, DoubleSide, Material, NoBlending, PerspectiveCamera, Plane, RenderTarget, RGBAFormat, Scene, Texture, Vector3, Vector4 } from "three";
import { mrt, normalView, output, vec4 } from "three/tsl";
import { Mesh, WebGPURenderer, WGSLNodeBuilder } from "three/webgpu";
import { describe, expect, it, vi } from "vitest";

import { createStudioMToonNodeGeometryPass } from "./studio-mtoon-node-geometry-pass";
import { StudioMToonNodeMaterial } from "./studio-mtoon-node-material";
import { hasStudioMToonRuntimeRegistration, readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";

function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function dataTexture() {
  const texture = new DataTexture(new Uint8Array([0, 97, 255, 113]), 1, 1, RGBAFormat);
  texture.offset.set(.3, -.2); texture.repeat.set(.8, 1.2); texture.rotation = .4; texture.needsUpdate = true;
  return texture;
}
function fixture() {
  const source = new StudioMToonNodeMaterial(), map = dataTexture(), mask = dataTexture(), normal = dataTexture();
  source.map = map; source.uvAnimationMaskTexture = mask; source.normalMap = normal;
  source.alphaTest = .37; source.opacity = .49; source.side = DoubleSide;
  // Three builder가 읽는 실제 공개 상태를 설정한다. SDK 타입 선언을 보강하지 않는다.
  Object.assign(source, { flatShading: true });
  source.clipIntersection = true; source.clipShadows = true;
  source.clippingPlanes = [new Plane(new Vector3(1, 0, 0), .3), new Plane(new Vector3(0, 1, 0), -.2)];
  source.uvAnimationScrollXOffset = .23; source.uvAnimationScrollYOffset = -.11; source.uvAnimationRotationPhase = .6;
  source.uvAnimationScrollXSpeedFactor = .7; source.uvAnimationScrollYSpeedFactor = -.3; source.uvAnimationRotationSpeedFactor = .2;
  return { source, map, mask, normal, dispose() { source.dispose(); map.dispose(); mask.dispose(); normal.dispose(); } };
}
function build(pass: Material, geometry: BoxGeometry, useMrt: boolean, useClipping: boolean) {
  const renderer = new WebGPURenderer({ canvas: document.createElement("canvas") });
  // GPU 초기화 대신 이 CPU profile의 두 capability만 명시한다.
  renderer.hasFeature = (name) => { if (!["float32-filterable", "clip-distances"].includes(name)) throw new Error(`예상하지 않은 feature: ${name}`); return false; };
  const target = new RenderTarget(4, 4, { count: useMrt ? 2 : 1 });
  const outputTexture = target.textures[0]; if (!outputTexture) throw new Error("depth attachment가 없습니다.");
  outputTexture.name = "output";
  if (useMrt) {
    const normalTexture = target.textures[1]; if (!normalTexture) throw new Error("normal attachment가 없습니다.");
    normalTexture.name = "studioNormal";
  }
  renderer.setRenderTarget(target);
  if (useMrt) renderer.setMRT(mrt({ output, studioNormal: vec4(normalView.mul(.5).add(.5), 1) }));
  const builder = new WGSLNodeBuilder(new Mesh(geometry, pass), renderer), camera = new PerspectiveCamera();
  Reflect.set(builder, "camera", camera); Reflect.set(builder, "scene", new Scene());
  if (useClipping) {
    // 실제 ClippingGroup이 renderer에 전달하는 view-space context를 입력하고 실제 Three clipping node를 빌드한다.
    Reflect.set(builder, "clippingContext", { unionPlanes: [new Vector4(1, 0, 0, .3)], intersectionPlanes: [], cacheKey: "1:0" });
  }
  try {
    if (!("build" in builder) || typeof builder.build !== "function") throw new Error("실제 WGSL builder가 없습니다.");
    builder.build();
    const fragment: unknown = Reflect.get(builder, "fragmentShader"), nodes: unknown = Reflect.get(builder, "nodes");
    if (typeof fragment !== "string" || !(nodes instanceof Set)) throw new Error("실제 WGSL 결과가 없습니다.");
    return { fragment, nodes: [...nodes].filter(object) };
  } finally { target.dispose(); }
}

describe("WebGPU MToon의 일회성 geometry pass", () => {
  it.each(["depth", "normal-depth"] as const)("%s는 원본 coverage·sampling·clock·side·clip 값을 독립 snapshot으로 보존한다", (kind) => {
    const value = fixture(), versions = [value.map.version, value.map.source.version, value.mask.version, value.mask.source.version];
    const matrix = value.map.matrix.clone(), pass = createStudioMToonNodeGeometryPass(value.source, kind);
    try {
      expect(pass).not.toBe(value.source); expect(pass.side).toBe(DoubleSide); expect(Reflect.get(pass, "flatShading")).toBe(true);
      expect(pass.opacity).toBe(.49); expect(pass.alphaTest).toBe(.37); expect(pass.blending).toBe(NoBlending);
      expect(pass.depthWrite).toBe(true); expect(pass.toneMapped).toBe(false); expect(pass.fragmentNode).toBeNull();
      expect(pass.map).not.toBe(value.map); expect(pass.map?.source.data).toBe(value.map.source.data);
      expect(pass.map?.source).not.toBe(value.map.source); expect(pass.map?.matrixAutoUpdate).toBe(false);
      expect(pass.clippingPlanes).toEqual(value.source.clippingPlanes); expect(pass.clippingPlanes?.[0]).not.toBe(value.source.clippingPlanes?.[0]);
      expect(pass.clipIntersection).toBe(true); expect(pass.clipShadows).toBe(true); expect(pass.normalNode).toBeNull();
      expect(readStudioMToonRuntimeIdentity(pass)).toBeNull(); expect(hasStudioMToonRuntimeRegistration(pass)).toBe(false);
      expect([value.map.version, value.map.source.version, value.mask.version, value.mask.source.version]).toEqual(versions);
      expect(value.map.matrix).toEqual(matrix);
      const before = pass.map?.matrix.clone();
      value.source.update(2); value.source.opacity = .9; value.source.alphaTest = .1;
      value.map.offset.set(10, 10); value.map.updateMatrix();
      if (value.source.clippingPlanes?.[0]) value.source.clippingPlanes[0].constant = 9;
      expect(pass.opacity).toBe(.49); expect(pass.alphaTest).toBe(.37); expect(pass.map?.matrix).toEqual(before);
      expect(value.source.uvAnimationRotationPhase).not.toBe(.6);
      expect(Reflect.get(pass, "uvAnimationScrollXOffset")).toBe(.23);
      expect(Reflect.get(pass, "uvAnimationScrollYOffset")).toBe(-.11); expect(Reflect.get(pass, "uvAnimationRotationPhase")).toBe(.6);
      expect(pass.clippingPlanes?.[0]?.constant).toBe(.3);
      expect(() => pass.clone()).toThrow(/일회성/u);
    } finally { pass.dispose(); value.dispose(); }
  });

  it.each([false, true])("실제 WGSL source/clone·MRT=%s에서 alpha discard 뒤 packed RGBA를 출력하고 B UV·기하 법선을 유지한다", (useMrt) => {
    const value = fixture(), geometry = new BoxGeometry(), clone = value.source.clone();
    try {
      expect(Reflect.get(clone, "flatShading")).toBe(true);
      for (const source of [value.source, clone]) {
      const pass = createStudioMToonNodeGeometryPass(source, useMrt ? "normal-depth" : "depth");
      try {
        const result = build(pass, geometry, useMrt, true);
        expect(result.fragment).toContain("studioThreePackDepthToRgba");
        expect(result.fragment).toContain("discard"); expect(result.fragment).toContain("DiffuseColor.w");
        expect(result.fragment.indexOf("discard")).toBeLessThan(result.fragment.lastIndexOf("studioThreePackDepthToRgba("));
        const references = result.nodes.filter((node) => node.isMaterialReferenceNode === true);
        for (const property of ["map", "uvAnimationMaskTexture", "uvAnimationRotationPhase", "uvAnimationScrollXOffset", "uvAnimationScrollYOffset"]) {
          const matching = references.filter((node) => node.property === property); expect(matching.length, property).toBeGreaterThan(0);
          for (const reference of matching) { expect(reference.material).toBe(pass); expect(reference.reference).toBe(pass); }
        }
        expect(references.some((node) => node.property === "normalMap")).toBe(false);
        expect(result.nodes.some((node) => node.type === "ClippingNode")).toBe(true);
        if (useMrt) {
          // OutputStructNode는 attachment 이름을 shader 멤버 m0/m1로 바꾼다. 실제 2번 출력과 기하 normal 경로를 검사한다.
          expect(result.fragment).toMatch(/@location\(\s*1\s*\)\s+m1\s*:\s*vec4<f32>/u);
          expect(result.fragment).toContain("normalView");
        }
        expect(value.source.map).toBe(value.map); expect(value.source.normalMap).toBe(value.normal);
        expect(value.source.alphaTest).toBe(.37); expect(value.source.opacity).toBe(.49);
      } finally { pass.dispose(); }
    } } finally { clone.dispose(); value.dispose(); geometry.dispose(); }
  });

  it("map과 mask가 같은 Texture이면 snapshot 하나만 소유하고 반복 dispose는 원본을 해제하지 않는다", () => {
    const value = fixture(); value.source.uvAnimationMaskTexture = value.map;
    const sourceDisposed = vi.fn(), passDisposed = vi.fn(), snapshotDisposed = vi.fn(); value.map.addEventListener("dispose", sourceDisposed);
    const pass = createStudioMToonNodeGeometryPass(value.source, "depth");
    pass.addEventListener("dispose", passDisposed); pass.map?.addEventListener("dispose", snapshotDisposed);
    expect(Reflect.get(pass, "uvAnimationMaskTexture")).toBe(pass.map);
    pass.dispose(); pass.dispose();
    expect(snapshotDisposed).toHaveBeenCalledOnce(); expect(passDisposed).toHaveBeenCalledOnce(); expect(sourceDisposed).not.toHaveBeenCalled();
    value.dispose();
  });

  it("두 번째 texture 준비가 실패하면 이미 생성한 독립 texture만 정리하고 source의 시계는 그대로 둔다", () => {
    const snapshotDisposed = vi.fn(); let constructorFails = false;
    class TrackedTexture extends DataTexture {
      constructor() { super(new Uint8Array([1, 2, 3, 4]), 1, 1); this.addEventListener("dispose", snapshotDisposed); }
    }
    class FailingTexture extends Texture { constructor() { super(); if (constructorFails) throw new Error("texture 생성 실패 fixture"); } }
    const source = new StudioMToonNodeMaterial(), map = new TrackedTexture(), mask = new FailingTexture();
    source.map = map; source.uvAnimationMaskTexture = mask;
    const version = map.source.version; constructorFails = true;
    expect(() => createStudioMToonNodeGeometryPass(source, "depth")).toThrow(/texture 생성 실패/u);
    expect(snapshotDisposed).toHaveBeenCalledOnce(); expect(map.source.version).toBe(version); expect(source.map).toBe(map);
    source.dispose(); map.dispose(); mask.dispose();
  });

  it("미등록·outline·변조·유한하지 않은 입력을 원본 수정 없이 거부한다", () => {
    const raw = new MToonNodeMaterial(); expect(() => createStudioMToonNodeGeometryPass(raw, "depth")).toThrow(/승인/u); raw.dispose();
    const value = fixture();
    try {
      expect(() => Reflect.apply(createStudioMToonNodeGeometryPass, undefined, [value.source, "other"])).toThrow(/지원/u);
      value.source.isOutline = true; expect(() => createStudioMToonNodeGeometryPass(value.source, "depth")).toThrow(/본체/u);
      value.source.isOutline = false; value.source.opacity = NaN;
      expect(() => createStudioMToonNodeGeometryPass(value.source, "depth")).toThrow(/유한/u);
      value.source.opacity = .49; value.source.onBeforeCompile = () => {};
      expect(() => createStudioMToonNodeGeometryPass(value.source, "depth")).toThrow(/승인/u);
      expect(value.source.map).toBe(value.map);
    } finally { value.dispose(); }
  });
});
