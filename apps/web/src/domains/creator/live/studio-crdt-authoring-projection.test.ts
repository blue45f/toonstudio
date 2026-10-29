import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { materializeStudioAuthoringFromCrdt, readStudioCrdtScopedRecords } from "@toonstudio/contracts/studio-crdt-authoring";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { reconcileStudioCrdtSceneGraphPages, studioDrawElementToCrdtStroke, studioPageToCrdtPage, type StudioCrdtCompatibleElement } from "./studio-crdt-page-bridge";

function fixture() {
  const source = new StudioCrdtDocument();
  const pages = ["page-1", "page-2"].map((id) => ({ id, bg: "#fff", bgGrad: null, canvasH: 1000, elements: [] as StudioCrdtCompatibleElement[] }));
  for (const page of pages) source.addPage(studioPageToCrdtPage(page));
  const baseline = { version: 1, title: "원본 제목", opaque: { originalBytes: "원본 토큰", future: [1, 2] }, pagesList: pages };
  const snapshot = () => { const doc = new Y.Doc(); Y.applyUpdate(doc, source.encodeStateAsUpdate()); return { baseline, doc }; };
  return { source, pages, baseline, snapshot };
}

describe("실제 Web CRDT와 공유 Authoring 투영", () => {
  it("다른 페이지의 최신 획과 opaque 본문을 Web과 같은 결과로 보존한다", () => {
    const f = fixture(), image = { id: "opaque-image", type: "image", src: "opfs://원본", vrmScene: { futureOriginal: [1, 2, 3] } };
    f.pages[0]!.elements.push(image);
    f.source.addStroke(studioDrawElementToCrdtStroke("page-2", { id: "stroke-2", type: "draw", points: [10, 20, 30, 40], pressures: [0.3, 0.8], stroke: "#123456", strokeWidth: 7, frameClipId: "actual-frame" }));
    const expected = reconcileStudioCrdtSceneGraphPages(f.pages, f.source.getStrokes({ includeDeleted: true }), f.source.getSceneElements({ includeDeleted: true }), f.source.getPages(true), f.source.getLayerGroups({ includeDeleted: true }));
    const input = f.snapshot();
    expect(materializeStudioAuthoringFromCrdt(input)).toEqual({ ...f.baseline, pagesList: expected.pages });
    expect(readStudioCrdtScopedRecords(input).find((record) => record.id === "stroke-2")?.value.frameClipId).toBe("actual-frame");
    expect(f.pages[0]!.elements[0]).toBe(image);
    input.doc.destroy(); f.source.destroy();
  });
  it("삭제·동일 ID 복원을 새 객체로 바꾸지 않고 원래 좌표와 raw 이력을 남긴다", () => {
    const f = fixture();
    f.source.addStroke(studioDrawElementToCrdtStroke("page-1", { id: "same-stroke", type: "draw", points: [1, 2, 3, 4], stroke: "#000", strokeWidth: 2 }));
    f.source.deleteStroke("same-stroke");
    const deleted = f.snapshot(), record = readStudioCrdtScopedRecords(deleted).find((entry) => entry.id === "same-stroke");
    expect(record).toMatchObject({ kind: "stroke", id: "same-stroke", pageId: "page-1", deleted: true, value: { type: "draw", points: [1, 2, 3, 4] } });
    expect(record?.raw).toBeDefined(); deleted.doc.destroy();
    f.source.restoreStroke("same-stroke");
    const restored = f.snapshot(); expect(readStudioCrdtScopedRecords(restored).find((entry) => entry.id === "same-stroke")?.deleted).toBe(false);
    restored.doc.destroy(); f.source.destroy();
  });
  it("두 페이지의 같은 group ID를 composite raw identity로 구분한다", () => {
    const f = fixture();
    for (const page of f.pages) f.source.addLayerGroup({ id: "same-group", pageId: page.id, payload: { version: 1, props: { name: page.id } } });
    const input = f.snapshot(), groups = readStudioCrdtScopedRecords(input).filter((entry) => entry.kind === "group");
    expect(groups.map((entry) => [entry.pageId, entry.id, entry.value.name])).toEqual([["page-1", "same-group", "page-1"], ["page-2", "same-group", "page-2"]]);
    expect(groups[0]?.raw).not.toEqual(groups[1]?.raw);
    input.doc.destroy(); f.source.destroy();
  });
  it("본문 없는 활성 topology 참조는 손실 저장을 거절하고 tombstone은 미해결로 보존한다", () => {
    const f = fixture();
    f.source.addSceneElement({ id: "legacy-image", pageId: "page-1", layerId: "page-root", payload: { version: 1, type: "reference", props: { elementType: "image" } } });
    const active = f.snapshot(); expect(() => materializeStudioAuthoringFromCrdt(active)).toThrow("원본 본문"); active.doc.destroy();
    f.source.deleteSceneElement("legacy-image");
    const deleted = f.snapshot(); expect(readStudioCrdtScopedRecords(deleted)).toContainEqual(expect.objectContaining({ id: "legacy-image", deleted: true, unresolved: true, value: expect.objectContaining({ type: "image" }) }));
    deleted.doc.destroy(); f.source.destroy();
  });
});
