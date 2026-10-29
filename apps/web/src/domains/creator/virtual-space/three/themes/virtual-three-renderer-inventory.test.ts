import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { assertVirtualThreeSceneCapacity, collectVirtualThreeSceneInventory, readVirtualThreeFramebufferSamples, VirtualThreeRendererCapacityError, VIRTUAL_THREE_RENDERER_CAPACITY_POLICY, type VirtualThreeSceneInventoryInput, type VirtualThreeSourceInput } from "./virtual-three-renderer-inventory";

function input(scene = new THREE.Scene()): VirtualThreeSceneInventoryInput {
  return { camera: new THREE.PerspectiveCamera(), activeScene: scene, sourceInputs: [],
    framebuffer: { width: 320, height: 200, samples: 1, depth: true, contextAvailable: true },
    shadowsEnabled: true, shadowMapType: THREE.PCFShadowMap, maxTextureSize: 4096 };
}
const lease = (id: string): VirtualThreeSourceInput => ({ id, blobBytes: 1024, bufferCopyBytes: 2048, decodedGeometryBytes: 4096, decodedImageBytes: 8192 });

describe("3D renderer의 관측량·보수 상한·명시 정책 예약", () => {
  it("WebGL1의 없는 MAX_SAMPLES는 GL query 없이 unknown으로 남기고 default sample은 관측한다", () => {
    const requested: number[] = [];
    const context = { SAMPLES: 0x80a9, getParameter(parameter: number) { requested.push(parameter); return 4; } };
    expect(readVirtualThreeFramebufferSamples(context, true)).toBeUndefined();
    expect(requested).toEqual([]);
    expect(readVirtualThreeFramebufferSamples(context, false)).toBe(4);
    expect(requested).toEqual([context.SAMPLES]);
  });

  it("target이 bound이면 MAX_SAMPLES만 읽고 default framebuffer로 재설정하지 않는다", () => {
    const requested: number[] = [];
    const context = { SAMPLES: 0x80a9, MAX_SAMPLES: 0x8d57,
      getParameter(parameter: number) { requested.push(parameter); return parameter === this.MAX_SAMPLES ? 8 : 4; } };
    expect(readVirtualThreeFramebufferSamples(context, true)).toBe(8);
    expect(readVirtualThreeFramebufferSamples(context, false)).toBe(4);
    expect(requested).toEqual([context.MAX_SAMPLES, context.SAMPLES]);
  });

  it.each([undefined, null, "8"])("숫자가 아닌 MAX_SAMPLES capability %s를 GL enum으로 전달하지 않는다", (maxSamples) => {
    const requested: number[] = [];
    const context = { SAMPLES: 0x80a9, MAX_SAMPLES: maxSamples,
      getParameter(parameter: number) { requested.push(parameter); return 4; } };
    expect(readVirtualThreeFramebufferSamples(context, true)).toBeUndefined();
    expect(requested).toEqual([]);
  });

  it.each([false, true])("실제 null boneMatrices는 texture 존재(%s)와 무관하게 unknown으로 거부하고 초기화하지 않는다", (withTexture) => {
    const skeleton = new THREE.Skeleton([new THREE.Bone()]);
    if (withTexture) skeleton.computeBoneTexture();
    const geometry = new THREE.BufferGeometry(), material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.SkinnedMesh(geometry, material); mesh.bind(skeleton);
    const scene = new THREE.Scene(); scene.add(mesh);
    const matrices = skeleton.boneMatrices, boneTexture = skeleton.boneTexture;
    skeleton.boneMatrices = null;
    try {
      const report = collectVirtualThreeSceneInventory(input(scene));
      expect(report.unknowns).toContainEqual({ resource: skeleton.uuid, reason: "실제 bone matrix buffer를 확인할 수 없습니다." });
      expect(report.conservative.completeUpperBoundBytes).toBeNull();
      expect(report.accountedTotalBytes).toBeNull();
      expect(() => assertVirtualThreeSceneCapacity(input(scene))).toThrow(VirtualThreeRendererCapacityError);
      expect(skeleton.boneMatrices).toBeNull();
      expect(skeleton.boneTexture).toBe(boneTexture);
    } finally {
      skeleton.boneMatrices = matrices;
      skeleton.dispose(); geometry.dispose(); material.dispose();
    }
  });

  it.each([
    { samples: 0, depth: false, stencil: false, bytesPerPixel: 12 },
    { samples: 1, depth: true, stencil: false, bytesPerPixel: 16 },
    { samples: 4, depth: true, stencil: false, bytesPerPixel: 44 },
    { samples: 4, depth: false, stencil: true, bytesPerPixel: 44 },
    { samples: 4, depth: false, stencil: false, bytesPerPixel: 28 },
  ])("4K 표시용 color와 MSAA attachment를 분리한다 ($samples samples, depth=$depth, stencil=$stencil)", ({ samples, depth, stencil, bytesPerPixel }) => {
    const current = input();
    const report = collectVirtualThreeSceneInventory({ ...current,
      framebuffer: { width: 3840, height: 2160, samples, depth, stencil, contextAvailable: true } });
    expect(report.conservative.knownFramebufferBytes).toBe(Math.ceil(3840 * 2160 * bytesPerPixel / 4096) * 4096);
    expect(report.policyReservation.maxAccountedBytes).toBe(512 * 1024 * 1024);
    expect(report.unknowns).toEqual([]);
    expect(current.framebuffer.width).toBe(320);
    expect(current.framebuffer.samples).toBe(1);
  });

  it("scene과 staging의 공유 geometry/texture/ArrayBuffer는 한 번 세고 invisible 자원도 포함한다", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const texture = new THREE.DataTexture(new Uint8Array(4 * 4 * 4), 4, 4);
    texture.generateMipmaps = true;
    const material = new THREE.MeshStandardMaterial({ map: texture });
    const scene = new THREE.Scene(), staged = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const copy = new THREE.Mesh(geometry, material); copy.visible = false; staged.add(copy);
    const report = collectVirtualThreeSceneInventory({ ...input(scene), stagedScene: staged });
    expect(report.measured.geometries).toBe(1);
    expect(report.measured.textures).toBe(1);
    expect(report.measured.geometryAttributeBytes).toBe(36);
    expect(report.measured.uniqueCpuArrayBufferBytes).toBe(36 + 64);
    expect(report.conservative.knownGpuTextureBytes).toBeGreaterThanOrEqual(84);
    expect(report.accountedTotalBytes).not.toBeNull();
    expect(report.deviceVramMeasured).toBe(false);
    expect(report.physicalRamMeasured).toBe(false);
    expect(report.calibrated).toBe(false);
    expect(report.policyReservation.jsWasmAndDriverBytes).toBe(128 * 1024 * 1024);
    texture.dispose(); material.dispose(); geometry.dispose();
  });

  it("interleaved attribute는 공유 upload를 한 번 세고 instance와 bone 자원을 별도로 포함한다", () => {
    const geometry = new THREE.BufferGeometry();
    const storage = new THREE.InterleavedBuffer(new Float32Array(24), 6);
    geometry.setAttribute("position", new THREE.InterleavedBufferAttribute(storage, 3, 0));
    geometry.setAttribute("normal", new THREE.InterleavedBufferAttribute(storage, 3, 3));
    const material = new THREE.MeshStandardMaterial();
    const instance = new THREE.InstancedMesh(geometry, material, 2);
    const bones = new THREE.Skeleton([new THREE.Bone()]);
    const skinned = new THREE.SkinnedMesh(geometry, material); skinned.bind(bones);
    const scene = new THREE.Scene(); scene.add(instance, skinned);
    const report = collectVirtualThreeSceneInventory(input(scene));
    expect(report.measured.geometryAttributeBytes).toBe(96);
    expect(report.measured.instanceAttributeBytes).toBe(2 * 16 * 4);
    expect(report.measured.boneMatrixBytes).toBe(16 * 4);
    expect(report.conservative.knownAnticipatedBoneAndMorphBytes).toBeGreaterThan(0);
    expect(report.accountedTotalBytes).not.toBeNull();
    instance.dispose(); bones.dispose(); material.dispose(); geometry.dispose();
  });

  it("array texture의 layer는 mip 단계에서 축소하지 않으며 cube/environment도 포함한다", () => {
    const layered = new THREE.DataArrayTexture(new Uint8Array(4 * 4 * 3 * 4), 4, 4, 3);
    layered.generateMipmaps = true;
    const cube = new THREE.CubeTexture(Array.from({ length: 6 }, () => ({ width: 4, height: 4 })));
    cube.generateMipmaps = true;
    const material = new THREE.MeshStandardMaterial({ map: layered });
    const geometry = new THREE.BoxGeometry();
    const scene = new THREE.Scene(); scene.environment = cube; scene.add(new THREE.Mesh(geometry, material));
    const report = collectVirtualThreeSceneInventory(input(scene));
    expect(report.measured.textures).toBe(2);
    expect(report.unknowns).toEqual([]);
    expect(report.conservative.knownGpuTextureBytes).toBeGreaterThanOrEqual(4 * 3 * (16 + 4 + 1) + 6 * 4 * (16 + 4 + 1));
    layered.dispose(); cube.dispose(); material.dispose(); geometry.dispose();
  });

  it("압축 texture의 top-level mip payload도 CPU에 남는 실제 버퍼로 센다", () => {
    const payload = new Uint8Array(8);
    const texture = new THREE.CompressedTexture([{ data: payload, width: 4, height: 4 }], 4, 4, THREE.RGB_S3TC_DXT1_Format);
    const geometry = new THREE.BufferGeometry(), material = new THREE.MeshStandardMaterial({ map: texture });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    const report = collectVirtualThreeSceneInventory(input(scene));
    expect(report.measured.uniqueCpuArrayBufferBytes).toBe(8);
    expect(report.conservative.knownGpuTextureBytes).toBeGreaterThanOrEqual(4 * 4 * 16);
    expect(report.accountedTotalBytes).not.toBeNull();
    texture.dispose(); material.dispose(); geometry.dispose();
  });

  it("명시된 float internalFormat의 storage 폭을 byte texture로 축소하지 않는다", () => {
    const texture = new THREE.DataTexture(new Float32Array(64 * 64 * 4), 64, 64, THREE.RGBAFormat, THREE.FloatType);
    texture.internalFormat = "RGBA32F";
    const geometry = new THREE.BufferGeometry(), material = new THREE.MeshStandardMaterial({ map: texture });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    const report = collectVirtualThreeSceneInventory(input(scene));
    expect(report.conservative.knownGpuTextureBytes).toBeGreaterThanOrEqual(64 * 64 * 16);
    expect(report.unknowns).toEqual([]);
    texture.dispose(); material.dispose(); geometry.dispose();
  });

  it("morph의 추가 GPU texture를 포함하고 필요한 limit이 unknown이면 거부한다", () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    geometry.morphAttributes.position = [new THREE.BufferAttribute(new Float32Array(9), 3)];
    const material = new THREE.MeshStandardMaterial();
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    const report = collectVirtualThreeSceneInventory(input(scene));
    expect(report.conservative.knownAnticipatedBoneAndMorphBytes).toBeGreaterThan(0);
    expect(() => assertVirtualThreeSceneCapacity({ ...input(scene), maxTextureSize: 0 })).toThrow(VirtualThreeRendererCapacityError);
    material.dispose(); geometry.dispose();
  });

  it("render target의 color/depth/MSAA와 아직 생성되지 않은 shadow target을 포함한다", () => {
    const target = new THREE.WebGLRenderTarget(64, 32, { samples: 4, depthBuffer: true });
    const scene = new THREE.Scene();
    const light = new THREE.DirectionalLight(); light.castShadow = true; light.shadow.mapSize.set(128, 128); scene.add(light);
    const report = collectVirtualThreeSceneInventory({ ...input(scene), renderTargets: [target, target] });
    expect(report.measured.renderTargets).toBe(1);
    expect(report.conservative.knownTargetAttachmentExtraBytes).toBeGreaterThanOrEqual(64 * 32 * 4 * 8);
    expect(report.conservative.knownAnticipatedShadowBytes).toBeGreaterThan(0);
    expect(report.conservative.knownFramebufferBytes).toBeGreaterThan(0);
    expect(report.accountedTotalBytes).not.toBeNull();
    target.dispose();
  });

  it("decode 전 admission은 blob/copy/CPU peak와 아직 없는 GPU/mip까지 추가한다", () => {
    const source = lease("stage-a:sha-x");
    const parsed = collectVirtualThreeSceneInventory({ ...input(), sourceInputs: [source] });
    const pending = collectVirtualThreeSceneInventory({ ...input(), sourceInputs: [{ ...source, pendingDecode: true }] });
    expect(parsed.callerReported.knownSourceCpuPeakBytes).toBe(1024 + 2048 + 4096 + 8192);
    expect(parsed.conservative.knownPendingDecodeGpuBytes).toBe(0);
    expect(pending.conservative.knownPendingDecodeGpuBytes).toBeGreaterThanOrEqual(4096 + 8192 * 2);
    expect(pending.knownAccountedSubtotalBytes).toBeGreaterThan(parsed.knownAccountedSubtotalBytes);
  });

  it("같은 SHA라도 다른 lease 복사본은 합치지 않고 같은 lease ID 중복은 거부한다", () => {
    const one = collectVirtualThreeSceneInventory({ ...input(), sourceInputs: [lease("active:sha-x")] });
    const two = collectVirtualThreeSceneInventory({ ...input(), sourceInputs: [lease("active:sha-x"), lease("staged:sha-x")] });
    expect(two.callerReported.knownSourceCpuPeakBytes).toBe(one.callerReported.knownSourceCpuPeakBytes * 2);
    expect(() => assertVirtualThreeSceneCapacity({ ...input(), sourceInputs: [lease("same"), lease("same")] })).toThrow(VirtualThreeRendererCapacityError);
  });

  it("texture 치수나 framebuffer context를 모르면 0 성공 대신 unknown/null과 명시 오류를 반환한다", () => {
    const texture = new THREE.Texture();
    const geometry = new THREE.BoxGeometry(), material = new THREE.MeshStandardMaterial({ map: texture });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry, material));
    const report = collectVirtualThreeSceneInventory(input(scene));
    expect(report.measured.textures).toBe(1);
    expect(report.unknowns.some((entry) => entry.reason.includes("치수"))).toBe(true);
    expect(report.conservative.completeUpperBoundBytes).toBeNull();
    expect(report.accountedTotalBytes).toBeNull();
    expect(() => assertVirtualThreeSceneCapacity(input(scene))).toThrow(VirtualThreeRendererCapacityError);
    const noContext = input();
    expect(() => assertVirtualThreeSceneCapacity({ ...noContext, framebuffer: { ...noContext.framebuffer, contextAvailable: false } })).toThrow(VirtualThreeRendererCapacityError);
    texture.dispose(); geometry.dispose(); material.dispose();
  });

  it("잘못된 source byte와 정책 초과를 거부하며 장면이나 해상도를 변경하지 않는다", () => {
    const current = input();
    const before = JSON.stringify(current.activeScene.toJSON());
    expect(() => assertVirtualThreeSceneCapacity({ ...current, sourceInputs: [{ ...lease("bad"), decodedImageBytes: -1 }] })).toThrow(VirtualThreeRendererCapacityError);
    expect(() => assertVirtualThreeSceneCapacity({ ...current, policy: { ...VIRTUAL_THREE_RENDERER_CAPACITY_POLICY, maxAccountedBytes: 1 } })).toThrow(VirtualThreeRendererCapacityError);
    expect(JSON.stringify(current.activeScene.toJSON())).toBe(before);
    expect(current.framebuffer.width).toBe(320);
  });
});
