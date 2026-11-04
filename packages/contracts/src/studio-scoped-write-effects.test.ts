import { describe, expect, it } from "vitest";

import { admitStudioScopedWriteEffects, projectStudioScopedAuthoringDocument, scopedEntityKey } from "./studio-scoped-write-effects";

import type { StudioScopedWriteContext, StudioScopedWriteTarget } from "./studio-scoped-write";

const at = "2026-11-04T00:00:00.000Z";
const stroke = { id: "own", type: "draw", groupId: "mapped", points: [10, 10, 20, 20], noClip: false, frameClipId: "frame" };
const outside = { ...stroke, id: "outside", groupId: "outside-layer", frameClipId: undefined };
const frame = { id: "frame", type: "frame", x: 0, y: 0, width: 100, height: 100 };
const groups = [{ id: "mapped", opacity: 1 }, { id: "outside-layer", opacity: 1 }];
const document = (elements: readonly unknown[] = [stroke, outside, frame], layerGroups: readonly unknown[] = groups) => ({
  width: 800, pagesList: [{ id: "page", canvasH: 1200, elements, groups: layerGroups }],
});
const target: StudioScopedWriteTarget = { definition: { id: "target", productionProjectId: "production", taskId: "task",
  scope: { kind: "project", id: "production", ancestors: [] }, pageId: "page", frameId: "frame", layerId: "mapped",
  entities: [{ kind: "stroke", id: "own" }, { kind: "group", id: "mapped" }], source: { schemaVersion: 1,
    workId: "work", projectId: "graph", artifactId: "artifact", reviewId: "review", revisionId: "revision", rootGraphHash: "a".repeat(64) } },
  sourceServerRevision: 1, captureSequence: 1, createdBy: "owner", createdAt: at, revokedAt: null };
const emptyContext: StudioScopedWriteContext = { version: 1, policyVersion: 1, grantIds: [], creations: [], restorations: [] };
function admit(after: unknown, allowed = false, context = emptyContext, before: unknown = document()) {
  return admitStudioScopedWriteEffects({ before: projectStudioScopedAuthoringDocument(before), after: projectStudioScopedAuthoringDocument(after),
    context, targets: allowed ? [target] : [], ownership: new Map([["stroke:own", "target"], [scopedEntityKey("group", "mapped", "page"), "target"]]),
    mappedFull: { controlledTargets: [target] } });
}

describe("명시 매핑 구역과 기존 전체 편집 ACL의 공존", () => {
  it("명시 grant 없이도 매핑 밖의 기존 객체 수정·새 객체 생성은 허용한다", () => {
    expect(admit(document([stroke, { ...outside, opacity: 0.5 }, frame])).targetIds).toEqual([]);
    expect(admit(document([stroke, outside, { ...outside, id: "fresh" }, frame])).created).toEqual([]);
  });
  it("매핑 객체는 실제 허용 대상이 있어야 수정하며 동결된 대상은 제외한다", () => {
    const changed = document([{ ...stroke, opacity: 0.5 }, outside, frame]);
    expect(() => admit(changed)).toThrow();
    expect(admit(changed, true).targetIds).toEqual(["target"]);
  });
  it("새 매핑 획은 실제 생성 선언이 있어야 하고 매핑 밖 생성 선언을 빌려 쓸 수 없다", () => {
    const fresh = { ...stroke, id: "fresh" }, after = document([stroke, fresh, outside, frame]);
    expect(() => admit(after, true)).toThrow();
    const context = { ...emptyContext, grantIds: ["grant"], creations: [{ kind: "stroke" as const, id: "fresh", targetId: "target" }] };
    expect(admit(after, true, context).created).toEqual(context.creations);
    expect(() => admit(document([stroke, outside, { ...outside, id: "fresh" }, frame]), true, context)).toThrow();
  });
  it("객체를 매핑 안팎으로 옮기거나 등록하지 않은 기존 객체를 빌려 편집할 수 없다", () => {
    expect(() => admit(document([{ ...stroke, groupId: "outside-layer" }, outside, frame]), true)).toThrow();
    expect(() => admit(document([stroke, { ...outside, groupId: "mapped", frameClipId: "frame" }, frame]), true)).toThrow();
  });
  it("모든 역할에서 매핑 레이어 삭제와 프레임 앵커 변경을 막는다", () => {
    expect(() => admit(document([stroke, outside, frame], [groups[1]]), true)).toThrow();
    expect(() => admit(document([stroke, outside, { ...frame, width: 200 }]), true)).toThrow();
  });
  it("읽기 전용 매핑 객체의 렌더 입력을 바꾸는 미매핑 변경도 막는다", () => {
    const clipped = { ...stroke, clipBelow: true }, before = document([outside, clipped, frame]);
    expect(() => admit(document([{ ...outside, opacity: 0.5 }, clipped, frame]), false, emptyContext, before)).toThrow();
  });
  it("미매핑 페이지 추가는 허용하고 읽기 전용 매핑에 영향을 주는 전역 크기 변경은 막는다", () => {
    const before = document(), after = { ...before, pagesList: [...before.pagesList,
      { id: "outside-page", canvasH: 100, elements: [{ ...outside, id: "another" }], groups: [{ id: "outside-layer" }] }] };
    expect(admit(after).targetIds).toEqual([]);
    expect(() => admit({ ...before, width: 1600 })).toThrow();
    expect(admit({ ...before, currentPageId: "page", savedAt: at, writerRoom: { draft: "매핑 밖 대본 메모" } }).targetIds).toEqual([]);
  });
  it("명시 frameClipId를 생략한 자동 클립 새 획도 매핑 구역 밖으로 승격하지 않는다", () => {
    const frameTarget = { ...target, definition: { ...target.definition, layerId: null,
      entities: [{ kind: "stroke" as const, id: "own" }] } };
    const before = projectStudioScopedAuthoringDocument(document());
    const after = projectStudioScopedAuthoringDocument(document([stroke, outside,
      { id: "auto-clipped", type: "draw", noClip: false, points: [40, 40, 50, 50] }, frame]));
    expect(() => admitStudioScopedWriteEffects({ before, after, context: emptyContext, targets: [],
      ownership: new Map([["stroke:own", "target"]]), mappedFull: { controlledTargets: [frameTarget] } })).toThrow();
  });
  it("미매핑 소비자와 함께 쓰는 surface를 변경하여 보호된 원고 픽셀을 바꾸지 못한다", () => {
    const projected = projectStudioScopedAuthoringDocument(document([
      { ...stroke, surfaceId: "shared" }, { ...outside, surfaceId: "shared" }, frame,
    ]));
    const surface = { kind: "surface" as const, id: "shared", pageId: "page", layerId: "outside-layer", value: { pixels: "original" } };
    const before = { ...projected, entities: new Map(projected.entities).set("surface:shared", surface) };
    const after = { ...before, entities: new Map(before.entities).set("surface:shared", { ...surface, value: { pixels: "changed" } }) };
    expect(() => admitStudioScopedWriteEffects({ before, after, context: emptyContext, targets: [],
      ownership: new Map([["stroke:own", "target"], [scopedEntityKey("group", "mapped", "page"), "target"]]),
      mappedFull: { controlledTargets: [target] } })).toThrow();
  });
});
