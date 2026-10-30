import { describe, expect, it, vi } from "vitest";
import type { SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import type { StudioScopedAuthorization } from "./studio-scoped-write-store";
import { scopedEntityKey } from "./studio-scoped-write-effects";
import { assertStudioScopedTaskOutputAuthorization } from "./studio-scoped-write-purpose";
import { scopedCaptureFixture } from "./studio-scoped-write-capture.test-fixture";
import { scopedDocument, scopedFixture, scopedFrame, scopedOutside, scopedStroke } from "./studio-scoped-write.test-fixture";

function fixture(source: unknown = scopedDocument()) {
  const { authorization } = scopedFixture(), capture = scopedCaptureFixture(source);
  const command: SubmitProductionTaskOutputCommand = { type: "submit-task-output", taskId: "task", submissionId: "submission",
    submittedByAssignmentId: "role", documentRole: "lineart", source: { subject: capture.capture.subject },
    selection: { mode: "frames", pages: [{ pageId: "page", ordinal: 0, frameIds: ["frame"] }] }, inputs: { mode: "current" },
    target: { kind: "create", deliverableId: "deliverable", type: "lineart", expectedFormat: "studio-document", completionCriteria: ["선화 확인"] } };
  return { authorization, capture, command, query: { query: vi.fn().mockResolvedValue([capture.row]) } };
}

describe("실제 담당 작업에 한정한 불변 원고 제출", () => {
  it("담당 frame·task·assignment의 정확한 캡처만 제출한다", async () => {
    const f = fixture(), before = structuredClone({ command: f.command, capture: f.capture.capture });
    expect(await assertStudioScopedTaskOutputAuthorization(f.query, f.authorization, f.command, { output: f.capture.capture })).toEqual(["target"]);
    expect({ command: f.command, capture: f.capture.capture }).toEqual(before);
    expect(f.authorization.work.access.edit).toBe(false);
  });

  it("레이어 담당자는 전체 페이지 이미지를 읽기 맥락으로 보존하며 자기 작업에만 제출한다", async () => {
    const group = { id: "group", name: "선화", hidden: false }, doc = scopedDocument([{ ...scopedStroke, groupId: "group" }, scopedOutside, scopedFrame], [group]);
    const f = fixture(doc), target = f.authorization.targets[0];
    if (!target) throw new Error("등록 범위가 없습니다.");
    const layerTarget = { ...target, definition: { ...target.definition, frameId: null, layerId: "group",
      scope: { kind: "layer-group" as const, id: "production-layer", ancestors: [...target.definition.scope.ancestors,
        { kind: "cut" as const, id: target.definition.scope.id }] } } };
    const authorization: StudioScopedAuthorization = { ...f.authorization, targets: [layerTarget], policy: { ...f.authorization.policy,
      targets: [layerTarget], ownership: { ...f.authorization.policy.ownership, [scopedEntityKey("group", "group", "page")]: "target" } } };
    const command: SubmitProductionTaskOutputCommand = { ...f.command, selection: { mode: "pages", pages: [{ pageId: "page", ordinal: 0 }] } };
    expect(await assertStudioScopedTaskOutputAuthorization(f.query, authorization, command, { output: f.capture.capture })).toEqual(["target"]);
    expect(f.capture.capture.pages[0]?.frameIds).toEqual(["frame"]);
    await expect(assertStudioScopedTaskOutputAuthorization(f.query, authorization, { ...command, taskId: "foreign-task" }, { output: f.capture.capture })).rejects.toMatchObject({ code: "policy" });
  });

  it("sourceEvidence·클라이언트의 캡처 번호만으로 현재 grant를 대체할 수 없다", async () => {
    const f = fixture();
    for (const command of [{ ...f.command, taskId: "other-task" }, { ...f.command, submittedByAssignmentId: "other-role" }]) {
      await expect(assertStudioScopedTaskOutputAuthorization(f.query, f.authorization, command, { output: f.capture.capture })).rejects.toMatchObject({ code: "policy" });
    }
    await expect(assertStudioScopedTaskOutputAuthorization({ query: vi.fn().mockResolvedValue([]) }, f.authorization, f.command,
      { output: f.capture.capture })).rejects.toMatchObject({ code: "ambiguous" });
    await expect(assertStudioScopedTaskOutputAuthorization(f.query, f.authorization, f.command,
      { output: { ...f.capture.capture, sourceServerRevision: 99 } })).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("다른 실제 frame·page와 frame 권한의 전체 페이지 제출을 거절한다", async () => {
    const f = fixture();
    const selections: SubmitProductionTaskOutputCommand["selection"][] = [
      { mode: "frames", pages: [{ pageId: "page", ordinal: 0, frameIds: ["other-frame"] }] },
      { mode: "pages", pages: [{ pageId: "other-page", ordinal: 0 }] }, { mode: "document" },
    ];
    for (const selection of selections) await expect(assertStudioScopedTaskOutputAuthorization(f.query, f.authorization,
      { ...f.command, selection }, { output: f.capture.capture })).rejects.toBeDefined();
  });

  it("캡처 원고의 현재 own ID가 범위 밖으로 바뀌었으면 과거 registry만 믿고 제출하지 않는다", async () => {
    const f = fixture(scopedDocument([{ ...scopedStroke, points: [500, 500, 520, 520] }, scopedOutside, scopedFrame]));
    await expect(assertStudioScopedTaskOutputAuthorization(f.query, f.authorization, f.command,
      { output: f.capture.capture })).rejects.toMatchObject({ code: "ambiguous" });
  });

  it("현재 공정은 grant.taskId로 판단하고 최초 등록 task와 raw 귀속을 보존한다", async () => {
    const f = fixture(), grants = f.authorization.grants.map((grant) => ({ ...grant, id: "next-grant", taskId: "color-task" }));
    const authorization = { ...f.authorization, grants };
    expect(await assertStudioScopedTaskOutputAuthorization(f.query, authorization, { ...f.command, taskId: "color-task" }, { output: f.capture.capture })).toEqual(["target"]);
    expect(f.authorization.targets[0]?.definition.taskId).toBe("task");
  });
});
