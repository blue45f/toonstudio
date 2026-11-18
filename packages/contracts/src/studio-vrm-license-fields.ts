/**
 * Renderer-neutral VRM license metadata admission.
 *
 * This module intentionally reads only the already-decoded glTF JSON extension. It does not load
 * model bytes, execute third-party code, or infer permission from a file name. The normalized DTO
 * follows the VRM Consortium's VRM 0.x and VRM 1.0 metadata fields and keeps the declared tokens in
 * `rawIntent` so a later audit can distinguish an omitted default from malformed input.
 */

export const STUDIO_VRM_LICENSE_METADATA_LIMITS = Object.freeze({
  maxMetadataJsonBytes: 64 * 1024,
  maxDepth: 8,
  maxContainers: 64,
  maxEntries: 256,
  maxArrayItems: 128,
  maxStringBytes: 4 * 1024,
  maxKeyBytes: 256,
  maxAuthors: 32,
  maxDiagnostics: 32,
});

export const STUDIO_VRM_1_PUBLIC_LICENSE_URL = "https://vrm.dev/licenses/1.0/";
export const STUDIO_VRM_CC0_1_LICENSE_URL =
  "https://creativecommons.org/publicdomain/zero/1.0/";
export const STUDIO_VRM_CC_BY_4_LICENSE_URL =
  "https://creativecommons.org/licenses/by/4.0/";
export const STUDIO_VRM_CC_BY_NC_4_LICENSE_URL =
  "https://creativecommons.org/licenses/by-nc/4.0/";

export type StudioVrmLicenseSpec = "vrm0" | "vrm1";
export type StudioVrmCommercialPermission =
  | "allow"
  | "disallow"
  | "personal-nonprofit"
  | "personal-profit"
  | "corporation"
  | "unknown";
export type StudioVrmModificationPermission =
  | "prohibited"
  | "allow-modification"
  | "allow-modification-redistribution"
  | "unknown";
export type StudioVrmBinaryPermission = "allow" | "disallow" | "unknown";
export type StudioVrmCreditPermission = "required" | "unnecessary" | "unknown";
export type StudioVrmShareAlikePermission = "required" | "not-required" | "unknown";
export type StudioVrmAvatarPermission =
  | "only-author"
  | "only-separately-licensed-person"
  | "everyone"
  | "unknown";

export type StudioVrmLicenseDiagnosticCode =
  | "missing-required-field"
  | "invalid-field-type"
  | "invalid-field-value"
  | "invalid-url"
  | "unsupported-license-document"
  | "conflicting-license-declarations";

export interface StudioVrmLicenseDiagnostic {
  readonly severity: "warning" | "error";
  readonly code: StudioVrmLicenseDiagnosticCode;
  readonly path: string;
  readonly message: string;
}

/** Selected declarations exactly as they occurred in the bounded metadata object. */
export interface StudioVrmLicenseRawIntent {
  readonly title: string | null;
  readonly authors: readonly string[] | null;
  readonly licenseUrl: string | null;
  readonly otherLicenseUrl: string | null;
  readonly otherPermissionUrl: string | null;
  readonly legacyLicenseName: string | null;
  readonly avatarPermission: string | null;
  readonly commercial: string | null;
  readonly modification: string | null;
  readonly redistribution: boolean | string | null;
  readonly credit: string | null;
  readonly violent: boolean | string | null;
  readonly sexual: boolean | string | null;
  readonly politicalOrReligious: boolean | string | null;
  readonly antisocialOrHate: boolean | string | null;
  readonly thirdPartyLicenses: string | null;
}

/**
 * Plain, deterministic JSON data suitable for canonical serialization and a caller-owned hash.
 * No `undefined`, Date, URL, Map, Set, class instance, or mutable nested value is admitted.
 */
export interface StudioVrmLicenseMetadataReceipt {
  readonly schema: "toonstudio.vrm-license-metadata";
  readonly version: 1;
  readonly spec: StudioVrmLicenseSpec;
  readonly sourcePath: "extensions.VRM.meta" | "extensions.VRMC_vrm.meta";
  readonly declaredSpecVersion: string | null;
  readonly conformance: "conformant" | "nonconformant";
  readonly metadataJsonBytes: number;
  readonly title: string | null;
  readonly authors: readonly string[];
  readonly licenseIdentifier: string | null;
  readonly licenseUrl: string | null;
  readonly additionalLicenseUrl: string | null;
  readonly additionalPermissionUrl: string | null;
  readonly avatarPermission: StudioVrmAvatarPermission;
  readonly commercial: StudioVrmCommercialPermission;
  readonly modification: StudioVrmModificationPermission;
  readonly redistribution: StudioVrmBinaryPermission;
  readonly credit: StudioVrmCreditPermission;
  readonly violent: StudioVrmBinaryPermission;
  readonly sexual: StudioVrmBinaryPermission;
  readonly politicalOrReligious: StudioVrmBinaryPermission;
  readonly antisocialOrHate: StudioVrmBinaryPermission;
  readonly thirdPartyLicenses: string | null;
  readonly shareAlike: StudioVrmShareAlikePermission;
  readonly rawIntent: StudioVrmLicenseRawIntent;
  readonly diagnostics: readonly StudioVrmLicenseDiagnostic[];
}

export type StudioVrmLicenseMetadataFailureCode =
  | "invalid-root"
  | "unsafe-container"
  | "missing-metadata"
  | "ambiguous-metadata"
  | "metadata-not-json"
  | "metadata-budget-exceeded";

export type StudioVrmLicenseMetadataParseResult =
  | {
      readonly ok: true;
      readonly receipt: StudioVrmLicenseMetadataReceipt;
    }
  | {
      readonly ok: false;
      readonly code: StudioVrmLicenseMetadataFailureCode;
      readonly message: string;
    };

export type JsonRecord = Record<string, unknown>;

export class MetadataAdmissionError extends Error {
  readonly code: StudioVrmLicenseMetadataFailureCode;

  constructor(code: StudioVrmLicenseMetadataFailureCode, message: string) {
    super(message);
    this.name = "MetadataAdmissionError";
    this.code = code;
  }
}

export const TEXT_ENCODER = new TextEncoder();
export const LEGACY_LICENSE_NAMES = new Set([
  "Redistribution_Prohibited",
  "CC0",
  "CC_BY",
  "CC_BY_NC",
  "CC_BY_SA",
  "CC_BY_NC_SA",
  "CC_BY_ND",
  "CC_BY_NC_ND",
  "Other",
]);

type StudioVrmCanonicalCreativeCommonsLicense = Readonly<{
  identifier: "CC0" | "CC_BY" | "CC_BY_NC";
  url: string;
  commercial: StudioVrmCommercialPermission;
  modification: StudioVrmModificationPermission;
  redistribution: StudioVrmBinaryPermission;
  credit: StudioVrmCreditPermission;
  shareAlike: StudioVrmShareAlikePermission;
}>;

const STUDIO_VRM_CANONICAL_CREATIVE_COMMONS_LICENSES = new Map<
  string,
  StudioVrmCanonicalCreativeCommonsLicense
>([
  [
    STUDIO_VRM_CC0_1_LICENSE_URL,
    Object.freeze({
      identifier: "CC0",
      url: STUDIO_VRM_CC0_1_LICENSE_URL,
      commercial: "allow",
      modification: "allow-modification-redistribution",
      redistribution: "allow",
      credit: "unnecessary",
      shareAlike: "not-required",
    }),
  ],
  [
    STUDIO_VRM_CC_BY_4_LICENSE_URL,
    Object.freeze({
      identifier: "CC_BY",
      url: STUDIO_VRM_CC_BY_4_LICENSE_URL,
      commercial: "allow",
      modification: "allow-modification-redistribution",
      redistribution: "allow",
      credit: "required",
      shareAlike: "not-required",
    }),
  ],
  [
    STUDIO_VRM_CC_BY_NC_4_LICENSE_URL,
    Object.freeze({
      identifier: "CC_BY_NC",
      url: STUDIO_VRM_CC_BY_NC_4_LICENSE_URL,
      commercial: "disallow",
      modification: "allow-modification-redistribution",
      redistribution: "allow",
      credit: "required",
      shareAlike: "not-required",
    }),
  ],
]);

export function explicitVrm1CreativeCommonsLicense(
  mandatoryLicenseUrl: string | null,
  otherLicenseUrl: string | null,
): StudioVrmCanonicalCreativeCommonsLicense | null {
  if (mandatoryLicenseUrl !== STUDIO_VRM_1_PUBLIC_LICENSE_URL || !otherLicenseUrl) return null;
  return STUDIO_VRM_CANONICAL_CREATIVE_COMMONS_LICENSES.get(otherLicenseUrl) ?? null;
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function fail(
  code: StudioVrmLicenseMetadataFailureCode,
  message: string
): StudioVrmLicenseMetadataParseResult {
  return deepFreeze({ ok: false as const, code, message });
}

export function isPlainRecord(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function boundedRecord(value: unknown, path: string): JsonRecord {
  if (!isPlainRecord(value)) {
    throw new MetadataAdmissionError("unsafe-container", `${path} must be a plain JSON object.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxEntries) {
    throw new MetadataAdmissionError(
      "metadata-budget-exceeded",
      `${path} exceeds the object-entry budget.`
    );
  }
  for (const key of keys) {
    if (typeof key !== "string") {
      throw new MetadataAdmissionError("metadata-not-json", `${path} contains a symbol key.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !("value" in descriptor)) {
      throw new MetadataAdmissionError(
        "metadata-not-json",
        `${path}.${key} is not an enumerable JSON data property.`
      );
    }
  }
  return value;
}

export function ownValue(record: JsonRecord, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function jsonStringBytes(value: string): number {
  return TEXT_ENCODER.encode(JSON.stringify(value)).byteLength;
}

/** Validates the whole selected meta object without serializing it into one monolithic string. */
export function inspectMetadataJson(value: unknown): number {
  const pending: Array<{ readonly value: unknown; readonly depth: number }> = [
    { value, depth: 0 },
  ];
  const seen = new WeakSet<object>();
  let containers = 0;
  let entries = 0;
  let bytes = 0;

  const addBytes = (amount: number): void => {
    bytes += amount;
    if (bytes > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxMetadataJsonBytes) {
      throw new MetadataAdmissionError(
        "metadata-budget-exceeded",
        "VRM license metadata exceeds the canonical JSON byte budget."
      );
    }
  };

  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.depth > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxDepth) {
      throw new MetadataAdmissionError(
        "metadata-budget-exceeded",
        "VRM license metadata exceeds the nesting-depth budget."
      );
    }
    if (current.value === null) {
      addBytes(4);
      continue;
    }
    if (typeof current.value === "boolean") {
      addBytes(current.value ? 4 : 5);
      continue;
    }
    if (typeof current.value === "number") {
      if (!Number.isFinite(current.value)) {
        throw new MetadataAdmissionError(
          "metadata-not-json",
          "VRM license metadata contains a non-finite number."
        );
      }
      addBytes(TEXT_ENCODER.encode(JSON.stringify(current.value)).byteLength);
      continue;
    }
    if (typeof current.value === "string") {
      if (
        TEXT_ENCODER.encode(current.value).byteLength
        > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxStringBytes
      ) {
        throw new MetadataAdmissionError(
          "metadata-budget-exceeded",
          "VRM license metadata contains an over-budget string."
        );
      }
      addBytes(jsonStringBytes(current.value));
      continue;
    }
    if (typeof current.value !== "object") {
      throw new MetadataAdmissionError(
        "metadata-not-json",
        "VRM license metadata contains a non-JSON value."
      );
    }
    if (seen.has(current.value)) {
      throw new MetadataAdmissionError(
        "metadata-not-json",
        "VRM license metadata contains a cyclic or shared object reference."
      );
    }
    seen.add(current.value);
    containers += 1;
    if (containers > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxContainers) {
      throw new MetadataAdmissionError(
        "metadata-budget-exceeded",
        "VRM license metadata exceeds the container-count budget."
      );
    }

    if (Array.isArray(current.value)) {
      if (current.value.length > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxArrayItems) {
        throw new MetadataAdmissionError(
          "metadata-budget-exceeded",
          "VRM license metadata exceeds the array-item budget."
        );
      }
      const keys = Reflect.ownKeys(current.value);
      if (keys.some((key) => key !== "length" && (
        typeof key !== "string" || !/^(?:0|[1-9]\d*)$/u.test(key)
      ))) {
        throw new MetadataAdmissionError(
          "metadata-not-json",
          "VRM license metadata array contains a non-index property."
        );
      }
      for (let index = 0; index < current.value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(current.value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new MetadataAdmissionError(
            "metadata-not-json",
            "VRM license metadata contains a sparse or accessor-backed array entry."
          );
        }
        pending.push({ value: descriptor.value, depth: current.depth + 1 });
      }
      entries += current.value.length;
      addBytes(2 + Math.max(0, current.value.length - 1));
    } else {
      const record = boundedRecord(current.value, "VRM metadata");
      const keys = Object.keys(record);
      entries += keys.length;
      addBytes(2 + Math.max(0, keys.length - 1));
      for (const key of keys) {
        if (TEXT_ENCODER.encode(key).byteLength > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxKeyBytes) {
          throw new MetadataAdmissionError(
            "metadata-budget-exceeded",
            "VRM license metadata contains an over-budget object key."
          );
        }
        addBytes(jsonStringBytes(key) + 1);
        pending.push({ value: record[key], depth: current.depth + 1 });
      }
    }
    if (entries > STUDIO_VRM_LICENSE_METADATA_LIMITS.maxEntries) {
      throw new MetadataAdmissionError(
        "metadata-budget-exceeded",
        "VRM license metadata exceeds the total-entry budget."
      );
    }
  }
  return bytes;
}

export function rawString(record: JsonRecord, key: string): string | null {
  const value = ownValue(record, key);
  return typeof value === "string" ? value : null;
}

export function rawBooleanOrString(record: JsonRecord, key: string): boolean | string | null {
  const value = ownValue(record, key);
  return typeof value === "boolean" || typeof value === "string" ? value : null;
}

export function rawStringArray(record: JsonRecord, key: string): readonly string[] | null {
  const value = ownValue(record, key);
  if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === "string")) {
    return null;
  }
  return Object.freeze([...value]);
}

export function normalizeDisplayText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint <= 0x1f
      || (codePoint >= 0x7f && codePoint <= 0x9f)
      || /\p{Cf}/u.test(character)
    ) return null;
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!normalized || TEXT_ENCODER.encode(normalized).byteLength > 512) return null;
  return normalized;
}

export function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    parsed.hash = "";
    const normalized = parsed.toString();
    return TEXT_ENCODER.encode(normalized).byteLength <= 2_048 ? normalized : null;
  } catch {
    return null;
  }
}

export function createDiagnosticWriter(): {
  readonly diagnostics: StudioVrmLicenseDiagnostic[];
  readonly add: (
    severity: StudioVrmLicenseDiagnostic["severity"],
    code: StudioVrmLicenseDiagnosticCode,
    path: string,
    message: string
  ) => void;
} {
  const diagnostics: StudioVrmLicenseDiagnostic[] = [];
  return {
    diagnostics,
    add(severity, code, path, message) {
      if (diagnostics.length >= STUDIO_VRM_LICENSE_METADATA_LIMITS.maxDiagnostics) return;
      diagnostics.push({ severity, code, path, message });
    },
  };
}

export function validateOptionalUrl(
  meta: JsonRecord,
  key: string,
  path: string,
  add: ReturnType<typeof createDiagnosticWriter>["add"]
): string | null {
  const raw = ownValue(meta, key);
  if (raw === undefined) return null;
  const url = normalizeHttpUrl(raw);
  if (!url) {
    add("error", typeof raw === "string" ? "invalid-url" : "invalid-field-type", path,
      `${path} must be an absolute HTTP(S) URL.`);
  }
  return url;
}

export function validateEnum<T extends string>(
  meta: JsonRecord,
  key: string,
  allowed: ReadonlySet<string>,
  path: string,
  add: ReturnType<typeof createDiagnosticWriter>["add"]
): T | null {
  const value = ownValue(meta, key);
  if (value === undefined) return null;
  if (typeof value !== "string") {
    add("error", "invalid-field-type", path, `${path} must be a string enum value.`);
    return null;
  }
  if (!allowed.has(value)) {
    add("error", "invalid-field-value", path, `${path} contains an unknown enum value.`);
    return null;
  }
  return value as T;
}

export function validateBoolean(
  meta: JsonRecord,
  key: string,
  path: string,
  add: ReturnType<typeof createDiagnosticWriter>["add"]
): boolean | null {
  const value = ownValue(meta, key);
  if (value === undefined) return null;
  if (typeof value !== "boolean") {
    add("error", "invalid-field-type", path, `${path} must be a boolean.`);
    return null;
  }
  return value;
}

export function validateOptionalLicenseText(
  meta: JsonRecord,
  key: string,
  path: string,
  add: ReturnType<typeof createDiagnosticWriter>["add"],
): string | null {
  const value = ownValue(meta, key);
  if (value === undefined) return null;
  if (typeof value !== "string") {
    add("error", "invalid-field-type", path, `${path} must be a string.`);
    return null;
  }
  const normalized = value
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .trim();
  if (!normalized) return null;
  for (const character of normalized) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      (codePoint <= 0x1f && codePoint !== 0x09 && codePoint !== 0x0a)
      || (codePoint >= 0x7f && codePoint <= 0x9f)
      || /\p{Cf}/u.test(character)
    ) {
      add("error", "invalid-field-value", path, `${path} contains unsafe control text.`);
      return null;
    }
  }
  return normalized;
}
