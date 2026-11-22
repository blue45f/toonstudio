/**
 * VRM 텍스처 페인트 런타임의 UV 투영 · 텍스처 샘플링 · 지오메트리 프리웜 순수 로직.
 *
 * `studio-vrm-texture-paint-runtime.ts`에서 레이히트 좌표 정규화, UV 아일랜드 분류,
 * 표면 투영 빌드, 원본 텍스처 읽기·비교 유틸리티를 분리한다.
 */
import * as THREE from "three";

import {
  getCachedStudioVrmTextureGeometryIndex,
  inspectStudioVrmTextureGeometryAdmission,
  type StudioVrmTextureGeometryIndex,
  type StudioVrmTextureGeometryLike,
} from "./studio-vrm-texture-geometry-index";
import {
  RGBA_CHANNELS,
  StudioVrmTexturePaintFault,
  canonicalizeStudioVrmSurfaceIslandId,
  failure,
  frozenGeometryBudgetGuidance,
  success,
  type StudioVrmTexturePaintRuntimeGuidance,
  type StudioVrmTexturePaintRuntimeResult,
} from "./studio-vrm-texture-paint-history-snapshot";
import { isBaseColorMaterial, type BaseColorMaterial } from "./studio-vrm-texture-paint-material-bindings";
import {
  parseStudioVrmTextureColor,
  type StudioVrmTexturePaintApplyOptions,
  type StudioVrmTexturePaintOp,
} from "./studio-vrm-texture-paint-ops";
import {
  STUDIO_VRM_TEXTURE_MAX_DIMENSION,
  isStudioVrmTextureSize,
  resolveStudioVrmTexelIndex,
  resolveStudioVrmTexelPoint,
  type StudioVrmTextureSize,
  type StudioVrmTextureWrapMode,
  type StudioVrmUvPoint,
} from "./studio-vrm-texture-uv";

import type {
  StudioVrmTextureStrokeSample,
  StudioVrmTextureStrokeStyle,
} from "./studio-vrm-texture-stroke";

export const SAMPLE_UV_EPSILON = 0.5 / STUDIO_VRM_TEXTURE_MAX_DIMENSION;
export const SAMPLE_PRESSURE_EPSILON = 1 / 1024;

export interface StudioVrmTexturePaintReadableImage {
  readonly width: number;
  readonly height: number;
  /**
   * A tightly packed, straight-alpha RGBA8 buffer. Ownership is transferred to the runtime.
   */
  readonly data: Uint8ClampedArray;
}

export type StudioVrmTexturePaintCanvasFactory = (
  width: number,
  height: number,
) => HTMLCanvasElement;

export type StudioVrmTexturePaintImageReader = (
  texture: THREE.Texture,
  signal: AbortSignal,
) => Promise<StudioVrmTexturePaintReadableImage> | StudioVrmTexturePaintReadableImage;

export interface StudioVrmTexturePaintColorSample {
  /** Byte-exact baseColor RGB channel values encoded as a portable HEX field. */
  readonly color: string;
  readonly rgba: Readonly<{
    readonly r: number;
    readonly g: number;
    readonly b: number;
    readonly a: number;
  }>;
  readonly texel: Readonly<{ readonly x: number; readonly y: number }>;
  readonly sourceTextureUuid: string;
  readonly sourceName: string;
  /** Present when the sample came from the latest editable paint buffer. */
  readonly targetId: string | null;
}

/** Ray/BVH evidence normalized by the runtime that owns the texture target. */
export interface StudioVrmTexturePaintSurfaceProjection {
  readonly u: number;
  readonly v: number;
  readonly uvWasWrapped: boolean;
  readonly sourcePressure?: number;
  readonly triangleId?: string;
  readonly islandId: string;
  readonly world?: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
  readonly texelsPerWorldUnit?: number;
}

export interface TextureSamplingSignature {
  readonly channel: number;
  readonly flipY: boolean;
  readonly format: THREE.AnyPixelFormat;
  readonly image: unknown;
  readonly matrixAutoUpdate: boolean;
  readonly matrixElements: readonly number[];
  readonly version: number;
  readonly type: THREE.TextureDataType;
  readonly wrapS: THREE.Wrapping;
  readonly wrapT: THREE.Wrapping;
}

export interface GeometryPrewarmJob {
  readonly geometry: StudioVrmTextureGeometryLike;
  readonly uvAttribute: "uv" | "uv1";
}

export interface RayHitMaterialCandidate {
  readonly object: THREE.Object3D;
  readonly face?: Readonly<{ materialIndex: number }> | null;
  readonly faceIndex?: number | null;
}

export interface ResolvedBaseColorHitLike<TTarget extends { readonly id: string } = { readonly id: string }> {
  readonly material: BaseColorMaterial;
  readonly sourceTexture: THREE.Texture;
  readonly effectiveTexture: THREE.Texture;
  readonly target: TTarget | null;
  readonly uv: StudioVrmUvPoint;
  readonly wrapU: StudioVrmTextureWrapMode;
  readonly wrapV: StudioVrmTextureWrapMode;
  readonly samplingSignature: TextureSamplingSignature | null;
}

export function defaultCanvasFactory(width: number, height: number): HTMLCanvasElement {
  if (typeof document !== "object" || typeof document.createElement !== "function") {
    throw new StudioVrmTexturePaintFault("canvas-unavailable");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function readableImageDimensions(image: unknown): StudioVrmTextureSize | null {
  if (typeof image !== "object" || image === null) return null;
  const source = image as Record<string, unknown>;
  const candidates = [
    [source.naturalWidth, source.naturalHeight],
    [source.videoWidth, source.videoHeight],
    [source.width, source.height],
  ] as const;
  for (const [width, height] of candidates) {
    const size = { width, height };
    if (isStudioVrmTextureSize(size)) return size;
  }
  return null;
}

export function textureImageDimensions(texture: THREE.Texture): StudioVrmTextureSize | null {
  try {
    return readableImageDimensions(texture.image);
  } catch {
    return null;
  }
}

export function isUsableFaceIndex(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function readTypedRgbaImage(
  texture: THREE.Texture,
  image: unknown,
): StudioVrmTexturePaintReadableImage | null {
  if (typeof image !== "object" || image === null) return null;
  const source = image as Record<string, unknown>;
  const size = { width: source.width, height: source.height };
  if (!isStudioVrmTextureSize(size)) return null;
  const data = source.data;
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
  if (texture.format !== THREE.RGBAFormat || texture.type !== THREE.UnsignedByteType) return null;
  if (data.byteLength !== size.width * size.height * RGBA_CHANNELS) return null;
  const rgba = new Uint8ClampedArray(data.byteLength);
  rgba.set(data);
  return { ...size, data: rgba };
}

export function disposeCanvas(canvas: HTMLCanvasElement): void {
  const close = (canvas as HTMLCanvasElement & { close?: () => void }).close;
  try {
    close?.call(canvas);
  } catch {
    // Width/height reset below remains the portable release path.
  }
  canvas.width = 0;
  canvas.height = 0;
}

export function createDefaultImageReader(
  createCanvas: StudioVrmTexturePaintCanvasFactory,
): StudioVrmTexturePaintImageReader {
  return (texture, signal) => {
    if (signal.aborted) throw new StudioVrmTexturePaintFault("source-read-aborted");
    let image: unknown;
    try {
      image = texture.image;
    } catch {
      throw new StudioVrmTexturePaintFault("source-unreadable");
    }
    const typed = readTypedRgbaImage(texture, image);
    if (typed) return typed;
    const size = readableImageDimensions(image);
    if (!size) throw new StudioVrmTexturePaintFault("invalid-dimensions");
    if (signal.aborted) throw new StudioVrmTexturePaintFault("source-read-aborted");

    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = createCanvas(size.width, size.height);
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new StudioVrmTexturePaintFault("canvas-unavailable");
      context.drawImage(image as CanvasImageSource, 0, 0, size.width, size.height);
      const pixels = context.getImageData(0, 0, size.width, size.height);
      if (signal.aborted) throw new StudioVrmTexturePaintFault("source-read-aborted");
      const data = new Uint8ClampedArray(pixels.data.length);
      data.set(pixels.data);
      return { ...size, data };
    } catch (error) {
      if (error instanceof StudioVrmTexturePaintFault) throw error;
      throw new StudioVrmTexturePaintFault("source-unreadable");
    } finally {
      if (canvas) disposeCanvas(canvas);
    }
  };
}

export function isCompressedTexture(texture: THREE.Texture): boolean {
  const candidate = texture as THREE.Texture & {
    readonly isCompressedTexture?: unknown;
    readonly isCompressedArrayTexture?: unknown;
    readonly isCompressedCubeTexture?: unknown;
  };
  return candidate.isCompressedTexture === true
    || candidate.isCompressedArrayTexture === true
    || candidate.isCompressedCubeTexture === true;
}

export function collectGeometryPrewarmJobs(
  scene: THREE.Object3D,
  maxTriangles: number,
): readonly GeometryPrewarmJob[] {
  const jobs: GeometryPrewarmJob[] = [];
  const seen = new WeakMap<StudioVrmTextureGeometryLike, Set<string>>();
  scene.traverse((object) => {
    const candidate = object as THREE.Object3D & {
      readonly isMesh?: unknown;
      readonly geometry?: StudioVrmTextureGeometryLike;
    };
    const geometry = candidate.isMesh === true ? candidate.geometry : undefined;
    if (!geometry || typeof geometry.getAttribute !== "function") return;
    for (const uvAttribute of ["uv", "uv1"] as const) {
      try {
        if (!geometry.getAttribute(uvAttribute)) continue;
      } catch {
        continue;
      }
      const admission = inspectStudioVrmTextureGeometryAdmission(geometry, {
        uvAttribute,
        maxTriangles,
      });
      if (!admission?.admitted) continue;
      let attributes = seen.get(geometry);
      if (!attributes) {
        attributes = new Set();
        seen.set(geometry, attributes);
      }
      if (attributes.has(uvAttribute)) continue;
      attributes.add(uvAttribute);
      jobs.push(Object.freeze({ geometry, uvAttribute }));
    }
  });
  return Object.freeze(jobs);
}

export function pixelsEqual(left: Uint8ClampedArray, right: Uint8ClampedArray): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function materialAtHit(
  mesh: THREE.Mesh,
  hit: RayHitMaterialCandidate,
): BaseColorMaterial | null {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const candidate = hit.face?.materialIndex;
  let materialIndex: number;
  if (candidate !== undefined) {
    if (!Number.isSafeInteger(candidate) || candidate < 0 || candidate >= materials.length) {
      return null;
    }
    materialIndex = candidate;
  } else {
    if (materials.length > 1) return null;
    materialIndex = 0;
  }
  const material = materials[materialIndex];
  return material && isBaseColorMaterial(material) ? material : null;
}

export function objectBelongsToScene(object: THREE.Object3D, scene: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === scene) return true;
    current = current.parent;
  }
  return false;
}

export function finiteUv(
  value: THREE.Vector2 | Readonly<{ x: number; y: number }> | undefined,
): THREE.Vector2 | null {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return new THREE.Vector2(value.x, value.y);
}

export function finiteWorld(
  value: THREE.Vector3 | Readonly<{ x: number; y: number; z: number }> | undefined,
): Readonly<{ x: number; y: number; z: number }> | undefined {
  if (
    !value
    || !Number.isFinite(value.x)
    || !Number.isFinite(value.y)
    || !Number.isFinite(value.z)
  ) {
    return undefined;
  }
  return { x: value.x, y: value.y, z: value.z };
}

export function normalizedSamplePressure(sample: StudioVrmTextureStrokeSample): number {
  const pressure = sample.pressure;
  return typeof pressure === "number" && Number.isFinite(pressure)
    ? Math.min(1, Math.max(0, pressure))
    : 0.5;
}

export function canCoalesceStrokeSample(
  previous: StudioVrmTextureStrokeSample | undefined,
  next: StudioVrmTextureStrokeSample,
): boolean {
  if (!previous || previous.islandId !== next.islandId) return false;
  if (Math.abs(previous.uv.u - next.uv.u) > SAMPLE_UV_EPSILON) return false;
  if (Math.abs(previous.uv.v - next.uv.v) > SAMPLE_UV_EPSILON) return false;
  return Math.abs(normalizedSamplePressure(previous) - normalizedSamplePressure(next))
    <= SAMPLE_PRESSURE_EPSILON;
}

export function textureWrapMode(value: THREE.Wrapping): StudioVrmTextureWrapMode {
  if (value === THREE.RepeatWrapping) return "repeat";
  if (value === THREE.MirroredRepeatWrapping) return "mirror";
  return "clamp";
}

export function paintWrapOptions(texture: THREE.Texture): StudioVrmTexturePaintApplyOptions {
  return Object.freeze({
    wrapU: textureWrapMode(texture.wrapS),
    wrapV: textureWrapMode(texture.wrapT),
  });
}

export function textureSamplingSignature(texture: THREE.Texture): TextureSamplingSignature {
  return Object.freeze({
    channel: texture.channel,
    flipY: texture.flipY,
    format: texture.format,
    image: texture.image,
    matrixAutoUpdate: texture.matrixAutoUpdate,
    matrixElements: Object.freeze([...texture.matrix.elements]),
    version: texture.version,
    type: texture.type,
    wrapS: texture.wrapS,
    wrapT: texture.wrapT,
  });
}

export function sameTextureSamplingSignature(
  left: TextureSamplingSignature,
  right: TextureSamplingSignature,
): boolean {
  if (
    left.channel !== right.channel
    || left.flipY !== right.flipY
    || left.format !== right.format
    || left.image !== right.image
    || left.matrixAutoUpdate !== right.matrixAutoUpdate
    || left.version !== right.version
    || left.type !== right.type
    || left.wrapS !== right.wrapS
    || left.wrapT !== right.wrapT
    || left.matrixElements.length !== right.matrixElements.length
  ) {
    return false;
  }
  return left.matrixElements.every((value, index) => value === right.matrixElements[index]);
}

export function sameResolvedBaseColorHit<TTarget extends { readonly id: string }>(
  left: ResolvedBaseColorHitLike<TTarget>,
  right: ResolvedBaseColorHitLike<TTarget>,
): boolean {
  return (
    left.material === right.material
    && left.sourceTexture === right.sourceTexture
    && left.effectiveTexture === right.effectiveTexture
    && left.target === right.target
    && left.uv.u === right.uv.u
    && left.uv.v === right.uv.v
    && left.wrapU === right.wrapU
    && left.wrapV === right.wrapV
    && left.samplingSignature !== null
    && right.samplingSignature !== null
    && sameTextureSamplingSignature(left.samplingSignature, right.samplingSignature)
  );
}

export function copyStrokeStyle(style: StudioVrmTextureStrokeStyle): StudioVrmTextureStrokeStyle {
  return Object.freeze({
    ...style,
    ...(style.tuning ? { tuning: Object.freeze({ ...style.tuning }) } : {}),
  });
}

export function isValidStrokeStyle(style: StudioVrmTextureStrokeStyle): boolean {
  const kinds = new Set(["airbrush", "ink", "pencil", "watercolor"]);
  const blends = new Set(["erase", "multiply", "normal", "overlay", "screen"]);
  if (!kinds.has(style.kind) || !blends.has(style.blend)) return false;
  if (!Number.isFinite(style.sizeTexels) || style.sizeTexels <= 0) return false;
  if (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1) return false;
  return style.blend === "erase" || parseStudioVrmTextureColor(style.color) !== null;
}

export function isValidSurfacePaintOperation(operation: StudioVrmTexturePaintOp): boolean {
  if (
    !Number.isFinite(operation.x)
    || !Number.isFinite(operation.y)
    || !Number.isFinite(operation.radius)
    || operation.radius <= 0
    || !Number.isFinite(operation.hardness)
    || operation.hardness < 0
    || operation.hardness > 1
    || !Number.isFinite(operation.opacity)
    || operation.opacity < 0
    || operation.opacity > 1
    || parseStudioVrmTextureColor(operation.color) === null
  ) {
    return false;
  }
  return operation.blend === "normal"
    || operation.blend === "multiply"
    || operation.blend === "screen"
    || operation.blend === "overlay"
    || operation.blend === "erase";
}

export function markMaterialChanged(material: THREE.Material): void {
  try {
    material.needsUpdate = true;
  } catch {
    // A custom material may expose a throwing setter. The map ownership change still stands.
  }
}

export function sourceTargetId(texture: THREE.Texture): string {
  return `vrm-texture:${texture.uuid}`;
}

export function byteHex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

export function sampleResolvedTextureColor<TTarget extends { readonly id: string }>(
  resolved: ResolvedBaseColorHitLike<TTarget>,
  pixels: Uint8ClampedArray,
  size: StudioVrmTextureSize,
): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintColorSample> {
  if (pixels.byteLength !== size.width * size.height * RGBA_CHANNELS) {
    return failure("invalid-dimensions");
  }
  const texel = resolveStudioVrmTexelIndex(resolved.uv, size, {
    wrapU: resolved.wrapU,
    wrapV: resolved.wrapV,
    flipV: false,
  });
  if (!texel) return failure("uv-missing");
  const offset = texel.index * RGBA_CHANNELS;
  const r = pixels[offset];
  const g = pixels[offset + 1];
  const b = pixels[offset + 2];
  const a = pixels[offset + 3];
  if (r === undefined || g === undefined || b === undefined || a === undefined) {
    return failure("invalid-dimensions");
  }
  return success(Object.freeze({
    color: `#${byteHex(r)}${byteHex(g)}${byteHex(b)}`,
    rgba: Object.freeze({ r, g, b, a }),
    texel: Object.freeze({ x: texel.x, y: texel.y }),
    sourceTextureUuid: resolved.sourceTexture.uuid,
    sourceName: resolved.sourceTexture.name,
    targetId: resolved.target?.id ?? null,
  }));
}

export function flipRgbaRowsInPlace(
  data: Uint8ClampedArray,
  size: StudioVrmTextureSize,
): void {
  const rowBytes = size.width * RGBA_CHANNELS;
  const temporary = new Uint8ClampedArray(rowBytes);
  for (let top = 0; top < Math.floor(size.height / 2); top += 1) {
    const bottom = size.height - top - 1;
    const topOffset = top * rowBytes;
    const bottomOffset = bottom * rowBytes;
    temporary.set(data.subarray(topOffset, topOffset + rowBytes));
    data.copyWithin(topOffset, bottomOffset, bottomOffset + rowBytes);
    data.set(temporary, bottomOffset);
  }
}

export interface HitIslandAndDensityResult {
  readonly islandId: string;
  readonly texelsPerWorldUnit: number | undefined;
  readonly guidance: StudioVrmTexturePaintRuntimeGuidance | null;
}

/**
 * 레이히트의 faceIndex와 사전 계산된 지오메트리 UV 아일랜드 캐시를 조회해
 * UV 아일랜드 식별자와 월드-텍셀 밀도(`texelsPerWorldUnit`)를 계산한다.
 */
export function resolveHitIslandAndDensity(input: Readonly<{
  object: THREE.Mesh;
  material: BaseColorMaterial;
  sourceTexture: THREE.Texture;
  effectiveTexture: THREE.Texture;
  targetSize: StudioVrmTextureSize | null;
  faceIndex: number | null | undefined;
  uvAttribute: "uv" | "uv1";
  maxGeometryIndexTriangles: number;
}>): HitIslandAndDensityResult {
  const {
    object,
    material,
    sourceTexture,
    effectiveTexture,
    targetSize,
    faceIndex,
    uvAttribute,
    maxGeometryIndexTriangles,
  } = input;
  let islandId = `${object.uuid}:${material.uuid}`;
  let texelsPerWorldUnit: number | undefined;
  let guidance: StudioVrmTexturePaintRuntimeGuidance | null = null;

  if (!isUsableFaceIndex(faceIndex)) {
    return { islandId, texelsPerWorldUnit, guidance };
  }

  let geometryIndex: StudioVrmTextureGeometryIndex | null = null;
  try {
    const geometry = object.geometry;
    const indexOptions = {
      uvAttribute,
      maxTriangles: maxGeometryIndexTriangles,
    } as const;
    const admission = inspectStudioVrmTextureGeometryAdmission(geometry, indexOptions);
    if (admission && !admission.admitted) {
      guidance = frozenGeometryBudgetGuidance(
        admission.triangleCount,
        admission.maxTriangles,
      );
    } else if (admission?.admitted) {
      geometryIndex = getCachedStudioVrmTextureGeometryIndex(geometry, indexOptions);
    }
  } catch {
    // 손상된 custom geometry는 아래 face-specific identity로 격리한다.
  }

  const island = geometryIndex?.getIsland(faceIndex) ?? null;
  islandId = island
    ? `${object.uuid}:${material.uuid}:${island.key}`
    : `${object.uuid}:${material.uuid}:${uvAttribute}:face:${faceIndex}`;

  // 첫 beginStroke는 비동기 read보다 먼저 오므로 island는 크기와 무관하게 위에서 고정한다.
  // 밀도만 이미 준비된 target 또는 안전하게 읽힌 원본 이미지 크기가 있을 때 보강한다.
  const textureSize = targetSize ?? textureImageDimensions(sourceTexture);
  if (geometryIndex && textureSize) {
    try {
      object.updateWorldMatrix(true, false);
      const classification = geometryIndex.resolvePaintClassification(
        faceIndex,
        textureSize,
        {
          matrixWorld: object.matrixWorld,
          uvAreaScale: Math.abs(effectiveTexture.matrix.determinant()),
        },
      );
      if (classification) {
        islandId = `${object.uuid}:${material.uuid}:${classification.island.key}`;
        if (classification.texelsPerWorldUnit !== null) {
          texelsPerWorldUnit = classification.texelsPerWorldUnit;
        }
      }
    } catch {
      // island/face-local ID는 유지하고 밀도 보강만 생략한다.
    }
  }

  return { islandId, texelsPerWorldUnit, guidance };
}

/**
 * 확정된 타깃 텍스처 해상도와 랩핑 설정으로 정규화 UV 투영 스냅샷을 생성한다.
 */
export function buildSurfaceProjectionFromHit(input: Readonly<{
  targetSize: StudioVrmTextureSize;
  sample: StudioVrmTextureStrokeSample;
  wrapU: StudioVrmTextureWrapMode;
  wrapV: StudioVrmTextureWrapMode;
  material: BaseColorMaterial;
  hit: RayHitMaterialCandidate;
}>): StudioVrmTexturePaintRuntimeResult<StudioVrmTexturePaintSurfaceProjection> {
  const { targetSize, sample, wrapU, wrapV, material, hit } = input;
  const point = resolveStudioVrmTexelPoint(sample.uv, targetSize, {
    wrapU,
    wrapV,
    flipV: false,
  });
  if (!point) return failure("uv-missing");
  const u = point.x / targetSize.width;
  const v = point.y / targetSize.height;
  if (!Number.isFinite(u) || !Number.isFinite(v)) return failure("uv-missing");
  const faceIndex = isUsableFaceIndex(hit.faceIndex) ? hit.faceIndex : undefined;
  const object = hit.object as THREE.Mesh;
  const triangleId = faceIndex === undefined
    ? undefined
    : `${object.uuid}:${object.geometry.uuid}:face:${faceIndex}`;
  const islandId = canonicalizeStudioVrmSurfaceIslandId(
    sample.islandId,
  ) ?? `runtime:${object.uuid}:${material.uuid}`;
  return success(Object.freeze({
    u,
    v,
    uvWasWrapped:
      Math.abs(u - sample.uv.u) > Number.EPSILON
      || Math.abs(v - sample.uv.v) > Number.EPSILON,
    ...(sample.pressure === undefined
      ? {}
      : { sourcePressure: sample.pressure }),
    ...(triangleId === undefined ? {} : { triangleId }),
    islandId,
    ...(sample.world ? { world: Object.freeze({ ...sample.world }) } : {}),
    ...(sample.texelsPerWorldUnit === undefined
      ? {}
      : { texelsPerWorldUnit: sample.texelsPerWorldUnit }),
  }));
}
