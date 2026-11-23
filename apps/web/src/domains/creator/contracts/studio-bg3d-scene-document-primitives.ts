/**
 * Studio BG3D 씬 문서 정규화의 공통 원시 유틸리티·경계 JSON 디코더·구조 동등성 검사.
 */
import { assertStudioBg3dSceneMeasurementsInput, StudioBg3dSceneMeasurementsValidationError } from "./studio-bg3d-hierarchy";
import {
  STUDIO_BG3D_SCENE_DOCUMENT_KIND,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  STUDIO_BG3D_SIX_PASS_SCENE_DOCUMENT_VERSION,
  StudioBg3dSceneDocumentBudgetError,
  failBudget,
} from "./studio-bg3d-scene-document-constants";

import type {
  BudgetFailureMode,
  StudioBg3dQualityProfile,
  StudioBg3dVec3,
} from "../bg3d/studio-bg3d-scene-document-types";

const DEFAULT_ROTATION: StudioBg3dVec3 = [0, 0, 0];
const DEFAULT_SCALE: StudioBg3dVec3 = [1, 1, 1];
export const MAX_WORLD_COORDINATE = 10_000;
const MIN_SCALE = 0.001;
const MAX_SCALE = 1_000;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,79}$/u;
const HEX_COLOR_PATTERN = /^#[a-f0-9]{6}$/iu;
const FORBIDDEN_ID_SET = new Set(["constructor", "prototype", "__proto__"]);
const SHADOW_MAP_SIZES = [256, 512, 1024, 2048, 4096] as const;
const UTF8_ENCODER = new TextEncoder();

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/** Persistence requires every root section even though the public normalizer is lenient. */
export function hasCompleteRootShapeForVersion(
  value: unknown,
  version: number,
): value is Record<string, unknown> & { readonly nodes: readonly unknown[] } {
  return (
    isRecord(value) &&
    value.kind === STUDIO_BG3D_SCENE_DOCUMENT_KIND &&
    value.version === version &&
    isRecord(value.camera) &&
    isRecord(value.render) &&
    isRecord(value.background) &&
    isRecord(value.lighting) &&
    isRecord(value.quality) &&
    isRecord(value.output) &&
    isRecord(value.budgets) &&
    Array.isArray(value.attachments) &&
    Array.isArray(value.nodes)
  );
}

export function hasCompleteCurrentRootShape(
  value: unknown,
): value is Record<string, unknown> & { readonly nodes: readonly unknown[] } {
  return hasCompleteRootShapeForVersion(value, STUDIO_BG3D_SCENE_DOCUMENT_VERSION)
    || hasCompleteRootShapeForVersion(value, STUDIO_BG3D_SIX_PASS_SCENE_DOCUMENT_VERSION);
}

export function isExplicitUnversionedLegacyRoot(
  value: unknown,
): value is Record<string, unknown> & { readonly primitives: readonly unknown[] } {
  return (
    isRecord(value) &&
    !hasOwn(value, "kind") &&
    !hasOwn(value, "version") && !hasOwn(value, "measurements") &&
    value.tool === "bg3d" &&
    Array.isArray(value.primitives) &&
    (value.customModels === undefined || Array.isArray(value.customModels)) &&
    (value.attachments === undefined || Array.isArray(value.attachments))
  );
}

export function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

export function decodeBoundedJson(
  raw: unknown,
  budgetFailureMode: BudgetFailureMode = "null",
): unknown | null {
  try {
    if (typeof raw === "string") {
      if (utf8ByteLength(raw) > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES) {
        if (budgetFailureMode === "throw") failBudget("input-byte-budget-exceeded");
        return null;
      }
      return JSON.parse(raw) as unknown;
    }
    assertStudioBg3dSceneMeasurementsInput(raw);
    const serialized = JSON.stringify(raw);
    if (
      typeof serialized !== "string" ||
      utf8ByteLength(serialized) > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
    ) {
      if (
        budgetFailureMode === "throw" &&
        typeof serialized === "string" &&
        utf8ByteLength(serialized) > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES
      ) {
        failBudget("input-byte-budget-exceeded");
      }
      return null;
    }
    // Reparse to detach prototypes, accessors, symbols, functions, and non-JSON object identity.
    return JSON.parse(serialized) as unknown;
  } catch (cause) {
    if (
      cause instanceof StudioBg3dSceneDocumentBudgetError
      || (cause instanceof StudioBg3dSceneMeasurementsValidationError && budgetFailureMode === "throw")
    ) throw cause;
    return null;
  }
}

export function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

/**
 * Compares detached JSON graphs without depending on object-key insertion order. Persistence uses
 * this after normalization so a current-version document is accepted only when normalization is
 * lossless: unknown keys, missing nested fields, invalid children, duplicate ids/hashes, clamped
 * values, and byte-budget truncation all fail closed instead of being silently rewritten.
 */
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
  for (let index = 0; index < leftKeys.length; index += 1) {
    const key = leftKeys[index];
    if (key !== rightKeys[index] || !jsonStructuresEqual(left[key], right[key])) return false;
  }
  return true;
}

export function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

export function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

export function normalizedBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizedEnum<Value extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  fallback: Value,
): Value {
  return typeof value === "string" && allowed.has(value) ? (value as Value) : fallback;
}

export function normalizedColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value)
    ? value.toLowerCase()
    : fallback;
}

export function normalizedId(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !ID_PATTERN.test(value) ||
    FORBIDDEN_ID_SET.has(value.toLowerCase())
  ) {
    return null;
  }
  return value;
}

export function normalizedVec3(
  value: unknown,
  fallback: StudioBg3dVec3,
  minimum: number,
  maximum: number,
): StudioBg3dVec3 {
  if (!Array.isArray(value) || value.length !== 3) return [...fallback] as StudioBg3dVec3;
  return [
    boundedNumber(value[0], fallback[0], minimum, maximum),
    boundedNumber(value[1], fallback[1], minimum, maximum),
    boundedNumber(value[2], fallback[2], minimum, maximum),
  ];
}

export function normalizedRotation(value: unknown): StudioBg3dVec3 {
  const rotation = normalizedVec3(value, DEFAULT_ROTATION, -Number.MAX_VALUE, Number.MAX_VALUE);
  return rotation.map((angle) => {
    if (!Number.isFinite(angle)) return 0;
    const wrapped = ((angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    return wrapped - Math.PI;
  }) as unknown as StudioBg3dVec3;
}

export function normalizedScale(value: unknown): StudioBg3dVec3 {
  return normalizedVec3(value, DEFAULT_SCALE, MIN_SCALE, MAX_SCALE);
}

export function normalizedDirection(value: unknown, fallback: StudioBg3dVec3): StudioBg3dVec3 {
  const direction = normalizedVec3(value, fallback, -1_000, 1_000);
  const length = Math.hypot(direction[0], direction[1], direction[2]);
  if (!Number.isFinite(length) || length < 0.000_001) {
    const fallbackLength = Math.hypot(fallback[0], fallback[1], fallback[2]);
    return [fallback[0] / fallbackLength, fallback[1] / fallbackLength, fallback[2] / fallbackLength];
  }
  // Canonical documents already contain unit directions. Dividing a nearly-unit IEEE-754 vector
  // on every parse introduces last-bit drift, so preserve it once it is within a strict tolerance.
  if (Math.abs(length - 1) <= 1e-12) return direction;
  return [direction[0] / length, direction[1] / length, direction[2] / length];
}

export function normalizedShadowMapSize(
  value: unknown,
  fallback: StudioBg3dQualityProfile["shadowMapSize"],
): StudioBg3dQualityProfile["shadowMapSize"] {
  return typeof value === "number" && SHADOW_MAP_SIZES.includes(value as never)
    ? (value as StudioBg3dQualityProfile["shadowMapSize"])
    : fallback;
}
