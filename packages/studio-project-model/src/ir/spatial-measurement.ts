/**
 * 렌더러 중립 공간 측정 문서 정본. 도구의 추론·포인터·렌더링 없이 저장 계약만 소유한다.
 * 기존 BG3D 저장 파일과 호환하도록 wire kind·버전·키 순서·기본 단위를 유지한다.
 */
export type StudioSpatialMeasurementVec3 = readonly [number, number, number];
export type StudioSpatialMeasurementUnit = "mm" | "cm" | "m";

export const STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_KIND = "toonstudio.bg3d-measurements" as const;
export const STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_VERSION = 1 as const;
export const STUDIO_SPATIAL_MEASUREMENT_MAX_WORLD_COORDINATE = 10_000;
export const STUDIO_SPATIAL_MEASUREMENT_MAX_GUIDES = 256;
export const STUDIO_SPATIAL_MEASUREMENT_MAX_BYTES = 64 * 1024;
export const STUDIO_SPATIAL_MEASUREMENT_GUIDE_ID_MAX_LENGTH = 80;
export const STUDIO_SPATIAL_MEASUREMENT_MIN_SEGMENT_METERS = 1e-9;
export const STUDIO_SPATIAL_MEASUREMENT_MIN_LOCKED_LENGTH_METERS = 1e-6;
export const STUDIO_SPATIAL_MEASUREMENT_MAX_LOCKED_LENGTH_METERS =
  STUDIO_SPATIAL_MEASUREMENT_MAX_WORLD_COORDINATE * Math.sqrt(12);

export interface StudioSpatialMeasurementGuide {
  readonly id: string;
  readonly kind: "distance";
  readonly startWorld: StudioSpatialMeasurementVec3;
  readonly endWorld: StudioSpatialMeasurementVec3;
  /** null은 자유 측정이며, 숫자 잠금은 두 끝점의 실제 거리와 일치해야 한다. */
  readonly lockedLengthMeters: number | null;
  readonly visible: boolean;
}

export interface StudioSpatialMeasurementDocument {
  readonly kind: typeof STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_KIND;
  readonly version: typeof STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_VERSION;
  readonly unit: StudioSpatialMeasurementUnit;
  readonly guides: readonly StudioSpatialMeasurementGuide[];
}

const GUIDE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:~-]{0,79}$/u;
const FORBIDDEN_ID_SET = new Set(["__proto__", "constructor", "prototype"]);
const UTF8_ENCODER = new TextEncoder();

export function isStudioSpatialMeasurementGuideId(value: unknown): value is string {
  return typeof value === "string"
    && value.length <= STUDIO_SPATIAL_MEASUREMENT_GUIDE_ID_MAX_LENGTH
    && GUIDE_ID_PATTERN.test(value)
    && !FORBIDDEN_ID_SET.has(value.toLowerCase());
}

export function isStudioSpatialMeasurementUnit(value: unknown): value is StudioSpatialMeasurementUnit {
  return value === "mm" || value === "cm" || value === "m";
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return !!descriptor && "value" in descriptor && descriptor.enumerable;
  });
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function canonicalNumber(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

function readPoint(value: unknown): StudioSpatialMeasurementVec3 | null {
  if (!Array.isArray(value) || value.length !== 3 || "toJSON" in value) return null;
  const point: [number, number, number] = [0, 0, 0];
  for (const index of [0, 1, 2] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !("value" in descriptor)) return null;
    const coordinate: unknown = descriptor.value;
    if (typeof coordinate !== "number" || !Number.isFinite(coordinate)
      || Math.abs(coordinate) > STUDIO_SPATIAL_MEASUREMENT_MAX_WORLD_COORDINATE) return null;
    point[index] = canonicalNumber(coordinate);
  }
  return Object.freeze(point);
}

function canonicalGuide(value: unknown): StudioSpatialMeasurementGuide | null {
  if (!isPlainDataRecord(value) || !hasExactKeys(value, [
    "endWorld", "id", "kind", "lockedLengthMeters", "startWorld", "visible",
  ]) || !isStudioSpatialMeasurementGuideId(value.id) || value.kind !== "distance"
    || typeof value.visible !== "boolean") return null;
  const startWorld = readPoint(value.startWorld);
  const endWorld = readPoint(value.endWorld);
  if (!startWorld || !endWorld) return null;
  const distanceMeters = Math.hypot(
    endWorld[0] - startWorld[0], endWorld[1] - startWorld[1], endWorld[2] - startWorld[2],
  );
  if (!Number.isFinite(distanceMeters) || distanceMeters < STUDIO_SPATIAL_MEASUREMENT_MIN_SEGMENT_METERS) return null;
  const lockedLengthMeters = value.lockedLengthMeters;
  if (lockedLengthMeters !== null) {
    if (typeof lockedLengthMeters !== "number" || !Number.isFinite(lockedLengthMeters)
      || lockedLengthMeters < STUDIO_SPATIAL_MEASUREMENT_MIN_LOCKED_LENGTH_METERS
      || lockedLengthMeters > STUDIO_SPATIAL_MEASUREMENT_MAX_LOCKED_LENGTH_METERS) return null;
    const tolerance = Math.max(1e-9, distanceMeters * 1e-9);
    if (Math.abs(lockedLengthMeters - distanceMeters) > tolerance) return null;
  }
  return Object.freeze({ id: value.id, kind: "distance" as const, startWorld, endWorld, lockedLengthMeters, visible: value.visible });
}

/** 완전한 정규형만 받으며 호출자의 객체와 배열을 변경하지 않는다. */
export function canonicalizeStudioSpatialMeasurementGuide(value: unknown): StudioSpatialMeasurementGuide | null {
  try {
    return canonicalGuide(value);
  } catch {
    return null;
  }
}

/**
 * 편집 mutation과 저장이 공유하는 구조 검증. 삭제로 초과 문서를 복구할 수 있도록 바이트 예산은
 * parse/serialize 저장 경계에서 따로 강제한다. 개수·값·중복·sparse 배열·JSON hook은 여기서 거부한다.
 */
export function canonicalizeStudioSpatialMeasurementDocument(value: unknown): StudioSpatialMeasurementDocument | null {
  try {
    if (!isPlainDataRecord(value) || !hasExactKeys(value, ["guides", "kind", "unit", "version"])
      || value.kind !== STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_KIND
      || value.version !== STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_VERSION
      || !isStudioSpatialMeasurementUnit(value.unit) || !Array.isArray(value.guides)
      || "toJSON" in value.guides || value.guides.length > STUDIO_SPATIAL_MEASUREMENT_MAX_GUIDES) return null;
    const guides: StudioSpatialMeasurementGuide[] = [];
    const ids = new Set<string>();
    for (let index = 0; index < value.guides.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value.guides, String(index));
      if (!descriptor || !("value" in descriptor)) return null;
      const guide = canonicalGuide(descriptor.value);
      if (!guide || ids.has(guide.id)) return null;
      ids.add(guide.id);
      guides.push(guide);
    }
    return Object.freeze({
      kind: STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_KIND,
      version: STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_VERSION,
      unit: value.unit,
      guides: Object.freeze(guides),
    });
  } catch {
    return null;
  }
}

export function createStudioSpatialMeasurementDocument(
  unit: StudioSpatialMeasurementUnit = "m",
): StudioSpatialMeasurementDocument {
  return Object.freeze({
    kind: STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_KIND,
    version: STUDIO_SPATIAL_MEASUREMENT_DOCUMENT_VERSION,
    unit: isStudioSpatialMeasurementUnit(unit) ? unit : "m",
    guides: Object.freeze([]),
  });
}

export const DEFAULT_STUDIO_SPATIAL_MEASUREMENT_DOCUMENT = createStudioSpatialMeasurementDocument();
export const DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS = createStudioSpatialMeasurementDocument("cm");

export function serializeStudioSpatialMeasurementDocument(raw: unknown): string | null {
  const document = canonicalizeStudioSpatialMeasurementDocument(raw);
  if (!document) return null;
  try {
    const serialized = JSON.stringify(document);
    return UTF8_ENCODER.encode(serialized).byteLength <= STUDIO_SPATIAL_MEASUREMENT_MAX_BYTES ? serialized : null;
  } catch {
    return null;
  }
}

export function parseStudioSpatialMeasurementDocument(raw: string): StudioSpatialMeasurementDocument | null {
  if (typeof raw !== "string" || UTF8_ENCODER.encode(raw).byteLength > STUDIO_SPATIAL_MEASUREMENT_MAX_BYTES) return null;
  try {
    const document = canonicalizeStudioSpatialMeasurementDocument(JSON.parse(raw) as unknown);
    return document && UTF8_ENCODER.encode(JSON.stringify(document)).byteLength <= STUDIO_SPATIAL_MEASUREMENT_MAX_BYTES ? document : null;
  } catch {
    return null;
  }
}
