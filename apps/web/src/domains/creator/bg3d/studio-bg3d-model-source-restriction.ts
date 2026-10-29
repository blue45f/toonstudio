export type StudioBg3dModelSourceRestrictionHash = `sha256:${string}`;

export interface StudioBg3dModelSourceRestrictionIdentity {
  readonly recordId: string;
  readonly sha256: StudioBg3dModelSourceRestrictionHash;
}

export interface StudioBg3dModelSourceRestrictionOrigin extends StudioBg3dModelSourceRestrictionIdentity {
  readonly kind: "bundle-pack" | "user-file" | "studio-generated";
}

/** 저장 권위가 확인한 출처 제한 DTO다. 형식 파싱 자체는 업로드 권한 영수증이 아니다. */
export interface StudioBg3dModelSourceRestrictionV1 {
  readonly version: 1;
  readonly modelFileExport: "allowed" | "service-only" | "unknown";
  readonly origin: StudioBg3dModelSourceRestrictionOrigin | null;
  readonly parent: StudioBg3dModelSourceRestrictionIdentity | null;
}

const STORAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const FORBIDDEN_IDS = new Set(["constructor", "prototype", "__proto__"]);
const SENSITIVE_REFERENCE_PATTERN =
  /(?:\b(?:api[-_ ]?key|access[-_ ]?token|secret|password)\b|(?:^|\s)sk-[A-Za-z0-9_-]{8,})/iu;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const ROOT_KEYS: readonly string[] = ["version", "modelFileExport", "origin", "parent"];
const ORIGIN_KEYS: readonly string[] = ["kind", "recordId", "sha256"];
const IDENTITY_KEYS: readonly string[] = ["recordId", "sha256"];
const EFFECTIVE_UNKNOWN: StudioBg3dModelSourceRestrictionV1 = Object.freeze({
  version: 1, modelFileExport: "unknown", origin: null, parent: null,
});

/** bg3d-model-library의 isSafeBg3dModelStorageId와 동일한 순수 식별자 규칙이다. */
export function isSafeStudioBg3dModelSourceRestrictionRecordId(value: unknown): value is string {
  return typeof value === "string" && STORAGE_ID_PATTERN.test(value)
    && !FORBIDDEN_IDS.has(value.toLowerCase()) && !SENSITIVE_REFERENCE_PATTERN.test(value);
}

function hash(value: unknown): value is StudioBg3dModelSourceRestrictionHash {
  return typeof value === "string" && HASH_PATTERN.test(value);
}
function plain(value: unknown): value is object {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function data(value: object, key: string): PropertyDescriptor | null {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor && descriptor.enumerable === true ? descriptor : null;
}
function exact(value: unknown, keys: readonly string[]): ReadonlyMap<string, unknown> | null {
  if (!plain(value)) return null;
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((key) => typeof key !== "string" || !keys.includes(key))) return null;
  const values = new Map<string, unknown>();
  for (const key of keys) {
    const descriptor = data(value, key);
    if (!descriptor) return null;
    values.set(key, descriptor.value);
  }
  return values;
}
function identity(value: unknown): StudioBg3dModelSourceRestrictionIdentity | null {
  const fields = exact(value, IDENTITY_KEYS);
  if (!fields) return null;
  const recordId = fields.get("recordId"), sha256 = fields.get("sha256");
  return isSafeStudioBg3dModelSourceRestrictionRecordId(recordId) && hash(sha256)
    ? Object.freeze({ recordId, sha256 }) : null;
}
function origin(value: unknown): StudioBg3dModelSourceRestrictionOrigin | null {
  const fields = exact(value, ORIGIN_KEYS);
  if (!fields) return null;
  const kind = fields.get("kind"), recordId = fields.get("recordId"), sha256 = fields.get("sha256");
  if ((kind !== "bundle-pack" && kind !== "user-file" && kind !== "studio-generated")
    || !isSafeStudioBg3dModelSourceRestrictionRecordId(recordId) || !hash(sha256)) return null;
  return Object.freeze({ kind, recordId, sha256 });
}

/** getter·추가 키·외부 prototype을 거부하고 모든 하위 DTO를 새로 만들어 동결한다. */
export function parseStudioBg3dModelSourceRestriction(value: unknown): StudioBg3dModelSourceRestrictionV1 | null {
  try {
    const fields = exact(value, ROOT_KEYS);
    if (!fields || fields.get("version") !== 1) return null;
    const modelFileExport = fields.get("modelFileExport");
    if (modelFileExport !== "allowed" && modelFileExport !== "service-only" && modelFileExport !== "unknown") return null;
    const rawOrigin = fields.get("origin"), rawParent = fields.get("parent");
    const parsedOrigin = rawOrigin === null ? null : origin(rawOrigin);
    const parsedParent = rawParent === null ? null : identity(rawParent);
    if ((rawOrigin !== null && parsedOrigin === null) || (rawParent !== null && parsedParent === null)) return null;
    if (modelFileExport === "allowed" && (parsedOrigin === null || parsedOrigin.kind === "bundle-pack")) return null;
    return Object.freeze({ version: 1, modelFileExport, origin: parsedOrigin, parent: parsedParent });
  } catch {
    // 입력의 prototype/descriptor 조회 자체가 실패해도 유효한 DTO로 취급하지 않는다.
    return null;
  }
}

/** 필드가 전혀 없는 레거시만 unknown이다. 명시된 손상 값은 레거시로 숨기지 않는다. */
export function readStudioBg3dEffectiveModelSourceRestriction(record: {
  readonly sourceRestriction?: StudioBg3dModelSourceRestrictionV1;
}): StudioBg3dModelSourceRestrictionV1 {
  if (!plain(record)) throw new TypeError("모델 출처 제한을 읽을 수 있는 정본 record가 필요합니다.");
  const descriptor = Object.getOwnPropertyDescriptor(record, "sourceRestriction");
  if (!descriptor) {
    if ("sourceRestriction" in record) throw new TypeError("상속된 모델 출처 제한은 사용할 수 없습니다.");
    return EFFECTIVE_UNKNOWN;
  }
  if (!("value" in descriptor) || descriptor.enumerable !== true) throw new TypeError("모델 출처 제한은 own data 필드여야 합니다.");
  const parsed = parseStudioBg3dModelSourceRestriction(descriptor.value);
  if (!parsed) throw new TypeError("명시된 모델 출처 제한이 손상되었거나 지원되지 않습니다.");
  return parsed;
}

/** 입력 key 순서와 무관한 정본 JSON이다. 원본 객체의 toJSON이나 getter를 실행하지 않는다. */
export function fingerprintStudioBg3dModelSourceRestriction(value: StudioBg3dModelSourceRestrictionV1): string {
  const parsed = parseStudioBg3dModelSourceRestriction(value);
  if (!parsed) throw new TypeError("유효한 모델 출처 제한만 fingerprint로 만들 수 있습니다.");
  return JSON.stringify(parsed);
}

/** 최초 출처·제한은 유지하고 직전 actual record ID/hash만 기록한다. 권한을 새로 부여하지 않는다. */
export function inheritStudioBg3dModelSourceRestriction(parent: {
  readonly id: string;
  readonly contentHash: StudioBg3dModelSourceRestrictionHash;
  readonly sourceRestriction?: StudioBg3dModelSourceRestrictionV1;
}): StudioBg3dModelSourceRestrictionV1 {
  if (!plain(parent)) throw new TypeError("상속할 정본 모델 record가 필요합니다.");
  const id: unknown = data(parent, "id")?.value, contentHash: unknown = data(parent, "contentHash")?.value;
  if (!isSafeStudioBg3dModelSourceRestrictionRecordId(id) || !hash(contentHash)) {
    throw new TypeError("직전 모델의 actual record ID와 SHA-256이 필요합니다.");
  }
  const previous = readStudioBg3dEffectiveModelSourceRestriction(parent);
  return Object.freeze({ version: 1, modelFileExport: previous.modelFileExport, origin: previous.origin,
    parent: Object.freeze({ recordId: id, sha256: contentHash }) });
}
