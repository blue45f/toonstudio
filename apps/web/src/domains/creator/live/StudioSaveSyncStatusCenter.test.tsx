// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  appendCanvasOperation,
  createEmptyOperationJournal,
  createJournalCheckpoint,
  type StudioSaveSyncStatus,
} from "../studio-operation-recovery-coordinator";
import { StudioSaveSyncStatusCenter } from "../StudioSaveSyncStatusCenter";
import {
  createStudioSaveSyncSignalStore,
  resolveSaveSyncStatusFromSignals,
  saveSyncJournalSnapshotFromSignals,
} from "../studio-save-sync-signals";

import type { StudioConnectivitySnapshot } from "../offline/studio-connectivity";
import { getActiveEditorStatusSlot } from "@/shared/lib/modal-status-slot";

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis.navigator, "clipboard");
  Reflect.deleteProperty(document, "execCommand");
  vi.restoreAllMocks();
});

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(globalThis.navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
}

function openAdvancedDiagnostics(): HTMLButtonElement {
  fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));
  fireEvent.click(screen.getByText("고급 진단 보기"));
  return screen.getByRole("button", { name: "진단 정보 복사" });
}

describe("StudioSaveSyncStatusCenter", () => {
  it("같은 상태 버튼과 숨김 상세 자리를 유지하며 닫기·해제 시 초점과 등록을 정리한다", () => {
    const view = render(<StudioSaveSyncStatusCenter journal={createEmptyOperationJournal("slot-test")} />);
    const slot = getActiveEditorStatusSlot();
    const trigger = screen.getByRole("button", { name: /저장 상태 열기/u });
    expect(slot?.summary.closest("button")).toBe(trigger);
    expect(trigger.getAttribute("aria-describedby")).toBe(slot?.summary.id);
    expect(slot?.element.closest('[role="dialog"]')?.hasAttribute("hidden")).toBe(true);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(trigger);
    expect(getActiveEditorStatusSlot()).toBe(slot);
    expect(slot?.element.closest('[role="dialog"]')?.hasAttribute("hidden")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 닫기" }));
    expect(document.activeElement).toBe(trigger);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(getActiveEditorStatusSlot()).toBe(slot);
    view.unmount();
    expect(getActiveEditorStatusSlot()).toBeNull();
  });

  it("로컬 체크포인트가 있으면 저장 범위를 기기로 표시한다", () => {
    const journal = createJournalCheckpoint(createEmptyOperationJournal("doc-1"), {});
    render(<StudioSaveSyncStatusCenter journal={journal} />);

    expect(screen.getByText("이 기기에 저장됨")).not.toBeNull();
    expect(screen.getByRole("button", { name: "저장 상태 열기: 이 기기에 저장됨" })).not.toBeNull();
  });

  it.each(["opfs-journal", "sqlite-fallback"] as const)("정상 서버 연결과 %s receipt를 서버 저장 확인으로 표시하지 않는다", (authority) => {
    const store = createStudioSaveSyncSignalStore();
    store.reset("guest-local-document");
    store.noteDurability("available");
    store.noteOnline(true);
    store.noteDurableReceipt({ authority, savedAtMs: Date.now(), generation: 1, sequence: 1, revision: 1 });
    const signals = store.getSignals();
    const status = resolveSaveSyncStatusFromSignals(signals);
    expect(status.cloudSyncStatus).toBe("synced");
    const online: StudioConnectivitySnapshot = {
      browserOnline: true,
      serverReachable: true,
      checking: false,
      mode: "online",
      serverAvailable: true,
      localOnly: false,
      lastCheckedAt: Date.now(),
      consecutiveFailures: 0,
    };
    render(
      <StudioSaveSyncStatusCenter
        journal={saveSyncJournalSnapshotFromSignals(signals)}
        statusOverride={status}
        connectivity={online}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 열기: 이 기기에 저장됨" }));
    expect(screen.getByText("최근 작업이 이 기기에 저장됐어요.")).not.toBeNull();
    expect(screen.getByText("이 화면에서는 서버 저장 여부를 확인할 수 없어요.")).not.toBeNull();
    expect(screen.queryByText(/최신 상태로 저장됐어요|자동으로 동기화|서버 동기화를 기다리고/u)).toBeNull();
    fireEvent.click(screen.getByText("고급 진단 보기"));
    expect(screen.getByText("기기 저장", { exact: true }).parentElement).toBe(screen.getByText("로컬 저장 방식").parentElement);
    expect(screen.queryByText("OPFS", { exact: true })).toBeNull();
  });

  it("체크포인트가 없는 새 문서는 저장 기록이 없다고 표시한다", () => {
    render(<StudioSaveSyncStatusCenter journal={createEmptyOperationJournal("new-document")} />);
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 열기: 아직 저장 기록 없음" }));
    expect(screen.getByText("아직 이 기기에 저장된 기록이 없어요.")).not.toBeNull();
    expect(screen.getByText(/아직 만들어진 복구 지점이 없어요/u)).not.toBeNull();
    expect(screen.queryByText(/마지막 복구 지점은/u)).toBeNull();
  });

  it("아직 체크포인트에 반영되지 않은 변경은 기기 저장 중으로 표시한다", () => {
    let journal = createEmptyOperationJournal("doc-1");
    journal = appendCanvasOperation(journal, "stroke", "선화 작화", {});

    render(<StudioSaveSyncStatusCenter journal={journal} />);
    expect(screen.getByText("이 기기에 저장 중")).not.toBeNull();
    expect(screen.queryByText(/서버에 저장하는 중/u)).toBeNull();
  });

  it("makes offline safety explicit", () => {
    const journal = createJournalCheckpoint(createEmptyOperationJournal("doc-1"), {});
    render(<StudioSaveSyncStatusCenter journal={journal} isOnline={false} />);

    expect(screen.getByText("오프라인 · 이 기기에 저장됨")).not.toBeNull();
  });

  it("opens plain-language details and keeps implementation data under advanced diagnostics", () => {
    const onForceCheckpoint = vi.fn();
    let journal = createEmptyOperationJournal("doc-1");
    journal = appendCanvasOperation(journal, "stroke", "스케치", {});

    render(
      <StudioSaveSyncStatusCenter
        journal={journal}
        onForceCheckpoint={onForceCheckpoint}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));

    expect(screen.getByRole("dialog", { name: "저장 상태 상세" })).not.toBeNull();
    expect(screen.getByText("이 기기")).not.toBeNull();
    expect(screen.getByText("서버")).not.toBeNull();
    expect(screen.getByText("복구")).not.toBeNull();
    expect(screen.getByText("이 화면에서는 서버 저장 여부를 확인할 수 없어요.")).not.toBeNull();
    expect(screen.getByText(/최근 변경을 이 기기에 저장하고 있어요/u)).not.toBeNull();
    expect(screen.getByText("고급 진단 보기")).not.toBeNull();
    expect(screen.getByText("로컬 저장 방식")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "복구 지점 만들기" }));
    expect(onForceCheckpoint).toHaveBeenCalledTimes(1);
  });

  it("shows copy success only after the diagnostics actually reach the clipboard", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    stubClipboard(writeText);
    const journal = createEmptyOperationJournal("doc-copy-success");

    render(<StudioSaveSyncStatusCenter journal={journal} />);
    fireEvent.click(openAdvancedDiagnostics());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "진단 정보를 복사했어요" })
      ).not.toBeNull();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0]?.[0]).toContain("doc-copy-success");
  });

  it("reports a blocked clipboard instead of claiming that diagnostics were copied", async () => {
    stubClipboard(() => Promise.reject(new Error("blocked")));
    Object.defineProperty(document, "execCommand", {
      value: () => false,
      configurable: true,
      writable: true,
    });
    const journal = createEmptyOperationJournal("doc-copy-failure");

    render(<StudioSaveSyncStatusCenter journal={journal} />);
    fireEvent.click(openAdvancedDiagnostics());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "진단 정보를 복사하지 못했어요" })
      ).not.toBeNull();
    });
    expect(screen.queryByText("진단 정보를 복사했어요")).toBeNull();
  });
});
describe("StudioSaveSyncStatusCenter recovery actions (G2)", () => {
  const baseStatus: StudioSaveSyncStatus = {
    documentId: "doc-g2",
    localDurable: true,
    pendingOperationsCount: 0,
    lastSavedAt: 1_700_000_000_000,
    lastCheckpointAt: 1_700_000_000_000,
    cloudSyncStatus: "synced",
    summaryText: "",
  };
  const serverDown: StudioConnectivitySnapshot = {
    browserOnline: true,
    serverReachable: false,
    checking: false,
    mode: "server-unavailable",
    serverAvailable: false,
    localOnly: true,
    lastCheckedAt: 1_700_000_000_000,
    consecutiveFailures: 2,
  };

  it("offers an in-dialog save retry when local durability failed", () => {
    const onRetrySave = vi.fn();
    const journal = createEmptyOperationJournal("doc-g2");
    render(
      <StudioSaveSyncStatusCenter
        journal={journal}
        statusOverride={{ ...baseStatus, localDurable: false }}
        onRetrySave={onRetrySave}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));
    fireEvent.click(screen.getByRole("button", { name: "지금 다시 시도" }));
    expect(onRetrySave).toHaveBeenCalledTimes(1);
  });

  it("연결 준비 안내보다 실제 저장 상태와 복구 행동을 먼저 제공한다", () => {
    render(
      <StudioSaveSyncStatusCenter
        journal={createEmptyOperationJournal("notice-order")}
        statusOverride={{ ...baseStatus, localDurable: false }}
        onRetrySave={vi.fn()}
        onForceCheckpoint={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 열기: 저장 확인 필요" }));
    const slot = getActiveEditorStatusSlot();
    if (!slot) throw new Error("편집기 알림 자리 누락");
    for (const prior of [
      screen.getByText("이 기기"),
      screen.getByText("서버"),
      screen.getByText("복구"),
      screen.getByRole("button", { name: "지금 다시 시도" }),
      screen.getByRole("button", { name: "복구 지점 만들기" }),
    ]) {
      expect(prior.compareDocumentPosition(slot.element) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    }
    expect(slot.element.compareDocumentPosition(screen.getByText("고급 진단 보기"))
      & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("shows server failure on the pill and offers a connection recheck in the dialog", () => {
    const onRecheckConnection = vi.fn();
    const journal = createEmptyOperationJournal("doc-g2");
    render(
      <StudioSaveSyncStatusCenter
        journal={journal}
        statusOverride={baseStatus}
        connectivity={serverDown}
        onRecheckConnection={onRecheckConnection}
      />
    );

    expect(screen.getByText("서버 연결 안 됨 · 이 기기에 저장됨")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));
    expect(screen.getByText(/서버에 연결할 수 없어요/u)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "연결 다시 확인" }));
    expect(onRecheckConnection).toHaveBeenCalledTimes(1);
  });

  it("shows offline on the pill from connectivity even when the save signal still says synced (C6)", () => {
    const offline: StudioConnectivitySnapshot = {
      browserOnline: false,
      serverReachable: false,
      checking: false,
      mode: "offline",
      serverAvailable: false,
      localOnly: true,
      lastCheckedAt: 1_700_000_000_000,
      consecutiveFailures: 0,
    };
    const journal = createEmptyOperationJournal("doc-g2");
    render(
      <StudioSaveSyncStatusCenter
        journal={journal}
        statusOverride={baseStatus}
        connectivity={offline}
      />
    );

    // 연결 모듈이 오프라인이면 저장 신호가 synced여도 "저장됨"으로 읽히면 안 된다.
    expect(screen.getByText("오프라인 · 이 기기에 저장됨")).not.toBeNull();
    expect(screen.queryByText("저장됨")).toBeNull();
  });

  it("says no checkpoint exists instead of showing an epoch time", () => {
    const journal = createEmptyOperationJournal("doc-g2");
    render(
      <StudioSaveSyncStatusCenter
        journal={journal}
        statusOverride={{ ...baseStatus, lastSavedAt: 0, lastCheckpointAt: 0 }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));
    expect(screen.getByText(/아직 만들어진 복구 지점이 없어요/u)).not.toBeNull();
  });

  it("supports Escape dismissal and outside pointerdown light-dismiss", () => {
    const journal = createEmptyOperationJournal("doc-g2");
    render(<StudioSaveSyncStatusCenter journal={journal} statusOverride={baseStatus} />);

    const trigger = screen.getByRole("button", { name: /저장 상태 열기/u });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "저장 상태 상세" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "저장 상태 상세" })).toBeNull();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "저장 상태 상세" })).not.toBeNull();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "저장 상태 상세" })).toBeNull();
  });

  it("보류 세대 진행률을 서버가 아닌 이 기기 저장 섹션에 표시한다", () => {
    const journal = createEmptyOperationJournal("doc-g2");
    const { rerender } = render(
      <StudioSaveSyncStatusCenter
        journal={journal}
        statusOverride={{ ...baseStatus, pendingOperationsCount: 81, cloudSyncStatus: "pending" }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /저장 상태 열기/u }));
    const progress = screen.getByRole("progressbar", {
      name: "이 기기 저장 대기열 진행률",
    }) as HTMLProgressElement;
    expect(progress.max).toBe(81);
    expect(progress.value).toBe(0);
    expect(screen.getByText("이 기기").closest("section")?.contains(progress)).toBe(true);
    expect(screen.getByText("서버").closest("section")?.contains(progress)).toBe(false);
    expect(screen.queryByText(/서버에 아직 반영되지 않은 변경/u)).toBeNull();

    rerender(
      <StudioSaveSyncStatusCenter
        journal={journal}
        statusOverride={{ ...baseStatus, pendingOperationsCount: 31, cloudSyncStatus: "pending" }}
      />
    );
    expect(progress.max).toBe(81);
    expect(progress.value).toBe(50);

    rerender(
      <StudioSaveSyncStatusCenter
        journal={journal}
        statusOverride={{ ...baseStatus, pendingOperationsCount: 0, cloudSyncStatus: "synced" }}
      />
    );
    expect(screen.queryByRole("progressbar", { name: "이 기기 저장 대기열 진행률" })).toBeNull();
  });
});
