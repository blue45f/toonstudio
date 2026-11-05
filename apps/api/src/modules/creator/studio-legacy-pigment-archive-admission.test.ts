import { describe, expect, it } from "vitest";
import type { StudioCrdtScopedRecord } from "@toonstudio/contracts/studio-crdt-authoring";
import { assertStudioLegacyPigmentArchiveTransition as admit, assertStudioLegacyPigmentArchiveCrdtRecords,
  assertStudioLegacyPigmentArchiveBaselineProjection, canonicalStudioLegacyPigmentV6Source,
  studioLegacyPigmentArchiveSourceAuthority } from "./studio-legacy-pigment-archive-admission";

function fixture(hidden?: boolean) {
  const source = { id: "source", type: "draw", kind: "freehand", mode: "pen", name: "원본 획", groupId: "source-group",
    points: [1, 2, 3, 4], pressures: [0.4, 0.7], stroke: "#ffff00", strokeWidth: 20, clipBelow: true, locked: false,
    ...(hidden === undefined ? {} : { hidden }),
    brushEnginePrograms: { version: 1, material: { version: 1, slots: { pigment: "pigment-mixbox" } } },
  };
  const archive = { ...structuredClone(source), id: "archive", hidden: true, groupId: "archive-group",
    legacyPigmentArchive: { version: 1, sourceElementId: source.id, sourceGroupId: source.groupId, sourceIndex: 0,
      ...(hidden === undefined ? {} : { sourceHidden: hidden }) } };
  const copy = { ...structuredClone(source), brushEnginePrograms: { version: 1, material: { version: 1, slots: { pigment: "pigment-latent" } } } };
  const sourceGroup = { id: "source-group", name: "선화" }, archiveGroup = { id: "archive-group", name: "원본", hidden: true, locked: true };
  const before = { pagesList: [{ id: "page", elements: [source], groups: [sourceGroup] }] };
  const after = { pagesList: [{ id: "page", elements: [archive, copy], groups: [archiveGroup, sourceGroup] }] };
  return { source, archive, copy, sourceGroup, archiveGroup, before, after };
}
function rawRecords(f: ReturnType<typeof fixture>, archived = true): StudioCrdtScopedRecord[] {
  return [
    { kind: "group", id: f.archiveGroup.id, pageId: "page", layerId: f.archiveGroup.id, deleted: !archived, value: f.archiveGroup, raw: {} },
    { kind: "stroke", id: f.archive.id, pageId: "page", layerId: f.archiveGroup.id, deleted: !archived, value: f.archive, raw: {} },
  ];
}

describe("이전 혼색 보관 원본의 서버 전이", () => {
  it("보관 필드 없는 일반 원고 쓰기는 기존 검증에 위임한다", () => {
    expect(() => admit({ version: 2 }, { title: "수정" })).not.toThrow();
  });
  it.each([undefined, false, true])("hidden=%s의 유무·값과 나머지 원본을 정확히 보존한다", (hidden) => {
    const f = fixture(hidden), source = JSON.stringify(f.before);
    expect(() => admit(f.before, f.after)).not.toThrow();
    expect(JSON.stringify(f.before)).toBe(source);
  });
  it.each(["points", "name", "clipBelow", "locked", "program", "index", "group", "hidden"] as const)("신규 보관본의 %s 위조를 거절한다", (field) => {
    const f = fixture();
    if (field === "points") f.archive.points = [1, 2, 30, 40];
    if (field === "name") f.archive.name = "변조";
    if (field === "clipBelow") f.archive.clipBelow = false;
    if (field === "locked") f.archive.locked = true;
    if (field === "program") f.archive.brushEnginePrograms.material.slots.pigment = "pigment-latent";
    if (field === "index") f.archive.legacyPigmentArchive.sourceIndex = 1;
    if (field === "group") f.archive.legacyPigmentArchive.sourceGroupId = "different-group";
    if (field === "hidden") Object.assign(f.archive.legacyPigmentArchive, { sourceHidden: false });
    expect(() => admit(f.before, f.after)).toThrow();
  });
  it.each(["version", "unknown", "visible", "unlocked-group", "wrong-group"] as const)("손상된 %s 보관 자료를 거절한다", (field) => {
    const f = fixture();
    if (field === "version") f.archive.legacyPigmentArchive.version = 2;
    if (field === "unknown") Object.assign(f.archive.legacyPigmentArchive, { approval: "forged" });
    if (field === "visible") f.archive.hidden = false;
    if (field === "unlocked-group") f.archiveGroup.locked = false;
    if (field === "wrong-group") f.archive.groupId = "source-group";
    expect(() => admit(f.before, f.after)).toThrow();
  });
  it("새 작품과 기존 작품의 외부 자료 import는 출처 필드를 서버 이력·권리 증명으로 취급하지 않는다", () => {
    const f = fixture();
    expect(() => admit(undefined, f.after)).not.toThrow();
    expect(() => admit({ pagesList: [{ id: "page", elements: [{ id: "unrelated", type: "text" }] }] }, f.after)).not.toThrow();
  });
  it("보관 필드만 버린 구 reader 저장과 원본 본문 변조를 거절한다", () => {
    const f = fixture(), stripped = structuredClone(f.after);
    Reflect.deleteProperty(stripped.pagesList[0]!.elements[0]!, "legacyPigmentArchive");
    expect(() => admit(f.after, stripped)).toThrow(/복원 정보/u);
    const changed = structuredClone(f.after); changed.pagesList[0]!.elements[0]!.points = [5, 6];
    expect(() => admit(f.after, changed)).toThrow(/바꿀 수/u);
  });
  it("보관본 원소의 명시 삭제와 원본 복구 undo는 기존 쓰기 권한을 따른다", () => {
    const f = fixture();
    expect(() => admit(f.after, f.before)).not.toThrow();
    expect(() => admit(f.after, { pagesList: [{ id: "page", elements: [f.copy], groups: [f.sourceGroup] }] })).not.toThrow();
    expect(() => admit(f.after, { pagesList: [{ id: "page", elements: [{ id: "extra", type: "text" }, f.source], groups: [f.sourceGroup] }] })).not.toThrow();
  });
  it("활성 자체 혼색 획은 계속 편집하고 전체 페이지 삭제는 기존 권한 경계를 따른다", () => {
    const f = fixture(), edited = structuredClone(f.after); edited.pagesList[0]!.elements[1]!.points = [1, 2, 50, 60];
    expect(() => admit(f.after, edited)).not.toThrow();
    expect(() => admit(f.after, { pagesList: [] })).not.toThrow();
  });
  it("그룹 없는 마스터의 숨김 원본을 허용하되 페이지 그룹을 가져오지 않는다", () => {
    const f = fixture();
    const source = { ...f.source }; Reflect.deleteProperty(source, "groupId"); Reflect.deleteProperty(source, "clipBelow");
    const archive = { ...f.archive }; Reflect.deleteProperty(archive, "groupId"); Reflect.deleteProperty(archive, "clipBelow");
    Reflect.deleteProperty(archive.legacyPigmentArchive, "sourceGroupId");
    expect(() => admit({ pagesList: [], master: { elements: [source] } }, { pagesList: [], master: { elements: [archive, f.copy] } })).not.toThrow();
  });
  it("undo로 숨긴 CRDT 원본도 본문과 출처를 보존한다", () => {
    const f = fixture(), before = rawRecords(f), after = rawRecords(f, false);
    expect(() => assertStudioLegacyPigmentArchiveCrdtRecords(f.after, before, after)).not.toThrow();
    const changed = structuredClone(after); changed[1] = { ...changed[1]!, value: { ...f.archive, name: "변조" } };
    expect(() => assertStudioLegacyPigmentArchiveCrdtRecords(f.after, before, changed)).toThrow(/삭제 이력/u);
  });
  it("baseline 뒤 승인된 undo의 다음 편집은 허용하고 baseline-only strip은 거절한다", () => {
    const f = fixture(), edited = structuredClone(f.before); edited.pagesList[0]!.elements[0]!.name = "undo 뒤 수정";
    expect(() => assertStudioLegacyPigmentArchiveBaselineProjection(f.after, edited, rawRecords(f, false))).not.toThrow();
    const stripped = structuredClone(f.after); Reflect.deleteProperty(stripped.pagesList[0]!.elements[0]!, "legacyPigmentArchive");
    expect(() => assertStudioLegacyPigmentArchiveBaselineProjection(f.after, stripped, [])).toThrow();
  });
  it.each([undefined, "linear-full-v1", "linear-residual-v2", "linear-residual-path-v3"])("%s의 기존 v6 기본 채널만 정확히 계산한다", (pressureModel) => {
    const source = { id: "source", type: "draw", points: [1, 2, 3, 4], ...(pressureModel ? { pressureModel } : {}) };
    expect(canonicalStudioLegacyPigmentV6Source(source)).toEqual({ ...source, kind: "freehand", mode: "pen",
      pressures: [pressureModel ? 1 : 0.5, pressureModel ? 1 : 0.5], tiltXs: [0, 0], tiltYs: [0, 0], twists: [0, 0], speeds: [0, 0], tangentialPressures: [0, 0] });
  });
  it("기존 보관본의 현재 그룹 해제·이동과 그룹 삭제는 원본 출처와 본문을 유지한다", () => {
    const f = fixture(), detached = structuredClone(f.after); Reflect.deleteProperty(detached.pagesList[0]!.elements[0]!, "groupId");
    detached.pagesList[0]!.groups = [f.sourceGroup];
    expect(() => admit(f.after, detached)).not.toThrow();
    const moved = structuredClone(detached); moved.pagesList[0]!.elements[0]!.groupId = "source-group";
    expect(() => admit(f.after, moved)).not.toThrow();
    moved.pagesList[0]!.elements[0]!.name = "사용자 변경";
    expect(() => admit(f.after, moved)).toThrow(/바꿀 수/u);
  });
  it("그룹을 해제·이동한 보관본도 새 작품 import와 서버 snapshot 복원 자료로 왕복한다", () => {
    const f = fixture(), detached = structuredClone(f.after); Reflect.deleteProperty(detached.pagesList[0]!.elements[0]!, "groupId");
    detached.pagesList[0]!.groups = [f.sourceGroup];
    expect(() => admit(undefined, detached)).not.toThrow();
    const moved = structuredClone(detached); moved.pagesList[0]!.elements[0]!.groupId = f.sourceGroup.id;
    expect(() => admit(undefined, moved)).not.toThrow();
  });
  it("baseline 원문은 실제 Y 원본이 정확한 v6 표현일 때만 신규 보관 출처를 증명한다", () => {
    const f = fixture(), canonical = canonicalStudioLegacyPigmentV6Source(f.source);
    const current = { pagesList: [{ ...f.before.pagesList[0], elements: [canonical] }] };
    expect(() => admit(studioLegacyPigmentArchiveSourceAuthority(f.before, current, f.after), f.after)).not.toThrow();
    canonical.points = [10, 20, 30, 40];
    expect(() => admit(studioLegacyPigmentArchiveSourceAuthority(f.before, current, f.after), f.after)).toThrow();
  });
});
