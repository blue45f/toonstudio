// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { registerModalStatusSlot } from "@/shared/lib/modal-status-slot";
import { StudioSaveStatusBar } from "../StudioSaveStatusBar";
import {
  createStudioSaveSyncSignalStore,
  resolveSaveSyncStatusFromSignals,
  type StudioSaveSyncReceiptRecord,
} from "../studio-save-sync-signals";
import type { StudioConnectivitySnapshot } from "../offline/studio-connectivity";
import type { StudioSaveSyncStatus } from "../studio-operation-recovery-coordinator";

afterEach(cleanup);

function connectivity(mode: StudioConnectivitySnapshot["mode"]): StudioConnectivitySnapshot {
  return {
    browserOnline: mode !== "offline",
    serverReachable: mode === "online" ? true : mode === "reconnecting" ? null : false,
    checking: mode === "reconnecting",
    mode,
    serverAvailable: mode === "online",
    localOnly: mode !== "online",
    lastCheckedAt: Date.now(),
    consecutiveFailures: mode === "server-unavailable" ? 2 : 0,
  };
}

function localReceipt(authority: StudioSaveSyncReceiptRecord["authority"]): StudioSaveSyncReceiptRecord {
  return { authority, savedAtMs: Date.now(), generation: 1, sequence: 1, revision: 1 };
}

function status(patch: Partial<StudioSaveSyncStatus> = {}): StudioSaveSyncStatus {
  return {
    documentId: "doc-1",
    localDurable: true,
    pendingOperationsCount: 0,
    lastSavedAt: Date.now(),
    lastCheckpointAt: Date.now(),
    cloudSyncStatus: "synced",
    summaryText: "",
    ...patch,
  };
}

describe("StudioSaveStatusBar", () => {
  it.each(["opfs-journal", "sqlite-fallback"] as const)("서버 연결이 정상이어도 %s receipt는 기기 저장으로 표시한다", (authority) => {
    const store = createStudioSaveSyncSignalStore();
    store.reset("guest-local-document");
    store.noteDurability("available");
    store.noteOnline(true);
    store.noteDurableReceipt(localReceipt(authority));
    const saved = resolveSaveSyncStatusFromSignals(store.getSignals());
    expect(saved.cloudSyncStatus).toBe("synced");

    render(<StudioSaveStatusBar status={saved} connectivity={connectivity("online")} />);
    expect(screen.getByText(/^이 기기에 저장됨 · 방금$|^Saved on this device · Just now$/u)).toBeTruthy();
    expect(screen.queryByText(/^저장됨 ·|^Saved ·/u)).toBeNull();
  });

  it("온라인 상태와 저장 경로 가용성만으로 아직 없는 저장 기록을 약속하지 않는다", () => {
    const store = createStudioSaveSyncSignalStore();
    store.reset("guest-empty-document");
    store.noteDurability("available");
    store.noteOnline(true);
    render(
      <StudioSaveStatusBar
        status={resolveSaveSyncStatusFromSignals(store.getSignals())}
        connectivity={connectivity("online")}
      />,
    );
    expect(screen.getByText(/아직 저장 기록 없음|No save recorded yet/u)).toBeTruthy();
    expect(screen.queryByText(/이 기기에 저장됨|Saved on this device/u)).toBeNull();
  });

  it("로컬 receipt로 저장이 끝나면 라이브 영역도 기기 저장 범위를 알린다", () => {
    const store = createStudioSaveSyncSignalStore();
    store.reset("guest-local-document");
    store.noteDurability("available");
    store.noteEditGeneration(1);
    const { rerender } = render(
      <StudioSaveStatusBar
        status={resolveSaveSyncStatusFromSignals(store.getSignals())}
        connectivity={connectivity("online")}
      />,
    );
    expect(screen.getByRole("status").textContent).toBe("");
    store.noteDurableReceipt(localReceipt("opfs-journal"));
    rerender(
      <StudioSaveStatusBar
        status={resolveSaveSyncStatusFromSignals(store.getSignals())}
        connectivity={connectivity("online")}
      />,
    );
    expect(screen.getByRole("status").textContent).toMatch(/^모든 변경이 이 기기에 저장됐습니다\.$|^All changes saved on this device\.$/u);
  });

  it("연결 복구를 서버 저장 확인으로 알리지 않는다", () => {
    const { rerender } = render(<StudioSaveStatusBar status={status()} connectivity={connectivity("online")} />);
    rerender(<StudioSaveStatusBar status={status()} connectivity={connectivity("offline")} />);
    rerender(<StudioSaveStatusBar status={status()} connectivity={connectivity("reconnecting")} />);
    rerender(<StudioSaveStatusBar status={status()} connectivity={connectivity("online")} />);
    expect(screen.getByRole("status").textContent).toMatch(
      /^연결이 복구됐고 모든 변경이 이 기기에 저장됐습니다\.$|^Connection restored and all changes saved on this device\.$/u,
    );
  });

  it("오프라인에서도 최근 변경이 아직 보류 중이면 저장 완료라고 표시하지 않는다", () => {
    render(
      <StudioSaveStatusBar
        status={status({ pendingOperationsCount: 1, cloudSyncStatus: "pending" })}
        connectivity={connectivity("offline")}
      />,
    );
    expect(screen.getByText(/오프라인 · 이 기기에 저장 중|Offline · Saving on this device/u)).toBeTruthy();
    expect(screen.queryByText(/이 기기에 저장됨|Saved on this device/u)).toBeNull();
  });

  it("shows the failure state with a working retry action", () => {
    const onRetrySave = vi.fn();
    render(
      <StudioSaveStatusBar
        status={status({ localDurable: false })}
        onRetrySave={onRetrySave}
      />,
    );
    expect(screen.getByText(/저장 확인 필요|Couldn't confirm save/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /다시 시도|Retry/ }));
    expect(onRetrySave).toHaveBeenCalledTimes(1);
  });

  it("shows minutes-ago after the just-now window", () => {
    const fiveMinutesAgo = Date.now() - 5 * 60_000;
    render(
      <StudioSaveStatusBar
        status={status({ lastSavedAt: fiveMinutesAgo, lastCheckpointAt: fiveMinutesAgo })}
      />,
    );
    expect(screen.getByText(/5분 전|5 min ago/)).toBeTruthy();
  });

  it("applies tabular-nums and motion-reduce:animate-none during active saving", () => {
    const { container } = render(
      <StudioSaveStatusBar
        status={status({ pendingOperationsCount: 3, cloudSyncStatus: "pending" })}
      />,
    );
    const bar = container.querySelector("[data-studio-save-status-bar]");
    expect(bar?.getAttribute("data-save-state")).toBe("saving");
    expect(bar?.innerHTML).toContain("tabular-nums");
    expect(bar?.innerHTML).toContain("motion-reduce:animate-none");
  });
});


describe("drawing save announcer", () => {
  it("moves one live announcement into the active More modal and returns it when closed", () => {
    const modal = document.createElement("div"); document.body.append(modal);
    let stop: (() => void) | undefined;
    try {
      const view = render(<StudioSaveStatusBar presentation="drawing" status={status()} />);
      act(() => { stop = registerModalStatusSlot(modal); });
      view.rerender(<StudioSaveStatusBar presentation="drawing" status={status({ localDurable: false })} />);
      expect(screen.getAllByRole("status")).toHaveLength(1);
      expect(modal.querySelector('[role="status"]')?.textContent).toMatch(/확인|confirm/u);
      expect(view.container.querySelector('[role="status"]')).toBeNull();
      act(() => stop?.()); stop = undefined;
      expect(modal.querySelector('[role="status"]')).toBeNull();
      expect(view.container.querySelector('[role="status"]')?.textContent).toMatch(/확인|confirm/u);
    } finally { if (stop) act(stop); modal.remove(); }
  });
  it("keeps local failure retry and live transitions without a duplicate connection button", () => {
    const retry = vi.fn(), recheck = vi.fn();
    const { rerender, container } = render(<StudioSaveStatusBar presentation="drawing" companionCenterMounted
      status={status({ pendingOperationsCount: 1, cloudSyncStatus: "pending" })}
      connectivity={connectivity("server-unavailable")} onRetrySave={retry} onRecheckConnection={recheck} />);
    expect(screen.queryByRole("button", { name: /연결 다시 확인|Check connection/ })).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    rerender(<StudioSaveStatusBar presentation="drawing" companionCenterMounted status={status({ localDurable: false })}
      connectivity={connectivity("server-unavailable")} onRetrySave={retry} onRecheckConnection={recheck} />);
    expect(screen.getByRole("status").textContent).toMatch(/확인|confirm/u);
    fireEvent.click(screen.getByRole("button", { name: /다시 시도|Retry/u }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(recheck).not.toHaveBeenCalled();
  });
});
