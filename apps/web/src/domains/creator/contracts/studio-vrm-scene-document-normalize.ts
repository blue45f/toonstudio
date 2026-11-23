/**
 * Studio VRM 씬 문서의 경계 안전 복제·원시 값 및 섹션 정규화기.
 */
import {
  FORBIDDEN_KEYS,
  SAFE_DATA_KEY_PATTERN,
  UNSAFE_REFERENCE_KEY_PATTERN,
  UNSAFE_REFERENCE_PATTERN,
  containsControlCharacter,
  normalizedDataOrNull,
} from "@toonstudio/contracts/studio-vrm-scene-fields";
import {
  canonicalizeStudioVrmTexturePaintChannel,
  studioVrmTexturePaintChannelEncoding,
} from "@toonstudio/contracts/studio-vrm-texture-paint-channel";
import { createStudioVrmRigProfileSelection } from "./studio-vrm-rig-profile-selection";
import {
  DEFAULT_RAW_DOCUMENT,
  DEFAULT_STUDIO_VRM_LIGHTING_TONE,
  STUDIO_VRM_IK_EFFECTORS,
  STUDIO_VRM_MAX_EXPRESSIONS,
  STUDIO_VRM_MAX_FINGER_BONES,
  STUDIO_VRM_MAX_IK_CONSTRAINTS,
  STUDIO_VRM_MAX_POSE_BONES,
  STUDIO_VRM_MODEL_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_KIND,
  STUDIO_VRM_SCENE_DOCUMENT_LEGACY_VERSION,
  STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_PREVIOUS_VERSION,
  STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V3_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V4_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_V5_MAX_BYTES,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION_FOUR,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION_THREE,
  STUDIO_VRM_SCENE_DOCUMENT_VERSION_TWO,
  STUDIO_VRM_SURFACE_PAINT_MAX_DECODED_PIXELS,
  STUDIO_VRM_SURFACE_PAINT_MAX_DIMENSION,
  STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURES,
  STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURE_PIXELS,
  STUDIO_VRM_SURFACE_PAINT_TEXTURE_MAX_BYTES,
  STUDIO_VRM_SURFACE_PAINT_TOTAL_MAX_BYTES,
  failSceneBudget,
  isStudioVrmEnvironment,
  isStudioVrmFingerBoneName,
  isStudioVrmHumanoidBoneName,
  isStudioVrmIkEffector,
  isStudioVrmLightingTone,
  type StudioVrmAppearanceSettings,
  type StudioVrmCameraSettings,
  type StudioVrmFingerRotationMap,
  type StudioVrmIkConstraint,
  type StudioVrmIkEffector,
  type StudioVrmLightingSettings,
  type StudioVrmLightingTone,
  type StudioVrmMaterialFx,
  type StudioVrmPhysicsSettings,
  type StudioVrmPoseBoneMap,
  type StudioVrmPoseState,
  type StudioVrmPoseTranslations,
  type StudioVrmRenderSettings,
  type StudioVrmRigSettings,
  type StudioVrmSceneDocument,
  type StudioVrmSceneModel,
  type StudioVrmSurfacePaintSettings,
  type StudioVrmSurfacePaintTexture,
  type StudioVrmVec3,
} from "./studio-vrm-scene-document-schema";

const MAX_WORLD_COORDINATE = 10_000;
const MAX_SAFE_GRAPH_DEPTH = 16;
const MAX_SAFE_GRAPH_NODES = 8_192;
const MAX_SAFE_GRAPH_ARRAY_ITEMS = 1_024;
const MAX_SAFE_GRAPH_OBJECT_KEYS = 1_024;
const MAX_RENDER_PIXELS = 33_554_432;
const UTF8_ENCODER = new TextEncoder();
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SAFE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const GLTF_MATERIAL_LOCATOR_PATTERN = /^gltf-material:(?:0|[1-9][0-9]{0,5})$/;
const SCENE_PATH_MATERIAL_LOCATOR_PATTERN =
  /^scene-path:[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,7}$/;
const CSS_HEX_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

interface SafeCloneState {
  readonly seen: WeakSet<object>;
  nodes: number;
}

export function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function safeCloneDataGraph(
  value: unknown,
  state: SafeCloneState,
  depth = 0,
): unknown | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value) : undefined;
  if (typeof value !== "object" || depth > MAX_SAFE_GRAPH_DEPTH) return undefined;
  if (state.seen.has(value) || state.nodes >= MAX_SAFE_GRAPH_NODES) return undefined;
  state.seen.add(value);
  state.nodes += 1;

  try {
    const symbols = Object.getOwnPropertySymbols(value);
    if (symbols.length > 0) return undefined;
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) return undefined;
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !("value" in lengthDescriptor)) return undefined;
      const length = lengthDescriptor.value;
      if (
        typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > MAX_SAFE_GRAPH_ARRAY_ITEMS
      ) return undefined;
      const keys = Object.keys(descriptors).filter((key) => key !== "length");
      if (keys.length !== length) return undefined;
      const result: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
        const child = safeCloneDataGraph(descriptor.value, state, depth + 1);
        if (child === undefined) return undefined;
        result.push(child);
      }
      return result;
    }

    if (prototype !== Object.prototype && prototype !== null) return undefined;
    const keys = Object.keys(descriptors);
    if (keys.length > MAX_SAFE_GRAPH_OBJECT_KEYS) return undefined;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) return undefined;
      const child = safeCloneDataGraph(descriptor.value, state, depth + 1);
      if (child === undefined) return undefined;
      Object.defineProperty(result, key, {
        value: child,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } catch {
    return undefined;
  }
}

export function decodeBoundedDataGraph(raw: unknown): unknown | null {
  let decoded: unknown;
  try {
    if (typeof raw === "string") {
      if (utf8ByteLength(raw) > STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES) return null;
      decoded = JSON.parse(raw);
    } else {
      decoded = raw;
    }
  } catch {
    return null;
  }
  const detached = safeCloneDataGraph(decoded, { seen: new WeakSet(), nodes: 0 });
  if (detached === undefined) return null;
  try {
    const serialized = JSON.stringify(detached);
    return utf8ByteLength(serialized) <= STUDIO_VRM_SCENE_DOCUMENT_MAX_BYTES ? detached : null;
  } catch {
    return null;
  }
}

export function exceedsHistoricalSourceLimit(raw: unknown, decoded: unknown): boolean {
  if (typeof raw !== "string" || !isRecord(decoded)) return false;
  if (decoded.version === STUDIO_VRM_SCENE_DOCUMENT_LEGACY_VERSION) {
    return utf8ByteLength(raw) > STUDIO_VRM_SCENE_DOCUMENT_V1_MAX_BYTES;
  }
  if (decoded.version === STUDIO_VRM_SCENE_DOCUMENT_VERSION_TWO) {
    return utf8ByteLength(raw) > STUDIO_VRM_SCENE_DOCUMENT_V2_MAX_BYTES;
  }
  if (decoded.version === STUDIO_VRM_SCENE_DOCUMENT_VERSION_THREE) {
    return utf8ByteLength(raw) > STUDIO_VRM_SCENE_DOCUMENT_V3_MAX_BYTES;
  }
  if (decoded.version === STUDIO_VRM_SCENE_DOCUMENT_VERSION_FOUR) {
    return utf8ByteLength(raw) > STUDIO_VRM_SCENE_DOCUMENT_V4_MAX_BYTES;
  }
  return decoded.version === STUDIO_VRM_SCENE_DOCUMENT_PREVIOUS_VERSION
    && utf8ByteLength(raw) > STUDIO_VRM_SCENE_DOCUMENT_V5_MAX_BYTES;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  const children = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  for (const child of children) deepFreeze(child);
  return Object.freeze(value);
}

export function jsonStructuresEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((item, index) => jsonStructuresEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every(
    (key, index) => key === rightKeys[index] && jsonStructuresEqual(left[key], right[key]),
  );
}

function boundedNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return Object.is(bounded, -0) ? 0 : bounded;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeSafeText(value: unknown, fallback: string, maximumLength = 128): string {
  if (typeof value !== "string" || containsControlCharacter(value)) return fallback;
  const normalized = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    !normalized ||
    Array.from(normalized).length > maximumLength ||
    UNSAFE_REFERENCE_PATTERN.test(normalized)
  ) return fallback;
  return normalized;
}

export function normalizeSafeId(value: unknown, fallback: string): string {
  if (
    typeof value !== "string" ||
    !SAFE_ID_PATTERN.test(value) ||
    FORBIDDEN_KEYS.has(value.toLowerCase()) ||
    UNSAFE_REFERENCE_PATTERN.test(value)
  ) return fallback;
  return value;
}

function normalizeCssHex(value: unknown, fallback: string): string {
  return typeof value === "string" && CSS_HEX_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

function normalizeNullableCssHex(value: unknown): string | null {
  return typeof value === "string" && CSS_HEX_PATTERN.test(value) ? value.toLowerCase() : null;
}

function normalizeVec3(
  value: unknown,
  fallback: StudioVrmVec3,
  minimum = -MAX_WORLD_COORDINATE,
  maximum = MAX_WORLD_COORDINATE,
): StudioVrmVec3 {
  if (!Array.isArray(value) || value.length !== 3) return [fallback[0], fallback[1], fallback[2]];
  return [
    boundedNumber(value[0], fallback[0], minimum, maximum),
    boundedNumber(value[1], fallback[1], minimum, maximum),
    boundedNumber(value[2], fallback[2], minimum, maximum),
  ];
}

function normalizeRotationAngle(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  if (value >= -Math.PI && value < Math.PI) return Object.is(value, -0) ? 0 : value;
  const wrapped = ((value + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function normalizeRotation(value: unknown): StudioVrmVec3 {
  if (!Array.isArray(value) || value.length !== 3) return [0, 0, 0];
  return [
    normalizeRotationAngle(value[0]),
    normalizeRotationAngle(value[1]),
    normalizeRotationAngle(value[2]),
  ];
}

function normalizeUnitVec3(value: unknown, fallback: StudioVrmVec3): StudioVrmVec3 {
  const vector = normalizeVec3(value, fallback, -1_000, 1_000);
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (!Number.isFinite(length) || length < 0.000_001) return [fallback[0], fallback[1], fallback[2]];
  if (Math.abs(length - 1) <= 1e-12) return vector;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function normalizeModel(value: unknown): StudioVrmSceneModel {
  if (!isRecord(value)) return { ...DEFAULT_RAW_DOCUMENT.model };
  if (value.source === "attachment") {
    const hash = typeof value.hash === "string" && HASH_PATTERN.test(value.hash)
      ? value.hash
      : "";
    if (!hash) return { ...DEFAULT_RAW_DOCUMENT.model };
    return {
      source: "attachment",
      hash,
      byteSize: boundedInteger(value.byteSize, 1, 1, STUDIO_VRM_MODEL_MAX_BYTES),
      mime: value.mime === "model/vrm" ? "model/vrm" : "model/gltf-binary",
      name: normalizeSafeText(value.name, "VRM 모델"),
    };
  }
  if (value.source === "bundled") {
    return {
      source: "bundled",
      id: normalizeSafeId(value.id, DEFAULT_RAW_DOCUMENT.model.source === "bundled"
        ? DEFAULT_RAW_DOCUMENT.model.id
        : "sample-vrm"),
      name: normalizeSafeText(value.name, "루미"),
    };
  }
  return { ...DEFAULT_RAW_DOCUMENT.model };
}

export function normalizePoseBones(value: unknown): StudioVrmPoseBoneMap {
  if (!isRecord(value)) return {};
  const result: StudioVrmPoseBoneMap = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= STUDIO_VRM_MAX_POSE_BONES || !isStudioVrmHumanoidBoneName(key)) continue;
    const bone = value[key];
    if (!isRecord(bone) || !hasOwn(bone, "rotation")) continue;
    result[key] = { rotation: normalizeRotation(bone.rotation) };
  }
  return result;
}

function normalizeFingerOverrides(value: unknown): StudioVrmFingerRotationMap {
  if (!isRecord(value)) return {};
  const result: StudioVrmFingerRotationMap = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= STUDIO_VRM_MAX_FINGER_BONES || !isStudioVrmFingerBoneName(key)) continue;
    result[key] = normalizeRotation(value[key]);
  }
  return result;
}

export function normalizePoseTranslations(value: unknown): StudioVrmPoseTranslations {
  const candidate = isRecord(value) ? value : {};
  const root = normalizeVec3(candidate.root, [0, 0, 0], -10, 10);
  return {
    version: 1,
    root: [root[0], 0, root[2]],
    hips: normalizeVec3(candidate.hips, [0, 0, 0], -2, 2),
    spine: normalizeVec3(candidate.spine, [0, 0, 0], -0.75, 0.75),
  };
}

export function normalizeIkConstraints(value: unknown): readonly StudioVrmIkConstraint[] {
  if (!Array.isArray(value)) return [];
  const byEffector = new Map<StudioVrmIkEffector, StudioVrmIkConstraint>();
  for (const rawConstraint of value) {
    if (byEffector.size >= STUDIO_VRM_MAX_IK_CONSTRAINTS || !isRecord(rawConstraint)) continue;
    if (!isStudioVrmIkEffector(rawConstraint.effector) || byEffector.has(rawConstraint.effector)) {
      continue;
    }
    byEffector.set(rawConstraint.effector, {
      effector: rawConstraint.effector,
      enabled: normalizeBoolean(rawConstraint.enabled, false),
      locked: normalizeBoolean(rawConstraint.locked, false),
      target: normalizeVec3(rawConstraint.target, [0, 0, 0]),
      pole: rawConstraint.pole === null
        ? null
        : normalizeVec3(rawConstraint.pole, [0, 0, 0]),
    });
  }
  return STUDIO_VRM_IK_EFFECTORS.flatMap((effector) => {
    const constraint = byEffector.get(effector);
    return constraint ? [constraint] : [];
  });
}

export function normalizePose(value: unknown): StudioVrmPoseState {
  const candidate = isRecord(value) ? value : {};
  return {
    bones: normalizePoseBones(candidate.bones),
    yOffset: boundedNumber(candidate.yOffset, 0, -10, 10),
    translations: normalizePoseTranslations(candidate.translations),
    bodyRotationY: normalizeRotationAngle(candidate.bodyRotationY),
    fingerOverrides: normalizeFingerOverrides(candidate.fingerOverrides),
    ikConstraints: normalizeIkConstraints(candidate.ikConstraints),
  };
}

export function normalizeExpressions(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) return {};
  const result: Record<string, number> = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= STUDIO_VRM_MAX_EXPRESSIONS) break;
    if (
      !SAFE_DATA_KEY_PATTERN.test(key) ||
      FORBIDDEN_KEYS.has(key.toLowerCase()) ||
      UNSAFE_REFERENCE_KEY_PATTERN.test(key) ||
      typeof value[key] !== "number" ||
      !Number.isFinite(value[key])
    ) continue;
    result[key] = boundedNumber(value[key], 0, 0, 1);
  }
  return result;
}

function normalizeCamera(value: unknown): StudioVrmCameraSettings {
  const candidate = isRecord(value) ? value : {};
  const fallback = DEFAULT_RAW_DOCUMENT.camera;
  let position = normalizeVec3(candidate.position, fallback.position);
  const target = normalizeVec3(candidate.target, fallback.target);
  if (Math.hypot(
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  ) < 0.001) position = [...fallback.position];
  let up = normalizeUnitVec3(candidate.up, fallback.up);
  const viewX = target[0] - position[0];
  const viewY = target[1] - position[1];
  const viewZ = target[2] - position[2];
  const crossLength = Math.hypot(
    viewY * up[2] - viewZ * up[1],
    viewZ * up[0] - viewX * up[2],
    viewX * up[1] - viewY * up[0],
  );
  if (crossLength < 0.000_001) up = [...fallback.up];
  const near = boundedNumber(candidate.near, fallback.near, 0.001, 10);
  let far = boundedNumber(candidate.far, fallback.far, 0.01, 100_000);
  if (far <= near) far = Math.min(100_000, Math.max(fallback.far, near + 0.01));
  return {
    projection: "perspective",
    position,
    target,
    up,
    fovDegrees: boundedNumber(candidate.fovDegrees, fallback.fovDegrees, 5, 150),
    near,
    far,
  };
}

function normalizeCustomColors(value: unknown): Readonly<Record<string, string>> {
  if (!isRecord(value)) return {};
  const result: Record<string, string> = {};
  for (const key of Object.keys(value).sort()) {
    if (Object.keys(result).length >= 32) break;
    if (
      !SAFE_DATA_KEY_PATTERN.test(key) ||
      FORBIDDEN_KEYS.has(key.toLowerCase()) ||
      UNSAFE_REFERENCE_KEY_PATTERN.test(key) ||
      typeof value[key] !== "string" ||
      !CSS_HEX_PATTERN.test(value[key])
    ) continue;
    result[key] = value[key].toLowerCase();
  }
  return result;
}

function normalizeMaterialFx(value: unknown): StudioVrmMaterialFx {
  const candidate = isRecord(value) ? value : {};
  return {
    shadeColor: normalizeNullableCssHex(candidate.shadeColor),
    outlineColor: normalizeNullableCssHex(candidate.outlineColor),
    rimColor: normalizeNullableCssHex(candidate.rimColor),
    rimIntensity: boundedNumber(candidate.rimIntensity, 0, 0, 1),
    emissiveColor: normalizeNullableCssHex(candidate.emissiveColor),
    emissiveIntensity: boundedNumber(candidate.emissiveIntensity, 0, 0, 1),
  };
}

export function normalizeAppearance(value: unknown): StudioVrmAppearanceSettings {
  const candidate = isRecord(value) ? value : {};
  const bodyScale = isRecord(candidate.bodyScale) ? candidate.bodyScale : {};
  return {
    bodyScale: {
      height: boundedNumber(bodyScale.height, 1, 0.5, 1.6),
      width: boundedNumber(bodyScale.width, 1, 0.5, 1.6),
    },
    customColors: normalizeCustomColors(candidate.customColors),
    materialFx: normalizeMaterialFx(candidate.materialFx),
    mannequin: normalizeBoolean(candidate.mannequin, false),
    avatarForge: normalizedDataOrNull(candidate.avatarForge),
    costume: normalizedDataOrNull(candidate.costume),
    wardrobe: normalizedDataOrNull(candidate.wardrobe),
  };
}

export function normalizeLighting(value: unknown): StudioVrmLightingSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    intensity: boundedNumber(candidate.intensity, 1, 0.1, 4),
    colorTemp: boundedNumber(candidate.colorTemp, 0.5, 0, 1),
    directionDeg: boundedNumber(candidate.directionDeg, 45, -180, 180),
  };
}

export function normalizeLightingTone(value: unknown): StudioVrmLightingTone {
  return isStudioVrmLightingTone(value) ? value : DEFAULT_STUDIO_VRM_LIGHTING_TONE;
}

export function normalizePhysics(value: unknown): StudioVrmPhysicsSettings {
  const candidate = isRecord(value) ? value : {};
  return {
    version: 1,
    stiffnessScale: boundedNumber(candidate.stiffnessScale, 1, 0, 2),
    gravityScale: boundedNumber(candidate.gravityScale, 1, 0, 2),
    windDirectionDeg: boundedNumber(candidate.windDirectionDeg, 0, -180, 180),
    windStrength: boundedNumber(candidate.windStrength, 0, 0, 2),
  };
}

export function normalizeRender(value: unknown): StudioVrmRenderSettings {
  const candidate = isRecord(value) ? value : {};
  let width = boundedInteger(candidate.width, 1024, 64, 8192);
  let height = boundedInteger(candidate.height, 1024, 64, 8192);
  if (width * height > MAX_RENDER_PIXELS) {
    const ratio = Math.sqrt(MAX_RENDER_PIXELS / (width * height));
    width = Math.max(64, Math.floor(width * ratio));
    height = Math.max(64, Math.floor(height * ratio));
  }
  return {
    width,
    height,
    transparentBackground: normalizeBoolean(candidate.transparentBackground, true),
    backgroundColor: normalizeCssHex(candidate.backgroundColor, "#ffffff"),
  };
}

function normalizeRig(value: unknown): StudioVrmRigSettings {
  const candidate = isRecord(value) ? value : {};
  const jointProfile = createStudioVrmRigProfileSelection(candidate.jointProfile)
    ?? createStudioVrmRigProfileSelection("neutral");
  if (!jointProfile) throw new Error("Missing internal neutral Studio VRM rig profile.");
  return {
    version: 1,
    jointProfile,
    fullBodyIk: normalizeBoolean(candidate.fullBodyIk, false),
    footPlant: normalizeBoolean(candidate.footPlant, false),
    floorHeight: boundedNumber(candidate.floorHeight, 0, -10, 10),
  };
}

function normalizeSurfacePaintIdentifier(value: unknown): string | null {
  if (
    typeof value !== "string"
    || !SAFE_ID_PATTERN.test(value)
    || FORBIDDEN_KEYS.has(value.toLowerCase())
    || UNSAFE_REFERENCE_PATTERN.test(value)
  ) return null;
  return value;
}

function normalizeSurfacePaintMaterialLocator(value: unknown): string | null {
  if (
    typeof value !== "string"
    || containsControlCharacter(value)
    || Array.from(value).length > 256
    || UNSAFE_REFERENCE_PATTERN.test(value)
  ) return null;
  return GLTF_MATERIAL_LOCATOR_PATTERN.test(value)
    || SCENE_PATH_MATERIAL_LOCATOR_PATTERN.test(value)
    ? value
    : null;
}

function normalizeSurfacePaintTexture(value: unknown, version: 1 | 2): StudioVrmSurfacePaintTexture | null {
  if (!isRecord(value)) return null;
  const bindingKey = normalizeSurfacePaintIdentifier(value.bindingKey);
  const materialLocator = normalizeSurfacePaintMaterialLocator(value.materialLocator);
  const textureSlot = canonicalizeStudioVrmTexturePaintChannel(value.textureSlot);
  if (!textureSlot || (version === 1 && textureSlot !== "baseColor")) return null;
  const encoding = studioVrmTexturePaintChannelEncoding(textureSlot);
  if (version === 2 && (value.colorSpace !== encoding.colorSpace
    || value.channelPacking !== encoding.channelPacking)) return null;
  if (
    !bindingKey
    || !materialLocator
    || !textureSlot
    || typeof value.hash !== "string"
    || !HASH_PATTERN.test(value.hash)
    || value.mime !== "image/png"
    || !Number.isSafeInteger(value.byteSize)
    || (value.byteSize as number) < 1
    || (value.byteSize as number) > STUDIO_VRM_SURFACE_PAINT_TEXTURE_MAX_BYTES
    || !Number.isSafeInteger(value.width)
    || (value.width as number) < 1
    || (value.width as number) > STUDIO_VRM_SURFACE_PAINT_MAX_DIMENSION
    || !Number.isSafeInteger(value.height)
    || (value.height as number) < 1
    || (value.height as number) > STUDIO_VRM_SURFACE_PAINT_MAX_DIMENSION
    || (value.width as number) * (value.height as number)
      > STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURE_PIXELS
  ) return null;
  return {
    bindingKey,
    materialLocator,
    textureSlot,
    ...(version === 2 ? encoding : {}),
    hash: value.hash,
    mime: "image/png",
    byteSize: value.byteSize as number,
    width: value.width as number,
    height: value.height as number,
  };
}

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSurfacePaintTextures(
  left: StudioVrmSurfacePaintTexture,
  right: StudioVrmSurfacePaintTexture,
): number {
  return compareCanonicalStrings(left.materialLocator, right.materialLocator)
    || compareCanonicalStrings(left.textureSlot, right.textureSlot)
    || compareCanonicalStrings(left.bindingKey, right.bindingKey)
    || compareCanonicalStrings(left.hash, right.hash)
    || left.byteSize - right.byteSize
    || left.width - right.width
    || left.height - right.height;
}

function surfacePaintBindingIdentity(texture: StudioVrmSurfacePaintTexture): string {
  return `${texture.materialLocator}\u0000${texture.textureSlot}`;
}

function normalizeSurfacePaint(value: unknown): StudioVrmSurfacePaintSettings {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2) || !Array.isArray(value.textures)) {
    return { version: 1, textures: [] };
  }

  const sorted = value.textures
    .flatMap((texture) => {
      const normalized = normalizeSurfacePaintTexture(texture, value.version as 1 | 2);
      return normalized ? [normalized] : [];
    })
    .sort(compareSurfacePaintTextures);
  const byIdentity = new Map<string, StudioVrmSurfacePaintTexture>();
  const conflictedIdentities = new Set<string>();
  const byHash = new Map<string, StudioVrmSurfacePaintTexture>();
  const conflictedHashes = new Set<string>();

  for (const texture of sorted) {
    const identity = surfacePaintBindingIdentity(texture);
    const existingBinding = byIdentity.get(identity);
    if (!existingBinding) {
      byIdentity.set(identity, texture);
    } else if (!jsonStructuresEqual(existingBinding, texture)) {
      conflictedIdentities.add(identity);
    }

    const existingAsset = byHash.get(texture.hash);
    if (!existingAsset) {
      byHash.set(texture.hash, texture);
    } else if (
      existingAsset.mime !== texture.mime
      || existingAsset.byteSize !== texture.byteSize
      || existingAsset.width !== texture.width
      || existingAsset.height !== texture.height
    ) {
      conflictedHashes.add(texture.hash);
    }
  }

  const uniqueBindings = Array.from(byIdentity.values())
    .filter((texture) => (
      !conflictedIdentities.has(surfacePaintBindingIdentity(texture))
      && !conflictedHashes.has(texture.hash)
    ))
    .sort(compareSurfacePaintTextures);
  if (uniqueBindings.length > STUDIO_VRM_SURFACE_PAINT_MAX_TEXTURES) {
    failSceneBudget("surface-paint-count-budget-exceeded");
  }
  const assets = Array.from(new Set(uniqueBindings.map((texture) => texture.hash)))
    .sort(compareCanonicalStrings);
  const acceptedHashes = new Set<string>();
  let totalBytes = 0;
  let totalDecodedPixels = 0;
  for (const hash of assets) {
    const texture = byHash.get(hash);
    if (!texture) continue;
    const decodedPixels = texture.width * texture.height;
    if (totalBytes + texture.byteSize > STUDIO_VRM_SURFACE_PAINT_TOTAL_MAX_BYTES) {
      failSceneBudget("surface-paint-byte-budget-exceeded");
    }
    if (totalDecodedPixels + decodedPixels > STUDIO_VRM_SURFACE_PAINT_MAX_DECODED_PIXELS) {
      failSceneBudget("surface-paint-decoded-pixel-budget-exceeded");
    }
    acceptedHashes.add(hash);
    totalBytes += texture.byteSize;
    totalDecodedPixels += decodedPixels;
  }

  return {
    version: value.version,
    textures: uniqueBindings.filter((texture) => acceptedHashes.has(texture.hash)),
  };
}

export function normalizeDecodedDocumentFields(value: Record<string, unknown>): StudioVrmSceneDocument {
  return {
    kind: STUDIO_VRM_SCENE_DOCUMENT_KIND,
    version: STUDIO_VRM_SCENE_DOCUMENT_VERSION,
    model: normalizeModel(value.model),
    pose: normalizePose(value.pose),
    expressions: normalizeExpressions(value.expressions),
    camera: normalizeCamera(value.camera),
    appearance: normalizeAppearance(value.appearance),
    rig: normalizeRig(value.rig),
    props: normalizedDataOrNull(value.props),
    sceneProps: normalizedDataOrNull(value.sceneProps),
    lighting: normalizeLighting(value.lighting),
    lightingTone: normalizeLightingTone(value.lightingTone),
    physics: normalizePhysics(value.physics),
    env: isStudioVrmEnvironment(value.env) ? value.env : "none",
    render: normalizeRender(value.render),
    surfacePaint: normalizeSurfacePaint(value.surfacePaint),
  };
}

export function normalizeDecodedCurrentDocument(value: unknown): StudioVrmSceneDocument | null {
  if (
    !isRecord(value) ||
    value.kind !== STUDIO_VRM_SCENE_DOCUMENT_KIND ||
    value.version !== STUDIO_VRM_SCENE_DOCUMENT_VERSION
  ) return null;
  return deepFreeze(normalizeDecodedDocumentFields(value));
}
