// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioHybridDccWorkspace, workspaceAddUnitCube } from "./studio-hybrid-dcc-workspace";
import { createStudioHybridDccDefaultToonMaterial } from "./materials/studio-hybrid-dcc-toon-material";
import { workspaceSetStudioHybridDccToonMaterial } from "./materials/studio-hybrid-dcc-toon-workspace";
import { useStudioHybridDccWorkspaceLease } from "./useStudioHybridDccWorkspaceLease";

const auth = vi.hoisted(() => ({ actor: "toon-owner", revision: 0, listeners: new Set<() => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({ getAuthUserId: () => auth.actor, getAuthSessionRevision: () => auth.revision, listeners: auth.listeners }));
beforeEach(() => { auth.actor = "toon-owner"; auth.revision = 0; });
afterEach(cleanup);

describe("재질을 포함한 비동기 전달의 계정·workspace lease", () => {
  it("geometry hash가 같아도 재질을 변경하면 이전 전달을 abort하고 A→B→A로 돌아와도 재사용하지 않는다", () => {
    const a = workspaceAddUnitCube(createStudioHybridDccWorkspace("lease"), "cube");
    const b = workspaceSetStudioHybridDccToonMaterial(a, "cube", [0], createStudioHybridDccDefaultToonMaterial());
    expect(b.session.state.geometry.records.cube?.mesh).toBe(a.session.state.geometry.records.cube?.mesh);
    const hook = renderHook(({ workspace }) => useStudioHybridDccWorkspaceLease(workspace, "project-a"), { initialProps: { workspace: a } });
    const controller = new AbortController(); const current = hook.result.current(controller);
    expect(current()).toBe(true);
    hook.rerender({ workspace: b }); expect(controller.signal.aborted).toBe(true); expect(current()).toBe(false);
    hook.rerender({ workspace: a }); expect(current()).toBe(false);
    const latest = hook.result.current(); expect(latest()).toBe(true);
    const newer = hook.result.current(); expect(latest()).toBe(false); expect(newer()).toBe(true);
    hook.unmount(); expect(newer()).toBe(false);
  });
  it.each(["actor", "revision", "project"] as const)("%s 변경은 늦은 결과를 폐기하고 실행 중 작업도 취소한다", (kind) => {
    const workspace = createStudioHybridDccWorkspace("lease");
    const hook = renderHook(({ project }) => useStudioHybridDccWorkspaceLease(workspace, project), { initialProps: { project: "project-a" } });
    const controller = new AbortController(), current = hook.result.current(controller);
    if (kind === "project") hook.rerender({ project: "project-b" });
    else {
      if (kind === "actor") auth.actor = "other-owner"; else auth.revision += 1;
      expect(current()).toBe(false);
      act(() => { auth.revision += 1; auth.listeners.forEach((notify) => notify()); });
    }
    expect(current()).toBe(false); expect(controller.signal.aborted).toBe(true);
  });
  it("전달 권한이 사라졌다가 돌아와도 이전 작업을 다시 허용하지 않는다", () => {
    const workspace = createStudioHybridDccWorkspace("lease");
    const hook = renderHook(({ enabled }) => useStudioHybridDccWorkspaceLease(workspace, "project", enabled), { initialProps: { enabled: true } });
    const controller = new AbortController(), current = hook.result.current(controller);
    hook.rerender({ enabled: false }); expect(current()).toBe(false); expect(controller.signal.aborted).toBe(true);
    hook.rerender({ enabled: true }); expect(current()).toBe(false); expect(hook.result.current()()).toBe(true);
  });
});
