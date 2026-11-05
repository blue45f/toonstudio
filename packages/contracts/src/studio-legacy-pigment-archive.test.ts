import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import { hasValidStudioLegacyPigmentArchiveExtension, hasValidStudioLegacyPigmentArchiveStroke, parseStudioLegacyPigmentArchive,
  hasStudioPreservedDrawReaderDocument, hasStudioPreservedDrawReaderCrdt, STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS } from "./studio-legacy-pigment-archive";

const valid = { version: 1, sourceElementId: "획 원본/한글", sourceIndex: 0 };
const preservedJsonFields = [{ psdGroupId: "ordinary" }, { colorizeMaskEnabled: false }];
const decodePending = (update: Uint8Array) => Y.decodeUpdateV2(update).structs.flatMap((item) =>
  item instanceof Y.Item ? [{ key: item.parentSub, values: item.content.getContent() }] : []);
function pendingItems(document: Y.Doc) {
  const pending = document.store.pendingStructs;
  if (!pending) throw new Error("부모를 기다리는 증분이 없습니다.");
  return decodePending(pending.update);
}

describe("보존 획 reader 요구 탐지", () => {
  it("archive 없는 보존 필드와 false도 인식하며 마스터도 조사한다", () => {
    for (const key of STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS) {
      const element = { type: "draw", [key]: key === "colorizeMaskEnabled" ? false : "preserved" };
      expect(hasStudioPreservedDrawReaderDocument({ pagesList: [{ elements: [element] }] }), key).toBe(true);
      expect(hasStudioPreservedDrawReaderDocument({ master: { elements: [element] } }), key).toBe(true);
    }
    expect(hasStudioPreservedDrawReaderDocument({ pagesList: [{ elements: [{ type: "draw", points: [0, 0] }] }] })).toBe(false);
  });
  it("원시 v7 삭제 기록을 reader 투영 없이 탐지해 undo 자료도 보호한다", () => {
    const doc = new Y.Doc();
    try {
      expect(hasStudioPreservedDrawReaderCrdt(doc)).toBe(false);
      const record = new Y.Map<unknown>(); doc.getMap("strokes").set("stroke", record);
      record.set("payloadVersion", 7); record.set("deleted", true);
      record.set("extensions", { colorizeMaskEnabled: false });
      expect(hasStudioPreservedDrawReaderCrdt(doc)).toBe(true);
      const raw = new Y.Doc();
      try { Y.applyUpdate(raw, Y.encodeStateAsUpdate(doc)); expect(hasStudioPreservedDrawReaderCrdt(raw)).toBe(true); }
      finally { raw.destroy(); }
    } finally { doc.destroy(); }
  });
  it.each(preservedJsonFields)("부모 전의 알려진 shapeParams 키는 보존 extensions로 오인하지 않는다: %j", (fields) => {
    const source = new Y.Doc(), pending = new Y.Doc();
    try {
      const stroke = new Y.Map<unknown>(); source.getMap("strokes").set("stroke", stroke);
      stroke.set("payloadVersion", 6);
      const parent = Y.encodeStateAsUpdate(source), vector = Y.encodeStateVector(source);
      stroke.set("shapeParams", fields);
      Y.applyUpdate(pending, Y.encodeStateAsUpdate(source, vector));
      expect(pending.store.pendingStructs).not.toBeNull();
      expect(pendingItems(pending)).toContainEqual({ key: "shapeParams", values: [fields] });
      expect(hasStudioPreservedDrawReaderCrdt(pending, decodePending)).toBe(false);
      Y.applyUpdate(pending, parent);
      expect(pending.store.pendingStructs).toBeNull();
      expect(hasStudioPreservedDrawReaderCrdt(pending, decodePending)).toBe(false);
    } finally { source.destroy(); pending.destroy(); }
  });
  it.each(preservedJsonFields)("상속 키가 미확정인 일반 JSON 교체는 보수적 보호 제한을 유지한다: %j", (fields) => {
    const source = new Y.Doc(), pending = new Y.Doc();
    try {
      const stroke = new Y.Map<unknown>(); source.getMap("strokes").set("stroke", stroke);
      stroke.set("payloadVersion", 6); stroke.set("shapeParams", { ordinaryValue: 1 });
      const parent = Y.encodeStateAsUpdate(source), vector = Y.encodeStateVector(source);
      stroke.set("shapeParams", fields);
      Y.applyUpdate(pending, Y.encodeStateAsUpdate(source, vector));
      expect(pending.store.pendingStructs).not.toBeNull();
      expect(pendingItems(pending)).toContainEqual({ key: null, values: [fields] });
      expect(hasStudioPreservedDrawReaderCrdt(pending, decodePending)).toBe(true);
      Y.applyUpdate(pending, parent);
      expect(hasStudioPreservedDrawReaderCrdt(pending, decodePending)).toBe(false);
    } finally { source.destroy(); pending.destroy(); }
  });
  it.each(preservedJsonFields.flatMap((fields) => [false, true].map((replace) => ({ fields, replace }))))(
    "실제 보존 extensions는 알려진 키와 상속 키 모두 부모 도착 전부터 보호한다: %j", ({ fields, replace }) => {
      const source = new Y.Doc(), pending = new Y.Doc();
      try {
        const stroke = new Y.Map<unknown>(); source.getMap("strokes").set("stroke", stroke);
        stroke.set("payloadVersion", 6);
        if (replace) stroke.set("extensions", {});
        const parent = Y.encodeStateAsUpdate(source), vector = Y.encodeStateVector(source);
        stroke.set("payloadVersion", 7); stroke.set("extensions", fields);
        Y.applyUpdate(pending, Y.encodeStateAsUpdate(source, vector));
        expect(pending.store.pendingStructs).not.toBeNull();
        expect(pendingItems(pending)).toContainEqual({ key: replace ? null : "extensions", values: [fields] });
        expect(hasStudioPreservedDrawReaderCrdt(pending, decodePending)).toBe(true);
        Y.applyUpdate(pending, parent);
        expect(hasStudioPreservedDrawReaderCrdt(pending, decodePending)).toBe(true);
      } finally { source.destroy(); pending.destroy(); }
    },
  );
});

describe("보존 획 reader 요구 탐지", () => {
  it("archive 없는 보존 필드와 false도 인식하며 마스터도 조사한다", () => {
    for (const key of STUDIO_LEGACY_PIGMENT_ARCHIVE_ELEMENT_EXTENSION_KEYS) {
      const element = { type: "draw", [key]: key === "colorizeMaskEnabled" ? false : "preserved" };
      expect(hasStudioPreservedDrawReaderDocument({ pagesList: [{ elements: [element] }] }), key).toBe(true);
      expect(hasStudioPreservedDrawReaderDocument({ master: { elements: [element] } }), key).toBe(true);
    }
    expect(hasStudioPreservedDrawReaderDocument({ pagesList: [{ elements: [{ type: "draw", points: [0, 0] }] }] })).toBe(false);
  });
  it("원시 v7 삭제 기록을 reader 투영 없이 탐지해 undo 자료도 보호한다", () => {
    const doc = new Y.Doc();
    try {
      expect(hasStudioPreservedDrawReaderCrdt(doc)).toBe(false);
      const record = new Y.Map<unknown>(); doc.getMap("strokes").set("stroke", record);
      record.set("payloadVersion", 7); record.set("deleted", true);
      record.set("extensions", { colorizeMaskEnabled: false });
      expect(hasStudioPreservedDrawReaderCrdt(doc)).toBe(true);
      const raw = new Y.Doc();
      try { Y.applyUpdate(raw, Y.encodeStateAsUpdate(doc)); expect(hasStudioPreservedDrawReaderCrdt(raw)).toBe(true); }
      finally { raw.destroy(); }
    } finally { doc.destroy(); }
  });
});

describe("외부 혼색 원본 보관 출처 계약", () => {
  it("원래 숨김 false와 필드 없음, 최대 ID와 안전한 순서를 보존한다", () => {
    expect(parseStudioLegacyPigmentArchive(valid)).toEqual(valid);
    expect(parseStudioLegacyPigmentArchive(valid)).not.toBe(valid);
    const complete = { ...valid, sourceElementId: "x".repeat(160), sourceGroupId: "g".repeat(160), sourceHidden: false, sourceIndex: Number.MAX_SAFE_INTEGER };
    expect(parseStudioLegacyPigmentArchive(complete)).toEqual(complete);
    expect(parseStudioLegacyPigmentArchive(valid)).not.toHaveProperty("sourceHidden");
  });
  it.each([
    null, [], { ...valid, version: 2 }, { ...valid, extra: "unknown" },
    { ...valid, sourceElementId: "" }, { ...valid, sourceElementId: "x".repeat(161) },
    { ...valid, sourceElementId: "bad\nID" }, { ...valid, sourceGroupId: "" },
    { ...valid, sourceGroupId: undefined }, { ...valid, sourceHidden: "false" },
    { ...valid, sourceHidden: undefined }, { ...valid, sourceIndex: -1 },
    { ...valid, sourceIndex: 0.5 }, { ...valid, sourceIndex: Number.MAX_SAFE_INTEGER + 1 },
    { ...valid, sourceIndex: "0" }, { ...valid, sourceIndex: undefined },
  ])("손상된 필드나 알 수 없는 버전을 제거하지 않고 거절한다: %j", (candidate) => {
    expect(parseStudioLegacyPigmentArchive(candidate)).toBeNull();
  });
  it("보관 출처는 v7에서만 허용하고 기존 v1-v6은 그대로 유지한다", () => {
    for (const version of [1, 2, 3, 4, 5, 6]) {
      expect(hasValidStudioLegacyPigmentArchiveExtension(version, valid)).toBe(false);
      expect(hasValidStudioLegacyPigmentArchiveExtension(version, undefined)).toBe(true);
    }
    expect(hasValidStudioLegacyPigmentArchiveExtension(7, valid)).toBe(true);
    expect(hasValidStudioLegacyPigmentArchiveExtension(7, undefined)).toBe(true);
    expect(hasValidStudioLegacyPigmentArchiveExtension(8, valid)).toBe(false);
    expect(hasValidStudioLegacyPigmentArchiveStroke({ version: 7, type: "draw", kind: "freehand", mode: "pen" })).toBe(false);
    expect(hasValidStudioLegacyPigmentArchiveStroke({ version: 7, type: "draw", extensions: { colorizeMaskEnabled: false } })).toBe(true);
    expect(hasValidStudioLegacyPigmentArchiveStroke({ version: 6, type: "draw", extensions: { colorizeMaskEnabled: false } })).toBe(false);
  });
});
