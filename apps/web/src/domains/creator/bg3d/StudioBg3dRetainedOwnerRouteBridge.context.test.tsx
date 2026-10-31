// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { useContext, useLayoutEffect, useMemo, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioMutationAuthorityRuntime } from "../studio-cuttoon-editor/runtime/useStudioMutationAuthorityRuntime";
import {
  StudioDocumentLayoutContext,
  type StudioDocumentLayoutRuntime,
} from "../studio-router/studio-document-layout-context";
import {
  StudioDocumentRuntimeContext,
  type StudioDocumentRuntimeLifecycle,
} from "../studio-router/studio-document-runtime-context";
import {
  StudioLocalToolImportAuthorityContext,
  type StudioLocalToolImportAuthority,
} from "../toolchain/studio-local-tool-import-authority";

import {
  resetStudioBg3dRetainedOwnerForTests,
  studioBg3dRetainedOwnerSource,
  type StudioBg3dRetainedElementProps,
} from "./studio-bg3d-retained-owner";
import { StudioBg3dRetainedOwnerHost } from "./StudioBg3dRetainedOwnerHost";
import { StudioBg3dRetainedOwnerRouteBridge } from "./StudioBg3dRetainedOwnerRouteBridge";

type MutationRuntime = ReturnType<typeof useStudioMutationAuthorityRuntime>;

interface Observation {
  readonly authority: StudioLocalToolImportAuthority | null;
  readonly layout: StudioDocumentLayoutRuntime | null;
  readonly runtime: StudioDocumentRuntimeLifecycle | null;
  readonly instance: object;
  readonly open: boolean;
}

const layoutA: StudioDocumentLayoutRuntime = {
  documentKey: "project-a/document-a/actor-a/0",
  projectId: "project-a",
  documentId: "document-a",
  draftId: null,
  documentWorkspace: "3d",
  draftSessionEpoch: 0,
  instantWorkId: "instant-a",
  liveRoomParam: null,
  liveInviteRoleParam: null,
  remixId: null,
  workId: "work-a",
};
const runtimeA: StudioDocumentRuntimeLifecycle = {
  documentKey: layoutA.documentKey,
  instanceId: "runtime-a",
};
const reportError = () => undefined;

function latest<T>(values: readonly T[]): T {
  const value = values.at(-1);
  if (value === undefined) throw new Error("관측 결과가 없습니다.");
  return value;
}

function requireAuthority(observation: Observation): StudioLocalToolImportAuthority {
  if (observation.authority === null) throw new Error("route 권한이 전달되지 않았습니다.");
  return observation.authority;
}

function RetainedConsumer({
  onObservation,
  onMount,
  open,
  onWebXrCleanupPendingChange,
}: StudioBg3dRetainedElementProps & {
  readonly onObservation: (observation: Observation) => void;
  readonly onMount: () => void;
}) {
  const authority = useContext(StudioLocalToolImportAuthorityContext);
  const layout = useContext(StudioDocumentLayoutContext);
  const runtime = useContext(StudioDocumentRuntimeContext);
  const instance = useRef({});
  const ticket = authority?.capture();
  const ready = authority !== null && ticket !== undefined
    && !authority.locked && authority.isCurrent(ticket);

  useLayoutEffect(onMount, [onMount]);
  useLayoutEffect(() => {
    onObservation({ authority, layout, runtime, instance: instance.current, open });
  }, [authority, layout, runtime, onObservation, open]);
  useLayoutEffect(() => {
    if (!open) onWebXrCleanupPendingChange?.(true);
  }, [open, onWebXrCleanupPendingChange]);

  return (
    <section data-testid="retained-consumer" data-open={String(open)} data-ready={String(ready)}>
      <button type="button" onClick={() => onWebXrCleanupPendingChange?.(false)}>
        정리 완료
      </button>
    </section>
  );
}

interface FixtureProps {
  readonly attached?: boolean;
  readonly locked?: boolean;
  readonly actor?: string;
  readonly layout?: StudioDocumentLayoutRuntime;
  readonly runtime?: StudioDocumentRuntimeLifecycle;
  readonly onMutationRuntime: (runtime: MutationRuntime) => void;
  readonly onObservation: (observation: Observation) => void;
  readonly onMount: () => void;
}

function CanonicalRoute({
  locked = false,
  actor = "actor-a",
  layout = layoutA,
  runtime = runtimeA,
  onMutationRuntime,
  onObservation,
  onMount,
}: FixtureProps) {
  const mutation = useStudioMutationAuthorityRuntime({
    collaborationDocumentLocked: locked,
    remixId: layout.remixId,
    reportError,
    studioAuthUserId: actor,
    workId: layout.workId,
  });
  const { captureStudioMutationTicket, canApplyStudioMutation } = mutation;
  const authority = useMemo(() => ({
    locked,
    capture: captureStudioMutationTicket,
    isCurrent: canApplyStudioMutation,
  }), [locked, captureStudioMutationTicket, canApplyStudioMutation]);

  useLayoutEffect(() => onMutationRuntime(mutation), [mutation, onMutationRuntime]);

  return (
    <StudioDocumentRuntimeContext.Provider value={runtime}>
      <StudioDocumentLayoutContext.Provider value={layout}>
        <StudioLocalToolImportAuthorityContext.Provider value={authority}>
          <StudioBg3dRetainedOwnerRouteBridge
            open
            element={<RetainedConsumer open onObservation={onObservation} onMount={onMount} />}
          />
        </StudioLocalToolImportAuthorityContext.Provider>
      </StudioDocumentLayoutContext.Provider>
    </StudioDocumentRuntimeContext.Provider>
  );
}

function RouteAndHost({ attached = true, ...props }: FixtureProps) {
  // 같은 React root 안에서도 Host는 route의 Provider 조상 경로 밖에 있다.
  return <>
    {attached ? <CanonicalRoute {...props} /> : null}
    <StudioBg3dRetainedOwnerHost />
  </>;
}

function createFixture() {
  const observations: Observation[] = [];
  const mutations: MutationRuntime[] = [];
  const props = {
    onObservation: (observation: Observation) => { observations.push(observation); },
    onMutationRuntime: (runtime: MutationRuntime) => { mutations.push(runtime); },
    onMount: vi.fn(),
  };
  return { observations, mutations, props };
}

afterEach(() => {
  cleanup();
  resetStudioBg3dRetainedOwnerForTests();
});

describe("BG3D retained Host의 실제 route Context 보존", () => {
  it("Provider 밖 Host에도 정본 문서와 원래 mutation 함수가 전달된다", () => {
    const { observations, mutations, props } = createFixture();
    const view = render(<RouteAndHost {...props} />);
    const observation = latest(observations);
    const mutation = latest(mutations);

    expect(observation.layout).toBe(layoutA);
    expect(observation.runtime).toBe(runtimeA);
    expect(observation.authority?.capture).toBe(mutation.captureStudioMutationTicket);
    expect(observation.authority?.isCurrent).toBe(mutation.canApplyStudioMutation);
    expect(view.getByTestId("retained-consumer").getAttribute("data-ready")).toBe("true");
    expect(requireAuthority(observation).capture()).toMatchObject({ authScopeKey: "actor-a", workId: "work-a" });
  });

  it("문서 세대·저장·잠금·사용자/문서 전환의 기존 거부 계약을 유지한다", () => {
    const { observations, mutations, props } = createFixture();
    const view = render(<RouteAndHost {...props} />);
    const originalNode = view.getByTestId("retained-consumer");
    const originalInstance = latest(observations).instance;
    const authority = requireAuthority(latest(observations));
    const ticket = authority.capture();

    act(() => { latest(mutations).markStudioDocumentChanged(); });
    expect(authority.isCurrent(ticket)).toBe(false);
    const editedTicket = authority.capture();
    expect(authority.isCurrent(editedTicket)).toBe(true);
    latest(mutations).documentSaveInFlightRef.current = true;
    expect(authority.isCurrent(editedTicket)).toBe(false);
    latest(mutations).documentSaveInFlightRef.current = false;

    view.rerender(<RouteAndHost {...props} locked />);
    expect(requireAuthority(latest(observations)).locked).toBe(true);
    expect(authority.isCurrent(editedTicket)).toBe(false);
    expect(originalNode.getAttribute("data-ready")).toBe("false");
    view.rerender(<RouteAndHost {...props} />);
    expect(authority.isCurrent(editedTicket)).toBe(false);
    expect(requireAuthority(latest(observations)).isCurrent(authority.capture())).toBe(true);

    const beforeSwitch = authority.capture();
    const layoutB = { ...layoutA, documentKey: "project-b/document-b/actor-b/0", projectId: "project-b", documentId: "document-b", workId: "work-b" };
    const runtimeB = { documentKey: layoutB.documentKey, instanceId: "runtime-b" };
    view.rerender(<RouteAndHost {...props} actor="actor-b" layout={layoutB} runtime={runtimeB} />);
    expect(authority.isCurrent(beforeSwitch)).toBe(false);
    expect(latest(observations).layout).toBe(layoutB);
    expect(latest(observations).runtime).toBe(runtimeB);
    expect(requireAuthority(latest(observations)).capture()).toMatchObject({ authScopeKey: "actor-b", workId: "work-b" });
    expect(view.getByTestId("retained-consumer")).toBe(originalNode);
    expect(latest(observations).instance).toBe(originalInstance);
    expect(props.onMount).toHaveBeenCalledOnce();
  });

  it("route 해제 즉시 원래 권한은 취소하고 같은 인스턴스에 close와 cleanup을 전달한다", () => {
    const { observations, props } = createFixture();
    const view = render(<RouteAndHost {...props} />);
    const originalNode = view.getByTestId("retained-consumer");
    const originalInstance = latest(observations).instance;
    const authority = requireAuthority(latest(observations));
    const ticket = authority.capture();

    view.rerender(<RouteAndHost {...props} attached={false} />);

    expect(authority.isCurrent(ticket)).toBe(false);
    expect(authority.isCurrent(authority.capture())).toBe(false);
    expect(view.getByTestId("retained-consumer")).toBe(originalNode);
    expect(latest(observations).instance).toBe(originalInstance);
    expect(latest(observations).open).toBe(false);
    expect(originalNode.getAttribute("data-ready")).toBe("false");
    expect(studioBg3dRetainedOwnerSource.getSnapshot().cleanupPending).toBe(true);
    expect(props.onMount).toHaveBeenCalledOnce();

    fireEvent.click(view.getByRole("button", { name: "정리 완료" }));
    expect(studioBg3dRetainedOwnerSource.getSnapshot().element).toBeNull();
    expect(view.queryByTestId("retained-consumer")).toBeNull();
  });

  it("route Provider가 없으면 null을 유지해 임의 권한을 만들지 않는다", () => {
    const { observations, props } = createFixture();
    const view = render(<>
      <StudioBg3dRetainedOwnerRouteBridge
        open
        element={<RetainedConsumer open onObservation={props.onObservation} onMount={props.onMount} />}
      />
      <StudioBg3dRetainedOwnerHost />
    </>);

    expect(latest(observations).authority).toBeNull();
    expect(latest(observations).layout).toBeNull();
    expect(latest(observations).runtime).toBeNull();
    expect(view.getByTestId("retained-consumer").getAttribute("data-ready")).toBe("false");
  });
});
