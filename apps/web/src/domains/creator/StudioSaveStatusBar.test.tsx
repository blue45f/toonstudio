// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioSaveStatusBar } from "./StudioSaveStatusBar";
import type { StudioSaveSyncStatus } from "./studio-operation-recovery-coordinator";

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
  it("shows 저장됨 · 방금 right after a receipt", () => {
    render(<StudioSaveStatusBar status={status()} />);
    expect(screen.getByText(/저장됨 · 방금|Saved · Just now/)).toBeTruthy();
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
});
