import { describe, expect, it } from "vitest";
import { scopedManagementUiFixture } from "./studio-scoped-write-management.test-fixture";
import { scopedManagementRequest, scopedSavedPages } from "./studio-scoped-write-management-model";

describe("저장 원고의 명시 ID 선택", () => {
  it("Production 컷 이름을 actual frame으로 대체하지 않고 draw=stroke와 실제 그룹을 유지한다", () => {
    const f = scopedManagementUiFixture(), pages = scopedSavedPages(f.doc);
    expect(pages[0]?.id).toBe("page/one");
    expect(pages[0]?.groups[0]).toMatchObject({ kind: "group", id: "layer" });
    expect(pages[0]?.entities.find((entry) => entry.id === "stroke/one")).toMatchObject({ kind: "stroke", groupId: "layer" });
    expect(pages[0]?.entities.find((entry) => entry.id === "frame@one")).toMatchObject({ type: "frame", id: "frame@one" });
  });
  it("공유 surface는 실제 소비자 ID 전체를 보존해 다른 요소를 빼고 고를 수 없게 한다", () => {
    const f = scopedManagementUiFixture(), page = f.doc.pagesList[0];
    if (!page) throw new Error("페이지가 없습니다.");
    const pages = scopedSavedPages({ ...f.doc, pagesList: [{ ...page, elements: page.elements.map((entry) => ({ ...entry, rasterSurfaceId: "surface" })) }] });
    expect(pages[0]?.surfaces[0]?.consumerKeys).toEqual(["element:frame@one", "stroke:stroke/one"]);
  });
  it("식별자가 없는 레거시·중복 페이지는 순번으로 추정하지 않는다", () => {
    expect(() => scopedSavedPages({ pagesList: [{ elements: [] }] })).toThrow();
    expect(() => scopedSavedPages({ pagesList: [{ id: "page", elements: [] }, { id: "page", elements: [] }] })).toThrow();
  });
  it("현재 정책 version과 새 mutation을 묶고 grant.taskId를 보존한다", () => {
    const request = scopedManagementRequest(4, { type: "grant", id: "grant", productionProjectId: "production", taskId: "color-task",
      assignmentId: "artist-role", targetIds: ["target"], startsAt: "2026-10-29T00:00:00.000Z", endsAt: null }, "10d86a7b-b1cc-48ea-943f-4c799a0c5af2");
    expect(request).toMatchObject({ expectedPolicyVersion: 4, command: { taskId: "color-task" } });
  });
});
