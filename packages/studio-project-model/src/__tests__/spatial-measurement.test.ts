import { describe, expect, it } from "vitest";

import {
  canonicalizeStudioSpatialMeasurementDocument,
  canonicalizeStudioSpatialMeasurementGuide,
  createStudioSpatialMeasurementDocument,
  DEFAULT_STUDIO_SPATIAL_MEASUREMENT_DOCUMENT,
  DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS,
  parseStudioSpatialMeasurementDocument,
  serializeStudioSpatialMeasurementDocument,
  STUDIO_SPATIAL_MEASUREMENT_MAX_BYTES,
  STUDIO_SPATIAL_MEASUREMENT_MAX_GUIDES,
  type StudioSpatialMeasurementDocument,
  type StudioSpatialMeasurementGuide,
} from "../ir/spatial-measurement";

const encoder = new TextEncoder();
const LEGACY_JSON = '{"kind":"toonstudio.bg3d-measurements","version":1,"unit":"cm","guides":[{"id":"measure-guide-0001","kind":"distance","startWorld":[1,2,3],"endWorld":[4,6,3],"lockedLengthMeters":5,"visible":false}]}';

function guide(index = 1): StudioSpatialMeasurementGuide {
  return {
    id: `measure-guide-${String(index).padStart(4, "0")}`,
    kind: "distance", startWorld: [1, 2, 3], endWorld: [4, 6, 3],
    lockedLengthMeters: 5, visible: false,
  };
}

function document(guides: readonly StudioSpatialMeasurementGuide[] = [guide()]): StudioSpatialMeasurementDocument {
  return { ...createStudioSpatialMeasurementDocument("cm"), guides };
}

describe("공간 측정 문서 정본", () => {
  it("기존 BG3D wire kind·버전·키 순서·잠금·숨김을 같은 바이트로 왕복한다", () => {
    expect(serializeStudioSpatialMeasurementDocument(document())).toBe(LEGACY_JSON);
    const parsed = parseStudioSpatialMeasurementDocument(LEGACY_JSON);
    expect(parsed).toEqual(document());
    expect(serializeStudioSpatialMeasurementDocument(parsed)).toBe(LEGACY_JSON);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed?.guides)).toBe(true);
    expect(Object.isFrozen(parsed?.guides[0]?.startWorld)).toBe(true);
  });

  it("도구의 m 기본값과 장면의 cm 기본값을 안정적인 frozen 정본으로 구분한다", () => {
    expect(DEFAULT_STUDIO_SPATIAL_MEASUREMENT_DOCUMENT.unit).toBe("m");
    expect(DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS.unit).toBe("cm");
    for (const value of [DEFAULT_STUDIO_SPATIAL_MEASUREMENT_DOCUMENT, DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS]) {
      expect(value.guides).toEqual([]);
      expect(Object.isFrozen(value)).toBe(true);
      expect(Object.isFrozen(value.guides)).toBe(true);
    }
    expect(createStudioSpatialMeasurementDocument()).not.toBe(createStudioSpatialMeasurementDocument());
  });

  it.each(["mm", "cm", "m"] as const)("%s 단위를 보존하며 세계 좌표를 바꾸지 않는다", (unit) => {
    const source = { ...document(), unit };
    const serialized = serializeStudioSpatialMeasurementDocument(source);
    if (!serialized) throw new Error("측정 단위 테스트 문서를 저장하지 못했습니다.");
    expect(parseStudioSpatialMeasurementDocument(serialized)).toEqual(source);
  });

  it("음의 0만 정규화하고 호출자의 좌표와 가이드를 변경하지 않는다", () => {
    const startWorld = [-0, 0, 0] as const;
    const source = { ...guide(), startWorld, endWorld: [1, 0, 0], lockedLengthMeters: null };
    const parsed = canonicalizeStudioSpatialMeasurementGuide(source);
    expect(parsed?.startWorld).toEqual([0, 0, 0]);
    expect(Object.is(parsed?.startWorld[0], -0)).toBe(false);
    expect(Object.is(startWorld[0], -0)).toBe(true);
    expect(Object.isFrozen(source)).toBe(false);
  });

  it.each([
    { ...guide(), id: "constructor" },
    { ...guide(), startWorld: [Number.NaN, 0, 0] },
    { ...guide(), endWorld: [10001, 0, 0] },
    { ...guide(), endWorld: [1, 2, 3], lockedLengthMeters: null },
    { ...guide(), lockedLengthMeters: 4 },
    { ...guide(), lockedLengthMeters: Number.POSITIVE_INFINITY },
    { ...guide(), visible: "false" },
    { ...guide(), runtimeHandle: {} },
  ])("손상된 가이드와 손실을 요구하는 입력을 거부한다: %j", (value) => {
    expect(canonicalizeStudioSpatialMeasurementGuide(value)).toBeNull();
    expect(serializeStudioSpatialMeasurementDocument({ ...document(), guides: [value] })).toBeNull();
  });

  it("알 수 없는 필드·중복·잘못된 버전·순환 참조를 정상 문서로 바꾸지 않는다", () => {
    for (const value of [
      { ...document(), unit: "inch" }, { ...document(), version: 2 },
      { ...document(), extra: true }, document([guide(), guide()]),
    ]) {
      expect(canonicalizeStudioSpatialMeasurementDocument(value)).toBeNull();
      expect(serializeStudioSpatialMeasurementDocument(value)).toBeNull();
      expect(parseStudioSpatialMeasurementDocument(JSON.stringify(value))).toBeNull();
    }
    const cycle: { guides: readonly unknown[] } = { guides: [] };
    cycle.guides = [cycle];
    expect(serializeStudioSpatialMeasurementDocument(cycle)).toBeNull();
  });

  it.each(["guides", "startWorld", "endWorld"] as const)("%s 배열의 JSON hook·접근자·구멍을 실행 없이 거부한다", (key) => {
    let calls = 0;
    let reads = 0;
    for (const kind of ["own", "inherited", "accessor"] as const) {
      const row = guide();
      const rows = [row];
      const target = key === "guides" ? rows : row[key];
      const toJSON = () => { calls += 1; return []; };
      if (kind === "inherited") {
        Object.setPrototypeOf(target, Object.create(Array.prototype, { toJSON: { value: toJSON } }));
      } else if (kind === "accessor") {
        Object.defineProperty(target, "toJSON", { get: () => { reads += 1; return toJSON; } });
      } else {
        Object.defineProperty(target, "toJSON", { value: toJSON });
      }
      expect(serializeStudioSpatialMeasurementDocument(document(rows))).toBeNull();
    }
    const sparse = key === "guides"
      ? { ...document(), guides: new Array(1) }
      : { ...document(), guides: [{ ...guide(), [key]: new Array(3) }] };
    expect(serializeStudioSpatialMeasurementDocument(sparse)).toBeNull();
    expect(calls).toBe(0);
    expect(reads).toBe(0);
  });

  it("객체와 숫자 원소의 getter를 읽지 않는다", () => {
    let reads = 0;
    const row = Object.defineProperty({ ...guide() }, "visible", {
      enumerable: true, get: () => { reads += 1; return false; },
    });
    const point = [1, 2, 3];
    Object.defineProperty(point, "0", { get: () => { reads += 1; return 1; } });
    expect(serializeStudioSpatialMeasurementDocument(document([row]))).toBeNull();
    expect(canonicalizeStudioSpatialMeasurementGuide({ ...guide(), startWorld: point })).toBeNull();
    expect(reads).toBe(0);
  });

  it("256개는 모두 보존하며 257개를 잘라 저장하지 않는다", () => {
    const rows = Array.from({ length: STUDIO_SPATIAL_MEASUREMENT_MAX_GUIDES }, (_, index) => guide(index + 1));
    const serialized = serializeStudioSpatialMeasurementDocument(document(rows));
    if (!serialized) throw new Error("가이드 개수 경계 테스트를 저장하지 못했습니다.");
    expect(parseStudioSpatialMeasurementDocument(serialized)?.guides).toHaveLength(256);
    expect(serializeStudioSpatialMeasurementDocument(document([...rows, guide(257)]))).toBeNull();
    expect(rows).toHaveLength(256);
  });

  it("64KiB 원본·정본 예산을 UTF-8 바이트로 강제하고 구조 검증은 편집 복구에 재사용한다", () => {
    const rawBytes = encoder.encode(LEGACY_JSON).byteLength;
    const boundary = LEGACY_JSON + " ".repeat(STUDIO_SPATIAL_MEASUREMENT_MAX_BYTES - rawBytes);
    expect(parseStudioSpatialMeasurementDocument(boundary)).toEqual(document());
    expect(parseStudioSpatialMeasurementDocument(boundary + " ")).toBeNull();
    const large = document(Array.from({ length: 256 }, (_, index): StudioSpatialMeasurementGuide => ({
      ...guide(index + 1), id: `guide-${index}`.padEnd(80, "x"), lockedLengthMeters: null,
      startWorld: [1234.123456789123, -2345.234567891234, 3456.345678912345],
      endWorld: [4567.456789123456, -5678.567891234567, 6789.678912345678],
    })));
    expect(encoder.encode(JSON.stringify(large)).byteLength).toBeGreaterThan(STUDIO_SPATIAL_MEASUREMENT_MAX_BYTES);
    expect(canonicalizeStudioSpatialMeasurementDocument(large)?.guides).toHaveLength(256);
    expect(serializeStudioSpatialMeasurementDocument(large)).toBeNull();
    expect(parseStudioSpatialMeasurementDocument(JSON.stringify(large))).toBeNull();
  });
});
