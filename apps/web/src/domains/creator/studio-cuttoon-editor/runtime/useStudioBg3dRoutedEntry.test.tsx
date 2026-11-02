// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { StudioEditorMutationTicket } from "../../studio-editor-scope";
import { useStudioBg3dRoutedEntry } from "./useStudioBg3dRoutedEntry";
import { useStudioMutationAuthorityRuntime } from "./useStudioMutationAuthorityRuntime";

interface FixtureProps {
  readonly surface: string;
  readonly hydrated: boolean;
  readonly pending: boolean;
  readonly remote: boolean;
  readonly checked: boolean;
  readonly recovery: boolean;
  readonly pageId: string;
  readonly locked: boolean;
  readonly warm: boolean;
  readonly onOpen: (pageId: string) => void;
  readonly onReset: () => void;
}

const reportError = vi.fn();
const defaults: FixtureProps = {
  surface: "bg3d", hydrated: true, pending: false, remote: false,
  checked: true, recovery: false, pageId: "restored-page", locked: false,
  warm: false, onOpen: () => undefined, onReset: () => undefined,
};

function useFixture(props: FixtureProps) {
  const [open, setOpen] = useState(props.warm);
  const [seed, setSeed] = useState<string | null>("selected-layer-and-seed");
  const [peersOpen, setPeersOpen] = useState(true);
  const syncRef = useRef({ bg3d: props.warm });
  const ticketRef = useRef<StudioEditorMutationTicket | null>(null);
  const pageRef = useRef<string | null>(null);
  const currentPageIdRef = useRef(props.pageId);
  currentPageIdRef.current = props.pageId;
  const mutation = useStudioMutationAuthorityRuntime({
    collaborationDocumentLocked: props.locked,
    remixId: null, reportError, studioAuthUserId: "actor-a",
    workId: props.remote ? "work-a" : null,
  });
  const { captureStudioMutationTicket, canApplyStudioMutation } = mutation;

  // Host와 같은 열림 edge에서 원래 authority를 캡처한다. 적용 시 재캡처하지 않는다.
  useEffect(() => {
    ticketRef.current = open ? captureStudioMutationTicket() : null;
    pageRef.current = open ? currentPageIdRef.current : null;
  }, [captureStudioMutationTicket, open]);

  useStudioBg3dRoutedEntry({
    routedSurface: props.surface,
    workHydrated: props.hydrated,
    sourceHydrationPending: props.pending,
    remoteSource: props.remote,
    autosaveChecked: props.checked,
    hasAutosave: props.recovery,
    wasOpen: () => syncRef.current.bg3d,
    resetColdSource: () => { setSeed(null); props.onReset(); },
    openEntry: () => { setPeersOpen(false); setOpen(true); props.onOpen(props.pageId); },
  });
  useEffect(() => { syncRef.current.bg3d = open; }, [open]);
  return {
    open, seed, peersOpen, mutation,
    captured: () => ({ ticket: ticketRef.current, pageId: pageRef.current }),
    canApplyCaptured: () => ticketRef.current !== null && canApplyStudioMutation(ticketRef.current),
  };
}

afterEach(() => { cleanup(); reportError.mockClear(); });

describe("useStudioBg3dRoutedEntry", () => {
  it("냉시작 원고와 복구 결정을 기다린 뒤 복원된 페이지에서 한 번 연다", () => {
    const onOpen = vi.fn(), onReset = vi.fn();
    const initial = { ...defaults, hydrated: false, checked: false, pageId: "initial-page", onOpen, onReset };
    const view = renderHook(useFixture, { initialProps: initial });
    expect(view.result.current.open).toBe(false);
    expect(view.result.current.captured().ticket).toBeNull();
    view.rerender({ ...initial, hydrated: true, pending: true, pageId: "restored-page" });
    expect(view.result.current.open).toBe(false);
    view.rerender({ ...initial, hydrated: true, pageId: "restored-page" });
    expect(view.result.current.open).toBe(false);
    view.rerender({ ...initial, hydrated: true, checked: true, recovery: true, pageId: "restored-page" });
    expect(view.result.current.open).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
    view.rerender({ ...initial, hydrated: true, checked: true, pageId: "restored-page" });
    expect(view.result.current.open).toBe(true);
    expect(view.result.current.seed).toBeNull();
    expect(view.result.current.peersOpen).toBe(false);
    expect(view.result.current.captured().pageId).toBe("restored-page");
    expect(view.result.current.canApplyCaptured()).toBe(true);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("restored-page");
    expect(onReset).toHaveBeenCalledOnce();
  });

  it("준비 전에 다른 route로 이동하면 늦은 복구 완료가 BG3D를 열지 않는다", () => {
    const onOpen = vi.fn();
    const initial = { ...defaults, hydrated: false, checked: false, onOpen };
    const view = renderHook(useFixture, { initialProps: initial });
    view.rerender({ ...initial, surface: "canvas", hydrated: true, checked: true });
    expect(view.result.current.open).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
    view.rerender({ ...initial, surface: "bg3d", hydrated: true, checked: true });
    expect(view.result.current.open).toBe(true);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("준비가 끝나지 않아도 UI에서 이미 연 장면과 seed를 보존한다", () => {
    const onReset = vi.fn(), onOpen = vi.fn();
    const initial = { ...defaults, warm: true, hydrated: false, pending: true, checked: false,
      recovery: true, onReset, onOpen };
    const view = renderHook(useFixture, { initialProps: initial });
    expect(view.result.current.open).toBe(true);
    expect(view.result.current.seed).toBe("selected-layer-and-seed");
    expect(view.result.current.peersOpen).toBe(false);
    view.rerender({ ...initial, hydrated: true, pending: false, checked: true, recovery: false });
    expect(view.result.current.seed).toBe("selected-layer-and-seed");
    expect(onReset).not.toHaveBeenCalled();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("서버 원고는 hydration 후 읽기 전용으로 열되 기존 쓰기 거부를 유지한다", () => {
    const onOpen = vi.fn();
    const initial = { ...defaults, remote: true, hydrated: false, checked: false,
      recovery: true, locked: true, onOpen };
    const view = renderHook(useFixture, { initialProps: initial });
    expect(view.result.current.open).toBe(false);
    view.rerender({ ...initial, hydrated: true });
    expect(view.result.current.open).toBe(true);
    expect(view.result.current.canApplyCaptured()).toBe(false);
    const ticket = view.result.current.captured().ticket;
    view.rerender({ ...initial, hydrated: true, locked: false });
    expect(view.result.current.captured().ticket).toBe(ticket);
    expect(view.result.current.canApplyCaptured()).toBe(false);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it("콜백과 준비 상태 변화는 다시 열거나 열린 문서의 ticket을 갱신하지 않는다", () => {
    const onOpen = vi.fn(), onReset = vi.fn();
    const initial = { ...defaults, onOpen, onReset };
    const view = renderHook(useFixture, { initialProps: initial });
    const captured = view.result.current.captured();
    act(() => { view.result.current.mutation.markStudioDocumentChanged(); });
    expect(view.result.current.canApplyCaptured()).toBe(false);
    const replacement = vi.fn();
    view.rerender({ ...initial, pageId: "different-page", pending: true, onOpen: replacement });
    view.rerender({ ...initial, pageId: "different-page", onOpen: replacement });
    expect(view.result.current.captured()).toEqual(captured);
    expect(view.result.current.canApplyCaptured()).toBe(false);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onReset).toHaveBeenCalledOnce();
    expect(replacement).not.toHaveBeenCalled();
  });

});
