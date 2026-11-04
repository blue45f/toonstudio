import { describe, expect, it, vi } from "vitest";
import { STUDIO_ROLE_PIPELINE_STAGES, type StudioRolePipelineState } from "@toonstudio/contracts/studio-role-pipeline";
import type { StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";
import type { PageState } from "../studio-page-state";
import type { DrawEl, FrameEl } from "../studio-element-model";
import { planStudioDrawPointerStart } from "../brush/studio-draw-pointer-start-plan";
import { createStudioScopedWriteFixture } from "./studio-scoped-write.test-fixture";
import { bindStudioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { admitStudioScopedDrawStart, admitStudioScopedPagesCommit, assertStudioScopedDrawContinuation } from "./studio-scoped-write-mutation";
import { createStudioCrdtTransitionPublisher } from "../studio-cuttoon-editor/runtime/createStudioCrdtTransitionPublisher";

function editor(editable = true) {
  const f = createStudioScopedWriteFixture();
  const target = f.policy.targets[0];
  if (!target) throw new Error("원고 fixture가 없습니다.");
  const pipeline: StudioRolePipelineState = { version: 1, productionProjectId: "production-1", enabled: true,
    roleBindings: [{ roleId: "story", assignmentId: "assignment-1" }], groupMappings: [{ groupId: "story-notes", targetIds: ["target-1"] }],
    stageTasks: STUDIO_ROLE_PIPELINE_STAGES.map((stage, i) => ({ stageId: stage.id, taskId: i === 0 ? "current-task-1" : `task-${i}` })),
    activeStageId: "story-script", frozenStageIds: [], approvedAt: null, history: [] };
  const policy: StudioScopedWritePolicy = { ...f.policy, fullEdit: true, scopedWrite: false, rolePipeline: pipeline,
    rolePipelineAccess: { editableTargetIds: editable ? ["target-1"] : [], frozenTargetIds: editable ? [] : ["target-1"] },
    targets: [{ ...target, definition: { ...target.definition, layerId: "protected", entities: [{ kind: "group", id: "protected" }, { kind: "stroke", id: "existing" }] } }],
    ownedEntities: [{ kind: "group", id: "protected", targetId: "target-1" }, { kind: "stroke", id: "existing", targetId: "target-1" }] };
  f.authority.setPolicy(policy);
  const owner = { current: { locked: false } }, unbind = bindStudioScopedWriteAuthority(owner, f.authority);
  const stroke: DrawEl = { id: "existing", type: "draw", groupId: "protected", points: [1, 2, 3, 4], stroke: "#000", strokeWidth: 3 };
  const page: PageState = { id: "page-1", elements: [stroke], groups: [{ id: "protected", name: "보호 원고" }], bg: "#fff", bgGrad: null, canvasH: 1000 };
  const reportError = vi.fn();
  const commit = (next: readonly PageState[]) => admitStudioScopedPagesCommit({ owner, previous: [page], next, reportError, lockMessage: () => "잠금" });
  return { ...f, policy, pipeline, owner, unbind, page, stroke, reportError, commit };
}

function frameEditor() {
  const e = editor(), target = e.policy.targets[0];
  if (!target) throw new Error("컷 원고 fixture가 없습니다.");
  const frames: FrameEl[] = [
    { id: "frame-own", type: "frame", x: 0, y: 0, width: 360, height: 768 },
    { id: "frame-outside", type: "frame", x: 360, y: 0, width: 360, height: 768 },
  ];
  const policy: StudioScopedWritePolicy = { ...e.policy,
    targets: [{ ...target, definition: { ...target.definition, layerId: null, frameId: "frame-own", entities: [] } }], ownedEntities: [] };
  e.authority.setPolicy(policy);
  const page: PageState = { ...e.page, elements: frames, groups: [] };
  return { ...e, policy, page, frames };
}

function pen(x = 100, y = 100): DrawEl {
  return planStudioDrawPointerStart({ id: "fresh-pen", position: { x, y }, pointer: { pointerType: "mouse", pressure: 0.5, timeStamp: 123 },
    drawMode: "pen", drawShape: "line", shapeFill: false, color: "#123456", strokeWidth: 8, brushOpacity: 1, brush: "pen",
    stampTuning: null, brushDynamics: {}, stabilizer: 0, stabilizerMode: "standard", velocitySensitivity: 0.65, pressureCurve: 1,
    positionScale: 2, brushTip: { tiltEnabled: false, angleDeg: 0, roundness: 1 },
    symmetry: { type: "none", centerX: 360, centerY: 384, radialCount: 6 } }).element;
}

describe("전체 편집자의 명시 매핑 원고 경계", () => {
  it("opt-in OFF에서는 기존 전체 편집을 보존하고 전역 잠금을 올리지 않는다", () => {
    const e = editor(false);
    try {
      e.authority.setPolicy({ ...e.policy, rolePipeline: { ...e.pipeline, enabled: false } });
      expect(e.commit([{ ...e.page, elements: [{ ...e.stroke, stroke: "#f00" }] }])).toBe(true);
      expect(e.owner.current.locked).toBe(false);
    } finally { e.unbind(); }
  });
  it("현재 grant를 명시 선택하기 전에는 fullEdit도 보호 원화를 수정하지 못한다", () => {
    const e = editor();
    try {
      expect(e.commit([{ ...e.page, elements: [{ ...e.stroke, stroke: "#f00" }] }])).toBe(false);
      e.choose();
      expect(e.commit([{ ...e.page, elements: [{ ...e.stroke, stroke: "#f00" }] }])).toBe(true);
      expect(e.authority.captureFullEditWriteContext()).toMatchObject({ grantIds: ["grant-1"], policyVersion: 1 });
      expect(e.page.elements[0]).toBe(e.stroke);
    } finally { e.unbind(); }
  });
  it("인계·승인 잠금 중 보호 범위는 차단하고 다른 페이지의 일반 편집은 보존한다", () => {
    const e = editor(false);
    try {
      expect(e.commit([{ ...e.page, elements: [{ ...e.stroke, stroke: "#f00" }] }])).toBe(false);
      const free: PageState = { ...e.page, id: "free-page", groups: [], elements: [] };
      expect(e.commit([e.page, free])).toBe(true);
      expect(() => admitStudioScopedDrawStart(e.owner, "page-1", e.page.elements, { ...e.stroke, id: "forged" })).toThrow();
      expect(e.owner.current.locked).toBe(false);
    } finally { e.unbind(); }
  });
  it("실제 보호 레이어의 새 획에는 grant 문맥을 싣고 회수·계정전환 뒤 늦은 획을 거절한다", () => {
    const e = editor();
    try {
      e.choose();
      const fresh = admitStudioScopedDrawStart(e.owner, "page-1", e.page.elements, { ...e.stroke, id: "fresh" });
      expect(e.commit([{ ...e.page, elements: [...e.page.elements, fresh] }])).toBe(true);
      expect(e.authority.captureFullEditWriteContext()?.creations).toEqual([{ kind: "stroke", id: "fresh", targetId: "target-1" }]);
      e.fence.authScopeKey = "other";
      expect(() => assertStudioScopedDrawContinuation(e.owner, "fresh")).toThrow();
      e.fence.authScopeKey = "actor-1";
      e.authority.setPolicy({ ...e.policy, policyVersion: 2, rolePipelineAccess: { editableTargetIds: [], frozenTargetIds: ["target-1"] } });
      expect(() => assertStudioScopedDrawContinuation(e.owner, "fresh")).toThrow();
    } finally { e.unbind(); }
  });
  it("전체 편집의 일반 undo·redo와 오프라인 발행도 정본 변경 전에 같은 보호를 검사한다", () => {
    const e = editor(false);
    try {
      const publisher = createStudioCrdtTransitionPublisher({ actorId: "actor-1", automaticRasterPublicationEnabled: false,
        mutationOwner: e.owner, getDocument: () => null, getRuntime: () => null, reportError: e.reportError, reportNotice: vi.fn() });
      expect(publisher.publishHistoryTransition([e.page], [{ ...e.page, elements: [] }])).toBe(false);
      expect(publisher.publishSceneTransition([e.page], [{ ...e.page, elements: [{ ...e.stroke, stroke: "#f00" }] }])).toBe(false);
      expect(publisher.publishHistoryTransition([e.page], [e.page])).toBe(true);
    } finally { e.unbind(); }
  });
  it("서로 명시 선택한 두 실제 grant만 전체 저장에 보존하고 새 정책에는 승계하지 않는다", () => {
    const e = editor(), first = e.policy.targets[0];
    if (!first) throw new Error("실제 대상이 없습니다.");
    try {
      const policy: StudioScopedWritePolicy = { ...e.policy,
        targets: [...e.policy.targets, { ...first, definition: { ...first.definition, id: "target-2", pageId: "page-2", layerId: "second", entities: [] } }],
        grants: e.policy.grants.map((grant) => ({ ...grant, taskId: "current-task-1" })),
        rolePipeline: { ...e.pipeline, roleBindings: [...e.pipeline.roleBindings, { roleId: "story", assignmentId: "assignment-2" }],
          groupMappings: [{ groupId: "story-notes", targetIds: ["target-1", "target-2"] }] },
        rolePipelineAccess: { editableTargetIds: ["target-1", "target-2"], frozenTargetIds: [] } };
      e.authority.setPolicy(policy);
      for (const n of [1, 2]) {
        e.authority.chooseTarget(`target-${n}`, `grant-${n}`);
        e.authority.registerCreation(e.authority.captureDrawingTicket(`page-${n}`, n === 1 ? "protected" : "second"), "stroke", `new-${n}`);
        e.authority.captureFullEditWriteContext();
      }
      expect(e.authority.fullEditSaveContext()?.grantIds.sort()).toEqual(["grant-1", "grant-2"]);
      e.authority.setPolicy({ ...policy, policyVersion: 2 });
      e.authority.chooseTarget(null);
      expect(e.authority.fullEditSaveContext()).toBeUndefined();
    } finally { e.unbind(); }
  });
});

describe("실제 펜 시작점의 매핑 컷 경계", () => {
  it("frameClipId가 없는 실제 펜도 자동 클립되는 보호 컷의 명시 선택을 요구한다", () => {
    const e = frameEditor(), stroke = pen();
    try {
      expect(stroke.frameClipId).toBeUndefined();
      expect(stroke.noClip).toBeUndefined();
      expect(() => admitStudioScopedDrawStart(e.owner, e.page.id, e.page.elements, stroke)).toThrow();
      expect(e.authority.captureFullEditWriteContext()).toBeUndefined();
    } finally { e.unbind(); }
  });
  it("명시 선택한 컷에서 시작한 펜의 새 ID만 grant 문맥과 실제 클립에 연결한다", () => {
    const e = frameEditor(), stroke = pen();
    try {
      e.choose();
      const fresh = admitStudioScopedDrawStart(e.owner, e.page.id, e.page.elements, stroke);
      expect(fresh).toMatchObject({ frameClipId: "frame-own", noClip: false });
      expect(stroke.frameClipId).toBeUndefined();
      const admitted = admitStudioScopedPagesCommit({ owner: e.owner, previous: [e.page], next: [{ ...e.page, elements: [...e.page.elements, fresh] }],
        reportError: e.reportError, lockMessage: () => "잠금" });
      expect(e.reportError.mock.calls).toEqual([]);
      expect(admitted).toBe(true);
      expect(e.authority.captureFullEditWriteContext()).toMatchObject({ grantIds: ["grant-1"], policyVersion: 1,
        creations: [{ kind: "stroke", id: stroke.id, targetId: "target-1" }] });
    } finally { e.unbind(); }
  });
  it("다른 매핑 컷의 새 획을 현재 선택한 컷에 임의로 귀속하지 않는다", () => {
    const e = frameEditor(), first = e.policy.targets[0];
    if (!first) throw new Error("컷 원고 fixture가 없습니다.");
    try {
      e.authority.setPolicy({ ...e.policy,
        targets: [...e.policy.targets, { ...first, definition: { ...first.definition, id: "target-2", frameId: "frame-outside", entities: [] } }],
        grants: e.policy.grants.map((grant) => ({ ...grant, taskId: "current-task-1" })),
        rolePipeline: { ...e.pipeline, roleBindings: [...e.pipeline.roleBindings, { roleId: "story", assignmentId: "assignment-2" }],
          groupMappings: [{ groupId: "story-notes", targetIds: ["target-1", "target-2"] }] },
        rolePipelineAccess: { editableTargetIds: ["target-1", "target-2"], frozenTargetIds: [] } });
      e.choose();
      expect(() => admitStudioScopedDrawStart(e.owner, e.page.id, e.page.elements, pen(500))).toThrow();
      expect(e.authority.captureFullEditWriteContext()).toBeUndefined();
    } finally { e.unbind(); }
  });
  it("선택 상태여도 비매핑 컷·컷 밖·명시 noClip 펜은 전체 편집 경로를 보존한다", () => {
    const e = frameEditor();
    try {
      e.choose();
      for (const stroke of [pen(500), pen(800), { ...pen(), noClip: true }]) {
        expect(admitStudioScopedDrawStart(e.owner, e.page.id, e.page.elements, stroke)).toBe(stroke);
        expect(e.authority.captureFullEditWriteContext()).toBeUndefined();
      }
      expect(() => admitStudioScopedDrawStart(e.owner, e.page.id, e.page.elements, { ...pen(), frameClipId: "frame-own", noClip: true })).toThrow();
    } finally { e.unbind(); }
  });
  it.each([false, true])("같은 크기로 겹치는 보호 컷의 모호한 자동 클립은 순서와 무관하게 거절한다 (%s)", (protectedFirst) => {
    const e = frameEditor(), own = e.frames[0];
    if (!own) throw new Error("보호 컷 fixture가 없습니다.");
    try {
      e.choose();
      const overlap: FrameEl = { ...own, id: "overlap" }, frames = protectedFirst ? [own, overlap] : [overlap, own];
      expect(() => admitStudioScopedDrawStart(e.owner, e.page.id, frames, pen())).toThrow();
      expect(e.authority.captureFullEditWriteContext()).toBeUndefined();
    } finally { e.unbind(); }
  });
  it("겹치는 컷 중 유일한 작은 컷이 비매핑이면 renderer와 같은 귀속을 보존한다", () => {
    const e = frameEditor();
    try {
      e.choose();
      const stroke = pen(), smaller: FrameEl = { id: "smaller", type: "frame", x: 50, y: 50, width: 100, height: 100 };
      expect(admitStudioScopedDrawStart(e.owner, e.page.id, [...e.frames, smaller], stroke)).toBe(stroke);
      expect(e.authority.captureFullEditWriteContext()).toBeUndefined();
    } finally { e.unbind(); }
  });
  it("요소 1만 개에서도 기존 획의 좌표 이력을 다시 읽지 않고 실제 프레임만 대조한다", () => {
    const e = frameEditor();
    try {
      e.choose();
      const history = Array.from({ length: 9_998 }, (_, index) => {
        const stroke = { ...e.stroke, id: `history-${index}` };
        Object.defineProperty(stroke, "points", { get: () => { throw new Error("기존 좌표 이력을 읽었습니다."); } });
        return stroke;
      });
      expect(admitStudioScopedDrawStart(e.owner, e.page.id, [...e.frames, ...history], pen())).toMatchObject({ frameClipId: "frame-own", noClip: false });
    } finally { e.unbind(); }
  });
});
