/**
 * Studio BG3D 사전 수출 예산 — GLB로 내보내기 전에 직렬화 JSON·메타데이터·텍스처
 * 용량을 측정해 프로필 예산 안에 드는지 검증한다. 가져오기 예산 단언과 한도·오류
 * 계약을 공유한다.
 */

import { measureStudioBg3dThreeMetrics } from "../studio-background-3d-model";

import {
  assertParsedAnimationBudgets,
  assertParsedImportBudgets,
  assertParsedMaterialBudgets,
} from "./studio-bg3d-import-budget-assertions";
import type { StudioBg3dGlbValidationBudget } from "./studio-bg3d-glb-validation";
import {
  importError,
  safeAddCount,
  safeMultiplyCount,
  throwIfAborted,
  type StudioBg3dModelImportErrorCode,
  type StudioBg3dParsedExportCandidate,
} from "./studio-bg3d-model-import-shared";
import type { StudioBg3dParsedGlbMetrics } from "./studio-bg3d-scene-document";

import type * as THREE from "three";

const STUDIO_BG3D_PRE_EXPORT_BASE_MODEL_BYTES = 4_096;
const STUDIO_BG3D_PRE_EXPORT_RESOURCE_ENVELOPE_NUMERATOR = 5;
const STUDIO_BG3D_PRE_EXPORT_RESOURCE_ENVELOPE_DENOMINATOR = 4;
const STUDIO_BG3D_PRE_EXPORT_MAX_METADATA_DEPTH = 32;
const STUDIO_BG3D_PRE_EXPORT_MAX_METADATA_ENTRIES = 65_536;
const STUDIO_BG3D_PRE_EXPORT_TEXTURE_SLOTS = [
  "anisotropyMap",
  "aoMap",
  "bumpMap",
  "clearcoatMap",
  "clearcoatNormalMap",
  "clearcoatRoughnessMap",
  "emissiveMap",
  "iridescenceMap",
  "iridescenceThicknessMap",
  "map",
  "metalnessMap",
  "normalMap",
  "roughnessMap",
  "sheenColorMap",
  "sheenRoughnessMap",
  "specularColorMap",
  "specularIntensityMap",
  "thicknessMap",
  "transmissionMap",
] as const;

interface StudioBg3dPreExportJsonMeasurement {
  readonly bytes: number;
  readonly entries: number;
}

interface StudioBg3dPreExportSupplementalMetrics {
  readonly joints: number;
  readonly maxTextureDimension: number;
  readonly morphTargets: number;
  readonly serializedMetadataBytes: number;
  readonly skins: number;
  readonly textureBytes: number;
}

function ownPropertyDescriptor(
  value: object,
  key: PropertyKey,
): PropertyDescriptor | undefined {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw importError("parse-failed");
  }
}

function ownDataProperty(value: object, key: PropertyKey): unknown {
  const descriptor = ownPropertyDescriptor(value, key);
  if (!descriptor) return undefined;
  if (!("value" in descriptor)) throw importError("parse-failed");
  return descriptor.value;
}

function enumerableOwnKeys(value: object): readonly string[] {
  try {
    return Object.keys(value);
  } catch {
    throw importError("parse-failed");
  }
}

function plainJsonPrototype(value: object): boolean {
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function jsonStringByteLength(
  value: string,
  signal: AbortSignal | undefined,
  maximumBytes: number,
): number {
  let bytes = 2;
  for (let index = 0; index < value.length; index += 1) {
    if ((index & 0x3fff) === 0) throwIfAborted(signal);
    const codeUnit = value.charCodeAt(index);
    let encodedBytes: number;
    if (codeUnit === 0x22 || codeUnit === 0x5c) {
      encodedBytes = 2;
    } else if (codeUnit <= 0x1f) {
      encodedBytes = 6;
    } else if (codeUnit <= 0x7f) {
      encodedBytes = 1;
    } else if (codeUnit <= 0x7ff) {
      encodedBytes = 2;
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const following = value.charCodeAt(index + 1);
      if (following >= 0xdc00 && following <= 0xdfff) {
        encodedBytes = 4;
        index += 1;
      } else {
        encodedBytes = 6;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      encodedBytes = 6;
    } else {
      encodedBytes = 3;
    }
    bytes = safeAddCount(bytes, encodedBytes, "model-byte-budget-exceeded");
    if (bytes > maximumBytes) throw importError("model-byte-budget-exceeded");
  }
  return bytes;
}

function measureStudioBg3dSerializableJson(
  root: unknown,
  signal: AbortSignal | undefined,
  maximumBytes: number,
): StudioBg3dPreExportJsonMeasurement {
  type Frame =
    | { readonly kind: "enter"; readonly depth: number; readonly value: unknown }
    | { readonly kind: "exit"; readonly value: object };
  const frames: Frame[] = [{ kind: "enter", depth: 0, value: root }];
  const active = new WeakSet<object>();
  let bytes = 0;
  let entries = 0;
  const addBytes = (amount: number): void => {
    bytes = safeAddCount(bytes, amount, "model-byte-budget-exceeded");
    if (bytes > maximumBytes) throw importError("model-byte-budget-exceeded");
  };
  const addEntries = (amount: number): void => {
    entries = safeAddCount(entries, amount, "parse-failed");
    if (entries > STUDIO_BG3D_PRE_EXPORT_MAX_METADATA_ENTRIES) {
      throw importError("parse-failed");
    }
  };

  while (frames.length > 0) {
    if ((entries & 0xff) === 0) throwIfAborted(signal);
    const frame = frames.pop();
    if (!frame) break;
    if (frame.kind === "exit") {
      active.delete(frame.value);
      continue;
    }
    const { depth, value } = frame;
    if (value === null) {
      addBytes(4);
      continue;
    }
    switch (typeof value) {
      case "boolean":
        addBytes(value ? 4 : 5);
        continue;
      case "number":
        if (!Number.isFinite(value)) throw importError("parse-failed");
        // Covers every finite decimal representation plus a conservative delimiter allowance.
        addBytes(32);
        continue;
      case "string":
        addBytes(jsonStringByteLength(value, signal, maximumBytes - bytes));
        continue;
      case "object":
        break;
      default:
        throw importError("parse-failed");
    }
    if (depth > STUDIO_BG3D_PRE_EXPORT_MAX_METADATA_DEPTH || active.has(value)) {
      throw importError("parse-failed");
    }
    active.add(value);
    frames.push({ kind: "exit", value });

    if (Array.isArray(value)) {
      const rawLength = ownDataProperty(value, "length");
      if (
        !Number.isSafeInteger(rawLength)
        || (rawLength as number) < 0
        || (rawLength as number) > STUDIO_BG3D_PRE_EXPORT_MAX_METADATA_ENTRIES
      ) {
        throw importError("parse-failed");
      }
      const length = rawLength as number;
      addEntries(length);
      addBytes(safeAddCount(2, Math.max(0, length - 1), "model-byte-budget-exceeded"));
      for (let index = length - 1; index >= 0; index -= 1) {
        const descriptor = ownPropertyDescriptor(value, String(index));
        if (descriptor && !("value" in descriptor)) throw importError("parse-failed");
        frames.push({
          kind: "enter",
          depth: depth + 1,
          value: descriptor ? descriptor.value : null,
        });
      }
      continue;
    }

    if (!plainJsonPrototype(value)) throw importError("parse-failed");
    const keys = enumerableOwnKeys(value);
    addEntries(keys.length);
    addBytes(safeAddCount(2, Math.max(0, keys.length - 1), "model-byte-budget-exceeded"));
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      const descriptor = ownPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) throw importError("parse-failed");
      addBytes(jsonStringByteLength(key, signal, maximumBytes - bytes));
      addBytes(1);
      frames.push({ kind: "enter", depth: depth + 1, value: descriptor.value });
    }
  }
  return Object.freeze({ bytes, entries });
}

function measureStudioBg3dOwnerMetadata(
  owner: object,
  signal: AbortSignal | undefined,
  maximumBytes: number,
  includeName: boolean,
): StudioBg3dPreExportJsonMeasurement {
  let bytes = 0;
  let entries = 0;
  if (includeName) {
    const name = ownDataProperty(owner, "name");
    if (name !== undefined) {
      if (typeof name !== "string") throw importError("parse-failed");
      if (name.length > 0) {
        bytes = safeAddCount(
          16,
          jsonStringByteLength(name, signal, maximumBytes),
          "model-byte-budget-exceeded",
        );
        entries = 1;
      }
    }
  }
  const userData = ownDataProperty(owner, "userData");
  if (userData === undefined) return Object.freeze({ bytes, entries });
  if (!userData || typeof userData !== "object" || Array.isArray(userData)) {
    throw importError("parse-failed");
  }
  const keys = enumerableOwnKeys(userData);
  if (keys.length === 0) return Object.freeze({ bytes, entries });
  const remainingBytes = maximumBytes - bytes;
  if (remainingBytes < 0) throw importError("model-byte-budget-exceeded");
  const measured = measureStudioBg3dSerializableJson(userData, signal, remainingBytes);
  return Object.freeze({
    bytes: safeAddCount(
      safeAddCount(bytes, measured.bytes, "model-byte-budget-exceeded"),
      16,
      "model-byte-budget-exceeded",
    ),
    entries: safeAddCount(entries, measured.entries, "parse-failed"),
  });
}

function inheritedDataProperty(value: object, key: PropertyKey): unknown {
  let current: object | null = value;
  for (let depth = 0; current && depth <= 16; depth += 1) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(current, key);
      current = Object.getPrototypeOf(current) as object | null;
    } catch {
      throw importError("parse-failed");
    }
    if (!descriptor) continue;
    if (!("value" in descriptor)) throw importError("parse-failed");
    return descriptor.value;
  }
  return undefined;
}

function isStudioBg3dTexture(value: unknown): value is THREE.Texture {
  return Boolean(
    value
    && typeof value === "object"
    && inheritedDataProperty(value, "isTexture") === true
  );
}

function preExportImageDimension(
  value: unknown,
  keys: readonly string[],
): number | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  let largest = 0;
  for (const key of keys) {
    const candidate = record[key];
    if (Number.isSafeInteger(candidate) && (candidate as number) > largest) {
      largest = candidate as number;
    }
  }
  return largest > 0 ? largest : null;
}

function preExportBufferByteLength(value: unknown): number {
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  return 0;
}

function measureStudioBg3dExportImageSource(
  value: unknown,
): { readonly decodedBytes: number; readonly maxDimension: number } {
  if (!value || typeof value !== "object") throw importError("parse-failed");
  const width = preExportImageDimension(value, ["width", "naturalWidth", "videoWidth"]);
  const height = preExportImageDimension(value, ["height", "naturalHeight", "videoHeight"]);
  if (width === null || height === null) throw importError("parse-failed");
  const record = value as Record<string, unknown>;
  const rawDepth = record.depth;
  const depth = rawDepth === undefined ? 1 : rawDepth;
  if (!Number.isSafeInteger(depth) || (depth as number) < 1) throw importError("parse-failed");
  const baseTexels = safeMultiplyCount(
    safeMultiplyCount(width, height, "texture-byte-budget-exceeded"),
    depth as number,
    "texture-byte-budget-exceeded",
  );
  const baseBytes = Math.max(
    safeMultiplyCount(baseTexels, 4, "texture-byte-budget-exceeded"),
    preExportBufferByteLength(record.data),
  );
  return Object.freeze({
    decodedBytes: baseBytes,
    maxDimension: Math.max(width, height),
  });
}

function measureStudioBg3dExportTexture(
  texture: THREE.Texture,
): { readonly decodedBytes: number; readonly maxDimension: number } {
  const source = ownDataProperty(texture, "source");
  const sourceData = source && typeof source === "object"
    ? ownDataProperty(source, "data")
    : ownDataProperty(texture, "image");
  const sources = Array.isArray(sourceData) ? sourceData : [sourceData];
  if (sources.length === 0 || sources.some((candidate) => candidate === undefined || candidate === null)) {
    throw importError("parse-failed");
  }
  let decodedBytes = 0;
  let maxTextureDimension = 0;
  for (const candidate of sources) {
    const measured = measureStudioBg3dExportImageSource(candidate);
    decodedBytes = safeAddCount(
      decodedBytes,
      measured.decodedBytes,
      "texture-byte-budget-exceeded",
    );
    maxTextureDimension = Math.max(maxTextureDimension, measured.maxDimension);
  }
  return Object.freeze({ decodedBytes, maxDimension: maxTextureDimension });
}

function measureStudioBg3dPreExportSupplementalMetrics(
  parsed: StudioBg3dParsedExportCandidate,
  signal: AbortSignal | undefined,
  maximumMetadataBytes: number,
): StudioBg3dPreExportSupplementalMetrics {
  const stack: THREE.Object3D[] = [parsed.root];
  const visited = new Set<THREE.Object3D>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  let joints = 0;
  let morphTargets = 0;
  let serializedMetadataBytes = 0;
  let serializedMetadataEntries = 0;
  let skins = 0;
  const addMetadata = (
    measurement: StudioBg3dPreExportJsonMeasurement,
    multiplier = 1,
  ): void => {
    serializedMetadataBytes = safeAddCount(
      serializedMetadataBytes,
      safeMultiplyCount(
        measurement.bytes,
        multiplier,
        "model-byte-budget-exceeded",
      ),
      "model-byte-budget-exceeded",
    );
    if (serializedMetadataBytes > maximumMetadataBytes) {
      throw importError("model-byte-budget-exceeded");
    }
    serializedMetadataEntries = safeAddCount(
      serializedMetadataEntries,
      safeMultiplyCount(measurement.entries, multiplier, "parse-failed"),
      "parse-failed",
    );
    if (serializedMetadataEntries > STUDIO_BG3D_PRE_EXPORT_MAX_METADATA_ENTRIES) {
      throw importError("parse-failed");
    }
  };

  while (stack.length > 0) {
    if ((visited.size & 0xff) === 0) throwIfAborted(signal);
    const object = stack.pop();
    if (!object || visited.has(object)) throw importError("parse-failed");
    visited.add(object);
    for (const child of object.children) stack.push(child);
    addMetadata(measureStudioBg3dOwnerMetadata(
      object,
      signal,
      maximumMetadataBytes - serializedMetadataBytes,
      true,
    ));

    const renderable = object as THREE.Object3D & {
      readonly geometry?: THREE.BufferGeometry;
      readonly isLine?: boolean;
      readonly isMesh?: boolean;
      readonly isPoints?: boolean;
      readonly isSkinnedMesh?: boolean;
      readonly material?: THREE.Material | readonly THREE.Material[];
      readonly morphTargetDictionary?: Readonly<Record<string, number>>;
      readonly morphTargetInfluences?: readonly number[];
      readonly skeleton?: { readonly bones?: readonly THREE.Bone[] };
    };
    if (renderable.isSkinnedMesh === true) {
      const bones = renderable.skeleton?.bones;
      if (!Array.isArray(bones)) throw importError("parse-failed");
      skins = safeAddCount(skins, 1, "skin-count-budget-exceeded");
      joints = safeAddCount(joints, bones.length, "joint-count-budget-exceeded");
    }
    if (
      (!renderable.isMesh && !renderable.isLine && !renderable.isPoints)
      || !renderable.geometry?.isBufferGeometry
    ) continue;

    const objectMaterials = Array.isArray(renderable.material)
      ? renderable.material
      : [renderable.material];
    for (const material of objectMaterials) {
      if (!material || typeof material !== "object") throw importError("parse-failed");
      materials.add(material);
    }
    const primitiveCount = Array.isArray(renderable.material)
      ? Math.max(1, renderable.geometry.groups.length)
      : 1;
    addMetadata(
      measureStudioBg3dOwnerMetadata(
        renderable.geometry,
        signal,
        maximumMetadataBytes - serializedMetadataBytes,
        false,
      ),
      primitiveCount,
    );
    if (!renderable.isMesh) continue;
    const morphAttributeSets = Object.values(renderable.geometry.morphAttributes);
    if (morphAttributeSets.some((attributes) => !Array.isArray(attributes))) {
      throw importError("parse-failed");
    }
    const attributeTargets = morphAttributeSets.reduce(
      (largest, attributes) => Math.max(largest, attributes.length),
      0,
    );
    const influences = renderable.morphTargetInfluences;
    if (influences !== undefined && !Array.isArray(influences)) {
      throw importError("parse-failed");
    }
    const targetCount = Math.max(attributeTargets, influences?.length ?? 0);
    morphTargets = safeAddCount(
      morphTargets,
      safeMultiplyCount(
        targetCount,
        primitiveCount,
        "morph-target-budget-exceeded",
      ),
      "morph-target-budget-exceeded",
    );
    const morphTargetDictionary = renderable.morphTargetDictionary;
    if (morphTargetDictionary !== undefined) {
      addMetadata(measureStudioBg3dSerializableJson(
        morphTargetDictionary,
        signal,
        maximumMetadataBytes - serializedMetadataBytes,
      ));
    }
  }

  for (const material of materials) {
    throwIfAborted(signal);
    addMetadata(measureStudioBg3dOwnerMetadata(
      material,
      signal,
      maximumMetadataBytes - serializedMetadataBytes,
      true,
    ));
    for (const slot of STUDIO_BG3D_PRE_EXPORT_TEXTURE_SLOTS) {
      const candidate = ownDataProperty(material, slot);
      if (candidate === undefined || candidate === null) continue;
      if (!isStudioBg3dTexture(candidate)) throw importError("parse-failed");
      textures.add(candidate);
    }
  }
  for (const animation of parsed.animations) {
    throwIfAborted(signal);
    if (!animation || typeof animation !== "object") throw importError("parse-failed");
    addMetadata(measureStudioBg3dOwnerMetadata(
      animation,
      signal,
      maximumMetadataBytes - serializedMetadataBytes,
      true,
    ));
    for (const track of animation.tracks) {
      const trackName = ownDataProperty(track, "name");
      if (typeof trackName !== "string") throw importError("parse-failed");
      addMetadata(Object.freeze({
        bytes: safeAddCount(
          16,
          jsonStringByteLength(
            trackName,
            signal,
            maximumMetadataBytes - serializedMetadataBytes,
          ),
          "model-byte-budget-exceeded",
        ),
        entries: 1,
      }));
    }
  }

  let textureBytes = 0;
  let maxTextureDimension = 0;
  for (const texture of textures) {
    throwIfAborted(signal);
    addMetadata(measureStudioBg3dOwnerMetadata(
      texture,
      signal,
      maximumMetadataBytes - serializedMetadataBytes,
      true,
    ));
    const measured = measureStudioBg3dExportTexture(texture);
    textureBytes = safeAddCount(
      textureBytes,
      measured.decodedBytes,
      "texture-byte-budget-exceeded",
    );
    maxTextureDimension = Math.max(maxTextureDimension, measured.maxDimension);
  }
  return Object.freeze({
    joints,
    maxTextureDimension,
    morphTargets,
    serializedMetadataBytes,
    skins,
    textureBytes,
  });
}

/**
 * GLTFExporter must materialize a JSON document, aligned buffer views, and image/container
 * records in addition to the arrays that are already resident in memory. The decoded geometry
 * and texture footprint is therefore wrapped in a conservative 25% envelope, then bounded
 * structural allowances are added without serializing the scene or allocating pixel buffers.
 */
function estimateStudioBg3dPreExportModelBytes(
  metrics: StudioBg3dParsedGlbMetrics,
  serializedMetadataBytes = 0,
): number {
  const code: StudioBg3dModelImportErrorCode = "model-byte-budget-exceeded";
  const resourceBytes = safeAddCount(
    metrics.estimatedDecodedGeometryBytes,
    metrics.textureBytes,
    code,
  );
  const envelopedResourceBytes = Math.ceil(
    safeMultiplyCount(
      resourceBytes,
      STUDIO_BG3D_PRE_EXPORT_RESOURCE_ENVELOPE_NUMERATOR,
      code,
    ) / STUDIO_BG3D_PRE_EXPORT_RESOURCE_ENVELOPE_DENOMINATOR,
  );
  let estimate = safeAddCount(
    STUDIO_BG3D_PRE_EXPORT_BASE_MODEL_BYTES,
    envelopedResourceBytes,
    code,
  );
  estimate = safeAddCount(
    estimate,
    Math.ceil(
      safeMultiplyCount(
        serializedMetadataBytes,
        STUDIO_BG3D_PRE_EXPORT_RESOURCE_ENVELOPE_NUMERATOR,
        code,
      ) / STUDIO_BG3D_PRE_EXPORT_RESOURCE_ENVELOPE_DENOMINATOR,
    ),
    code,
  );
  const structuralAllowances = [
    [metrics.nodes, 512],
    [metrics.drawCalls, 512],
    [metrics.materials, 2_048],
    [metrics.lights, 512],
    [metrics.animations, 512],
    [metrics.animationChannels, 384],
    [metrics.skins, 512],
    [metrics.joints, 128],
    [metrics.morphTargets, 256],
    [metrics.textures, 1_024],
  ] as const;
  for (const [count, bytesPerRecord] of structuralAllowances) {
    estimate = safeAddCount(
      estimate,
      safeMultiplyCount(count, bytesPerRecord, code),
      code,
    );
  }
  return estimate;
}

function assertActiveProfilePreExportBudgets(
  parsed: StudioBg3dParsedExportCandidate,
  budget: StudioBg3dGlbValidationBudget,
  signal?: AbortSignal,
): void {
  const measured = measureStudioBg3dThreeMetrics(parsed.root, parsed.animations);
  if (!measured.ok) throw importError("parse-failed");
  const supplemental = measureStudioBg3dPreExportSupplementalMetrics(
    parsed,
    signal,
    budget.complexity.maxModelBytes,
  );
  const metrics: StudioBg3dParsedGlbMetrics = Object.freeze({
    ...measured.metrics,
    joints: Math.max(measured.metrics.joints, supplemental.joints),
    maxTextureDimension: Math.max(
      measured.metrics.maxTextureDimension,
      supplemental.maxTextureDimension,
    ),
    morphTargets: Math.max(measured.metrics.morphTargets, supplemental.morphTargets),
    skins: Math.max(measured.metrics.skins, supplemental.skins),
    textureBytes: Math.max(measured.metrics.textureBytes, supplemental.textureBytes),
  });

  if (metrics.lights > budget.complexity.maxLights) {
    throw importError("light-budget-exceeded");
  }
  if (metrics.skins > budget.complexity.maxSkins) {
    throw importError("skin-count-budget-exceeded");
  }
  if (metrics.joints > budget.complexity.maxJoints) {
    throw importError("joint-count-budget-exceeded");
  }
  if (metrics.morphTargets > budget.complexity.maxMorphTargets) {
    throw importError("morph-target-budget-exceeded");
  }
  if (
    metrics.accessorElements > budget.complexity.maxAccessorElements
    || metrics.estimatedDecodedGeometryBytes
      > budget.complexity.maxDecodedGeometryBytes
  ) {
    throw importError("geometry-memory-too-large");
  }
  if (metrics.textures > budget.textures.maxTextures) {
    throw importError("texture-count-budget-exceeded");
  }
  if (metrics.maxTextureDimension > budget.textures.maxDimension) {
    throw importError("texture-dimension-budget-exceeded");
  }
  if (metrics.textureBytes > budget.textures.maxTotalBytes) {
    throw importError("texture-byte-budget-exceeded");
  }
  if (
    estimateStudioBg3dPreExportModelBytes(metrics, supplemental.serializedMetadataBytes)
    > budget.complexity.maxModelBytes
  ) {
    throw importError("model-byte-budget-exceeded");
  }
}

/**
 * Bounds every CPU-heavy structure that GLTFExporter will walk. This runs after format parsing but
 * before legacy material conversion, matrix updates, texture encoding, or GLB allocation.
 */
export function assertStudioBg3dPreExportBudgets(
  parsed: StudioBg3dParsedExportCandidate,
  signal?: AbortSignal,
  budget?: StudioBg3dGlbValidationBudget,
): void {
  assertParsedImportBudgets(parsed.root, signal, budget);
  assertParsedMaterialBudgets(parsed.root, signal, budget);
  assertParsedAnimationBudgets(parsed.animations, signal, budget);
  if (budget) {
    throwIfAborted(signal);
    assertActiveProfilePreExportBudgets(parsed, budget, signal);
    throwIfAborted(signal);
  }
}

