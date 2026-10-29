// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState, type MutableRefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_STUDIO_MENU_SESSION,
  reduceStudioAppMenuOpenUpdate,
  reduceStudioMenuSession,
  type StudioMenuSessionState,
} from "../../studio-menu-session-model";
import {
  useStudioPageWorkspacePersistence,
  type StudioPageWorkspacePersistenceContext,
} from "../../studio-page-workspace-persistence";
import {
  createStudioWorkspaceDefaultState,
  studioWorkspaceOwnerScope,
  type StudioWorkspaceLoadResult,
} from "../../studio-workspaces";
import type {
  StudioWorkspacePersistenceRuntime,
  StudioWorkspaceRuntimeHydrationResult,
} from "../../studio-workspace-sqlite-runtime";

const { createRuntime } = vi.hoisted(() => ({ createRuntime: vi.fn() }));
vi.mock("../../studio-workspace-sqlite-runtime", () => ({
  createStudioWorkspacePersistenceRuntime: createRuntime,
}));
vi.mock("../../studio-legacy-editor-runtime-helpers", () => ({
  acquireProductStudioUiPreferencesRepository: vi.fn(),
}));

function ref<T>(current: T): MutableRefObject<T> {
  return { current };
}

function deferred<T>() {
  const pending: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => { pending.resolve = resolve; });
  return {
    promise,
    resolve(value: T) {
      if (!pending.resolve) throw new Error("지연 응답이 아직 준비되지 않았습니다.");
      pending.resolve(value);
    },
  };
}

function runtimeFixture(userId: string | null) {
  const hydration = deferred<StudioWorkspaceRuntimeHydrationResult>();
  const state = createStudioWorkspaceDefaultState(userId);
  const ownerScope = studioWorkspaceOwnerScope(userId);
  const runtime: StudioWorkspacePersistenceRuntime = {
    ownerScope,
    authority: () => "sqlite-opfs",
    liveSync: () => "unavailable",
    hydrate: vi.fn<StudioWorkspacePersistenceRuntime["hydrate"]>(() => hydration.promise),
    save: vi.fn<StudioWorkspacePersistenceRuntime["save"]>(),
    reconcile: vi.fn<StudioWorkspacePersistenceRuntime["reconcile"]>(),
    subscribeInvalidation: vi.fn(() => () => undefined),
    flush: vi.fn(async () => undefined),
    close: vi.fn(),
  };
  return {
    runtime,
    complete() {
      hydration.resolve({
        state, ownerScope, source: "current", status: "persisted", failure: null,
        authority: "sqlite-opfs", revision: 1, guardRevision: 0, conflictPaths: [],
      });
    },
  };
}

function persistenceFixture(userId: string | null) {
  const state = createStudioWorkspaceDefaultState(userId);
  const initial: StudioWorkspaceLoadResult = {
    state, ownerScope: studioWorkspaceOwnerScope(userId),
    source: "default", status: "session-only", failure: null,
  };
  const context: Omit<StudioPageWorkspacePersistenceContext,
    "applyStudioWorkspaceLayout" | "currentWorkspaceOwnerScope" | "studioAuthUserId"
  > = {
    drawingPaletteDragging: false,
    drawingPaletteDraggingRef: ref(false),
    leftResize: { dragging: false },
    liveWorkspaceLayout: state.liveLayout,
    liveWorkspaceLayoutRef: ref(state.liveLayout),
    pendingExternalWorkspaceSync: null,
    pendingExternalWorkspaceSyncRef: ref(null),
    rightResize: { dragging: false },
    setPendingExternalWorkspaceSync: vi.fn(),
    setWorkspaceMenuEpoch: vi.fn(),
    setWorkspacePersistence: vi.fn(),
    setWorkspaceSyncNotice: vi.fn(),
    setWorkspaceSyncRetryEpoch: vi.fn(),
    workspaceDirtyRevisionRef: ref(0),
    workspaceHydrationGenerationRef: ref(0),
    workspacePersistenceRef: ref(initial),
    workspaceRuntimeRef: ref(null),
    workspaceSyncBaseStateRef: ref(state),
    workspaceSyncRetryEpoch: 0,
    workspaceSyncSequenceRef: ref(0),
  };
  return { context, applied: vi.fn<StudioPageWorkspacePersistenceContext["applyStudioWorkspaceLayout"]>() };
}

function Harness({ userId, fixture }: {
  userId: string | null;
  fixture: ReturnType<typeof persistenceFixture>;
}) {
  const [menus, setMenus] = useState<StudioMenuSessionState>(EMPTY_STUDIO_MENU_SESSION);
  useStudioPageWorkspacePersistence({
    ...fixture.context,
    currentWorkspaceOwnerScope: studioWorkspaceOwnerScope(userId),
    studioAuthUserId: userId,
    applyStudioWorkspaceLayout(layout, workspaceId, source = "switch", clearSyncNotice) {
      fixture.applied(layout, workspaceId, source, clearSyncNotice);
      setMenus((current) => reduceStudioMenuSession(current, {
        type: "workspace.layout-applied", source,
      }));
    },
  });
  const open = menus.appMenu === "project";
  return <>
    <button type="button" aria-expanded={open} onClick={() => {
      setMenus((current) => reduceStudioAppMenuOpenUpdate(current, "project", (wasOpen) => !wasOpen));
    }}>프로젝트 센터</button>
    {open && <div role="dialog" aria-label="프로젝트 센터">프로젝트 작업</div>}
  </>;
}

beforeEach(() => { createRuntime.mockReset(); });
afterEach(() => { cleanup(); });

describe("작업공간 초기 복원과 프로젝트 센터 메뉴", () => {
  it("첫 클릭 뒤 같은 계정의 지연 복원이 완료되어도 열린 프로젝트 센터를 유지한다", async () => {
    const runtime = runtimeFixture(null);
    createRuntime.mockReturnValue(runtime.runtime);
    const fixture = persistenceFixture(null);
    render(<Harness userId={null} fixture={fixture} />);
    await waitFor(() => expect(runtime.runtime.hydrate).toHaveBeenCalledOnce());
    expect(fixture.applied.mock.calls.map((call) => call[2])).toEqual(["owner-scope-change"]);

    fireEvent.click(screen.getByRole("button", { name: "프로젝트 센터" }));
    expect(screen.getByRole("dialog", { name: "프로젝트 센터" })).toBeTruthy();
    expect(fixture.context.workspaceDirtyRevisionRef.current).toBe(0);
    await act(async () => { runtime.complete(); });

    expect(fixture.applied.mock.calls.map((call) => call[2])).toEqual([
      "owner-scope-change", "owner-hydration",
    ]);
    expect(screen.getByRole("button", { name: "프로젝트 센터" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "프로젝트 센터" })).toBeTruthy();
  });

  it("계정 전환은 열린 메뉴를 즉시 닫고 이전 계정의 늦은 응답은 반영하지 않는다", async () => {
    const guest = runtimeFixture(null);
    const signedIn = runtimeFixture("artist-b");
    createRuntime.mockReturnValueOnce(guest.runtime).mockReturnValueOnce(signedIn.runtime);
    const fixture = persistenceFixture(null);
    const view = render(<Harness userId={null} fixture={fixture} />);
    await waitFor(() => expect(guest.runtime.hydrate).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 센터" }));
    expect(screen.getByRole("dialog", { name: "프로젝트 센터" })).toBeTruthy();

    view.rerender(<Harness userId="artist-b" fixture={fixture} />);
    await waitFor(() => expect(signedIn.runtime.hydrate).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog", { name: "프로젝트 센터" })).toBeNull();
    expect(guest.runtime.close).toHaveBeenCalledOnce();
    await act(async () => { guest.complete(); });
    expect(fixture.applied.mock.calls.map((call) => call[2])).toEqual([
      "owner-scope-change", "owner-scope-change",
    ]);
    expect(fixture.context.workspacePersistenceRef.current.ownerScope).toBe(signedIn.runtime.ownerScope);
    expect(screen.getByRole("button", { name: "프로젝트 센터" }).getAttribute("aria-expanded")).toBe("false");
    await act(async () => { signedIn.complete(); });
    expect(fixture.applied.mock.calls.map((call) => call[2])).toEqual([
      "owner-scope-change", "owner-scope-change", "owner-hydration",
    ]);
    expect(screen.queryByRole("dialog", { name: "프로젝트 센터" })).toBeNull();
  });
});
