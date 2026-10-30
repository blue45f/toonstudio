import { MToonMaterial } from "@pixiv/three-vrm";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioMToonMaterial } from "../mesh-materials/studio-mtoon-webgl-runtime";
import { registerStudioBg3dDepthExcludedObject } from "./studio-bg3d-capture-exclusion";
import { captureStudioBg3dThreeDepth } from "./studio-bg3d-lt-three-depth";
import { captureStudioBg3dThreeNormals } from "./studio-bg3d-three-normal-capture";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function rendererFixture(readback: Promise<THREE.TypedArray>) {
  const initialColor = new THREE.Color("#234567");
  let clearColor = initialColor.clone();
  let clearAlpha = 0.4;
  let renderTarget: THREE.WebGLRenderTarget | null = null;
  const renderer = {
    autoClear: false,
    xr: { enabled: true },
    getRenderTarget: vi.fn(() => renderTarget),
    getActiveCubeFace: vi.fn(() => 3),
    getActiveMipmapLevel: vi.fn(() => 2),
    getViewport: vi.fn((target: THREE.Vector4) => target.set(7, 9, 19, 21)),
    getScissor: vi.fn((target: THREE.Vector4) => target.set(2, 3, 11, 13)),
    getScissorTest: vi.fn(() => true),
    setViewport: vi.fn(),
    setScissor: vi.fn(),
    setScissorTest: vi.fn(),
    getClearColor: vi.fn((target: THREE.Color) => target.copy(clearColor)),
    getClearAlpha: vi.fn(() => clearAlpha),
    setRenderTarget: vi.fn((next: THREE.WebGLRenderTarget | null) => {
      renderTarget = next;
    }),
    setClearColor: vi.fn((next: THREE.Color | number | string, alpha: number) => {
      clearColor = next instanceof THREE.Color ? next.clone() : new THREE.Color(next);
      clearAlpha = alpha;
    }),
    clear: vi.fn(),
    render: vi.fn(),
    readRenderTargetPixelsAsync: vi.fn(
      (
        _target: THREE.WebGLRenderTarget,
        _x: number,
        _y: number,
        _width: number,
        _height: number,
        packed: THREE.TypedArray
      ) => {
        (packed as Uint8Array).set([
          64, 0, 0, 0,
          128, 0, 0, 0,
          192, 0, 0, 0,
          255, 255, 255, 255,
        ]);
        return readback;
      }
    ),
  } as unknown as THREE.WebGLRenderer;
  return {
    initialColor,
    renderer,
    current: () => ({ clearAlpha, clearColor, renderTarget }),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  ["depth", captureStudioBg3dThreeDepth],
  ["normal", captureStudioBg3dThreeNormals],
] as const)("실제 %s capture의 툰 본체 coverage", (kind, capture) => {
  it("outline을 제외하고 화면 uniform snapshot을 제출한 뒤 fence 전에 원본을 복원한다", async () => {
    const readback = deferred<THREE.TypedArray>(), f = rendererFixture(readback.promise);
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    const normalMap = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
    const body = new StudioMToonMaterial({ side: THREE.DoubleSide, map, normalMap, opacity: .6, alphaTest: .25 });
    body.clippingPlanes = [new THREE.Plane(new THREE.Vector3(1, 0, 0), -.1)];
    body.uvAnimationScrollXSpeedFactor = .4; body.update(.5);
    // property가 다음 frame을 기다려도 pass는 현재 beauty에 업로드된 값과 일치해야 한다.
    body.opacity = .9; body.alphaTest = .75; map.offset.set(.6, .4);
    const outline = body.clone(); outline.isOutline = true; outline.side = THREE.BackSide;
    const geometry = new THREE.BoxGeometry(); geometry.clearGroups();
    geometry.addGroup(0, geometry.index!.count, 0); geometry.addGroup(0, geometry.index!.count, 1);
    const originals = [body, outline], mesh = new THREE.Mesh(geometry, originals), scene = new THREE.Scene(); scene.add(mesh);
    const originalGroups = JSON.stringify(geometry.groups), originalMatrix = map.matrix.clone(), sourceDisposed = vi.fn();
    const originalSourceVersion = map.source.version, originalNormalSourceVersion = normalMap.source.version;
    body.addEventListener("dispose", sourceDisposed);
    const passDisposed = vi.fn(); let capturedPass: MToonMaterial | undefined;
    vi.mocked(f.renderer.render).mockImplementation(() => {
      expect(scene.overrideMaterial).toBeNull();
      if (!Array.isArray(mesh.material) || !(mesh.material[0] instanceof MToonMaterial)) throw new Error("실제 툰 기하 pass가 없습니다.");
      const pass = mesh.material[0]; capturedPass = pass; pass.addEventListener("dispose", passDisposed);
      expect(pass).not.toBe(body); expect(pass.isOutline).toBe(false); expect(pass.side).toBe(THREE.DoubleSide);
      expect(mesh.material[1]?.visible).toBe(false);
      expect(pass.map).toBe(map); expect(pass.normalMap).toBeNull(); expect(pass.clippingPlanes).toEqual(body.clippingPlanes);
      expect(pass.uniforms.opacity?.value).toBe(.6); expect(pass.uniforms.alphaTest?.value).toBe(.25);
      expect(pass.uniforms.mapUvTransform?.value).toEqual(body.uniforms.mapUvTransform?.value);
      expect(pass.uniforms.uvAnimationScrollXOffset?.value).toBeCloseTo(.2);
      expect(pass.debugMode).toBe("normal");
      const shader = { vertexShader: pass.vertexShader, fragmentShader: pass.fragmentShader, uniforms: pass.uniforms };
      Reflect.apply(pass.onBeforeCompile, pass, [shader, { outputColorSpace: THREE.LinearSRGBColorSpace }]);
      expect(shader.fragmentShader.includes("vHighPrecisionZW")).toBe(kind === "depth");
    });
    try {
      const pending = capture({ renderer: f.renderer, scene, camera: new THREE.PerspectiveCamera(), width: 2, height: 2 });
      expect(f.renderer.render).toHaveBeenCalledOnce(); expect(capturedPass).toBeDefined();
      expect(mesh.material).toBe(originals); expect(scene.overrideMaterial).toBeNull(); expect(f.current().renderTarget).toBeNull();
      expect(passDisposed).not.toHaveBeenCalled(); expect(sourceDisposed).not.toHaveBeenCalled();
      expect(JSON.stringify(geometry.groups)).toBe(originalGroups); expect(map.matrix).toEqual(originalMatrix);
      expect(map.source.version).toBe(originalSourceVersion); expect(normalMap.source.version).toBe(originalNormalSourceVersion);
      readback.resolve(new Uint8Array(16)); await pending;
      expect(passDisposed).toHaveBeenCalledOnce(); expect(sourceDisposed).not.toHaveBeenCalled();
      expect(body.uniforms.uvAnimationScrollXOffset?.value).toBeCloseTo(.2);
    } finally { body.dispose(); outline.dispose(); geometry.dispose(); map.dispose(); normalMap.dispose(); }
  });
});

describe("captureStudioBg3dThreeDepth", () => {
  it("restores live renderer state before asynchronous GPU readback settles", async () => {
    const readback = deferred<THREE.TypedArray>();
    const fixture = rendererFixture(readback.promise);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const originalOverride = new THREE.MeshBasicMaterial();
    const originalBackground = new THREE.DataTexture();
    scene.overrideMaterial = originalOverride;
    scene.background = originalBackground;
    scene.backgroundRotation.set(0.1, 0.8, 0.2);
    const originalBackgroundRotation = scene.backgroundRotation.clone();
    vi.mocked(fixture.renderer.clear).mockImplementationOnce(() => {
      scene.background = new THREE.Color("#abcdef");
      scene.backgroundRotation.set(1, 2, 3);
    });
    vi.mocked(fixture.renderer.render).mockImplementation((renderedScene) => {
      expect(renderedScene).toBe(scene);
      expect(scene.background).toBeNull();
    });
    const targetDispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.MeshDepthMaterial.prototype, "dispose");

    const pending = captureStudioBg3dThreeDepth({
      renderer: fixture.renderer,
      scene,
      camera,
      width: 2,
      height: 2,
    });

    expect(scene.overrideMaterial).toBe(originalOverride);
    expect(scene.background).toBe(originalBackground);
    expect(scene.backgroundRotation).toEqual(originalBackgroundRotation);
    expect(fixture.renderer.autoClear).toBe(false);
    expect(fixture.renderer.xr.enabled).toBe(true);
    expect(fixture.current().renderTarget).toBeNull();
    expect(fixture.current().clearColor).toEqual(fixture.initialColor);
    expect(fixture.current().clearAlpha).toBe(0.4);
    expect(targetDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();

    readback.resolve(new Uint8Array(16));
    await expect(pending).resolves.toEqual(Float32Array.from([0.75, 1, 0.25, 0.5]));
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    originalOverride.dispose();
  });

  it("restores state and disposes temporary resources when readback rejects", async () => {
    const failure = new Error("context lost");
    const readback = deferred<THREE.TypedArray>();
    const fixture = rendererFixture(readback.promise);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const originalBackground = new THREE.Color("#102030");
    scene.background = originalBackground;
    vi.mocked(fixture.renderer.render).mockImplementation(() => {
      expect(scene.background).toBeNull();
    });
    const targetDispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.MeshDepthMaterial.prototype, "dispose");
    const pending = captureStudioBg3dThreeDepth({
      renderer: fixture.renderer,
      scene,
      camera,
      width: 2,
      height: 2,
    });

    expect(scene.overrideMaterial).toBeNull();
    expect(scene.background).toBe(originalBackground);
    expect(fixture.current().renderTarget).toBeNull();
    readback.reject(failure);

    await expect(pending).rejects.toBe(failure);
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("hides beauty-only contact geometry only for depth submission and restores it before readback", async () => {
    const readback = deferred<THREE.TypedArray>();
    const fixture = rendererFixture(readback.promise);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const visibleContactShadow = new THREE.Mesh();
    const alreadyHiddenContactShadow = new THREE.Mesh();
    alreadyHiddenContactShadow.visible = false;
    const importedLookingObject = new THREE.Mesh();
    importedLookingObject.userData.studioBg3dDepthExcluded = true;
    registerStudioBg3dDepthExcludedObject(visibleContactShadow);
    registerStudioBg3dDepthExcludedObject(alreadyHiddenContactShadow);
    scene.add(visibleContactShadow, alreadyHiddenContactShadow, importedLookingObject);
    vi.mocked(fixture.renderer.render).mockImplementation(() => {
      expect(visibleContactShadow.visible).toBe(false);
      expect(alreadyHiddenContactShadow.visible).toBe(false);
      expect(importedLookingObject.visible).toBe(true);
    });

    const pending = captureStudioBg3dThreeDepth({
      renderer: fixture.renderer,
      scene,
      camera,
      width: 2,
      height: 2,
    });

    expect(visibleContactShadow.visible).toBe(true);
    expect(alreadyHiddenContactShadow.visible).toBe(false);
    expect(importedLookingObject.visible).toBe(true);
    readback.resolve(new Uint8Array(16));
    await expect(pending).resolves.toBeInstanceOf(Float32Array);
  });

  it("restores and disposes when rendering fails before readback submission", async () => {
    const fixture = rendererFixture(Promise.resolve(new Uint8Array(4)));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const failure = new Error("render failed");
    const originalBackground = new THREE.DataTexture();
    const contactShadow = new THREE.Mesh();
    registerStudioBg3dDepthExcludedObject(contactShadow);
    scene.add(contactShadow);
    scene.background = originalBackground;
    vi.mocked(fixture.renderer.render).mockImplementation(() => {
      expect(scene.background).toBeNull();
      expect(contactShadow.visible).toBe(false);
      throw failure;
    });
    const targetDispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const materialDispose = vi.spyOn(THREE.MeshDepthMaterial.prototype, "dispose");

    await expect(
      captureStudioBg3dThreeDepth({
        renderer: fixture.renderer,
        scene,
        camera,
        width: 1,
        height: 1,
      })
    ).rejects.toBe(failure);

    expect(scene.overrideMaterial).toBeNull();
    expect(scene.background).toBe(originalBackground);
    expect(contactShadow.visible).toBe(true);
    expect(fixture.renderer.autoClear).toBe(false);
    expect(fixture.renderer.xr.enabled).toBe(true);
    expect(fixture.current().renderTarget).toBeNull();
    expect(targetDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
  });

  it("rejects malformed inputs and over-budget dimensions", async () => {
    const fixture = rendererFixture(Promise.resolve(new Uint8Array(4)));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    await expect(
      captureStudioBg3dThreeDepth({
        renderer: fixture.renderer,
        scene,
        camera,
        width: 0,
        height: 1,
      })
    ).rejects.toThrow(/dimensions/u);
    await expect(
      captureStudioBg3dThreeDepth({
        renderer: null as unknown as THREE.WebGLRenderer,
        scene,
        camera,
        width: 1,
        height: 1,
      })
    ).rejects.toThrow(/requires/u);
  });
});


describe.each([
  ["depth", captureStudioBg3dThreeDepth],
  ["normal", captureStudioBg3dThreeNormals],
] as const)("WebGL %s capture viewport isolation", (_label, capture) => {
  it("restores viewport, scissor and cube/mip target before the GPU fence completes", async () => {
    const readback = deferred<THREE.TypedArray>();
    const fixture = rendererFixture(readback.promise);
    const scene = new THREE.Scene();
    const target = new THREE.WebGLCubeRenderTarget(16);
    fixture.renderer.setRenderTarget(target, 3, 2);
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const pending = capture({ renderer: fixture.renderer, scene,
      camera: new THREE.PerspectiveCamera(), width: 2, height: 2 });
    expect(fixture.renderer.setRenderTarget).toHaveBeenLastCalledWith(target, 3, 2);
    expect(fixture.renderer.setViewport).toHaveBeenLastCalledWith(new THREE.Vector4(7, 9, 19, 21));
    expect(fixture.renderer.setScissor).toHaveBeenLastCalledWith(new THREE.Vector4(2, 3, 11, 13));
    expect(fixture.renderer.setScissorTest).toHaveBeenCalledWith(false);
    expect(fixture.renderer.setScissorTest).toHaveBeenLastCalledWith(true);
    expect(dispose).not.toHaveBeenCalled();
    readback.resolve(new Uint8Array(16));
    await pending;
    expect(dispose).toHaveBeenCalledOnce();
    target.dispose();
  });

  it("does not dispose submitted GPU resources when state restoration throws", async () => {
    const readback = deferred<THREE.TypedArray>();
    const fixture = rendererFixture(readback.promise);
    const scene = new THREE.Scene();
    const contact = new THREE.Mesh();
    registerStudioBg3dDepthExcludedObject(contact);
    scene.add(contact);
    const failure = new Error("restore target failed");
    vi.mocked(fixture.renderer.setRenderTarget).mockImplementationOnce(() => {})
      .mockImplementationOnce(() => { throw failure; });
    const dispose = vi.spyOn(THREE.WebGLRenderTarget.prototype, "dispose");
    const pending = capture({ renderer: fixture.renderer, scene,
      camera: new THREE.PerspectiveCamera(), width: 2, height: 2 });
    const rejected = expect(pending).rejects.toBe(failure);
    expect(contact.visible).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    readback.resolve(new Uint8Array(16));
    await rejected;
    expect(dispose).toHaveBeenCalledOnce();
  });
});
