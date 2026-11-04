import { MToonMaterial } from "@pixiv/three-vrm";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dTiledCameraSession } from "../bg3d/studio-bg3d-tiled-session";
import { assertStudioBg3dTiledSceneAdmission } from "../bg3d/studio-bg3d-tiled-scene-admission";
import { hideStudioBg3dCaptureExcludedObjects, registerStudioBg3dCaptureExcludedObject } from "../bg3d/studio-bg3d-capture-exclusion";
import { buildStudioBg3dTiledImages, type StudioBg3dTiledWorkerLike } from "../bg3d/studio-bg3d-tiled-artifact-client";
import { StudioBg3dTiledArtifactProcessor } from "../bg3d/studio-bg3d-tiled-artifact-processor";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "../bg3d/studio-bg3d-scene-document";
import { createStudioBg3dThreeWebglCaptureAdapter } from "../bg3d/studio-bg3d-three-webgl-capture";
import { createStudioBg3dThreeWebGpuCaptureAdapter } from "../bg3d/studio-bg3d-three-webgpu-capture";
import { updateStudioMToonInstanceMaterials } from "./studio-mtoon-instance-materials";
import { StudioMToonNodeMaterial } from "./studio-mtoon-node-material";
import { beginStudioMToonRasterScope } from "./studio-mtoon-raster-scope";
import { StudioMToonMaterial } from "./studio-mtoon-webgl-runtime";
import { STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1, type StudioBg3dCaptureRequest, type StudioBg3dCapturedRaster, type StudioBg3dCaptureAdapter } from "../bg3d/studio-bg3d-capture-adapter";
import type { StudioBg3dTiledRequest } from "../bg3d/studio-bg3d-tiled-artifact-contract";
import type { StudioMToonMaterialBackend } from "./studio-mtoon-runtime-identity";
import type { WebGPURenderer } from "three/webgpu";

const releases: Array<() => void> = [];
afterEach(() => { releases.splice(0).reverse().forEach((release) => release()); });
function owned<T extends { dispose(): void }>(resource: T): T { releases.push(() => resource.dispose()); return resource; }
function fixture(backend: StudioMToonMaterialBackend = "webgl", mode: "screenCoordinates" | "worldCoordinates" = "screenCoordinates") {
  const body = owned(backend === "webgl" ? new StudioMToonMaterial() : new StudioMToonNodeMaterial());
  body.outlineWidthMode = mode; body.outlineWidthFactor = .02;
  const outline = owned(body.clone()); outline.isOutline = true; outline.side = THREE.BackSide;
  const geometry = owned(new THREE.BoxGeometry()); geometry.clearGroups();
  geometry.addGroup(0, geometry.index?.count ?? 0, 0); geometry.addGroup(0, geometry.index?.count ?? 0, 1);
  const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material[]>(geometry, [body, outline]), scene = new THREE.Scene(); scene.add(mesh);
  const begin = () => owned(beginStudioMToonRasterScope(scene, backend, { assertSceneCurrent: () => assertStudioBg3dTiledSceneAdmission(scene, backend), prepareScene: () => hideStudioBg3dCaptureExcludedObjects(scene) }));
  return { body, outline, geometry, mesh, scene, begin };
}
function webgl() {
  const f = fixture(); if (!(f.body instanceof StudioMToonMaterial)) throw new Error("WebGL fixture 재질이 없습니다.");
  f.body.uvAnimationScrollXSpeedFactor = .4;
  return { ...f, body: f.body };
}
const window = { fullWidth: 64, fullHeight: 64, x: 0, y: 0, width: 32, height: 32 };
const request: StudioBg3dCaptureRequest = { width: 32, height: 32, includeDepth: false, background: { color: "#000000", alpha: 0 } };
function raster(): StudioBg3dCapturedRaster { return { width: 32, height: 32, rgba: new Uint8ClampedArray(32 * 32 * 4) }; }
function clock(material: StudioMToonMaterial) { return material.uniforms.uvAnimationScrollXOffset?.value; }
function tick(material: StudioMToonMaterial) { updateStudioMToonInstanceMaterials([material], .25); }

describe("MToon 타일 제출의 실제 재질·clock 소유권(CPU, GPU 픽셀 검증 아님)", () => {
  it.each(["webgl", "webgpu"] as const)("%s screen 폭은 halo 포함 window 높이로 보정하고 Promise 대기 전에 culling과 폭을 복원한다", async (backend) => {
    const f = fixture(backend), scope = f.begin(), groups = structuredClone(f.geometry.groups), positions = f.geometry.getAttribute("position").array.slice();
    const pending = Promise.withResolvers<number>();
    const result = scope.submit({ fullHeight: 1536, height: 524 }, () => {
      expect(f.body.outlineWidthFactor).toBeCloseTo(.02 * 1536 / 524);
      expect(f.outline.outlineWidthFactor).toBeCloseTo(.02 * 1536 / 524);
      expect(f.mesh.frustumCulled).toBe(false); return pending.promise;
    });
    expect(f.body.outlineWidthFactor).toBe(.02); expect(f.outline.outlineWidthFactor).toBe(.02); expect(f.mesh.frustumCulled).toBe(true);
    expect(f.geometry.groups).toEqual(groups); expect(f.geometry.getAttribute("position").array).toEqual(positions);
    pending.resolve(7); await expect(result).resolves.toBe(7);
    scope.submit({ fullHeight: 1536, height: 128 }, () => expect(f.outline.outlineWidthFactor).toBeCloseTo(.24));
    expect(f.outline.outlineWidthFactor).toBe(.02);
  });

  it.each(["webgl", "webgpu"] as const)("%s world 폭·원래 false culling은 유지하고 외부 source·형제 재질은 바꾸지 않는다", (backend) => {
    const f = fixture(backend, "worldCoordinates"), sibling = owned(f.body.clone()), scope = f.begin(); f.mesh.frustumCulled = false;
    scope.submit({ fullHeight: 1536, height: 128 }, () => {
      expect(f.body.outlineWidthFactor).toBe(.02); expect(f.outline.outlineWidthFactor).toBe(.02); expect(sibling.outlineWidthFactor).toBe(.02);
    });
    expect(f.mesh.frustumCulled).toBe(false); expect(sibling.outlineWidthFactor).toBe(.02);
  });

  it("겹친 scope는 각자 반납하고 중첩 제출·제출 중 begin은 변경 전에 거부한다", () => {
    const f = webgl(), a = f.begin(), b = f.begin(); tick(f.body); expect(clock(f.body)).toBe(0);
    a.submit(window, () => {
      expect(() => b.submit(window, () => undefined)).toThrow("제출 중");
      expect(() => f.begin()).toThrow("제출 중"); expect(f.outline.outlineWidthFactor).toBe(.04);
    });
    a.dispose(); a.dispose(); tick(f.body); expect(clock(f.body)).toBe(0);
    b.dispose(); tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
  });

  it("전체 타일 세션의 await 사이에도 clock을 고정하고 정상 종료 때만 해제한다", async () => {
    const f = webgl(), sibling = owned(f.body.clone()); sibling.uvAnimationScrollXSpeedFactor = .4;
    const execute = vi.fn(async () => { expect(f.outline.outlineWidthFactor).toBe(.04); expect(f.mesh.frustumCulled).toBe(false); return raster(); });
    const session = owned(createStudioBg3dTiledCameraSession(new THREE.PerspectiveCamera(), execute, undefined, f.begin()));
    await session.capture(request, window); tick(f.body); tick(sibling);
    expect(clock(f.body)).toBe(0); expect(clock(sibling)).toBeCloseTo(.1);
    await Promise.resolve(); await session.capture(request, window); tick(f.body); expect(clock(f.body)).toBe(0);
    expect(execute).toHaveBeenCalledTimes(2); session.dispose(); tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
  });

  it("진행 중 session dispose는 임시 상태를 이미 복원하되 GPU fence가 끝날 때까지 clock lease를 유지한다", async () => {
    const f = webgl(), pending = Promise.withResolvers<StudioBg3dCapturedRaster>();
    const session = owned(createStudioBg3dTiledCameraSession(new THREE.PerspectiveCamera(), () => pending.promise, undefined, f.begin()));
    const capturing = session.capture(request, window), rejection = expect(capturing).rejects.toThrow("closed before");
    expect(f.mesh.frustumCulled).toBe(true); expect(f.outline.outlineWidthFactor).toBe(.02);
    session.dispose(); tick(f.body); expect(clock(f.body)).toBe(0);
    pending.resolve(raster()); await rejection; tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
  });

  it.each(["throw", "reject"] as const)("%s한 제출은 상태와 clock을 복원하고 재실행하지 않는다", async (failure) => {
    const f = webgl(), execute = vi.fn(() => { if (failure === "throw") throw new Error("제출 실패"); return Promise.reject(new Error("복사 실패")); });
    const session = owned(createStudioBg3dTiledCameraSession(new THREE.PerspectiveCamera(), execute, undefined, f.begin()));
    await expect(session.capture(request, window)).rejects.toThrow("실패");
    expect(f.outline.outlineWidthFactor).toBe(.02); expect(f.mesh.frustumCulled).toBe(true); tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
    await expect(session.capture(request, window)).rejects.toThrow("closed"); expect(execute).toHaveBeenCalledOnce();
  });

  it("뒤쪽 Float32 overflow는 앞쪽 폭·culling도 변경하기 전에 거부한다", () => {
    const f = webgl(); f.outline.outlineWidthFactor = 1e38; const scope = f.begin(), execute = vi.fn();
    expect(() => scope.submit({ fullHeight: 64, height: 1 }, execute)).toThrow("Float32");
    expect(execute).not.toHaveBeenCalled(); expect(f.body.outlineWidthFactor).toBe(.02); expect(f.outline.outlineWidthFactor).toBe(1e38); expect(f.mesh.frustumCulled).toBe(true);
    scope.dispose(); tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
  });

  it.each(["callback", "binding", "stochastic"] as const)("begin 뒤 %s 변조는 admission/identity를 다시 검사하고 GPU 제출을 막는다", async (change) => {
    const f = webgl(), execute = vi.fn(async () => raster()), session = owned(createStudioBg3dTiledCameraSession(new THREE.PerspectiveCamera(), execute, undefined, f.begin()));
    const compile = f.body.onBeforeCompile;
    if (change === "callback") f.body.onBeforeCompile = () => undefined;
    else if (change === "binding") f.mesh.material = [f.outline, f.body];
    else f.body.alphaHash = true;
    await expect(session.capture(request, window)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled(); expect(f.outline.outlineWidthFactor).toBe(.02); expect(f.mesh.frustumCulled).toBe(true);
    f.body.onBeforeCompile = compile; f.body.alphaHash = false; tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
  });

  it("검증된 양 backend만 admission하고 raw SDK·custom shader·wrong backend는 거부한다", () => {
    const gl = fixture(), gpu = fixture("webgpu");
    expect(() => assertStudioBg3dTiledSceneAdmission(gl.scene, "webgl")).not.toThrow();
    expect(() => assertStudioBg3dTiledSceneAdmission(gpu.scene, "webgpu")).not.toThrow();
    expect(() => assertStudioBg3dTiledSceneAdmission(gpu.scene, "webgl")).toThrow("backend");
    const raw = owned(new MToonMaterial()); gl.mesh.material = [raw];
    expect(() => gl.begin()).toThrow("런타임");
    const shader = owned(new THREE.ShaderMaterial()); gl.mesh.material = [shader];
    expect(() => gl.begin()).toThrow("viewport-dependent");
  });

  it("camera 검증 실패와 잘못된 tile 요청도 이미 취득한 clock lease를 정리한다", async () => {
    const f = webgl(); expect(() => createStudioBg3dTiledCameraSession(new THREE.Camera(), async () => raster(), undefined, f.begin())).toThrow("perspective");
    tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
    const session = owned(createStudioBg3dTiledCameraSession(new THREE.PerspectiveCamera(), async () => raster(), undefined, f.begin()));
    await expect(session.capture({ ...request, height: 31 }, window)).rejects.toThrow("declared window");
    tick(f.body); expect(clock(f.body)).toBeCloseTo(.2);
  });

  it("제외 subtree의 raw SDK·다른 backend·형제 재질은 수집/동결하지 않고 visibility를 원복한다", () => {
    const f = webgl(), helper = new THREE.Group(), raw = owned(new MToonMaterial()), gpu = owned(new StudioMToonNodeMaterial());
    const excluded = owned(new StudioMToonMaterial()); excluded.uvAnimationScrollXSpeedFactor = .4;
    helper.add(new THREE.Mesh(f.geometry, [raw, gpu, excluded])); f.scene.add(helper); registerStudioBg3dCaptureExcludedObject(helper);
    const scope = f.begin(); expect(helper.visible).toBe(true);
    scope.submit(window, () => { expect(helper.visible).toBe(true); tick(excluded); tick(f.body); });
    expect(helper.visible).toBe(true); expect(clock(excluded)).toBeCloseTo(.1); expect(clock(f.body)).toBe(0);
    expect(gpu.outlineWidthFactor).toBe(0); expect(raw.isMToonMaterial).toBe(true);
    const compile = f.body.onBeforeCompile; f.body.onBeforeCompile = () => undefined;
    expect(() => beginStudioMToonRasterScope(f.scene, "webgl", { prepareScene: () => hideStudioBg3dCaptureExcludedObjects(f.scene) })).toThrow("런타임");
    expect(helper.visible).toBe(true); f.body.onBeforeCompile = compile;
    helper.visible = false; scope.submit(window, () => undefined); expect(helper.visible).toBe(false);
  });

  it("실제 tile client·CPU PNG processor의 init/ack/finish 전체를 통과할 때까지 clock을 고정한다", async () => {
    const f = webgl(), phases: string[] = []; let processor: StudioBg3dTiledArtifactProcessor | undefined;
    // Worker transport만 대체한다. 실제 프로토콜·processor·PNG는 호출하며 GPU 색 픽셀은 fixture다.
    const worker: StudioBg3dTiledWorkerLike = {
      onmessage: null, onerror: null, onmessageerror: null, terminate: vi.fn(() => { void processor?.abort(); }),
      postMessage(message: StudioBg3dTiledRequest) {
        const send = (data: unknown) => worker.onmessage?.(new MessageEvent("message", { data }));
        void Promise.resolve().then(async () => {
          phases.push(message.kind); tick(f.body); expect(clock(f.body)).toBe(0); expect(f.outline.outlineWidthFactor).toBe(.02); expect(f.mesh.frustumCulled).toBe(true);
          if (message.kind === "init") {
            processor = new StudioBg3dTiledArtifactProcessor(message.options); send({ version: 1, id: message.id, kind: "ready" });
          } else {
            if (!processor) throw new Error("CPU processor가 없습니다.");
            if (message.kind === "tile") {
              await processor.append(message.index, message.raster); send({ version: 1, id: message.id, kind: "ack", index: message.index });
            } else send({ version: 1, id: message.id, kind: "result", result: await processor.finish() });
          }
        }).catch(() => send({ version: 1, id: message.id, kind: "error", message: "CPU processor 검증 실패" }));
      },
    };
    const capture = async (input: StudioBg3dCaptureRequest): Promise<StudioBg3dCapturedRaster> => {
      expect(f.mesh.frustumCulled).toBe(false);
      return { width: input.width, height: input.height, rgba: new Uint8Array(input.width * input.height * 4).fill(255) };
    };
    const adapter: StudioBg3dCaptureAdapter = {
      backend: "three-webgl", engineId: "three", engineVersion: "184", implementationRevision: "mtoon-cpu-scope-test", graphicsApi: "webgl2",
      profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1, getSourceSize: () => ({ width: 32, height: 32 }), capture,
      createTiledCapture: () => createStudioBg3dTiledCameraSession(new THREE.PerspectiveCamera(), capture, undefined, f.begin()),
    };
    const result = await buildStudioBg3dTiledImages({ adapter, includeDepth: false, includeNormals: false, background: request.background, workerFactory: () => worker,
      options: { width: 32, height: 32, tileWidth: 16, bandHeight: 16, passes: ["beauty"],
        settings: { line: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.line, tone: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output.tone } } });
    expect(result.images[0]?.png.type).toBe("image/png"); expect(phases).toEqual(["init", "tile", "tile", "tile", "tile", "finish"]);
    expect(worker.terminate).toHaveBeenCalledOnce(); tick(f.body); expect(clock(f.body)).toBeCloseTo(.1);
  });

  it.each([
    { backend: "webgl", finish: "resolve" }, { backend: "webgpu", finish: "resolve" },
    { backend: "webgl", finish: "reject" }, { backend: "webgpu", finish: "reject" },
    { backend: "webgl", finish: "dispose" }, { backend: "webgpu", finish: "dispose" },
  ] as const)("실제 $backend 공개 single capture의 $finish는 제출 상태와 readback clock 수명을 지킨다", async ({ backend, finish }) => {
    const f = fixture(backend), pending = Promise.withResolvers<THREE.TypedArray>(), draws: boolean[] = [];
    f.body.uvAnimationScrollXSpeedFactor = .4;
    const phase = () => f.body instanceof StudioMToonMaterial ? f.body.uniforms.uvAnimationScrollXOffset?.value : f.body.uvAnimationScrollXOffset;
    const tickMaterial = () => updateStudioMToonInstanceMaterials([f.body], .25);
    // 기존 single PNG에서 허용하던 PBR transmission·point·sprite는 tile admission으로 차단하지 않는다.
    const physical = owned(new THREE.MeshPhysicalMaterial({ transmission: .5 })), points = owned(new THREE.PointsMaterial()), sprite = owned(new THREE.SpriteMaterial());
    const legacy = owned(new MToonMaterial());
    f.scene.add(new THREE.Mesh(f.geometry, physical), new THREE.Points(f.geometry, points), new THREE.Sprite(sprite), new THREE.Mesh(f.geometry, legacy));
    let target: THREE.RenderTarget | null = null;
    const recorder = {
      isWebGLRenderer: backend === "webgl", isWebGPURenderer: backend === "webgpu", domElement: { width: 2, height: 2 },
      autoClear: true, xr: { enabled: false }, toneMapping: THREE.NeutralToneMapping, toneMappingExposure: 1, outputColorSpace: THREE.SRGBColorSpace,
      extensions: { has: () => false }, getRenderTarget: () => target, setRenderTarget: (value: THREE.RenderTarget | null) => { target = value; },
      getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, getMRT: () => null, setMRT: () => undefined,
      getClearColor: (value: THREE.Color) => value.set(0), getClearAlpha: () => 0, setClearColor: () => undefined,
      getViewport: (value: THREE.Vector4) => value.set(0, 0, 2, 2), getScissor: (value: THREE.Vector4) => value.set(0, 0, 2, 2),
      getScissorTest: () => false, setViewport: () => undefined, setScissor: () => undefined, setScissorTest: () => undefined, clear: () => undefined,
      render: (scene: THREE.Object3D) => { if (scene === f.scene) { draws.push(f.mesh.frustumCulled); expect(f.outline.outlineWidthFactor).toBe(.02); } },
      readRenderTargetPixelsAsync: (...args: readonly unknown[]) => {
        if (args[5] instanceof Uint8Array) args[5].fill(255);
        return pending.promise;
      },
    };
    const camera = new THREE.PerspectiveCamera(), adapter = backend === "webgl"
      ? createStudioBg3dThreeWebglCaptureAdapter({ renderer: recorder as unknown as THREE.WebGLRenderer, scene: f.scene, camera })
      : createStudioBg3dThreeWebGpuCaptureAdapter({ renderer: recorder as unknown as WebGPURenderer, scene: f.scene, camera });
    releases.push(() => adapter.dispose?.());
    expect(adapter.implementationRevision).toBe(backend === "webgl"
      ? "studio-three-webgl-capture-adapter-v6-ldr-six-pass"
      : "studio-three-webgpu-capture-adapter-v5-mtoon-scope-hdr-mrt-normals");
    const capturing = adapter.capture({ ...request, width: 2, height: 2 });
    const verification = finish === "reject" || (finish === "dispose" && backend === "webgpu")
      ? expect(capturing).rejects.toThrow() : expect(capturing).resolves.toMatchObject({ width: 2, height: 2 });
    expect(draws).toEqual([false]); expect(f.mesh.frustumCulled).toBe(true); expect(target).toBeNull(); tickMaterial(); expect(phase()).toBe(0);
    if (finish === "dispose") { adapter.dispose?.(); tickMaterial(); expect(phase()).toBe(0); }
    if (finish === "reject") pending.reject(new Error("복사 실패")); else pending.resolve(new Uint8Array(16).fill(255));
    await verification;
    tickMaterial(); expect(phase()).toBeCloseTo(.1);
    if (finish !== "dispose") {
      const compile = f.body.onBeforeCompile; f.body.onBeforeCompile = () => undefined;
      await expect(adapter.capture({ ...request, width: 2, height: 2 })).rejects.toThrow("런타임");
      expect(draws).toEqual([false]); f.body.onBeforeCompile = compile; tickMaterial(); expect(phase()).toBeCloseTo(.2);
    }
  });
});
