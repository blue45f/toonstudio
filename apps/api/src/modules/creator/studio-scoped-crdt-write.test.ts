import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { admitStudioScopedCrdtProbe, admitStudioScopedCrdtUpdate } from "./studio-scoped-crdt-write";
import { assertStudioScopedCrdtResolved, projectStudioScopedCrdtAuthority } from "./studio-scoped-crdt-authority";
import { snapshotStudioScopedOpaqueRoots } from "./studio-scoped-crdt-opaque";
import { scopedFixture } from "./studio-scoped-write.test-fixture";
import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";

const noAssetTransaction = {} as DrizzleStudioCrdtTransaction;
function stroke(doc: Y.Doc, id: string) {
  const record = new Y.Map<unknown>();
  for (const [key, value] of Object.entries({ id, pageId: "page", layerId: "page-root", status: "finalized", deleted: false,
    payloadVersion: 1, type: "draw", mode: "pen", kind: "freehand", stroke: "#111111", strokeWidth: 3 })) record.set(key, value);
  record.set("points", Y.Array.from([20, 20, 50, 50]));
  for (const key of ["pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures"]) record.set(key, Y.Array.from([1, 1]));
  doc.getMap<Y.Map<unknown>>("strokes").set(id, record);
  const order = new Y.Map<unknown>();
  for (const [key, value] of Object.entries({ strokeId: id, pageId: "page", layerId: "page-root", active: true })) order.set(key, value);
  doc.getArray<Y.Map<unknown>>("stroke-order").push([order]);
  return record;
}
function candidate(doc: Y.Doc, change: (probe: Y.Doc) => void) {
  const probe = new Y.Doc(); Y.applyUpdate(probe, Y.encodeStateAsUpdate(doc));
  const vector = Y.encodeStateVector(probe); change(probe);
  const update = Y.encodeStateAsUpdate(probe, vector); probe.destroy(); return update;
}
function hydrate(source: Y.Doc) {
  const doc = new Y.Doc(); Y.applyUpdate(doc, Y.encodeStateAsUpdate(source)); return doc;
}

describe("현재 durable Y와 Authoring을 함께 확인하는 제한 저장", () => {
  it("담당 획을 허용하며 기존 원고·후보 외의 Y와 baseline은 변경하지 않는다", async () => {
    const doc = new Y.Doc(); stroke(doc, "own"); const authorization = scopedFixture().authorization;
    const baseline = structuredClone(authorization.work.document), before = Y.encodeStateAsUpdate(doc);
    try {
      const update = candidate(doc, (probe) => probe.getMap<Y.Map<unknown>>("strokes").get("own")?.set("stroke", "#ff0000"));
      expect((await admitStudioScopedCrdtUpdate(authorization, doc, update, noAssetTransaction))?.targetIds).toEqual(["target"]);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before); expect(authorization.work.document).toEqual(baseline);
    } finally { doc.destroy(); }
  });
  it("기하가 같아도 귀속하지 않은 실제 raw 획 변경을 거절한다", async () => {
    const doc = new Y.Doc(); stroke(doc, "own"); stroke(doc, "other");
    try {
      const update = candidate(doc, (probe) => probe.getMap<Y.Map<unknown>>("strokes").get("other")?.set("stroke", "#ff0000"));
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
    } finally { doc.destroy(); }
  });
  it("렌더에 안 보이는 미등록 runtime root도 담당 객체로 추정하지 않는다", async () => {
    const doc = new Y.Doc(); stroke(doc, "own");
    try {
      const update = candidate(doc, (probe) => probe.getMap("foreign-runtime").set("authority", "changed"));
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
    } finally { doc.destroy(); }
  });
  it("실제 서비스가 쓰는 validated probe 직접 경계도 미등록 root를 거절한다", async () => {
    const source = new Y.Doc(); stroke(source, "own"); const doc = hydrate(source), probe = hydrate(doc);
    try {
      const before = Y.encodeStateAsUpdate(doc); probe.getMap("foreign-runtime").set("hidden", true);
      await expect(admitStudioScopedCrdtProbe(scopedFixture().authorization, doc, probe, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { source.destroy(); doc.destroy(); probe.destroy(); }
  });
  it.each(["change", "delete", "temporary"] as const)("이미 hydrate된 AbstractType root의 %s도 원문 불변으로 거절한다", async (change) => {
    const source = new Y.Doc(); stroke(source, "own"); source.getMap("foreign-runtime").set("value", "original");
    const doc = hydrate(source), root = doc.share.get("foreign-runtime");
    try {
      expect(root?.toJSON()).toBeUndefined(); const before = Y.encodeStateAsUpdate(doc);
      const update = candidate(doc, (client) => {
        const map = client.getMap("foreign-runtime");
        if (change === "change") map.set("value", "changed");
        else if (change === "delete") map.delete("value");
        else { map.set("temporary", "hidden"); map.delete("temporary"); }
      });
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before); expect(doc.share.get("foreign-runtime")).toBe(root);
    } finally { source.destroy(); doc.destroy(); }
  });
  it("__proto__ 이름의 실제 미등록 root도 객체 prototype으로 사라지지 않는다", async () => {
    const doc = new Y.Doc(); stroke(doc, "own");
    try {
      const before = Y.encodeStateAsUpdate(doc), update = candidate(doc, (client) => client.getMap("__proto__").set("authority", true));
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { doc.destroy(); }
  });
  it("opaque root의 실제 중첩 Y.Map 변경도 owned 획으로 추정하지 않는다", async () => {
    const source = new Y.Doc(); stroke(source, "own");
    source.getMap("foreign-runtime").set("nested", new Y.Map([["value", "original"]])); const doc = hydrate(source);
    try {
      const before = Y.encodeStateAsUpdate(doc), update = candidate(doc, (client) => {
        const nested = client.getMap("foreign-runtime").get("nested");
        if (!(nested instanceof Y.Map)) throw new Error("실제 nested map fixture가 필요합니다."); nested.set("value", "changed");
      });
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { source.destroy(); doc.destroy(); }
  });
  it("표시 문자열이 같은 text format 변경도 raw Item으로 거절한다", async () => {
    const source = new Y.Doc(); stroke(source, "own"); source.getText("foreign-text").insert(0, "same"); const doc = hydrate(source);
    try {
      const before = Y.encodeStateAsUpdate(doc), update = candidate(doc, (client) => {
        const text = client.getText("foreign-text"); text.format(0, 4, { bold: true }); expect(text.toString()).toBe("same");
      });
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { source.destroy(); doc.destroy(); }
  });
  it("현재 JSON 값이 같은 concurrent losing 후보도 미등록 raw 변경이다", async () => {
    const source = new Y.Doc(), other = new Y.Doc(); source.clientID = 100; other.clientID = 1;
    stroke(source, "own"); source.getMap("foreign-runtime").set("value", "same"); other.getMap("foreign-runtime").set("value", "same");
    const doc = hydrate(source), update = Y.encodeStateAsUpdate(other), preview = hydrate(doc);
    try {
      Y.applyUpdate(preview, update); expect(preview.getMap("foreign-runtime").toJSON()).toEqual({ value: "same" });
      const before = Y.encodeStateAsUpdate(doc);
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { source.destroy(); other.destroy(); doc.destroy(); preview.destroy(); }
  });
  it("삭제된 opaque 부모 아래 새 자식이 무부모 GC가 되어도 조용히 승인하지 않는다", async () => {
    const source = new Y.Doc({ gc: false }); stroke(source, "own"); const nested = new Y.Array<string>();
    source.getMap("foreign-runtime").set("nested", nested); nested.push(["old"]); source.getMap("foreign-runtime").delete("nested");
    const doc = hydrate(source), vector = Y.encodeStateVector(source);
    try {
      const before = Y.encodeStateAsUpdate(doc); nested.push(["invisible"]);
      await expect(admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, Y.encodeStateAsUpdate(source, vector), noAssetTransaction)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { source.destroy(); doc.destroy(); }
  });
  it("담당 획의 scalar Item ID를 부모 타입으로 위장한 새 GC도 거절한다", async () => {
    const doc = new Y.Doc(); doc.clientID = 1; const record = stroke(doc, "own"), scalar = record._map.get("stroke");
    const probe = hydrate(doc);
    try {
      if (!(scalar instanceof Y.Item) || !(scalar.content instanceof Y.ContentAny)) throw new Error("실제 scalar 색상 Item fixture가 필요합니다.");
      const before = Y.encodeStateAsUpdate(doc), encoder = new Y.UpdateEncoderV1();
      // 공개 V1 wire 순서: client 수, struct 수, client, 시작 clock, Item, delete-set 수.
      encoder.writeLen(1); encoder.writeLen(1); encoder.writeClient(2); encoder.writeLen(0);
      new Y.Item(Y.createID(2, 0), null, null, null, null, scalar.id, null, new Y.ContentAny(["hidden"])).write(encoder, 0);
      encoder.writeLen(0); const update = encoder.toUint8Array(); Y.applyUpdate(probe, update);
      expect(probe.store.clients.get(2)?.[0]).toBeInstanceOf(Y.GC);
      expect(hasValidStudioCrdtRootSchema(probe)).toBe(true);
      await expect(admitStudioScopedCrdtProbe(scopedFixture().authorization, doc, probe, noAssetTransaction, update)).rejects.toMatchObject({ code: "scope" });
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { doc.destroy(); probe.destroy(); }
  });
  it("같은 hydrated opaque 상태를 보존한 담당 획 수정은 허용한다", async () => {
    const source = new Y.Doc(); stroke(source, "own"); source.getMap("foreign-runtime").set("value", "retained");
    const doc = hydrate(source), root = doc.share.get("foreign-runtime");
    try {
      const before = Y.encodeStateAsUpdate(doc), update = candidate(doc, (client) => client.getMap<Y.Map<unknown>>("strokes").get("own")?.set("stroke", "#ff0000"));
      expect((await admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction))?.targetIds).toEqual(["target"]);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before); expect(doc.share.get("foreign-runtime")).toBe(root); expect(root?.toJSON()).toBeUndefined();
    } finally { source.destroy(); doc.destroy(); }
  });
  it("wire Item이 없는 로컬 empty share 등록은 담당 수정의 변경으로 오인하지 않는다", async () => {
    const doc = new Y.Doc(); stroke(doc, "own"); doc.getMap("empty-unknown");
    try {
      expect(snapshotStudioScopedOpaqueRoots(doc)).toEqual([]);
      const update = candidate(doc, (client) => client.getMap<Y.Map<unknown>>("strokes").get("own")?.set("stroke", "#ff0000"));
      expect((await admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction))?.targetIds).toEqual(["target"]);
    } finally { doc.destroy(); }
  });
  it("client 수신 순서·인접 Item 병합이 달라도 같은 opaque wire 상태의 담당 수정을 허용한다", async () => {
    const source = new Y.Doc(), first = new Y.Doc(), second = new Y.Doc(); source.clientID = 3; first.clientID = 1; second.clientID = 2;
    stroke(source, "own"); first.getMap("foreign-runtime").set("first", "retained"); second.getArray("foreign-array").push(["a"]);
    second.getArray("foreign-array").push(["b"]); Y.applyUpdate(source, Y.encodeStateAsUpdate(first)); Y.applyUpdate(source, Y.encodeStateAsUpdate(second));
    try {
      const replay = hydrate(source); try { expect(snapshotStudioScopedOpaqueRoots(replay)).toEqual(snapshotStudioScopedOpaqueRoots(source)); }
      finally { replay.destroy(); }
      const update = candidate(source, (client) => client.getMap<Y.Map<unknown>>("strokes").get("own")?.set("stroke", "#ff0000"));
      expect((await admitStudioScopedCrdtUpdate(scopedFixture().authorization, source, update, noAssetTransaction))?.targetIds).toEqual(["target"]);
    } finally { source.destroy(); first.destroy(); second.destroy(); }
  });
  it("기존 담당 ink 채널 Y.Array 삭제의 정상 GC는 미등록 변경으로 거절하지 않는다", async () => {
    const source = new Y.Doc(), record = stroke(source, "own"); source.getMap("foreign-runtime").set("value", "retained");
    const channels = ["altitudeAngles", "azimuthAngles", "contactWidths", "contactHeights", "sampleTimeOffsets"];
    for (const name of channels) record.set(name, Y.Array.from(name === "sampleTimeOffsets" ? [0, 1] : [1, 1]));
    try {
      expect(hasValidStudioCrdtRootSchema(source)).toBe(true);
      const update = candidate(source, (client) => {
        const target = client.getMap<Y.Map<unknown>>("strokes").get("own"); if (!target) throw new Error("담당 획 fixture가 필요합니다.");
        for (const name of channels) target.delete(name);
      });
      expect((await admitStudioScopedCrdtUpdate(scopedFixture().authorization, source, update, noAssetTransaction))?.targetIds).toEqual(["target"]);
    } finally { source.destroy(); }
  });
  it("이미 통합된 opaque update의 동일 재전송은 no-op으로 허용한다", async () => {
    const source = new Y.Doc(); stroke(source, "own"); source.getMap("foreign-runtime").set("value", "retained"); const doc = hydrate(source);
    try {
      const update = Y.encodeStateAsUpdate(source), before = Y.encodeStateAsUpdate(doc);
      expect((await admitStudioScopedCrdtUpdate(scopedFixture().authorization, doc, update, noAssetTransaction))?.targetIds).toEqual([]);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally { source.destroy(); doc.destroy(); }
  });
  it("tombstone을 보존하며 같은 ID 복구에는 명시 restoration이 필요하다", async () => {
    const doc = new Y.Doc(); const record = stroke(doc, "own"); record.set("deleted", true);
    const fixture = scopedFixture();
    try {
      expect(projectStudioScopedCrdtAuthority(doc, fixture.authorization.work.document).state.entities.get("stroke:own")?.deleted).toBe(true);
      const update = candidate(doc, (probe) => probe.getMap<Y.Map<unknown>>("strokes").get("own")?.set("deleted", false));
      await expect(admitStudioScopedCrdtUpdate(fixture.authorization, doc, update, noAssetTransaction)).rejects.toMatchObject({ code: "context" });
      const authorization = { ...fixture.authorization, context: { ...fixture.context, restorations: [{ kind: "stroke" as const, id: "own", targetId: "target" }] } };
      expect((await admitStudioScopedCrdtUpdate(authorization, doc, update, noAssetTransaction))?.created).toEqual([]);
    } finally { doc.destroy(); }
  });
  it("아직 도착하지 않은 인과 선행 변경은 다른 사용자의 쓰기에 끼워 넣지 않는다", () => {
    const source = new Y.Doc(), pending = new Y.Doc();
    try {
      source.getMap("root").set("first", 1); const vector = Y.encodeStateVector(source);
      source.getMap("root").set("second", 2); Y.applyUpdate(pending, Y.encodeStateAsUpdate(source, vector));
      expect(() => assertStudioScopedCrdtResolved(pending)).toThrow();
      try { assertStudioScopedCrdtResolved(pending); } catch (error) { expect(error).toMatchObject({ code: "unresolved" }); }
    } finally { source.destroy(); pending.destroy(); }
  });
  it("전체 편집자의 기존 검증·wire 경로에 제한 투영을 강제하지 않는다", async () => {
    const doc = new Y.Doc(), fixture = scopedFixture();
    try { expect(await admitStudioScopedCrdtUpdate({ ...fixture.authorization, context: null }, doc, Uint8Array.of(0), noAssetTransaction)).toBeUndefined(); }
    finally { doc.destroy(); }
  });
  it("명시 frameClipId는 opaque ID로만 받고 invalid losing scene 후보도 거절한다", () => {
    const doc = new Y.Doc(), record = stroke(doc, "own");
    try {
      record.set("extensions", { frameClipId: "frame" }); expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
      record.set("extensions", { frameClipId: "bad\u0000frame" }); expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
      record.delete("extensions");
      const scene = doc.getMap<unknown>("scene-element:text"); doc.getMap("scene-elements").set("text", true);
      for (const [key, value] of Object.entries({ id: "text", pageId: "page", layerId: "page-root", payloadVersion: 1, type: "text", deleted: false,
        "prop:text": "검수", "prop:x": 10, "prop:y": 10, "prop:width": 100, "prop:fontSize": 16, "prop:fill": "#000000", "prop:rotation": 0,
        "base:frameClipId": "frame", "prop:frameClipId": "frame" })) scene.set(key, value);
      expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
      scene.set("base:frameClipId", 12); expect(hasValidStudioCrdtRootSchema(doc)).toBe(false);
    } finally { doc.destroy(); }
  });
});
