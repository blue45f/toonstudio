import * as Y from "yjs";

import { isBoundedStudioCrdtId } from "./studio-crdt-identifiers";

export const STUDIO_CRDT_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
export const STUDIO_CRDT_SCENE_INDEX_ROOT = "scene-elements";
export const STUDIO_CRDT_PAGE_INDEX_ROOT = "studio-pages";
export const STUDIO_CRDT_LAYER_GROUP_INDEX_ROOT = "layer-groups";
export const STUDIO_CRDT_SCENE_ROOT_PREFIX = "scene-element:";
export const STUDIO_CRDT_PAGE_ROOT_PREFIX = "studio-page:";
export const STUDIO_CRDT_LAYER_GROUP_ROOT_PREFIX = "layer-group:";
export const STUDIO_CRDT_PAGE_ORDER_ROOT = "page-order";
export const STUDIO_CRDT_DELETION_OPS_ROOT = "studio-deletion-ops";
export const STUDIO_CRDT_DELETION_ACKS_ROOT = "studio-deletion-acks";
export const STUDIO_CRDT_PROPERTY_PREFIXES = ["base:", "prop:", "unset:"] as const;
export const STUDIO_CRDT_SCENE_PAYLOAD_MAX_BYTES = 16 * 1_024;
export const STUDIO_CRDT_PAGE_PAYLOAD_MAX_BYTES = 8 * 1_024;
export const STUDIO_CRDT_LAYER_GROUP_PAYLOAD_MAX_BYTES = 2 * 1_024;
export const STUDIO_CRDT_COLLECTION_MAX_ENTRIES = 100_000;
export const STUDIO_CRDT_LAYER_GROUP_MAX_ENTRIES = 4_096;
export const STUDIO_CRDT_ACTIVE_ORDER_ENTRY_MAX_COUNT = 256;
export const STUDIO_CRDT_JSON_MAX_DEPTH = 10;
export const STUDIO_CRDT_JSON_MAX_ENTRIES = 4_096;
export const STUDIO_CRDT_JSON_MAX_STRING_LENGTH = 64 * 1_024;
export const STUDIO_CRDT_MAX_COORDINATE = 10_000_000;
export const STUDIO_CRDT_DELETION_TARGET_MAX_LENGTH = 384;

const STUDIO_CRDT_TEXT_ENCODER = new TextEncoder();

export function hasOnlyKeys(value: Y.Map<unknown>, allowed: ReadonlySet<string>): boolean {
  for (const key of value.keys()) {
    if (!allowed.has(key)) return false;
  }
  return true;
}

export function materializeExistingMapRoot(
  doc: Y.Doc,
  rootName: string
): Y.Map<unknown> | null | undefined {
  if (!doc.share.has(rootName)) return undefined;
  try {
    return doc.getMap<unknown>(rootName);
  } catch {
    return null;
  }
}

export function materializeExistingArrayRoot(
  doc: Y.Doc,
  rootName: string
): Y.Array<unknown> | null | undefined {
  if (!doc.share.has(rootName)) return undefined;
  try {
    return doc.getArray<unknown>(rootName);
  } catch {
    return null;
  }
}

export function isBoundedJsonValue(
  value: unknown,
  state = { entries: 0, seen: new WeakSet<object>() },
  depth = 0
): boolean {
  if (depth > STUDIO_CRDT_JSON_MAX_DEPTH || ++state.entries > STUDIO_CRDT_JSON_MAX_ENTRIES) {
    return false;
  }
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") {
    return value.length <= STUDIO_CRDT_JSON_MAX_STRING_LENGTH && !value.includes("\0");
  }
  if (typeof value !== "object" || value instanceof Y.AbstractType || state.seen.has(value)) {
    return false;
  }
  state.seen.add(value);
  if (Array.isArray(value)) {
    return value.every((item) => isBoundedJsonValue(item, state, depth + 1));
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  for (const [key, item] of Object.entries(value)) {
    if (
      key.length === 0 ||
      key.length > 512 ||
      key.includes("\0") ||
      !isBoundedJsonValue(item, state, depth + 1)
    ) {
      return false;
    }
  }
  return true;
}

export function encodedJsonByteLength(value: unknown): number | null {
  try {
    return STUDIO_CRDT_TEXT_ENCODER.encode(JSON.stringify(value)).byteLength;
  } catch {
    return null;
  }
}

export function finiteNumberInRange(value: unknown, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function boundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum && !value.includes("\0");
}

export function boundedExactText(value: unknown, maximum: number): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || (codePoint >= 127 && codePoint <= 159)) return false;
  }
  return true;
}

export function isExactJsonObject(
  value: unknown,
  requiredKeys: ReadonlySet<string>
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const keys = Object.keys(value);
  return keys.length === requiredKeys.size && keys.every((key) => requiredKeys.has(key));
}

export function hasOnlyJsonKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>
): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

export function readReservedProperties(
  record: Y.Map<unknown>,
  allowedProperties: ReadonlySet<string>,
  metadataKeys: ReadonlySet<string>
): Record<string, unknown> | null {
  const baseline: Record<string, unknown> = {};
  const properties: Record<string, unknown> = {};
  const unset = new Set<string>();
  for (const [key, value] of record) {
    if (metadataKeys.has(key)) continue;
    const prefix = STUDIO_CRDT_PROPERTY_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (!prefix) return null;
    const property = key.slice(prefix.length);
    if (!allowedProperties.has(property)) return null;
    if (prefix === "unset:") {
      if (typeof value !== "boolean") return null;
      if (value) unset.add(property);
      continue;
    }
    if (!isBoundedJsonValue(value) || (property === "frameClipId" && !isBoundedStudioCrdtId(value))) return null;
    if (prefix === "base:") baseline[property] = value;
    else properties[property] = value;
  }
  const effective = { ...baseline, ...properties };
  for (const property of unset) delete effective[property];
  // The browser validates the effective payload as one JSON tree after resolving base/prop/unset.
  // Re-validating the whole object here is essential: validating each property with a fresh entry
  // counter would allow several individually-small values to exceed the shared 4,096-entry limit
  // and create a durable document that every conforming client refuses to materialize.
  return isBoundedJsonValue(effective) ? effective : null;
}

export function canonicalReservedRootId(rootName: string, prefix: string): string | null {
  if (!rootName.startsWith(prefix)) return null;
  const encodedId = rootName.slice(prefix.length);
  if (encodedId.length === 0) return null;
  try {
    const id = decodeURIComponent(encodedId);
    return isBoundedStudioCrdtId(id) && encodeURIComponent(id) === encodedId ? id : null;
  } catch {
    return null;
  }
}
