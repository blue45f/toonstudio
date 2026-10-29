import * as THREE from "three";

import type { VirtualThreeRendererCapacityProfile } from "./virtual-three-capacity-profiles";

export interface VirtualThreeSourceInput {
  /** SHA가 아닌 실제 활성 lease/epoch ID다. 같은 파일의 동시 복사본도 별도 ID를 쓴다. */
  readonly id: string;
  readonly blobBytes: number;
  readonly bufferCopyBytes: number;
  readonly decodedGeometryBytes: number;
  readonly decodedImageBytes: number;
  readonly pendingDecode?: boolean;
}
export interface VirtualThreeRendererCapacityPolicy {
  readonly maxAccountedBytes: number;
  readonly jsWasmAndDriverReservationBytes: number;
}
/** 기기 실측이 아닌 초기 admission 설계값이다. 성능·실제 VRAM/RAM 보증이나 품질 하향 기준이 아니다. */
export const VIRTUAL_THREE_RENDERER_CAPACITY_POLICY: VirtualThreeRendererCapacityPolicy = Object.freeze({
  maxAccountedBytes: 512 * 1024 * 1024,
  jsWasmAndDriverReservationBytes: 128 * 1024 * 1024,
});
export interface VirtualThreeFramebufferInventoryInput {
  readonly width: number;
  readonly height: number;
  readonly samples: number;
  readonly depth: boolean;
  readonly stencil?: boolean;
  readonly contextAvailable: boolean;
}
export interface VirtualThreeSceneInventoryInput {
  readonly camera: THREE.Camera;
  readonly activeScene: THREE.Object3D;
  readonly stagedScene?: THREE.Object3D;
  readonly sourceInputs: readonly VirtualThreeSourceInput[];
  readonly framebuffer: VirtualThreeFramebufferInventoryInput;
  readonly shadowsEnabled: boolean;
  readonly shadowMapType?: THREE.ShadowMapType;
  readonly maxTextureSize?: number;
  /** renderer 밖에서 유지하는 environment/postprocess target은 호출자가 함께 제공한다. */
  readonly renderTargets?: readonly THREE.RenderTarget[];
  readonly policy?: VirtualThreeRendererCapacityPolicy;
  readonly capacityProfile?: VirtualThreeRendererCapacityProfile;
}
export interface VirtualThreeRendererInventory {
  readonly schema: "toonstudio.virtual-three-renderer-inventory.v1";
  readonly cameraId: string;
  readonly deviceVramMeasured: false;
  readonly physicalRamMeasured: false;
  readonly calibrated: false;
  readonly measured: {
    readonly geometryAttributeBytes: number;
    readonly instanceAttributeBytes: number;
    readonly uniqueCpuArrayBufferBytes: number;
    readonly boneMatrixBytes: number;
    readonly geometries: number;
    readonly textures: number;
    readonly renderTargets: number;
  };
  readonly callerReported: { readonly knownSourceCpuPeakBytes: number; readonly sourceLeases: number };
  readonly conservative: {
    readonly knownGpuGeometryUploadBytes: number;
    readonly knownGpuTextureBytes: number;
    readonly knownDecodedImageCpuBytes: number;
    readonly knownTargetAttachmentExtraBytes: number;
    readonly knownAnticipatedShadowBytes: number;
    readonly knownFramebufferBytes: number;
    readonly knownAnticipatedBoneAndMorphBytes: number;
    readonly knownMorphTextureCpuBytes: number;
    readonly knownPendingDecodeGpuBytes: number;
    readonly knownSubtotalBytes: number;
    readonly completeUpperBoundBytes: number | null;
  };
  readonly policyReservation: {
    readonly jsWasmAndDriverBytes: number;
    readonly maxAccountedBytes: number;
    readonly capacityProfileId: string | null;
    readonly capacityProfileValidation: "candidate" | null;
  };
  readonly unknowns: readonly { readonly resource: string; readonly reason: string }[];
  readonly knownAccountedSubtotalBytes: number;
  readonly accountedTotalBytes: number | null;
  readonly assumptions: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function validBytes(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function dimension(value: unknown): value is number { return validBytes(value) && value > 0; }
const page = (bytes: number) => Math.ceil(bytes / 4096) * 4096;
function bytesPerPixel(texture: THREE.Texture): number | null {
  if (texture instanceof THREE.CompressedTexture) return 16;
  if (texture.internalFormat !== null) {
    const packed: Readonly<Partial<Record<string, number>>> = {
      RGBA4: 2, RGB565: 2, RGB5_A1: 2, RGB10_A2: 4, RGB10_A2UI: 4,
      R11F_G11F_B10F: 4, RGB9_E5: 4, SRGB8: 4, SRGB8_ALPHA8: 4,
      DEPTH_COMPONENT16: 4, DEPTH_COMPONENT24: 4, DEPTH_COMPONENT32F: 4,
      DEPTH24_STENCIL8: 4, DEPTH32F_STENCIL8: 8,
    };
    const name = texture.internalFormat;
    if (Object.hasOwn(packed, name)) return packed[name] ?? null;
    const match = /^(RGBA|RGB|RG|R)(8|16|32)(F|I|UI|_SNORM)?$/u.exec(name);
    if (!match) return null;
    return (match[1] === "R" ? 1 : match[1] === "RG" ? 2 : 4) * Number(match[2]) / 8;
  }
  if (texture.format === THREE.DepthStencilFormat) return texture.type === THREE.FloatType ? 8
    : texture.type === THREE.UnsignedInt248Type || texture.type === THREE.UnsignedIntType ? 4 : null;
  if ([THREE.UnsignedShort4444Type, THREE.UnsignedShort5551Type].some((type) => type === texture.type)) return 2;
  if ([THREE.UnsignedInt248Type, THREE.UnsignedInt5999Type, THREE.UnsignedInt101111Type].some((type) => type === texture.type)) return 4;
  let component: number;
  switch (texture.type) {
    case THREE.UnsignedByteType: case THREE.ByteType: component = 1; break;
    case THREE.ShortType: case THREE.UnsignedShortType: case THREE.HalfFloatType: component = 2; break;
    case THREE.IntType: case THREE.UnsignedIntType: case THREE.FloatType: component = 4; break;
    default: return null;
  }
  switch (texture.format) {
    case THREE.AlphaFormat: case THREE.RedFormat: case THREE.RedIntegerFormat: return component;
    case THREE.RGFormat: case THREE.RGIntegerFormat: return 2 * component;
    case THREE.RGBFormat: case THREE.RGBIntegerFormat: case THREE.RGBAFormat: case THREE.RGBAIntegerFormat: return 4 * component;
    case THREE.DepthFormat: return Math.max(4, component);
    default: return null;
  }
}
function imageSize(image: unknown): { width: number; height: number; depth: number } | null {
  if (!isRecord(image)) return null;
  if (Array.isArray(image.mipmaps) && image.mipmaps.length > 0 && image.width === undefined) return imageSize(image.mipmaps[0]);
  const width = "naturalWidth" in image ? image.naturalWidth : "videoWidth" in image ? image.videoWidth : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight : "videoHeight" in image ? image.videoHeight : image.height;
  const depth = image.depth === undefined ? 1 : image.depth;
  return dimension(width) && dimension(height) && dimension(depth) ? { width, height, depth } : null;
}

/** 설치 Three의 WebGLTextures.getTextureCacheKey 14필드다. UV transform은 GPU 저장소를 나누지 않는다. */
function textureStorageKey(texture: THREE.Texture): string {
  const wrapR = "wrapR" in texture ? texture.wrapR : 0;
  const domain = "isCubeDepthTexture" in texture && texture.isCubeDepthTexture === true ? "cube-depth"
    : "isCubeTexture" in texture && texture.isCubeTexture === true ? "cube"
    : "isData3DTexture" in texture && texture.isData3DTexture === true ? "3d"
    : ("isDataArrayTexture" in texture && texture.isDataArrayTexture === true)
      || ("isCompressedArrayTexture" in texture && texture.isCompressedArrayTexture === true) ? "2d-array" : "2d";
  return `${domain}:${[texture.wrapS, texture.wrapT, wrapR || 0, texture.magFilter, texture.minFilter,
    texture.anisotropy, texture.internalFormat, texture.format, texture.type, texture.generateMipmaps,
    texture.premultiplyAlpha, texture.flipY, texture.unpackAlignment, texture.colorSpace].join()}`;
}

/** scene·staging의 invisible 노드도 포함한다. dispose·업로드·GL 상태 변경은 하지 않는다. */
export function collectVirtualThreeSceneInventory(input: VirtualThreeSceneInventoryInput): VirtualThreeRendererInventory {
  const policy = input.capacityProfile?.policy ?? input.policy ?? VIRTUAL_THREE_RENDERER_CAPACITY_POLICY;
  const unknowns: { resource: string; reason: string }[] = [];
  const unknown = (resource: string, reason: string) => { unknowns.push({ resource, reason }); };
  if (input.capacityProfile !== undefined && input.policy !== undefined) unknown("capacity-policy", "capacity profile과 개별 policy를 중복 전달할 수 없습니다.");
  const cpuBuffers = new Set<ArrayBufferLike>();
  const measuredAttributes = new Set<object>();
  const gpuAttributes = new Set<object>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const gpuTextureStorage = new WeakMap<object, Map<string, number>>();
  const decodedImages = new Set<object>();
  const targets = new Set<THREE.RenderTarget>();
  const objects = new Set<THREE.Object3D>();
  const skeletons = new Set<THREE.Skeleton>();
  let cpuBytes = 0, geometryBytes = 0, instanceBytes = 0, boneBytes = 0, gpuGeometry = 0;
  let gpuTextures = 0, decodedCpu = 0, targetExtra = 0, shadows = 0, boneAndMorph = 0, morphCpu = 0, pendingGpu = 0, sourceCpu = 0;
  const safe = (resource: string, value: number): number => {
    if (!validBytes(value)) { unknown(resource, "안전한 바이트 상한을 계산할 수 없습니다."); return 0; }
    return value;
  };
  const addCpu = (value: unknown) => {
    if (!ArrayBuffer.isView(value)) return;
    if (!cpuBuffers.has(value.buffer)) { cpuBuffers.add(value.buffer); cpuBytes += value.buffer.byteLength; }
  };
  const attribute = (value: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | THREE.GLBufferAttribute, kind: "geometry" | "instance", gpuUpload = true) => {
    const storage = value instanceof THREE.InterleavedBufferAttribute ? value.data : value;
    if (!(storage instanceof THREE.BufferAttribute) && !(storage instanceof THREE.InterleavedBuffer)) {
      unknown("external-geometry-buffer", "외부 GLBufferAttribute의 byteLength를 관측할 수 없습니다."); return;
    }
    addCpu(storage.array);
    if (!measuredAttributes.has(storage)) {
      measuredAttributes.add(storage);
      if (kind === "instance") instanceBytes += storage.array.byteLength;
      else geometryBytes += storage.array.byteLength;
    }
    if (gpuUpload && !gpuAttributes.has(storage)) {
      gpuAttributes.add(storage);
      gpuGeometry += page(storage.array.byteLength);
    }
  };
  const countImageData = (image: unknown) => {
    if (!isRecord(image)) return;
    addCpu(image.data);
    if (Array.isArray(image.mipmaps)) for (const mip of image.mipmaps) if (isRecord(mip)) addCpu(mip.data);
  };
  const countGpuTexture = (value: THREE.Texture, bytes: number) => {
    // RenderTarget는 Three의 source cache를 거치지 않고 attachment별로 직접 할당한다.
    if (value.isRenderTargetTexture || ("isExternalTexture" in value && value.isExternalTexture === true)) {
      gpuTextures += bytes;
      return;
    }
    let storage = gpuTextureStorage.get(value.source);
    if (!storage) { storage = new Map(); gpuTextureStorage.set(value.source, storage); }
    const key = textureStorageKey(value), previous = storage.get(key) ?? 0;
    // 공유 Texture의 CPU/mipmap은 모두 조사하되 GPU 저장소는 관측한 가장 큰 상한 한 번만 센다.
    if (bytes > previous) { storage.set(key, bytes); gpuTextures += bytes - previous; }
  };
  const texture = (value: THREE.Texture, resource = value.uuid) => {
    if (textures.has(value)) return;
    textures.add(value);
    const rawImage: unknown = value.image;
    for (const mip of value.mipmaps) countImageData(mip);
    const images: readonly unknown[] = Array.isArray(rawImage) ? rawImage : [rawImage];
    if (images.length === 0) { unknown(resource, "texture 이미지가 없습니다."); return; }
    const pixelBytes = bytesPerPixel(value);
    if (pixelBytes === null) { unknown(resource, "texture format/type의 할당 상한을 알 수 없습니다."); return; }
    let gpuBytes = 0;
    for (const image of images) {
      const size = imageSize(image);
      if (!size) { unknown(resource, "실제 decoded texture 치수를 알 수 없습니다."); continue; }
      countImageData(image);
      let width = size.width, height = size.height, depth = size.depth, bytes = 0;
      const mips = value.generateMipmaps || value.mipmaps.length > 1 || (isRecord(image) && Array.isArray(image.mipmaps) && image.mipmaps.length > 1);
      let moreMipLevels: boolean;
      do {
        bytes += safe(resource, width * height * depth * pixelBytes);
        moreMipLevels = mips && (width > 1 || height > 1 || (value instanceof THREE.Data3DTexture && depth > 1));
        if (moreMipLevels) {
          width = Math.max(1, Math.floor(width / 2)); height = Math.max(1, Math.floor(height / 2));
          if (value instanceof THREE.Data3DTexture) depth = Math.max(1, Math.floor(depth / 2));
        }
      } while (moreMipLevels);
      gpuBytes += safe(resource, page(bytes));
      if (!value.isRenderTargetTexture && isRecord(image) && !decodedImages.has(image)) {
        decodedImages.add(image);
        if (!ArrayBuffer.isView(image.data) && !(value instanceof THREE.CompressedTexture)) decodedCpu += safe(resource, size.width * size.height * size.depth * 4);
      }
    }
    countGpuTexture(value, gpuBytes);
  };
  const target = (value: THREE.RenderTarget) => {
    if (targets.has(value)) return;
    targets.add(value);
    if (!dimension(value.width) || !dimension(value.height) || !dimension(value.depth) || !validBytes(value.samples)) {
      unknown("render-target", "target 치수·depth·sample 수가 유효하지 않습니다."); return;
    }
    let colorBytes = 0;
    for (const color of value.textures) {
      texture(color, "render-target-color");
      const perPixel = bytesPerPixel(color);
      if (perPixel === null) unknown("render-target-color", "MSAA color attachment 형식을 알 수 없습니다.");
      else colorBytes += perPixel;
    }
    if (value.depthTexture) texture(value.depthTexture, "render-target-depth");
    const pixels = value.width * value.height * value.depth;
    const sampleBuffers = value.samples > 0 ? colorBytes * value.samples : 0;
    const depthBuffers = value.depthBuffer && (value.samples > 0 || !value.depthTexture) ? 4 * Math.max(1, value.samples) : 0;
    targetExtra += safe("render-target-attachments", page(pixels * (sampleBuffers + depthBuffers)));
  };
  const uniformObjects = new Set<object>();
  const uniform = (value: unknown): void => {
    if (value instanceof THREE.Texture) { texture(value); return; }
    if (!isRecord(value) || ArrayBuffer.isView(value) || uniformObjects.has(value)) return;
    if (uniformObjects.size >= 4096) { unknown("shader-uniforms", "uniform 자원 그래프의 상한을 넘었습니다."); return; }
    uniformObjects.add(value);
    if (Array.isArray(value)) for (const child of value) uniform(child);
    else for (const child of Object.values(value)) uniform(child);
  };
  const material = (value: THREE.Material) => {
    for (const item of Object.values(value)) if (item instanceof THREE.Texture) texture(item);
    if (value instanceof THREE.ShaderMaterial) for (const item of Object.values(value.uniforms)) uniform(item.value);
  };
  const geometry = (value: THREE.BufferGeometry) => {
    if (geometries.has(value)) return;
    geometries.add(value);
    for (const item of Object.values(value.attributes)) attribute(item, "geometry");
    if (value.index) attribute(value.index, "geometry");
    // WebGLGeometries는 일반 attributes만 VBO로 올린다. morph 원본 배열은 CPU에 보존한다.
    for (const items of Object.values(value.morphAttributes)) for (const item of items) attribute(item, "geometry", false);
    const morphAttribute = value.morphAttributes.position || value.morphAttributes.normal || value.morphAttributes.color;
    const morphs = morphAttribute?.length ?? 0;
    if (morphs > 0) {
      if (!dimension(input.maxTextureSize)) unknown(value.uuid, "morph texture 상한에 필요한 maxTextureSize가 없습니다.");
      else {
        const vertices = value.attributes.position?.count;
        if (!dimension(vertices)) unknown(value.uuid, "morph 정점 수를 알 수 없습니다.");
        else {
          // WebGLMorphtargets의 고정 RGBA 슬롯: position=0, normal=1, color=2다.
          const streams = value.morphAttributes.color !== undefined ? 3 : value.morphAttributes.normal !== undefined ? 2 : 1;
          const texels = vertices * streams;
          const width = Math.min(input.maxTextureSize, texels), height = Math.ceil(texels / width);
          const bytes = safe("morph-texture", width * height * morphs * 16);
          boneAndMorph += page(bytes);
          // Three가 별도로 만드는 Float32Array와 GPU DataArrayTexture는 함께 살아 있다.
          morphCpu += bytes;
        }
      }
    }
  };
  const visit = (node: THREE.Object3D) => {
    if (objects.has(node)) return;
    objects.add(node);
    if (node instanceof THREE.Scene) {
      if (node.background instanceof THREE.Texture) texture(node.background, "scene-background");
      if (node.environment) texture(node.environment, "scene-environment");
      if (node.overrideMaterial) material(node.overrideMaterial);
    }
    if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
      geometry(node.geometry);
      for (const item of Array.isArray(node.material) ? node.material : [node.material]) material(item);
    } else if (node instanceof THREE.Sprite) material(node.material);
    if (node instanceof THREE.InstancedMesh) {
      attribute(node.instanceMatrix, "instance");
      if (node.instanceColor) attribute(node.instanceColor, "instance");
      if (node.morphTexture) texture(node.morphTexture, "instance-morph-texture");
    }
    if (node instanceof THREE.SkinnedMesh && !skeletons.has(node.skeleton)) {
      const skeleton = node.skeleton; skeletons.add(skeleton);
      const boneMatrices = skeleton.boneMatrices;
      if (boneMatrices === null) unknown(skeleton.uuid, "실제 bone matrix buffer를 확인할 수 없습니다.");
      else { addCpu(boneMatrices); boneBytes += boneMatrices.byteLength; }
      if (skeleton.boneTexture) texture(skeleton.boneTexture, "bone-texture");
      else if (boneMatrices !== null && skeleton.bones.length > 0) {
        const size = Math.max(4, Math.ceil(Math.sqrt(skeleton.bones.length * 4) / 4) * 4);
        const bytes = size * size * 16;
        boneAndMorph += safe("anticipated-bone-texture", page(bytes) + Math.max(0, bytes - boneMatrices.byteLength));
      }
    }
    if (input.shadowsEnabled && node.castShadow && (node instanceof THREE.DirectionalLight || node instanceof THREE.SpotLight || node instanceof THREE.PointLight)) {
      const shadow = node.shadow;
      if (shadow.map) target(shadow.map);
      if (shadow.mapPass) target(shadow.mapPass);
      if (!shadow.map) {
        const extents = shadow.getFrameExtents();
        const width = shadow.mapSize.x * extents.x, height = shadow.mapSize.y * extents.y;
        if (!dimension(width) || !dimension(height)) unknown(node.uuid, "shadow map 치수를 알 수 없습니다.");
        else shadows += safe("anticipated-shadow-target", page(width * height * (input.shadowMapType === THREE.VSMShadowMap ? 20 : 8)));
      } else if (input.shadowMapType === THREE.VSMShadowMap && !shadow.mapPass) {
        shadows += safe("anticipated-shadow-pass", page(shadow.map.width * shadow.map.height * 12));
      }
    }
  };
  input.activeScene.traverse(visit);
  input.stagedScene?.traverse(visit);
  for (const value of input.renderTargets ?? []) target(value);
  const sourceIds = new Set<string>();
  for (const source of input.sourceInputs) {
    if (!source.id || sourceIds.has(source.id)) { unknown("source-lease", "동시 source lease ID는 중복 없이 구분해야 합니다."); continue; }
    sourceIds.add(source.id);
    const values = [source.blobBytes, source.bufferCopyBytes, source.decodedGeometryBytes, source.decodedImageBytes];
    if (!values.every(validBytes)) { unknown(source.id, "source/decode/copy byte 수가 유효하지 않습니다."); continue; }
    sourceCpu += safe(source.id, values.reduce((sum, value) => sum + value, 0));
    // 종횡비를 모르는 decode 전에는 가늘고 긴 1D 유사 이미지의 mip chain(최대 2배)도 포함한다.
    if (source.pendingDecode) pendingGpu += safe(source.id, page(source.decodedGeometryBytes) + page(source.decodedImageBytes * 2));
  }
  const fb = input.framebuffer;
  let framebufferBytes = 0;
  if (!fb.contextAvailable || !dimension(fb.width) || !dimension(fb.height) || !validBytes(fb.samples)) unknown("default-framebuffer", "renderer context·실제 drawing buffer 치수·sample 수를 알 수 없습니다.");
  else {
    // 표시/합성용 단일 sample color 3개 예약에 MSAA 배율을 다시 곱하지 않는다.
    // antialias가 없으면 color 3개+depth, 있으면 별도의 color/depth MSAA attachment를 센다.
    const depthBytes = fb.depth || fb.stencil ? 4 : 0;
    const attachments = 4 * 3 + (fb.samples > 1 ? (4 + depthBytes) * fb.samples : depthBytes);
    framebufferBytes = safe("default-framebuffer", page(fb.width * fb.height * attachments));
  }
  if (!dimension(policy.maxAccountedBytes) || !validBytes(policy.jsWasmAndDriverReservationBytes)) unknown("capacity-policy", "명시 정책 예산이 유효하지 않습니다.");
  const knownConservative = gpuGeometry + gpuTextures + decodedCpu + targetExtra + shadows + framebufferBytes + boneAndMorph + morphCpu + pendingGpu;
  const knownAccounted = cpuBytes + sourceCpu + knownConservative + policy.jsWasmAndDriverReservationBytes;
  if (!validBytes(knownAccounted)) unknown("accounted-total", "합계가 안전한 정수 범위를 넘었습니다.");
  return {
    schema: "toonstudio.virtual-three-renderer-inventory.v1", cameraId: input.camera.uuid,
    deviceVramMeasured: false, physicalRamMeasured: false, calibrated: false,
    measured: { geometryAttributeBytes: geometryBytes, instanceAttributeBytes: instanceBytes, uniqueCpuArrayBufferBytes: cpuBytes, boneMatrixBytes: boneBytes, geometries: geometries.size, textures: textures.size, renderTargets: targets.size },
    callerReported: { knownSourceCpuPeakBytes: sourceCpu, sourceLeases: sourceIds.size },
    conservative: { knownGpuGeometryUploadBytes: gpuGeometry, knownGpuTextureBytes: gpuTextures, knownDecodedImageCpuBytes: decodedCpu, knownTargetAttachmentExtraBytes: targetExtra, knownAnticipatedShadowBytes: shadows, knownFramebufferBytes: framebufferBytes, knownAnticipatedBoneAndMorphBytes: boneAndMorph, knownMorphTextureCpuBytes: morphCpu, knownPendingDecodeGpuBytes: pendingGpu, knownSubtotalBytes: knownConservative, completeUpperBoundBytes: unknowns.length ? null : knownConservative },
    policyReservation: { jsWasmAndDriverBytes: policy.jsWasmAndDriverReservationBytes, maxAccountedBytes: policy.maxAccountedBytes,
      capacityProfileId: input.policy === undefined ? input.capacityProfile?.id ?? null : null,
      capacityProfileValidation: input.policy === undefined ? input.capacityProfile?.validation ?? null : null },
    unknowns, knownAccountedSubtotalBytes: knownAccounted, accountedTotalBytes: unknowns.length ? null : knownAccounted,
    assumptions: [
      "관측한 ArrayBuffer/attribute 길이와 texture 치수는 기기 VRAM 또는 프로세스 물리 RAM 측정이 아니다.",
      "GPU texture는 실제 source 객체와 Three의 14필드 cache key 및 업로드 타입으로 공유를 센다. RenderTarget attachment는 합치지 않는다. 공유 Texture의 CPU/mipmap은 계속 조사한다.",
      "GPU 논리 할당은 공유 자원 중복 제거·4096B 정렬·RGB padding·mip/cube/depth/MSAA 및 미생성 bone/morph/shadow를 보수 계수로 센다.",
      "morph 원본 attribute는 CPU만 세고, Three의 고정 position/normal/color 슬롯으로 생성하는 별도 Float32Array CPU와 RGBA32F array texture GPU를 각각 예약한다.",
      `압축 texture는 RGBA32F 전개 상한을 예약한다. 미관측 엔진 cache/PMREM·JS/WASM·driver는 명시 ${policy.jsWasmAndDriverReservationBytes}B 정책 예약의 범위이며 기기 보장이 아니다.`,
      "source CPU peak는 호출자가 보고한 blob/copy/decode의 동시존재량을 scene CPU와 추가 합산한 보수 예약이다. lease는 SHA로 합치지 않는다.",
      "default framebuffer는 단일 sample 표시용 color 3개와 별도의 MSAA color/depth를 보수 예약한다. 표시용 color에 MSAA 배율을 중복 적용하지 않으며 실제 swapchain 수나 물리 allocation 증명이 아니다.",
      "다른 target이 bound 상태면 default framebuffer sample 수는 GL 상태 변경 없이 MAX_SAMPLES 상한으로 예약한다.",
      "상한 초과 또는 unknown이면 기존 테마를 유지한다. 화질·기능·해상도를 낮추는 fallback 근거가 아니다.",
    ],
  };
}

export class VirtualThreeRendererCapacityError extends Error {
  constructor(readonly inventory: VirtualThreeRendererInventory) {
    super(inventory.unknowns.length ? "3D 자원 크기를 확인할 수 없어 기존 테마를 유지합니다." : "3D 테마의 명시 자원 예산을 초과해 기존 테마를 유지합니다.");
    this.name = "VirtualThreeRendererCapacityError";
  }
}
export function assertVirtualThreeSceneCapacity(input: VirtualThreeSceneInventoryInput): VirtualThreeRendererInventory {
  const report = collectVirtualThreeSceneInventory(input);
  if (report.accountedTotalBytes === null || report.accountedTotalBytes > report.policyReservation.maxAccountedBytes) throw new VirtualThreeRendererCapacityError(report);
  return report;
}
export interface VirtualThreeRendererCapacityInput {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera: THREE.Camera;
  readonly activeScene: THREE.Object3D;
  readonly stagedScene?: THREE.Object3D;
  readonly sourceInputs: readonly VirtualThreeSourceInput[];
  readonly renderTargets?: readonly THREE.RenderTarget[];
  readonly policy?: VirtualThreeRendererCapacityPolicy;
  readonly capacityProfile?: VirtualThreeRendererCapacityProfile;
}
interface VirtualThreeSampleParameterContext {
  readonly SAMPLES: number;
  readonly MAX_SAMPLES?: unknown;
  getParameter(parameter: number): unknown;
}
/** WebGL1에는 없는 MAX_SAMPLES를 관측값 0이나 잘못된 GL enum으로 대체하지 않는다. */
export function readVirtualThreeFramebufferSamples(context: VirtualThreeSampleParameterContext, targetBound: boolean): unknown {
  const parameter = targetBound ? context.MAX_SAMPLES : context.SAMPLES;
  return typeof parameter === "number" ? context.getParameter(parameter) : undefined;
}
/** 실제 renderer를 읽는 adapter다. context query만 하며 resize·렌더·품질 변경을 하지 않는다. */
export function assertVirtualThreeRendererCapacity(input: VirtualThreeRendererCapacityInput): VirtualThreeRendererInventory {
  const size = input.renderer.getDrawingBufferSize(new THREE.Vector2());
  const gl = input.renderer.getContext();
  const attributes = gl.getContextAttributes();
  const current = input.renderer.getRenderTarget();
  const observedSamples = readVirtualThreeFramebufferSamples(gl, current !== null);
  const samples = attributes?.antialias === false ? 0 : validBytes(observedSamples) ? observedSamples : -1;
  return assertVirtualThreeSceneCapacity({
    ...input, framebuffer: { width: size.x, height: size.y, samples, depth: attributes?.depth ?? true, stencil: attributes?.stencil ?? false, contextAvailable: attributes !== null && !gl.isContextLost() && !input.renderer.xr.isPresenting },
    shadowsEnabled: input.renderer.shadowMap.enabled, shadowMapType: input.renderer.shadowMap.type,
    maxTextureSize: input.renderer.capabilities.maxTextureSize,
    renderTargets: [...(input.renderTargets ?? []), ...(current ? [current] : [])],
  });
}
