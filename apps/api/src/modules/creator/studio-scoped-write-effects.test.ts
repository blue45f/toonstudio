import { describe, expect, it } from "vitest";
import { admitStudioScopedWriteEffects, projectStudioScopedAuthoringDocument, scopedEntityIdentity, scopedEntityKey, StudioScopedWriteDeniedError,
  validateStudioScopedWriteTarget, type StudioScopedDocumentState } from "./studio-scoped-write-effects";
import { scopedDocument, scopedFixture, scopedFrame, scopedOutside, scopedStroke } from "./studio-scoped-write.test-fixture";

const project = projectStudioScopedAuthoringDocument;
function admit(before: unknown, after: unknown, context = scopedFixture().context, ownership = scopedFixture().ownership) {
  return admitStudioScopedWriteEffects({ before: project(before), after: project(after), context, ownership, targets: [scopedFixture().target] });
}

describe("실제 원고 ID에 명시한 제한 편집 효과", () => {
  it("담당 획의 정상 수정·삭제와 같은 프레임 안 새 획을 허용한다", () => {
    expect(admit(scopedDocument(), scopedDocument([{ ...scopedStroke, color: "#ff0000" }, scopedOutside, scopedFrame])).targetIds).toEqual(["target"]);
    expect(admit(scopedDocument(), scopedDocument([scopedOutside, scopedFrame])).changedEntityKeys).toContain("stroke:own");
    const fresh = { ...scopedStroke, id: "fresh" }, context = { ...scopedFixture().context, creations: [{ kind: "stroke" as const, id: "fresh", targetId: "target" }] };
    expect(admit(scopedDocument(), scopedDocument([scopedStroke, fresh, scopedOutside, scopedFrame]), context).created).toEqual(context.creations);
  });

  it("같은 이름·좌표라도 귀속하지 않은 원고를 수정·삭제·담당 scope로 빌려 쓸 수 없다", () => {
    for (const elements of [[scopedStroke, { ...scopedOutside, name: "내 컷" }, scopedFrame], [scopedStroke, scopedFrame],
      [scopedStroke, { ...scopedOutside, x: 30, noClip: false }, scopedFrame]]) {
      expect(() => admit(scopedDocument(), scopedDocument(elements))).toThrow(StudioScopedWriteDeniedError);
    }
  });

  it("새 ID는 생성 diff와 creations가 정확히 1:1이며 귀속 이동에 재사용하지 않는다", () => {
    const context = scopedFixture().context, fresh = { ...scopedStroke, id: "fresh" }, changed = scopedDocument([scopedStroke, fresh, scopedOutside, scopedFrame]);
    expect(() => admit(scopedDocument(), changed)).toThrow(StudioScopedWriteDeniedError);
    expect(() => admit(scopedDocument(), scopedDocument(), { ...context, creations: [{ kind: "stroke", id: "ghost", targetId: "target" }] })).toThrow(StudioScopedWriteDeniedError);
    expect(() => admit(scopedDocument(), changed, { ...context, creations: [{ kind: "stroke", id: "fresh", targetId: "other" }] })).toThrow(StudioScopedWriteDeniedError);
  });

  it("삭제된 known ID는 같은 target의 명시 복원으로만 되살린다", () => {
    const deleted = scopedDocument([scopedOutside, scopedFrame]), context = scopedFixture().context;
    expect(() => admit(deleted, scopedDocument())).toThrow(StudioScopedWriteDeniedError);
    expect(admit(deleted, scopedDocument(), { ...context, restorations: [{ kind: "stroke", id: "own", targetId: "target" }] }).created).toEqual([]);
    expect(() => admit(deleted, scopedDocument(), { ...context, creations: [{ kind: "stroke", id: "own", targetId: "target" }] })).toThrow(StudioScopedWriteDeniedError);
  });

  it("원시 tombstone 복귀와 보이지 않는 raw 후보 변경도 관찰한다", () => {
    const fixture = scopedFixture(), before = project(scopedDocument()), original = before.entities.get("stroke:own");
    if (!original) throw new Error("담당 획이 없습니다.");
    const deleted: StudioScopedDocumentState = { ...before, entities: new Map(before.entities).set("stroke:own", { ...original, deleted: true, raw: { deleted: true } }) };
    const input = { before: deleted, after: before, ownership: fixture.ownership, targets: [fixture.target], context: fixture.context };
    expect(() => admitStudioScopedWriteEffects(input)).toThrow(StudioScopedWriteDeniedError);
    expect(admitStudioScopedWriteEffects({ ...input, context: { ...fixture.context, restorations: [{ kind: "stroke", id: "own", targetId: "target" }] } }).created).toEqual([]);
    const outside = before.entities.get("element:outside");
    if (!outside) throw new Error("외부 요소가 없습니다.");
    expect(() => admitStudioScopedWriteEffects({ ...input, before, after: { ...before,
      entities: new Map(before.entities).set("element:outside", { ...outside, raw: { losingProp: "변경" } }) } })).toThrow(StudioScopedWriteDeniedError);
  });

  it("컷 밖 이동·noClip·프레임 앵커·전역 설정 변경을 거절한다", () => {
    for (const after of [scopedDocument([{ ...scopedStroke, points: [400, 400, 430, 430] }, scopedOutside, scopedFrame]),
      scopedDocument([{ ...scopedStroke, noClip: true }, scopedOutside, scopedFrame]),
      scopedDocument([scopedStroke, scopedOutside, { ...scopedFrame, width: 400 }]), { ...scopedDocument(), width: 1000 }]) {
      expect(() => admit(scopedDocument(), after)).toThrow(StudioScopedWriteDeniedError);
    }
  });

  it("다각·대각 컷은 renderer와 같은 공용 실제 클립을 검증하고 빈 points는 사각형으로 보존한다", () => {
    for (const points of [[0, 0, 300, 0, 0, 300], []]) {
      const frame = { ...scopedFrame, points }, before = scopedDocument([scopedStroke, scopedOutside, frame]);
      expect(admit(before, scopedDocument([{ ...scopedStroke, color: "#ff0000" }, scopedOutside, frame])).targetIds).toEqual(["target"]);
    }
    const frame = { ...scopedFrame, points: [0, 0, 1] };
    expect(() => validateStudioScopedWriteTarget(scopedFixture().target, project(scopedDocument([scopedStroke, frame])), new Map())).toThrow(StudioScopedWriteDeniedError);
  });

  it("전체 크기의 파생 브러시 이미지도 실제 frameClipId를 소비하면 담당 컷에서 편집한다", () => {
    const image = { id: "own", type: "image", src: "asset:canonical-brush", x: 0, y: 0, width: 800, height: 1200, noClip: false, frameClipId: "frame", opacity: 1 };
    const before = scopedDocument([image, scopedFrame]), ownership = new Map([["element:own", "target"]]);
    expect(admit(before, scopedDocument([{ ...image, opacity: 0.5 }, scopedFrame]), scopedFixture().context, ownership).targetIds).toEqual(["target"]);
    for (const patch of [{ frameClipId: "other-frame" }, { frameClipId: undefined }, { noClip: true }]) {
      expect(() => admit(before, scopedDocument([{ ...image, ...patch, opacity: 0.5 }, scopedFrame]), scopedFixture().context, ownership)).toThrow(StudioScopedWriteDeniedError);
    }
  });

  it("밖 clipBelow 요소의 base가 바뀌는 순서·삭제·내용 변경을 거절한다", () => {
    const clipped = { ...scopedOutside, clipBelow: true }, before = scopedDocument([scopedStroke, clipped, scopedFrame]);
    for (const elements of [[clipped, scopedStroke, scopedFrame], [clipped, scopedFrame], [{ ...scopedStroke, opacity: 0.5 }, clipped, scopedFrame]]) {
      expect(() => admit(before, scopedDocument(elements))).toThrow(StudioScopedWriteDeniedError);
    }
  });

  it("일반 컷 클립을 소비하지 않는 live/document adjustment를 제한 컷으로 승인하지 않는다", () => {
    for (const extra of [{ adjustmentLayer: { version: 1, scope: "composite-below" } }, { type: "adjustment" }]) {
      const adjustment = { ...scopedOutside, ...extra, id: "own", x: 20, y: 20, width: 30, height: 30, noClip: false };
      const before = scopedDocument([adjustment, scopedFrame]), after = scopedDocument([{ ...adjustment, opacity: 0.2 }, scopedFrame]);
      expect(() => admit(before, after, scopedFixture().context, new Map([["element:own", "target"]]))).toThrow(StudioScopedWriteDeniedError);
    }
  });

  it("그룹 가시성 변경은 현재 자식 모두의 실제 효과 범위를 재검사한다", () => {
    const group = { id: "group", name: "선화", hidden: false }, owned = { ...scopedStroke, groupId: group.id, points: [500, 500, 510, 510] };
    expect(() => admit(scopedDocument([owned, scopedFrame], [group]), scopedDocument([owned, scopedFrame], [{ ...group, hidden: true }]),
      scopedFixture().context, new Map([["stroke:own", "target"], [scopedEntityKey("group", "group", "page"), "target"]]))).toThrow(StudioScopedWriteDeniedError);
  });

  it("최초 등록도 실제 ID·전체 그룹 자식·공유 surface 소비자를 확인한다", () => {
    const { target } = scopedFixture();
    expect(validateStudioScopedWriteTarget(target, project(scopedDocument()), new Map())).toEqual([{ kind: "stroke", id: "own", targetId: "target" }]);
    expect(() => validateStudioScopedWriteTarget({ ...target, definition: { ...target.definition, entities: [{ kind: "stroke", id: "missing" }] } },
      project(scopedDocument()), new Map())).toThrow(StudioScopedWriteDeniedError);
    const referenced = scopedDocument([{ ...scopedStroke, surfaceId: "shared" }, { ...scopedOutside, surfaceId: "shared" }, scopedFrame]);
    expect(() => validateStudioScopedWriteTarget({ ...target, definition: { ...target.definition, entities: [
      { kind: "stroke", id: "own" }, { kind: "surface", id: "shared" }] } }, project(referenced), new Map())).toThrow(StudioScopedWriteDeniedError);
  });

  it("보존된 stroke ID를 element kind로 바꿔 새 귀속으로 등록할 수 없다", () => {
    const context = { ...scopedFixture().context, creations: [{ kind: "element" as const, id: "own", targetId: "target" }] };
    expect(() => admit(scopedDocument([scopedOutside, scopedFrame]), scopedDocument([
      { id: "own", type: "image", x: 20, y: 20, width: 30, height: 30 }, scopedOutside, scopedFrame]), context)).toThrow(StudioScopedWriteDeniedError);
  });

  it("두 페이지의 같은 group ID를 별도 실제 객체로 보존하고 담당 페이지 그룹만 수정한다", () => {
    const f = scopedFixture(), group = { id: "same/group", name: "선화", hidden: false };
    const doc = { width: 800, pagesList: [
      { id: "page", canvasH: 1200, groups: [group], elements: [{ ...scopedStroke, groupId: group.id }, scopedFrame] },
      { id: "page-two", canvasH: 1200, groups: [group], elements: [{ ...scopedStroke, id: "other-stroke", groupId: group.id }, { ...scopedFrame, id: "other-frame" }] },
    ] };
    const ownKey = scopedEntityKey("group", group.id, "page"), otherKey = scopedEntityKey("group", group.id, "page-two");
    expect(ownKey).not.toBe(otherKey);
    expect(scopedEntityIdentity(ownKey)).toEqual({ kind: "group", id: group.id, pageId: "page" });
    const before = project(doc), ownership = new Map([...f.ownership, [ownKey, "target"]]);
    expect(before.entities.has(ownKey) && before.entities.has(otherKey)).toBe(true);
    const ownChanged = { ...doc, pagesList: doc.pagesList.map((page) => page.id === "page" ? { ...page, groups: [{ ...group, hidden: true }] } : page) };
    expect(admitStudioScopedWriteEffects({ before, after: project(ownChanged), ownership, context: f.context, targets: [f.target] }).targetIds).toEqual(["target"]);
    const foreignChanged = { ...doc, pagesList: doc.pagesList.map((page) => page.id === "page-two" ? { ...page, groups: [{ ...group, hidden: true }] } : page) };
    expect(() => admitStudioScopedWriteEffects({ before, after: project(foreignChanged), ownership, context: f.context, targets: [f.target] })).toThrow(StudioScopedWriteDeniedError);
  });
});
