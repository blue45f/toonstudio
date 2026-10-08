// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  reportStudioReliabilitySignal,
  resetStudioReliabilityStatus,
} from "./studio-reliability-status-store";
import { StudioDraftSaveCenter } from "./StudioDraftSaveCenter";

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value,
  });
}

function renderCenter(overrides: Partial<ComponentProps<typeof StudioDraftSaveCenter>> = {}) {
  const onSaveDraft = vi.fn(() => Promise.resolve());
  const onContinuePendingSave = vi.fn(() => Promise.resolve());
  const onOpenVersions = vi.fn();
  const onExportBackup = vi.fn(() => Promise.resolve());
  render(
    <StudioDraftSaveCenter
      saving={false}
      workId="work-1"
      workHydrated
      workHydrationFailed={false}
      loadedWork={{ id: "work-1", revision: 7 }}
      localCheckpointCount={3}
      serverCurrentRevision={7}
      serverRevisions={[{ revision: 7, createdAt: "2026-09-09T03:00:00.000Z" }]}
      autosaveDocumentLeadership={{ role: "leader", basis: "web-lock" }}
      onSaveDraft={onSaveDraft}
      onContinuePendingSave={onContinuePendingSave}
      onOpenVersions={onOpenVersions}
      onExportBackup={onExportBackup}
      {...overrides}
    />,
  );
  return {
    onSaveDraft,
    onContinuePendingSave,
    onOpenVersions,
    onExportBackup,
  };
}

afterEach(() => {
  cleanup();
  resetStudioReliabilityStatus();
  setOnline(true);
  vi.restoreAllMocks();
});

describe("StudioDraftSaveCenter", () => {
  it("오프라인 보호 성공을 기존 저장 상태에서 알리고 상세 안내만 닫는다", () => {
    setOnline(false);
    const notice = "변경을 Automerge 오프라인 branch에 보호했습니다. 서버 정본 연결 후 안전하게 합칩니다.";
    const onDismissOfflineSceneNotice = vi.fn();
    const actions = { onSaveDraft: vi.fn(), onExportBackup: vi.fn() };
    function NoticeCenter() {
      const [message, setMessage] = useState<string | null>(notice);
      return <StudioDraftSaveCenter saving={false} workId="work-1" loadedWork={{ id: "work-1", revision: 7 }}
        offlineSceneNotice={message} onDismissOfflineSceneNotice={() => {
          onDismissOfflineSceneNotice(); setMessage(null);
        }} onSaveDraft={actions.onSaveDraft} onExportBackup={actions.onExportBackup} onOpenVersions={() => undefined} />;
    }
    render(<NoticeCenter />);
    const trigger = screen.getByRole("button", { name: "저장 상태: 오프라인" });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("title")).toBe(notice);
    const liveNotice = document.getElementById(trigger.getAttribute("aria-describedby") ?? "");
    expect(liveNotice?.getAttribute("aria-live")).toBe("polite");
    expect(liveNotice?.textContent).toBe(notice);
    expect(document.querySelector("[data-studio-offline-scene-notice]")).toBeNull();

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "초안 저장 센터" });
    expect(within(dialog).getByText(notice)).not.toBeNull();
    const dismiss = within(dialog).getByRole("button", { name: "알림 닫기" });
    dismiss.focus();
    fireEvent.click(dismiss);
    expect(onDismissOfflineSceneNotice).toHaveBeenCalledTimes(1);
    expect(actions.onSaveDraft).not.toHaveBeenCalled();
    expect(actions.onExportBackup).not.toHaveBeenCalled();
    expect(document.querySelector("[data-studio-offline-scene-notice]")).toBeNull();
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "초안 저장 센터 닫기" }));
    expect(screen.getByRole("dialog", { name: "초안 저장 센터" })).not.toBeNull();
  });

  it("opens a two-authority save explanation from the compact status", () => {
    setOnline(true);
    renderCenter();

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));

    expect(screen.getByRole("dialog", { name: "초안 저장 센터" })).not.toBeNull();
    expect(screen.getByText("2단계 자동 보호")).not.toBeNull();
    expect(screen.getByText("이 탭이 복구 저장 담당")).not.toBeNull();
    expect(screen.getByText("서버 초안 revision #7")).not.toBeNull();
    expect(screen.getByText("기기 체크포인트")).not.toBeNull();
    expect(screen.getByText("3개")).not.toBeNull();
    const lastSave = document.querySelector("[data-studio-last-server-save]");
    expect(lastSave).not.toBeNull();
    expect(lastSave?.getAttribute("datetime")).toBe("2026-09-09T03:00:00.000Z");
    expect(lastSave?.textContent).toContain("서버");
  });

  it("delegates manual save, version history and project backup to existing authorities", async () => {
    setOnline(true);
    const actions = renderCenter();
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));

    fireEvent.click(screen.getByRole("button", { name: "지금 서버에 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "버전·체크포인트" }));

    // The save adapter owns an in-flight Promise before invoking the authority.
    await waitFor(() => expect(actions.onSaveDraft).toHaveBeenCalledTimes(1));
    expect(actions.onOpenVersions).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "프로젝트 백업" }));
    expect(actions.onExportBackup).toHaveBeenCalledTimes(1);
  });

  it("blocks an empty overwrite while the existing document is hydrating", () => {
    setOnline(true);
    const actions = renderCenter({ workHydrated: false });

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 원고 불러오는 중" }));

    const saveButton = screen.getByRole("button", { name: "원고 불러오는 중" }) as HTMLButtonElement;
    const backupButton = screen.getByRole("button", { name: "원고 로드 후 백업" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(backupButton.disabled).toBe(true);
    expect(actions.onSaveDraft).not.toHaveBeenCalled();
  });

  it("opens preserved recovery history after hydration failure", () => {
    setOnline(true);
    const actions = renderCenter({
      workHydrated: false,
      workHydrationFailed: true,
    });

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 원고 복구 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "버전·복구 열기" }));

    expect(actions.onOpenVersions).toHaveBeenCalledTimes(1);
    expect(actions.onSaveDraft).not.toHaveBeenCalled();
  });

  it("continues the exact pending draft metadata intent", () => {
    setOnline(true);
    const actions = renderCenter({ pendingSaveIntent: "draft" });

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 저장 정보 입력 필요" }));
    fireEvent.click(screen.getByRole("button", { name: "초안 저장 계속" }));

    expect(actions.onContinuePendingSave).toHaveBeenCalledTimes(1);
    expect(actions.onSaveDraft).not.toHaveBeenCalled();
  });

  it("routes revision conflict to comparison instead of blind retry", () => {
    setOnline(true);
    const actions = renderCenter({
      error: new Error("다른 팀원이 먼저 저장했습니다. 최신 공동 문서를 다시 불러와 주세요."),
    });

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 저장 충돌 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "버전 비교·복원" }));

    expect(actions.onOpenVersions).toHaveBeenCalledTimes(1);
    expect(actions.onSaveDraft).not.toHaveBeenCalled();
  });

  it("queues one save while offline and replays it when connectivity returns", async () => {
    setOnline(false);
    const actions = renderCenter();
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 오프라인 · 기기 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "연결 후 저장 예약" }));

    expect(actions.onSaveDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "연결 후 저장 예약됨" })).not.toBeNull();

    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(actions.onSaveDraft).toHaveBeenCalledTimes(1));
  });

  it("replays a save that failed mid-request once the server becomes reachable again", async () => {
    setOnline(true);
    const onSaveDraft = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValue(undefined);
    renderCenter({ onSaveDraft });

    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" }));
    fireEvent.click(screen.getByRole("button", { name: "지금 서버에 저장" }));

    // 실패는 숨지 않는다 — 기기 예약과 자동 재저장 약속이 그대로 보인다.
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(
      (await screen.findAllByText(/연결이 복구되면 자동으로 다시 저장합니다/)).length,
    ).toBeGreaterThan(0);
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    // 연결성 감지가 복구를 확인하면(online 전이) 클릭 없이 예약 저장이 자동 재생된다.
    // 실패가 세팅한 오류 문구가 재생 가드를 막던 교착의 회귀 방지다.
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2));
  });

  it("promotes durable storage failure instead of showing a false green state", () => {
    setOnline(true);
    act(() => {
      reportStudioReliabilitySignal({
        channel: "storage",
        level: "failed",
        title: "복구 저장소 쓰기 실패",
        detail: "저장 공간을 확인하세요.",
        at: Date.now(),
      });
    });
    renderCenter();

    expect(screen.getByRole("button", { name: "저장 상태: 복구 저장 확인" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "저장 상태: 복구 저장 확인" }));
    expect(screen.getByText("이 기기 복구 저장 확인 필요")).not.toBeNull();
    const dialog = screen.getByRole("dialog", { name: "초안 저장 센터" });
    const descriptionId = dialog.getAttribute("aria-describedby");
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)?.textContent).toContain(
      "탭을 닫기 전에 프로젝트 백업을 내려받아 주세요",
    );
  });

  it("closes with Escape and restores focus to the status trigger", () => {
    setOnline(true);
    renderCenter();
    const trigger = screen.getByRole("button", { name: "저장 상태: 서버 r7 확인" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "초안 저장 센터" })).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "초안 저장 센터" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
