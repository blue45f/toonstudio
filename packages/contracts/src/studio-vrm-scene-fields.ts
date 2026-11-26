type Fields = Record<string, unknown>;

export function hasVrmSceneFields(value: unknown, keys: readonly string[]): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

const root = ["kind", "version", "model", "pose", "expressions", "camera", "appearance", "rig", "props", "sceneProps",
  "lighting", "lightingTone", "physics", "env", "render", "surfacePaint"];

const linkedRoot = [...root, "characterDocumentId"];

/** 제작 문서의 네임스페이스를 허용하되 파일·원격 주소와 예약 키를 식별자로 사용하지 않는다. */
export function isStudioVrmCharacterDocumentId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,255}$/u.test(value)
    && !UNSAFE_REFERENCE_PATTERN.test(value) && !FORBIDDEN_KEYS.has(value.toLowerCase());
}

/** 개인 원고의 v6 정규 판독과 팀 컷 수신에서 같은 필수 필드를 검사한다. */
export function hasStudioVrmV6Fields(v: unknown): v is Fields & { rig: Fields; pose: Fields & { translations: Fields } } {
  if (!hasVrmSceneFields(v, root)
    && !(hasVrmSceneFields(v, linkedRoot) && isStudioVrmCharacterDocumentId(v.characterDocumentId))) return false;
  return v.kind === "studio-vrm-scene" && v.version === 6
    && hasVrmSceneFields(v.rig, ["version", "jointProfile", "fullBodyIk", "footPlant", "floorHeight"])
    && hasVrmSceneFields(v.pose, ["bones", "yOffset", "bodyRotationY", "fingerOverrides", "translations", "ikConstraints"])
    && hasVrmSceneFields(v.pose.translations, ["version", "root", "hips", "spine"]);
}

const MAX_DATA_DEPTH = 8;
const MAX_DATA_NODES = 1_024;
const MAX_DATA_ARRAY_ITEMS = 128;
const MAX_DATA_OBJECT_KEYS = 128;
const MAX_DATA_KEY_LENGTH = 64;
const MAX_DATA_STRING_LENGTH = 1_024;
export const SAFE_DATA_KEY_PATTERN = /^[\p{L}\p{N}_. -]{1,64}$/u;
export const UNSAFE_REFERENCE_PATTERN = /^(?:data|blob|https?|file|javascript|vbscript):|^\/\//i;
// `curl` is an Avatar Forge numeric hair control, not a URL reference. Keep the broad
// suffix guard for keys such as `runtimeUrl` while exempting that exact canonical field.
export const UNSAFE_REFERENCE_KEY_PATTERN =
  /(?:^|_)(?:url|uri|href|src)$|^(?!curl$).*(?:url|uri)$/i;
export const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export const STUDIO_VRM_HUMANOID_BONES = [
  "hips",
  "spine",
  "chest",
  "upperChest",
  "neck",
  "head",
  "leftEye",
  "rightEye",
  "jaw",
  "leftShoulder",
  "leftUpperArm",
  "leftLowerArm",
  "leftHand",
  "rightShoulder",
  "rightUpperArm",
  "rightLowerArm",
  "rightHand",
  "leftUpperLeg",
  "leftLowerLeg",
  "leftFoot",
  "leftToes",
  "rightUpperLeg",
  "rightLowerLeg",
  "rightFoot",
  "rightToes",
] as const;

export const STUDIO_VRM_FINGER_BONES = [
  "leftThumbMetacarpal",
  "leftThumbProximal",
  "leftThumbDistal",
  "leftIndexProximal",
  "leftIndexIntermediate",
  "leftIndexDistal",
  "leftMiddleProximal",
  "leftMiddleIntermediate",
  "leftMiddleDistal",
  "leftRingProximal",
  "leftRingIntermediate",
  "leftRingDistal",
  "leftLittleProximal",
  "leftLittleIntermediate",
  "leftLittleDistal",
  "rightThumbMetacarpal",
  "rightThumbProximal",
  "rightThumbDistal",
  "rightIndexProximal",
  "rightIndexIntermediate",
  "rightIndexDistal",
  "rightMiddleProximal",
  "rightMiddleIntermediate",
  "rightMiddleDistal",
  "rightRingProximal",
  "rightRingIntermediate",
  "rightRingDistal",
  "rightLittleProximal",
  "rightLittleIntermediate",
  "rightLittleDistal",
] as const;

export type StudioVrmCanonicalData =
  | null
  | boolean
  | number
  | string
  | readonly StudioVrmCanonicalData[]
  | { readonly [key: string]: StudioVrmCanonicalData };

export function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

interface CanonicalDataState {
  nodes: number;
}

export function normalizeCanonicalData(
  value: unknown,
  state: CanonicalDataState,
  depth = 0
): StudioVrmCanonicalData | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined;
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value === "string") {
    if (
      Array.from(value).length > MAX_DATA_STRING_LENGTH ||
      containsControlCharacter(value) ||
      UNSAFE_REFERENCE_PATTERN.test(value.trim())
    ) return undefined;
    return value;
  }
  if (depth >= MAX_DATA_DEPTH || state.nodes >= MAX_DATA_NODES) return undefined;
  state.nodes += 1;
  if (Array.isArray(value)) {
    if (value.length > MAX_DATA_ARRAY_ITEMS) return undefined;
    const result: StudioVrmCanonicalData[] = [];
    for (const item of value) {
      const normalized = normalizeCanonicalData(item, state, depth + 1);
      if (normalized === undefined) return undefined;
      result.push(normalized);
    }
    return result;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const fields = value as Fields;
  const keys = Object.keys(value).sort();
  if (keys.length > MAX_DATA_OBJECT_KEYS) return undefined;
  const result: Record<string, StudioVrmCanonicalData> = {};
  for (const key of keys) {
    if (
      !SAFE_DATA_KEY_PATTERN.test(key) ||
      Array.from(key).length > MAX_DATA_KEY_LENGTH ||
      FORBIDDEN_KEYS.has(key.toLowerCase()) ||
      UNSAFE_REFERENCE_KEY_PATTERN.test(key)
    ) return undefined;
    const normalized = normalizeCanonicalData(fields[key], state, depth + 1);
    if (normalized === undefined) return undefined;
    result[key] = normalized;
  }
  return result;
}

export function normalizedDataOrNull(value: unknown): StudioVrmCanonicalData {
  return normalizeCanonicalData(value, { nodes: 0 }) ?? null;
}

