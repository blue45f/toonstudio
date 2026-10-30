// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serializeStudioCommandJournal } from "../studio-command-journal";
import { hashStudioEditableMesh, serializeStudioEditableMesh, type StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

import { applyStudioSculptStroke } from "./studio-hybrid-sculpt-kernel";
import { commitStudioHybridDccSculptStroke } from "./studio-hybrid-dcc-sculpt-stroke-workspace";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceRedo, workspaceUndo, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { useStudioHybridDccSculptStroke, type StudioHybridDccSculptStrokeHost, type StudioHybridDccSculptStrokeModel } from "./useStudioHybridDccSculptStroke";

import type { StudioSculptGestureToken } from "./studio-hybrid-dcc-sculpt-gesture";

const auth = vi.hoisted(() => ({ actor: "sculpt-owner", revision: 0, listeners: new Set<() => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.actor, getAuthSessionRevision: () => auth.revision, listeners: auth.listeners,
}));

const frames = new Map<number, FrameRequestCallback>();
const cancelledFrames = new Set<number>();
let frameSequence = 0;
const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>((callback) => {
  frameSequence += 1; frames.set(frameSequence, callback); return frameSequence;
});
const cancelFrame = vi.fn<(id: number) => void>((id) => { cancelledFrames.add(id); });

beforeEach(() => {
  auth.actor = "sculpt-owner"; auth.revision = 0; auth.listeners.clear();
  frames.clear(); cancelledFrames.clear(); frameSequence = 0;
  requestFrame.mockClear(); cancelFrame.mockClear();
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function source() { return workspaceAddUnitCube(createStudioHybridDccWorkspace("sculpt-stroke-hook"), "cube"); }
function mesh(workspace: StudioHybridDccWorkspace) {
  const assetId = workspace.activeAssetId;
  if (!assetId) throw new Error("선택한 조형 자산이 없습니다.");
  const record = workspace.session.state.geometry.records[assetId];
  if (!record) throw new Error("선택한 조형 메시가 없습니다.");
  return record.mesh;
}
function point(workspace: StudioHybridDccWorkspace, index = 0): StudioMeshVec3 {
  const vertex = mesh(workspace).vertices[index];
  if (!vertex) throw new Error("실제 큐브의 조형 정점이 없습니다.");
  return { ...vertex.position };
}
function evidence(workspace: StudioHybridDccWorkspace) {
  return { mesh: serializeStudioEditableMesh(mesh(workspace)), hash: hashStudioEditableMesh(mesh(workspace)),
    state: workspace.session.state.stateHash, commandCount: workspace.session.state.commandCount,
    undo: JSON.stringify(workspace.session.undoStack), redo: JSON.stringify(workspace.session.redoStack),
    journal: serializeStudioCommandJournal(workspace.session.journal) };
}
function firstFrame(): number {
  const id = frames.keys().next().value;
  if (id === undefined) throw new Error("예약된 preview frame이 없습니다.");
  return id;
}
/** cancelAnimationFrame 뒤에도 이미 전달 중이던 콜백을 재현할 수 있다. */
function deliverFrame(id: number): void {
  const callback = frames.get(id);
  if (!callback) throw new Error("전달할 preview frame이 없습니다.");
  frames.delete(id); act(() => { callback(16); });
}
function deferredBoolean() {
  const completions: Array<(value: boolean) => void> = [];
  const promise = new Promise<boolean>((resolve) => { completions.push(resolve); });
  return { promise, resolve(value: boolean) {
    const completion = completions.shift();
    if (!completion) throw new Error("호스트 발행 Promise를 두 번 완료했습니다.");
    completion(value);
  } };
}

interface Props {
  readonly workspace: StudioHybridDccWorkspace;
  readonly workspaceDocumentId: string;
  readonly enabled: boolean;
  readonly externalBusy: boolean;
}
interface PendingCommit {
  readonly candidate: StudioHybridDccWorkspace;
  readonly isCurrent: () => boolean;
  readonly onPublished: () => void;
  readonly resolve: (published: boolean) => void;
}

/** 실제 receipt/geometry/저널 계산은 사용하며, 호스트의 비동기 발행만 수동으로 지연한다. */
function mount(workspace = source(), strict = false, scopeRef?: RefObject<HTMLElement | null>) {
  let props: Props = { workspace, workspaceDocumentId: "project-a", enabled: true, externalBusy: false };
  const pending: PendingCommit[] = [], published: StudioHybridDccWorkspace[] = [];
  const commit = vi.fn<StudioHybridDccSculptStrokeHost["commit"]>((receipt, isCurrent, onPublished) => {
    if (!isCurrent()) return Promise.resolve(false);
    // 실제 Panel도 fn()에서 receipt를 소비한 뒤 preview 복구/발행만 await한다.
    const candidate = commitStudioHybridDccSculptStroke(props.workspace, receipt);
    const completion = deferredBoolean();
    pending.push({ candidate, isCurrent, onPublished, resolve: completion.resolve });
    return completion.promise;
  });
  const hook = renderHook((current: Props) => useStudioHybridDccSculptStroke({ ...current, commit, ...(scopeRef ? { scopeRef } : {}) }), {
    initialProps: props, ...(strict ? { wrapper: StrictMode } : {}),
  });
  const update = (patch: Partial<Props>) => {
    props = { ...props, ...patch }; hook.rerender(props);
  };
  const call = (index = 0): PendingCommit => {
    const value = pending[index];
    if (!value) throw new Error("기다리는 호스트 commit이 없습니다.");
    return value;
  };
  const release = async (index = 0): Promise<boolean> => {
    const value = call(index), allowed = value.isCurrent();
    await act(async () => {
      if (allowed) {
        published.push(value.candidate);
        // hook이 자신의 발행을 먼저 종료한 뒤 새 workspace lease로 교체한다.
        value.onPublished(); update({ workspace: value.candidate, externalBusy: false });
      }
      value.resolve(allowed); await Promise.resolve();
    });
    return allowed;
  };
  return { hook, commit, pending, published, call, release,
    update: (patch: Partial<Props>) => { act(() => { update(patch); }); },
    get workspace() { return props.workspace; },
  };
}

function begin(model: StudioHybridDccSculptStrokeModel, workspace: StudioHybridDccWorkspace, localPoint = point(workspace)): StudioSculptGestureToken {
  const assetId = workspace.activeAssetId;
  if (!assetId) throw new Error("조형할 자산이 없습니다.");
  const issued: StudioSculptGestureToken[] = [];
  act(() => {
    const token = model.controller.begin({ assetId, pointerId: 7, localPoint });
    if (token) issued.push(token);
  });
  const token = issued[0];
  if (!token) throw new Error(`조형 gesture 시작 실패: ${model.error}`);
  return token;
}
function end(model: StudioHybridDccSculptStrokeModel, token: StudioSculptGestureToken): void {
  act(() => { model.controller.end(token); });
}
function notifyAuth(change: "actor" | "revision"): void {
  act(() => {
    if (change === "actor") auth.actor = auth.actor === "sculpt-owner" ? "other-owner" : "sculpt-owner";
    auth.revision += 1; auth.listeners.forEach((notify) => notify());
  });
}
function expectedSamples(workspace: StudioHybridDccWorkspace, points: readonly StudioMeshVec3[]) {
  let expected = mesh(workspace);
  for (const center of points) {
    const result = applyStudioSculptStroke(expected, { kind: "inflate", center, radius: .45, strength: .2 });
    if (!result.ok) throw new Error(result.detail);
    expected = result.mesh;
  }
  return expected;
}

describe("native 조형 stroke의 실제 workspace와 비동기 발행 lease", () => {
  it("여러 sample은 하나의 frame preview와 한 geometry 명령으로 확정되며 undo 한 번으로 복원된다", async () => {
    const workspace = source(), before = evidence(workspace), points = [point(workspace, 0), point(workspace, 1), point(workspace, 0)];
    const h = mount(workspace), controller = h.hook.result.current.controller;
    const first = points[0], second = points[1], third = points[2];
    if (!first || !second || !third) throw new Error("다중 sample 입력이 없습니다.");
    const token = begin(h.hook.result.current, workspace, first);
    act(() => { controller.sample(token, second); controller.sample(token, third); });
    expect(h.hook.result.current.phase).toBe("drawing");
    expect(h.hook.result.current.preview).toBeNull();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(h.commit).not.toHaveBeenCalled();
    expect(evidence(workspace)).toEqual(before);
    deliverFrame(firstFrame());
    const expected = expectedSamples(workspace, points);
    expect(h.hook.result.current.preview?.strokeRevision).toBe(3);
    expect(h.hook.result.current.preview?.sourceMesh).toBe(mesh(workspace));
    expect(h.hook.result.current.preview?.meshHash).toBe(hashStudioEditableMesh(expected));
    expect(hashStudioEditableMesh(expected)).not.toBe(hashStudioEditableMesh(expectedSamples(workspace, [first])));
    end(h.hook.result.current, token); end(h.hook.result.current, token);
    expect(h.commit).toHaveBeenCalledTimes(1);
    expect(h.hook.result.current.phase).toBe("committing");
    expect(evidence(workspace)).toEqual(before);
    expect(h.call().candidate.session.undoStack).toHaveLength(workspace.session.undoStack.length + 1);
    expect(await h.release()).toBe(true);
    expect(h.published).toHaveLength(1);
    expect(hashStudioEditableMesh(mesh(h.workspace))).toBe(hashStudioEditableMesh(expected));
    expect(h.hook.result.current.phase).toBe("idle"); expect(h.hook.result.current.preview).toBeNull();
    const undone = workspaceUndo(h.workspace);
    expect(hashStudioEditableMesh(mesh(undone))).toBe(before.hash);
    expect(hashStudioEditableMesh(mesh(workspaceRedo(undone)))).toBe(hashStudioEditableMesh(expected));
    expect(evidence(workspace)).toEqual(before);
  });

  it("취소는 원본·저널·undo를 바꾸지 않으며 취소된 frame과 끝 이벤트가 preview를 되살리지 않는다", () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace);
    const token = begin(h.hook.result.current, workspace), frame = firstFrame();
    deliverFrame(frame);
    expect(h.hook.result.current.preview).not.toBeNull();
    act(() => { h.hook.result.current.controller.sample(token, point(workspace, 1)); });
    const late = firstFrame();
    act(() => { h.hook.result.current.cancel(); });
    expect(cancelledFrames.has(late)).toBe(true);
    deliverFrame(late); end(h.hook.result.current, token);
    expect(h.hook.result.current.phase).toBe("idle"); expect(h.hook.result.current.preview).toBeNull();
    expect(h.hook.result.current.notice).toMatch(/취소|cancelled/iu);
    expect(h.commit).not.toHaveBeenCalled(); expect(h.workspace).toBe(workspace);
    expect(evidence(workspace)).toEqual(before);
  });

  it("호스트가 자신의 commit 동안 busy=true를 반환해도 스스로 취소하지 않는다", async () => {
    const workspace = source(), h = mount(workspace), token = begin(h.hook.result.current, workspace);
    end(h.hook.result.current, token); h.update({ externalBusy: true });
    expect(h.hook.result.current.phase).toBe("committing");
    expect(h.call().isCurrent()).toBe(true);
    expect(h.hook.result.current.notice).not.toMatch(/취소|cancelled/iu);
    expect(await h.release()).toBe(true);
    expect(h.published).toHaveLength(1); expect(h.hook.result.current.error).toBe("");
  });

  it("drawing 중 다른 호스트 작업이 시작되면 preview만 취소하고 commit하지 않는다", () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), token = begin(h.hook.result.current, workspace);
    const frame = firstFrame(); h.update({ externalBusy: true }); deliverFrame(frame); end(h.hook.result.current, token);
    expect(h.hook.result.current.engaged).toBe(false); expect(h.hook.result.current.preview).toBeNull();
    expect(h.commit).not.toHaveBeenCalled(); expect(evidence(workspace)).toEqual(before);
  });

  it.each(["mode", "actor", "revision", "project", "workspace"])("지연 발행 중 %s ABA는 이전 candidate를 정본에 발행하지 않는다", async (scope) => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), token = begin(h.hook.result.current, workspace);
    end(h.hook.result.current, token);
    const pending = h.call(); expect(pending.isCurrent()).toBe(true);
    expect(hashStudioEditableMesh(mesh(pending.candidate))).not.toBe(before.hash);
    if (scope === "mode") { h.update({ enabled: false }); h.update({ enabled: true }); }
    else if (scope === "actor") { notifyAuth("actor"); notifyAuth("actor"); }
    else if (scope === "revision") { notifyAuth("revision"); notifyAuth("revision"); }
    else if (scope === "project") { h.update({ workspaceDocumentId: "project-b" }); h.update({ workspaceDocumentId: "project-a" }); }
    else if (scope === "workspace") { h.update({ workspace: workspaceAddUnitCube(workspace, "other-cube") }); h.update({ workspace }); }
    else throw new Error("검증하지 않은 lease 전환 종류입니다.");
    expect(pending.isCurrent()).toBe(false);
    expect(h.hook.result.current.phase).toBe("idle"); expect(h.hook.result.current.preview).toBeNull();
    expect(await h.release()).toBe(false);
    act(() => { pending.onPublished(); });
    expect(h.published).toHaveLength(0); expect(h.workspace).toBe(workspace);
    expect(h.hook.result.current.notice).not.toMatch(/적용했습니다|Sculpting applied/u);
    expect(evidence(workspace)).toEqual(before);
  });

  it.each(["actor", "revision"])("알림 전 %s 변경도 이미 발급한 isCurrent에서 즉시 거절한다", async (scope) => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), token = begin(h.hook.result.current, workspace);
    end(h.hook.result.current, token);
    if (scope === "actor") auth.actor = "other-owner"; else auth.revision += 1;
    expect(h.call().isCurrent()).toBe(false);
    expect(await h.release()).toBe(false);
    expect(h.published).toHaveLength(0); expect(evidence(workspace)).toEqual(before);
  });

  it("drawing의 mode 전환은 취소된 rAF를 나중에 받아도 old end를 발행하지 않는다", () => {
    const workspace = source(), h = mount(workspace), token = begin(h.hook.result.current, workspace), frame = firstFrame();
    h.update({ enabled: false }); h.update({ enabled: true }); deliverFrame(frame); end(h.hook.result.current, token);
    expect(h.hook.result.current.preview).toBeNull(); expect(h.commit).not.toHaveBeenCalled();
  });

  it("brush/carve 변경도 진행 중 gesture의 이력 없는 미리보기를 취소한다", () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), token = begin(h.hook.result.current, workspace), frame = firstFrame();
    act(() => { h.hook.result.current.setCarve(true); }); deliverFrame(frame); end(h.hook.result.current, token);
    expect(h.hook.result.current.phase).toBe("idle"); expect(h.commit).not.toHaveBeenCalled();
    const next = begin(h.hook.result.current, workspace);
    act(() => { h.hook.result.current.setKind("smooth"); }); end(h.hook.result.current, next);
    expect(h.hook.result.current.kind).toBe("smooth"); expect(h.hook.result.current.phase).toBe("idle");
    expect(h.commit).not.toHaveBeenCalled(); expect(evidence(workspace)).toEqual(before);
  });

  it("이전 gesture의 늦은 rAF가 새 gesture preview를 덮어쓰지 않는다", () => {
    const workspace = source(), h = mount(workspace), first = begin(h.hook.result.current, workspace), staleFrame = firstFrame();
    act(() => { h.hook.result.current.controller.cancel(first, "pointercancel"); });
    begin(h.hook.result.current, workspace, point(workspace, 1));
    const currentFrame = frameSequence;
    deliverFrame(staleFrame); expect(h.hook.result.current.preview).toBeNull();
    deliverFrame(currentFrame);
    expect(h.hook.result.current.phase).toBe("drawing");
    expect(h.hook.result.current.preview?.strokeRevision).toBe(1);
    expect(h.commit).not.toHaveBeenCalled();
  });

  it("unmount는 예약 frame과 이미 계산된 candidate의 늦은 발행을 모두 막는다", async () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), token = begin(h.hook.result.current, workspace), frame = firstFrame();
    end(h.hook.result.current, token); const pending = h.call(); h.hook.unmount();
    expect(pending.isCurrent()).toBe(false); expect(cancelledFrames.has(frame)).toBe(true);
    deliverFrame(frame); pending.onPublished();
    expect(await h.release()).toBe(false);
    expect(h.published).toHaveLength(0); expect(evidence(workspace)).toEqual(before);
  });

  it("drawing 중 unmount도 frame을 취소하며 보관된 controller는 새 gesture를 시작하지 못한다", () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), controller = h.hook.result.current.controller;
    const token = begin(h.hook.result.current, workspace), frame = firstFrame(), assetId = workspace.activeAssetId;
    if (!assetId) throw new Error("실제 자산이 없습니다.");
    h.hook.unmount(); expect(cancelledFrames.has(frame)).toBe(true); deliverFrame(frame);
    controller.end(token);
    expect(controller.begin({ assetId, pointerId: 8, localPoint: point(workspace) })).toBeNull();
    expect(h.commit).not.toHaveBeenCalled(); expect(evidence(workspace)).toEqual(before);
  });

  it("controller는 새 host 객체·phase·preview 재렌더에서도 안정적이며 StrictMode 첫 시작도 유효하다", () => {
    const workspace = source(), h = mount(workspace, true), controller = h.hook.result.current.controller;
    h.update({ workspace }); expect(h.hook.result.current.controller).toBe(controller);
    const token = begin(h.hook.result.current, workspace); expect(h.hook.result.current.controller).toBe(controller);
    deliverFrame(firstFrame()); expect(h.hook.result.current.controller).toBe(controller);
    h.update({ workspace }); act(() => { controller.sample(token, point(workspace, 1)); });
    expect(h.hook.result.current.phase).toBe("drawing"); expect(h.hook.result.current.controller).toBe(controller);
    act(() => { controller.cancel(token, "escape"); }); expect(h.hook.result.current.controller).toBe(controller);
  });

  it("malformed 첫 point는 token/commit 없이 실패하며 원본과 이력을 유지한다", () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), assetId = workspace.activeAssetId;
    if (!assetId) throw new Error("실제 자산이 없습니다.");
    const issued: Array<StudioSculptGestureToken | null> = [];
    act(() => { issued.push(h.hook.result.current.controller.begin({ assetId, pointerId: 7, localPoint: { ...point(workspace), x: Number.NaN } })); });
    expect(issued).toEqual([null]); expect(h.hook.result.current.phase).toBe("idle");
    expect(h.hook.result.current.error).toMatch(/유한|finite/iu);
    expect(h.hook.result.current.preview).toBeNull(); expect(h.commit).not.toHaveBeenCalled();
    expect(evidence(workspace)).toEqual(before);
  });

  it("후속 malformed sample은 먼저 계산한 preview도 버리고 늦은 frame/end를 거절한다", () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), token = begin(h.hook.result.current, workspace), frame = firstFrame();
    act(() => { h.hook.result.current.controller.sample(token, { ...point(workspace), z: Infinity }); });
    deliverFrame(frame); end(h.hook.result.current, token);
    expect(h.hook.result.current.error).toMatch(/유한|finite/iu); expect(h.hook.result.current.preview).toBeNull();
    expect(h.hook.result.current.phase).toBe("idle"); expect(h.commit).not.toHaveBeenCalled();
    expect(evidence(workspace)).toEqual(before);
  });

  it("반경 밖 no-op gesture는 commit과 새 undo를 만들지 않는다", () => {
    const workspace = source(), before = evidence(workspace), h = mount(workspace), local = point(workspace);
    const token = begin(h.hook.result.current, workspace, { x: local.x + 100, y: local.y + 100, z: local.z + 100 });
    deliverFrame(firstFrame()); end(h.hook.result.current, token);
    expect(h.hook.result.current.preview).toBeNull(); expect(h.hook.result.current.phase).toBe("idle");
    expect(h.hook.result.current.notice).toMatch(/변화가 없어|did not change/iu);
    expect(h.commit).not.toHaveBeenCalled(); expect(h.workspace).toBe(workspace);
    expect(evidence(workspace)).toEqual(before);
  });

  it("own onPublished 뒤 workspace lease가 바뀌어도 적용 성공 notice는 취소로 바뀌지 않는다", async () => {
    const workspace = source(), h = mount(workspace), token = begin(h.hook.result.current, workspace), frame = firstFrame();
    end(h.hook.result.current, token);
    expect(await h.release()).toBe(true);
    expect(h.call().isCurrent()).toBe(false);
    expect(h.workspace).not.toBe(workspace); expect(h.hook.result.current.phase).toBe("idle");
    expect(h.hook.result.current.notice).toMatch(/조형을 적용했습니다|Sculpting applied/u);
    deliverFrame(frame); h.update({ workspace: h.workspace });
    expect(h.hook.result.current.preview).toBeNull();
    expect(h.hook.result.current.notice).toMatch(/조형을 적용했습니다|Sculpting applied/u);
    expect(h.hook.result.current.notice).not.toMatch(/취소|cancelled/iu);
  });
});

describe("pointerup 뒤 committing 상태의 DOM Escape·blur 소유권", () => {
  const roots: HTMLElement[] = [];
  afterEach(() => { for (const root of roots.splice(0)) root.remove(); });

  function scopeDom() {
    const outer = document.createElement("div"), scope = document.createElement("section");
    outer.setAttribute("role", "dialog");
    const target = document.createElement("button"), outside = document.createElement("button");
    target.textContent = "조형 작업대"; outside.textContent = "다른 도구";
    scope.append(target); outer.append(scope, outside); document.body.append(outer); roots.push(outer);
    const scopeRef: RefObject<HTMLElement | null> = { current: scope };
    return { outer, scope, target, outside, scopeRef };
  }
  function escape(target: EventTarget, init: KeyboardEventInit = {}, alreadyPrevented = false) {
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true, ...init });
    if (alreadyPrevented) event.preventDefault();
    act(() => { target.dispatchEvent(event); });
    return event;
  }
  function element(scope: HTMLElement, tag: "input" | "textarea" | "select" | "div", attribute?: readonly [string, string]) {
    const target = document.createElement(tag);
    if (attribute) target.setAttribute(attribute[0], attribute[1]);
    scope.append(target); return target;
  }
  function innerTarget(scope: HTMLElement, name: string, value: string) {
    const inner = document.createElement("div"), target = document.createElement("button");
    inner.setAttribute(name, value); inner.append(target); scope.append(inner); return target;
  }

  it("outer dialog 안의 작업대 Escape는 committing을 취소하고 늦은 onPublished·발행을 막는다", async () => {
    const workspace = source(), before = evidence(workspace), dom = scopeDom(), h = mount(workspace, false, dom.scopeRef);
    const token = begin(h.hook.result.current, workspace); end(h.hook.result.current, token);
    expect(h.hook.result.current.phase).toBe("committing"); expect(h.call().isCurrent()).toBe(true);
    const event = escape(dom.target);
    expect(event.defaultPrevented).toBe(true);
    expect(h.hook.result.current.phase).toBe("idle"); expect(h.hook.result.current.preview).toBeNull();
    expect(h.call().isCurrent()).toBe(false);
    act(() => { h.call().onPublished(); });
    expect(await h.release()).toBe(false); expect(h.published).toHaveLength(0);
    expect(h.workspace).toBe(workspace); expect(evidence(workspace)).toEqual(before);
    expect(h.hook.result.current.notice).toMatch(/취소|cancelled/iu);
    expect(h.hook.result.current.notice).not.toMatch(/적용했습니다|Sculpting applied/u);
  });

  interface ProtectedEscape {
    readonly label: string;
    readonly target: (dom: ReturnType<typeof scopeDom>) => EventTarget;
    readonly init?: KeyboardEventInit;
    readonly alreadyPrevented?: boolean;
  }
  const protectedEscapes: readonly ProtectedEscape[] = [
    { label: "IME 조합", target: (dom) => dom.target, init: { isComposing: true } },
    { label: "이미 소비된 Escape", target: (dom) => dom.target, alreadyPrevented: true },
    { label: "input", target: (dom) => element(dom.scope, "input") },
    { label: "textarea", target: (dom) => element(dom.scope, "textarea") },
    { label: "select", target: (dom) => element(dom.scope, "select") },
    { label: "contenteditable", target: (dom) => element(dom.scope, "div", ["contenteditable", "true"]) },
    { label: "textbox role", target: (dom) => element(dom.scope, "div", ["role", "textbox"]) },
    { label: "내부 dialog", target: (dom) => innerTarget(dom.scope, "role", "dialog") },
    { label: "내부 alertdialog", target: (dom) => innerTarget(dom.scope, "role", "alertdialog") },
    { label: "내부 aria-modal", target: (dom) => innerTarget(dom.scope, "aria-modal", "true") },
    { label: "내부 escape scope", target: (dom) => innerTarget(dom.scope, "data-studio-escape-scope", "true") },
    { label: "작업대 scope 바깥", target: (dom) => dom.outside },
  ];
  it.each(protectedEscapes)("$label Escape는 취소하지 않고 원래 도구의 소유권을 지킨다", async ({ target, init, alreadyPrevented }) => {
    const workspace = source(), before = evidence(workspace), dom = scopeDom(), h = mount(workspace, false, dom.scopeRef);
    const token = begin(h.hook.result.current, workspace); end(h.hook.result.current, token);
    const event = escape(target(dom), init, alreadyPrevented);
    expect(event.defaultPrevented).toBe(alreadyPrevented === true);
    expect(h.hook.result.current.phase).toBe("committing"); expect(h.call().isCurrent()).toBe(true);
    expect(h.hook.result.current.notice).not.toMatch(/취소|cancelled/iu);
    expect(evidence(workspace)).toEqual(before);
    expect(await h.release()).toBe(true); expect(h.published).toHaveLength(1);
    expect(h.workspace).not.toBe(workspace);
    expect(h.hook.result.current.notice).toMatch(/적용했습니다|Sculpting applied/u);
  });

  it("drawing Escape는 hook이 소비하지 않아 pointer adapter가 취소 여부를 결정한다", async () => {
    const workspace = source(), dom = scopeDom(), h = mount(workspace, false, dom.scopeRef);
    const token = begin(h.hook.result.current, workspace), event = escape(dom.target);
    expect(event.defaultPrevented).toBe(false); expect(h.hook.result.current.phase).toBe("drawing");
    deliverFrame(firstFrame()); expect(h.hook.result.current.preview).not.toBeNull();
    end(h.hook.result.current, token); expect(h.commit).toHaveBeenCalledTimes(1);
    expect(await h.release()).toBe(true);
  });

  it("pointerup 뒤 window blur도 modifier 대기 candidate의 늦은 발행을 막는다", async () => {
    const workspace = source(), before = evidence(workspace), dom = scopeDom(), h = mount(workspace, false, dom.scopeRef);
    const token = begin(h.hook.result.current, workspace); end(h.hook.result.current, token);
    act(() => { window.dispatchEvent(new Event("blur")); });
    expect(h.hook.result.current.phase).toBe("idle"); expect(h.call().isCurrent()).toBe(false);
    act(() => { h.call().onPublished(); });
    expect(await h.release()).toBe(false); expect(h.published).toHaveLength(0);
    expect(h.workspace).toBe(workspace); expect(evidence(workspace)).toEqual(before);
    expect(h.hook.result.current.notice).toMatch(/취소|cancelled/iu);
  });

  it("unmount 뒤에는 작업대 Escape listener가 남지 않아 이벤트를 소비하지 않는다", async () => {
    const workspace = source(), before = evidence(workspace), dom = scopeDom(), h = mount(workspace, false, dom.scopeRef);
    const token = begin(h.hook.result.current, workspace); end(h.hook.result.current, token); h.hook.unmount();
    const event = escape(dom.target);
    expect(event.defaultPrevented).toBe(false); expect(h.call().isCurrent()).toBe(false);
    expect(await h.release()).toBe(false); expect(h.published).toHaveLength(0);
    expect(evidence(workspace)).toEqual(before);
  });
});
