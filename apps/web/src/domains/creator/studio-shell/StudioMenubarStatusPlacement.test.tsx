// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EMPTY_STUDIO_LIVE_CONTEXT,
  StudioLiveCollaborationContext,
  type StudioLiveCollaborationContextValue,
} from "../live/studio-live-collaboration-context";
import { INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT } from "../live/studio-live-sync-safety";
import { StudioDraftOperationSyncAssistant } from "../StudioDraftOperationSyncAssistant";
import { StudioDraftSaveCenter } from "../StudioDraftSaveCenter";
import { resetStudioReliabilityStatus } from "../studio-reliability-status-store";
import {
  STUDIO_MENUBAR_STATUS_SLOT_REFS,
  studioMenubarPopoverPosition,
} from "./studio-menubar-status-slot";

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, value });
}

/** 데스크톱 메뉴바 동작 영역의 두 자리만 흉내 낸다. */
function MenubarSlots() {
  return (
    <div data-testid="menubar-actions">
      <div data-testid="sync-slot" ref={STUDIO_MENUBAR_STATUS_SLOT_REFS.sync} />
      <div data-testid="save-slot" ref={STUDIO_MENUBAR_STATUS_SLOT_REFS.save} />
    </div>
  );
}

function SaveCenter({ mobileImmersive = false, canvasOnlyMode = false, ...overrides }: Partial<ComponentProps<typeof StudioDraftSaveCenter>> = {}) {
  return (
    <StudioDraftSaveCenter
      saving={false}
      workId="work-1"
      loadedWork={{ id: "work-1", revision: 7 }}
      autosaveDocumentLeadership={{ role: "leader", basis: "web-lock" }}
      mobileImmersive={mobileImmersive}
      canvasOnlyMode={canvasOnlyMode}
      onSaveDraft={vi.fn(() => Promise.resolve())}
      onOpenVersions={vi.fn()}
      onExportBackup={vi.fn(() => Promise.resolve())}
      {...overrides}
    />
  );
}

function ClarityMobileSaveSlot() {
  return <div data-testid="mobile-save-slot" data-studio-clarity-mobile-save-slot="true" ref={STUDIO_MENUBAR_STATUS_SLOT_REFS.save} />;
}

function saveRoot(): HTMLElement {
  const root = document.querySelector<HTMLElement>("[data-studio-draft-save-center]");
  if (!root) throw new Error("save center root missing");
  return root;
}

afterEach(() => {
  cleanup();
  resetStudioReliabilityStatus();
  setOnline(true);
  vi.restoreAllMocks();
});

describe("studioMenubarPopoverPosition", () => {
  it("opens below the chip, right-aligned, keeping an 8px viewport margin", () => {
    const anchor = new DOMRect(1200, 6, 160, 44);
    expect(studioMenubarPopoverPosition(anchor, 1440)).toEqual({ top: 58, right: 80 });
    // 칩이 화면 오른쪽 끝에 붙어 있어도 대화상자는 가장자리에서 8px 떨어진다.
    expect(studioMenubarPopoverPosition(new DOMRect(1400, 0, 44, 44), 1440).right).toBe(8);
  });
});

describe("desktop menubar status placement", () => {
  it("모바일 저장 버튼에서 Enter로 열면 실제 팝오버의 첫 조작으로 진입하고 Escape·닫기는 복귀한다", async () => {
    setOnline(false);
    render(<><ClarityMobileSaveSlot /><SaveCenter mobileImmersive /></>);
    const trigger = within(screen.getByTestId("mobile-save-slot")).getByRole("button", { name: /저장 상태:/ });
    trigger.focus(); fireEvent.keyDown(trigger, { key: "Enter" });
    // jsdom에는 버튼의 기본 키보드 클릭이 없어 그 기본 동작을 명시한다. 실제 Enter는 브라우저 검증으로 구분한다.
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "초안 저장 센터" });
    const close = within(dialog).getByRole("button", { name: "초안 저장 센터 닫기" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }); fireEvent(close, tab);
    expect(tab.defaultPrevented).toBe(false);
    fireEvent.keyDown(close, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "초안 저장 센터" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    const reopened = await screen.findByRole("button", { name: "초안 저장 센터 닫기" });
    await waitFor(() => expect(document.activeElement).toBe(reopened));
    fireEvent.click(reopened); expect(document.activeElement).toBe(trigger);
  });

  it("비동기 저장 실패로 상세가 다시 열려도 다른 입력창의 초점을 가져가지 않는다", async () => {
    setOnline(true);
    let rejectSave: ((reason: Error) => void) | undefined;
    const pending = new Promise<void>((_resolve, reject) => { rejectSave = reject; });
    const onSaveDraft = vi.fn(() => pending);
    render(<><input aria-label="작업 중인 원고 이름" /><ClarityMobileSaveSlot /><SaveCenter mobileImmersive onSaveDraft={onSaveDraft} /></>);
    const trigger = within(screen.getByTestId("mobile-save-slot")).getByRole("button", { name: /저장 상태:/ });
    trigger.focus(); fireEvent.click(trigger);
    await screen.findByRole("dialog", { name: "초안 저장 센터" });
    fireEvent.click(screen.getByRole("button", { name: "지금 서버에 저장" }));
    // 정본 어댑터는 Promise.resolve().then(saveDraft)로 실제 요청을 시작한다.
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    fireEvent.keyDown(document, { key: "Escape" });
    const editing = screen.getByRole("textbox", { name: "작업 중인 원고 이름" }); editing.focus();
    if (!rejectSave) throw new Error("비동기 저장 요청 누락");
    const failSave = rejectSave;
    await act(async () => { failSave(new Error("비동기 저장 결과를 확인하지 못했습니다")); await pending.catch(() => undefined); });
    await screen.findByRole("dialog", { name: "초안 저장 센터" });
    expect(screen.getByRole("button", { name: "서버 저장 다시 시도" })).toBeTruthy();
    expect(document.activeElement).toBe(editing);
  });

  it("keeps the floating chip when no menubar slot exists", () => {
    setOnline(false);
    render(<SaveCenter />);

    const root = saveRoot();
    expect(root.getAttribute("data-studio-draft-save-placement")).toBe("floating");
    expect(root.className).toContain("fixed");
    expect(root.className).toContain("top-[calc(5.25rem+env(safe-area-inset-top))]");
    // 오프라인 문구가 이미 상태에 들어 있으므로 연결 배지를 겹쳐 달지 않는다.
    const trigger = screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" });
    expect(trigger.textContent?.match(/오프라인/gu)).toHaveLength(1);
  });

  it("moves the save status into the menubar and portals its dialog outside the clipped lane", async () => {
    setOnline(false);
    render(
      <>
        <MenubarSlots />
        <SaveCenter />
      </>,
    );

    const root = saveRoot();
    expect(screen.getByTestId("save-slot").contains(root)).toBe(true);
    expect(root.getAttribute("data-studio-draft-save-placement")).toBe("menubar");
    // 배치 관리자는 표시/숨김만 적용하고 위치는 옮기지 않는다.
    expect(root.getAttribute("data-studio-shell-inline-docked")).toBe("true");
    expect(root.getAttribute("data-studio-shell-force-visible")).toBe("true");
    expect(root.className).not.toContain("fixed");

    const trigger = screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" });
    expect(trigger.getAttribute("data-studio-draft-save-trigger")).toBe("menubar");
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog", { name: "초안 저장 센터" });
    expect(screen.getByTestId("menubar-actions").contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain("fixed");
    expect(dialog.style.left).toBe("");
    expect(dialog.style.top).not.toBe("");
    expect(dialog.style.right).not.toBe("");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "초안 저장 센터" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("stays a bottom floating chip in mobile immersive mode even when a slot is registered", () => {
    render(
      <>
        <MenubarSlots />
        <SaveCenter mobileImmersive />
      </>,
    );

    const root = saveRoot();
    expect(screen.getByTestId("save-slot").contains(root)).toBe(false);
    expect(root.getAttribute("data-studio-draft-save-placement")).toBe("floating");
    expect(root.className).toContain("bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4.25rem)]");
  });

  it("모바일 저장 자리가 없으면 기존 하단 부유 버튼을 유지한다", () => {
    render(<SaveCenter mobileImmersive />);
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("floating");
    expect(saveRoot().className).toContain("bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4.25rem)]");
  });

  it("명시한 모바일 저장 자리에서만 버튼을 올리고 대화상자는 body와 Escape 초점을 유지한다", async () => {
    setOnline(false);
    const view = render(<><ClarityMobileSaveSlot /><SaveCenter mobileImmersive /></>);
    const host = screen.getByTestId("mobile-save-slot");
    const trigger = within(host).getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" });
    expect(host.contains(saveRoot())).toBe(true);
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("menubar");
    expect(saveRoot().getAttribute("data-studio-shell-inline-docked")).toBe("true");
    expect(saveRoot().className).not.toContain("fixed");
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "초안 저장 센터" });
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.style.top).not.toBe("");
    expect(dialog.style.right).not.toBe("");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    view.rerender(<SaveCenter mobileImmersive />);
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("floating");
    expect(saveRoot().className).toContain("bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4.25rem)]");
  });

  it.each([false, true])("명시한 모바일 자리가 남아 있어도 캔버스 전용 모드에서는 부유 배치를 유지한다 (mobileImmersive=%s)", (mobileImmersive) => {
    render(<><ClarityMobileSaveSlot /><SaveCenter mobileImmersive={mobileImmersive} canvasOnlyMode /></>);
    expect(screen.getByTestId("mobile-save-slot").contains(saveRoot())).toBe(false);
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("floating");
    expect(saveRoot().className).toContain("bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+4.25rem)]");
    fireEvent.click(screen.getByRole("button", { name: /저장 상태:/ }));
    const dialog = screen.getByRole("dialog", { name: "초안 저장 센터" });
    expect(dialog.className).toContain("absolute right-0");
    expect(dialog.style.left).toBe("");
    expect(dialog.style.right).toBe("");
  });

  it.each([320, 390, 834])("왼쪽 모바일 저장 버튼의 팝오버를 %spx 화면의 8px 여백 안에 배치한다", async (width) => {
    vi.stubGlobal("innerWidth", width);
    try {
      render(<><ClarityMobileSaveSlot /><SaveCenter mobileImmersive /></>);
      const trigger = within(screen.getByTestId("mobile-save-slot")).getByRole("button", { name: /저장 상태:/ });
      vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue(new DOMRect(8, 136, 48, 48));
      fireEvent.click(trigger);
      const dialog = await screen.findByRole("dialog", { name: "초안 저장 센터" });
      expect(dialog.parentElement).toBe(document.body);
      expect(dialog.className).toContain("fixed");
      expect(dialog.style.top).toBe("192px");
      expect(dialog.style.left).toBe("8px");
      expect(dialog.style.right).toBe("8px");
      // 폭도 화면보다 16px 작게 제한하므로 왼쪽 버튼에 오른쪽 정렬해 화면 밖으로 밀리지 않는다.
      expect(dialog.className).toContain("w-[min(26rem,calc(100vw-1rem))]");
      expect(dialog.style.right).not.toBe(`${width - 56}px`);
    } finally { vi.unstubAllGlobals(); }
  });

  it("모바일 저장 자리에서도 서버 실패를 닫고 다시 열어 재시도·백업·버전을 사용할 수 있다", async () => {
    setOnline(true);
    const onSaveDraft = vi.fn().mockRejectedValueOnce(new Error("서버 저장 요청이 실패했습니다")).mockResolvedValue(undefined);
    const onExportBackup = vi.fn(() => Promise.resolve());
    const onOpenVersions = vi.fn();
    render(<><ClarityMobileSaveSlot /><SaveCenter mobileImmersive onSaveDraft={onSaveDraft} onExportBackup={onExportBackup} onOpenVersions={onOpenVersions} /></>);
    const host = screen.getByTestId("mobile-save-slot");
    fireEvent.click(within(host).getByRole("button", { name: "저장 상태: 서버 저장 기록 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "지금 서버에 저장" }));
    const retry = await screen.findByRole("button", { name: "서버 저장 다시 시도" });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(retry.closest('[role="dialog"]')?.parentElement).toBe(document.body);
    const failedTrigger = within(host).getByRole("button", { name: "저장 상태: 서버 저장 실패" });
    expect(saveRoot().getAttribute("data-studio-shell-force-visible")).toBe("true");
    expect(screen.getByText("현재 저장 번호 #7")).not.toBeNull();
    expect(document.querySelector("[data-studio-last-server-save]")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(failedTrigger);
    fireEvent.click(failedTrigger);
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 백업" }));
    expect(onExportBackup).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "서버 저장 다시 시도" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "저장 상태: 서버 저장 기록 확인" });
    // 단순 Promise 완료를 새 서버 저장 시각이나 버전 증가로 표시하지 않는다.
    expect(screen.getByText("현재 저장 번호 #7")).not.toBeNull();
    expect(document.querySelector("[data-studio-last-server-save]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "버전·체크포인트" }));
    expect(onOpenVersions).toHaveBeenCalledTimes(1);
  });

  it("모바일 저장 자리에서도 서버 충돌은 덮어쓰기 대신 버전 비교로 연결한다", () => {
    setOnline(true);
    const onSaveDraft = vi.fn();
    const onOpenVersions = vi.fn();
    render(<><ClarityMobileSaveSlot /><SaveCenter mobileImmersive error={new Error("다른 팀원이 먼저 저장했습니다. 최신 공동 문서를 다시 불러와 주세요.")} onSaveDraft={onSaveDraft} onOpenVersions={onOpenVersions} /></>);
    fireEvent.click(within(screen.getByTestId("mobile-save-slot")).getByRole("button", { name: "저장 상태: 저장 충돌 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "버전 비교·복원" }));
    expect(onOpenVersions).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("falls back to the floating chip after the menubar unmounts", () => {
    const view = render(
      <>
        <MenubarSlots />
        <SaveCenter />
      </>,
    );
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("menubar");

    view.rerender(<SaveCenter />);
    expect(saveRoot().getAttribute("data-studio-draft-save-placement")).toBe("floating");
  });

  it("puts the operation sync chip beside the save status in the menubar", async () => {
    const value: StudioLiveCollaborationContextValue = {
      ...EMPTY_STUDIO_LIVE_CONTEXT,
      availability: "error",
      mode: "server",
      serverAvailable: false,
      sync: {
        ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
        phase: "offline-queued",
        pendingCount: 2,
        persistenceDurability: "durable",
        transportReady: false,
        operationSyncReady: true,
        editsDurablyProtected: true,
        message: "서버 연결 대기",
        mode: "server",
      },
    };
    const withLive = (node: ReactNode) => (
      <StudioLiveCollaborationContext.Provider value={value}>{node}</StudioLiveCollaborationContext.Provider>
    );
    render(withLive(
      <>
        <MenubarSlots />
        <StudioDraftOperationSyncAssistant
          serverRevision={7}
          hasServerDocument
          localCheckpointCount={3}
          localRole="leader"
          collaborationSyncPending={false}
          hydrated
          hydrationFailed={false}
          saving={false}
          onOpenVersions={vi.fn()}
          onExportBackup={vi.fn(() => Promise.resolve())}
        />
      </>,
    ));

    const trigger = screen.getByRole("button", { name: /동기화 상태/u });
    const root = trigger.closest<HTMLElement>("[data-studio-operation-sync-assistant]");
    expect(root?.getAttribute("data-studio-operation-sync-placement")).toBe("menubar");
    expect(screen.getByTestId("sync-slot").contains(trigger)).toBe(true);

    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "기기·서버 동기화" });
    expect(dialog.parentElement).toBe(document.body);
    await waitFor(() => expect(document.activeElement).toBe(dialog));
  });

  it("keeps the operation sync chip in its slot at a fixed width after sync completes", async () => {
    const baseSync = {
      ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
      persistenceDurability: "durable" as const,
      transportReady: true,
      operationSyncReady: true,
      editsDurablyProtected: true,
      mode: "server" as const,
    };
    const syncingValue: StudioLiveCollaborationContextValue = {
      ...EMPTY_STUDIO_LIVE_CONTEXT,
      availability: "ready",
      mode: "server",
      serverAvailable: true,
      sync: { ...baseSync, phase: "syncing", pendingCount: 2, message: "동기화 중" },
    };
    const syncedValue: StudioLiveCollaborationContextValue = {
      ...syncingValue,
      sync: { ...baseSync, phase: "synced", pendingCount: 0, message: "동기화됨" },
    };
    const assistant = (
      <StudioDraftOperationSyncAssistant
        serverRevision={7}
        hasServerDocument
        localCheckpointCount={3}
        localRole="leader"
        collaborationSyncPending={false}
        hydrated
        hydrationFailed={false}
        saving={false}
        onOpenVersions={vi.fn()}
        onExportBackup={vi.fn(() => Promise.resolve())}
      />
    );
    const view = render(
      <StudioLiveCollaborationContext.Provider value={syncingValue}>
        <MenubarSlots />
        {assistant}
      </StudioLiveCollaborationContext.Provider>,
    );
    const slot = screen.getByTestId("sync-slot");
    expect(slot.contains(screen.getByRole("button", { name: /동기화 상태/ }))).toBe(true);

    view.rerender(
      <StudioLiveCollaborationContext.Provider value={syncedValue}>
        <MenubarSlots />
        {assistant}
      </StudioLiveCollaborationContext.Provider>,
    );

    // 동기화가 끝나도 칩이 슬롯에서 사라지지 않는다 — 같은 자리에 완료 상태만 남아야
    // 메뉴바 레이아웃이 동기화 사이클마다 밀리지 않는다.
    const syncedTrigger = screen.getByRole("button", { name: "동기화 상태: 변경 동기화 완료" });
    expect(slot.contains(syncedTrigger)).toBe(true);
    // 고정 폭 계약: 라벨이 보이는 구간에서도 폭은 클래스 상수로 고정된다.
    expect(syncedTrigger.className).toContain("w-11");
    expect(syncedTrigger.className).toContain("2xl:w-44");
    expect(syncedTrigger.className).not.toContain("max-w-");
  });

  it("gives the menubar save chip a fixed width that state labels cannot resize", () => {
    setOnline(true);
    render(
      <>
        <MenubarSlots />
        <SaveCenter />
      </>,
    );

    const trigger = screen.getByRole("button", { name: /저장 상태/ });
    expect(trigger.className).toContain("max-2xl:w-11");
    expect(trigger.className).toContain("2xl:w-48");
    expect(trigger.className).not.toContain("max-w-[13rem]");
  });
});
