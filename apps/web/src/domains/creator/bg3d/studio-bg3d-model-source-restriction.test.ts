import { describe, expect, it, vi } from "vitest";

import {
  fingerprintStudioBg3dModelSourceRestriction,
  inheritStudioBg3dModelSourceRestriction,
  isSafeStudioBg3dModelSourceRestrictionRecordId,
  parseStudioBg3dModelSourceRestriction,
  readStudioBg3dEffectiveModelSourceRestriction,
  type StudioBg3dModelSourceRestrictionHash,
  type StudioBg3dModelSourceRestrictionOrigin,
  type StudioBg3dModelSourceRestrictionV1,
} from "./studio-bg3d-model-source-restriction";

const A: StudioBg3dModelSourceRestrictionHash = `sha256:${"a".repeat(64)}`;
const B: StudioBg3dModelSourceRestrictionHash = `sha256:${"b".repeat(64)}`;
const C: StudioBg3dModelSourceRestrictionHash = `sha256:${"c".repeat(64)}`;
function restriction(
  modelFileExport: StudioBg3dModelSourceRestrictionV1["modelFileExport"] = "service-only",
  kind: StudioBg3dModelSourceRestrictionOrigin["kind"] = "bundle-pack",
): StudioBg3dModelSourceRestrictionV1 {
  const parsed = parseStudioBg3dModelSourceRestriction({ version: 1, modelFileExport,
    origin: { kind, recordId: "source-a", sha256: A }, parent: null });
  if (!parsed) throw Error("유효한 제한 fixture 필요");
  return parsed;
}
function carrying(value: unknown): { readonly sourceRestriction?: StudioBg3dModelSourceRestrictionV1 } {
  const record: { readonly sourceRestriction?: StudioBg3dModelSourceRestrictionV1 } = {};
  Object.defineProperty(record, "sourceRestriction", { value, enumerable: true });
  return record;
}

describe("모델 출처 제한의 엄격한 DTO 파싱", () => {
  it.each(["user-file", "studio-generated"])("%s 출처의 allowed만 정본 복사로 받는다", (kind) => {
    const value = { version: 1, modelFileExport: "allowed", origin: { kind, recordId: "owned-source", sha256: A },
      parent: { recordId: "previous-record", sha256: B } };
    const result = parseStudioBg3dModelSourceRestriction(value);
    expect(result).toEqual(value); expect(result).not.toBe(value);
    expect(result?.origin).not.toBe(value.origin); expect(result?.parent).not.toBe(value.parent);
  });

  it.each(["service-only", "unknown"])("%s는 bundle-pack 및 출처 미노출 null을 유지한다", (policy) => {
    const withBundle = { version: 1, modelFileExport: policy, origin: { kind: "bundle-pack", recordId: "bundle.asset~1", sha256: A }, parent: null };
    const withoutOrigin = { version: 1, modelFileExport: policy, origin: null, parent: null };
    expect(parseStudioBg3dModelSourceRestriction(withBundle)).toEqual(withBundle);
    expect(parseStudioBg3dModelSourceRestriction(withoutOrigin)).toEqual(withoutOrigin);
  });

  it.each([null, { kind: "bundle-pack", recordId: "bundle", sha256: A }])("allowed가 원본 제한을 우회하는 origin=%j는 거부한다", (origin) => {
    expect(parseStudioBg3dModelSourceRestriction({ version: 1, modelFileExport: "allowed", origin, parent: null })).toBeNull();
  });

  it("null-prototype 입력도 own data만 복사하고 정본 Object prototype으로 반환한다", () => {
    const origin: object = Object.create(null), parent: object = Object.create(null), value: object = Object.create(null);
    Object.assign(origin, { kind: "user-file", recordId: "origin", sha256: A });
    Object.assign(parent, { recordId: "parent", sha256: B });
    Object.assign(value, { version: 1, modelFileExport: "allowed", origin, parent });
    const result = parseStudioBg3dModelSourceRestriction(value);
    expect(result?.origin?.recordId).toBe("origin"); expect(result?.parent?.recordId).toBe("parent");
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result?.origin)).toBe(Object.prototype);
  });

  it("반환값과 하위 출처/부모를 동결하며 입력 변경은 반환값을 바꾸지 않는다", () => {
    const value = { version: 1, modelFileExport: "service-only", origin: { kind: "bundle-pack", recordId: "original", sha256: A },
      parent: { recordId: "parent", sha256: B } };
    const result = parseStudioBg3dModelSourceRestriction(value);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result?.origin)).toBe(true); expect(Object.isFrozen(result?.parent)).toBe(true);
    value.origin.recordId = "replacement"; value.origin.sha256 = C; value.parent.recordId = "other-parent";
    expect(result?.origin).toEqual({ kind: "bundle-pack", recordId: "original", sha256: A });
    expect(result?.parent).toEqual({ recordId: "parent", sha256: B });
  });

  it.each([null, undefined, "{}", [], 1, true, new Date(0), new Uint8Array(0)])("plain DTO가 아닌 %j는 거부한다", (value) => {
    expect(parseStudioBg3dModelSourceRestriction(value)).toBeNull();
  });

  it.each([0, 2, "1", null])("지원하지 않는 version=%j는 거부한다", (version) => {
    expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), version })).toBeNull();
  });

  it.each(["Allowed", "service_only", "", undefined])("지원하지 않는 export 값 %j는 거부한다", (modelFileExport) => {
    expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), modelFileExport })).toBeNull();
  });

  it("루트/하위의 누락·추가 키·symbol·non-enumerable·외부 prototype을 거부한다", () => {
    const valid = restriction(), hidden = { ...valid }, symbol = { ...valid, [Symbol("외부")]: 1 };
    Object.defineProperty(hidden, "version", { value: 1, enumerable: false });
    const inherited: object = Object.create({ version: 1 }); Object.assign(inherited, { modelFileExport: "unknown", origin: null, parent: null });
    const values: readonly unknown[] = [
      { version: 1, modelFileExport: "unknown", origin: null }, { ...valid, extra: 1 }, hidden, symbol, inherited,
      { ...valid, origin: { ...valid.origin, extra: true } }, { ...valid, origin: { kind: "user-file", recordId: "origin" } },
      { ...valid, parent: { recordId: "parent", sha256: B, extra: 0 } },
      { ...valid, parent: { recordId: "parent" } }, { ...valid, origin: [] }, { ...valid, parent: [] },
    ];
    for (const value of values) expect(parseStudioBg3dModelSourceRestriction(value)).toBeNull();
  });

  it("버려질 getter/toJSON을 실행하지 않으며 root·origin·parent accessor를 거부한다", () => {
    const getter = vi.fn(() => { throw Error("getter 실행 금지"); });
    const root = { ...restriction() }, origin = { kind: "user-file", recordId: "origin", sha256: A }, parent = { recordId: "parent", sha256: B };
    Object.defineProperty(root, "modelFileExport", { enumerable: true, get: getter });
    Object.defineProperty(origin, "recordId", { enumerable: true, get: getter });
    Object.defineProperty(parent, "sha256", { enumerable: true, get: getter });
    expect(parseStudioBg3dModelSourceRestriction(root)).toBeNull();
    expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), origin })).toBeNull();
    expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), parent })).toBeNull();
    expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), toJSON: getter })).toBeNull();
    expect(getter).not.toHaveBeenCalled();
  });

  it("입력 prototype/descriptor 조회가 throw하면 null로 거부한다", () => {
    const value = new Proxy({}, { getPrototypeOf: () => { throw Error("외부 조회 실패"); } });
    expect(parseStudioBg3dModelSourceRestriction(value)).toBeNull();
  });

  it.each(["sha256:abc", `SHA256:${"a".repeat(64)}`, `sha256:${"A".repeat(64)}`, "a".repeat(64), `${A} `, `sha256:${"a".repeat(65)}`])(
    "비정본 hash %s는 원본/부모 모두 거부한다", (sha256) => {
      expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), origin: { kind: "user-file", recordId: "origin", sha256 } })).toBeNull();
      expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), parent: { recordId: "parent", sha256 } })).toBeNull();
    },
  );
});

describe("라이브러리와 같은 record ID 경계", () => {
  it.each(["a", "model-1._~", "Z".repeat(80), "secretive", "myRecord42"])("정상 식별자 %s는 허용한다", (id) => {
    expect(isSafeStudioBg3dModelSourceRestrictionRecordId(id)).toBe(true);
  });
  it.each(["", "a".repeat(81), ".leading", "_leading", "-leading", "한글", "path/id", "a b", "blob:model", "https://host", "CONSTRUCTOR", "Prototype", "__proto__", "api-key", "access_token", "secret", "password", "sk-abcdefgh", null, 7])(
    "위험·범위 밖 식별자 %j는 DTO 원본/부모에서 거부한다", (recordId) => {
      expect(isSafeStudioBg3dModelSourceRestrictionRecordId(recordId)).toBe(false);
      expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), origin: { kind: "user-file", recordId, sha256: A } })).toBeNull();
      expect(parseStudioBg3dModelSourceRestriction({ ...restriction(), parent: { recordId, sha256: B } })).toBeNull();
    },
  );
});

describe("레거시 effective 제한·fingerprint·파생물 상속", () => {
  it("레거시 부재는 immutable unknown이며 record/render 필드를 변경하지 않는다", () => {
    const render = { visible: true, scale: [1, 2, 3] }, toJSON = vi.fn(() => { throw Error("record 직렬화 금지"); });
    const record: { name: string; render: typeof render; toJSON: typeof toJSON; sourceRestriction?: StudioBg3dModelSourceRestrictionV1 } = { name: "소재", render, toJSON };
    const before = { ...render, scale: [...render.scale] };
    const result = readStudioBg3dEffectiveModelSourceRestriction(record);
    expect(result).toEqual({ version: 1, modelFileExport: "unknown", origin: null, parent: null }); expect(Object.isFrozen(result)).toBe(true);
    expect(record.render).toBe(render); expect(render).toEqual(before); expect(record).not.toHaveProperty("sourceRestriction"); expect(toJSON).not.toHaveBeenCalled();
  });

  it.each([undefined, null, {}, { version: 2, modelFileExport: "unknown", origin: null, parent: null }])("명시된 손상 field=%j를 레거시 unknown으로 숨기지 않는다", (value) => {
    expect(() => readStudioBg3dEffectiveModelSourceRestriction(carrying(value))).toThrow(TypeError);
  });

  it("effective accessor와 상속된 field는 읽거나 허용하지 않는다", () => {
    const getter = vi.fn(() => restriction()), own: { sourceRestriction?: StudioBg3dModelSourceRestrictionV1 } = {};
    Object.defineProperty(own, "sourceRestriction", { enumerable: true, get: getter });
    const inherited = {}; Object.setPrototypeOf(inherited, { sourceRestriction: restriction() });
    expect(() => readStudioBg3dEffectiveModelSourceRestriction(own)).toThrow(TypeError);
    expect(() => readStudioBg3dEffectiveModelSourceRestriction(inherited)).toThrow(TypeError); expect(getter).not.toHaveBeenCalled();
  });

  it("effective 값도 입력과 분리된 깊은 동결 사본이다", () => {
    const sourceRestriction = restriction(), result = readStudioBg3dEffectiveModelSourceRestriction({ sourceRestriction });
    expect(result).toEqual(sourceRestriction); expect(result).not.toBe(sourceRestriction); expect(result.origin).not.toBe(sourceRestriction.origin);
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.origin)).toBe(true);
  });

  it("fingerprint는 root/하위 key 순서와 무관한 정본 순서다", () => {
    const left: StudioBg3dModelSourceRestrictionV1 = { version: 1, modelFileExport: "allowed",
      origin: { kind: "user-file", recordId: "origin", sha256: A }, parent: { recordId: "parent", sha256: B } };
    const right: StudioBg3dModelSourceRestrictionV1 = { parent: { sha256: B, recordId: "parent" },
      origin: { sha256: A, recordId: "origin", kind: "user-file" }, modelFileExport: "allowed", version: 1 };
    expect(fingerprintStudioBg3dModelSourceRestriction(left)).toBe(fingerprintStudioBg3dModelSourceRestriction(right));
    expect(fingerprintStudioBg3dModelSourceRestriction(left)).toBe(`{"version":1,"modelFileExport":"allowed","origin":{"kind":"user-file","recordId":"origin","sha256":"${A}"},"parent":{"recordId":"parent","sha256":"${B}"}}`);
  });

  it("fingerprint도 runtime 손상을 다시 검증하고 toJSON을 실행하지 않는다", () => {
    const value: StudioBg3dModelSourceRestrictionV1 = { ...restriction() }, toJSON = vi.fn(() => "우회");
    Object.defineProperty(value, "toJSON", { value: toJSON, enumerable: true });
    expect(() => fingerprintStudioBg3dModelSourceRestriction(value)).toThrow(TypeError); expect(toJSON).not.toHaveBeenCalled();
  });

  it.each(["service-only", "unknown", "allowed"])("파생물 %s 제한·최초 출처는 유지하고 parent만 직전 actual identity로 바꾼다", (policy) => {
    const sourceRestriction = policy === "allowed" ? restriction("allowed", "studio-generated")
      : policy === "service-only" ? restriction("service-only") : restriction("unknown", "user-file");
    const first = inheritStudioBg3dModelSourceRestriction({ id: "record-b", contentHash: B, sourceRestriction });
    const second = inheritStudioBg3dModelSourceRestriction({ id: "record-c", contentHash: C, sourceRestriction: first });
    expect(first.modelFileExport).toBe(policy); expect(second.modelFileExport).toBe(policy);
    expect(first.origin).toEqual(sourceRestriction.origin); expect(second.origin).toEqual(sourceRestriction.origin);
    expect(second.origin?.sha256).toBe(A); expect(first.parent).toEqual({ recordId: "record-b", sha256: B });
    expect(second.parent).toEqual({ recordId: "record-c", sha256: C });
    expect(first.origin).not.toBe(sourceRestriction.origin); expect(second.origin).not.toBe(first.origin);
    expect(Object.isFrozen(second)).toBe(true); expect(Object.isFrozen(second.origin)).toBe(true); expect(Object.isFrozen(second.parent)).toBe(true);
  });

  it("제한이 없는 레거시 파생물은 allowed를 추정하거나 원본 hash를 생성하지 않는다", () => {
    const result = inheritStudioBg3dModelSourceRestriction({ id: "legacy-record", contentHash: B });
    expect(result).toEqual({ version: 1, modelFileExport: "unknown", origin: null, parent: { recordId: "legacy-record", sha256: B } });
  });

  it("손상된 명시 제한과 actual ID/hash는 상속 전에 거부한다", () => {
    const damaged = { id: "parent", contentHash: B }; Object.defineProperty(damaged, "sourceRestriction", { value: undefined, enumerable: true });
    expect(() => inheritStudioBg3dModelSourceRestriction(damaged)).toThrow(TypeError);
    expect(() => inheritStudioBg3dModelSourceRestriction({ id: "constructor", contentHash: B })).toThrow(TypeError);
    expect(() => inheritStudioBg3dModelSourceRestriction({ id: "parent", contentHash: "sha256:invalid" })).toThrow(TypeError);
  });

  it("actual ID/hash accessor를 실행하지 않는다", () => {
    const getter = vi.fn(() => "parent"), record = { id: "parent", contentHash: B };
    Object.defineProperty(record, "id", { enumerable: true, get: getter });
    expect(() => inheritStudioBg3dModelSourceRestriction(record)).toThrow(TypeError); expect(getter).not.toHaveBeenCalled();
  });
});
