// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioRecoveryNotice } from "./StudioRecoveryNotice";
import { createStudioRecoveryNewDrawingHref } from "./studio-recovery-notice-model";

afterEach(() => { cleanup(); useI18n.setState({ lang: "ko" }); });
const handlers = () => ({ autoRestore: true, onRestore: vi.fn(), onBackup: vi.fn(), onDelete: vi.fn() });

describe("low-friction studio recovery", () => {
  it("automatically resumes a compatible drawing without presenting a choice gate", () => {
    const props = handlers();
    render(<StudioRecoveryNotice blockedReason={null} {...props} />);

    expect(props.onRestore).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: "마지막 작업을 이어 여는 중이에요" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /이어/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /새 그림 그리기/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "다른 방법" })).toBeNull();
  });

  it.each(["legacy-unversioned", "work-mismatch", "revision-mismatch"] as const)(
    "keeps %s fail-closed instead of auto-restoring",
    (blockedReason) => {
      const props = handlers();
      render(<StudioRecoveryNotice blockedReason={blockedReason} {...props} />);

      expect(props.onRestore).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /이어/ })).toBeNull();
      expect(screen.queryByText(/revision|JSON|내구|권위/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "백업 파일 받기" }));
      expect(props.onBackup).toHaveBeenCalledOnce();
    },
  );

  it("저장본 불일치 안내를 접어도 경고와 백업을 유지하고 작업에는 손대지 않는다", () => {
    const props = handlers();
    render(<StudioRecoveryNotice blockedReason="revision-mismatch" {...props} />);
    const toggle = screen.getByRole("button", { name: "복구 안내 접기" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const explanation = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(explanation?.hidden).toBe(false);
    toggle.focus();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "복구 안내 펼치기" })).toBe(toggle);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(explanation?.hidden).toBe(true);
    expect(screen.getByRole("heading", { name: "남겨 둔 그림을 보관해 주세요" })).toBeTruthy();
    expect(screen.getByText("저장본과 다른 그림이 있어요.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /새 그림 그리기/ })).toBeNull();
    expect(props.onBackup).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "백업 파일 받기" }));
    expect(props.onBackup).toHaveBeenCalledOnce();
    fireEvent.click(toggle);
    expect(explanation?.hidden).toBe(false);
    expect(screen.getByRole("button", { name: "복구 안내 접기" })).toBe(toggle);
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(props.onRestore).not.toHaveBeenCalled();
  });

  it.each(["legacy-unversioned", "work-mismatch", null] as const)(
    "다른 복구 상태 %s 에서는 기존 안내를 그대로 유지한다",
    (blockedReason) => {
      render(<StudioRecoveryNotice {...handlers()} autoRestore={false} blockedReason={blockedReason} />);
      expect(screen.queryByRole("button", { name: "복구 안내 접기" })).toBeNull();
    },
  );

  it("영어에서도 현재 그림을 보존하고 다시 열기·새 탭·백업·명시적 삭제를 구분한다", () => {
    useI18n.setState({ lang: "en" });
    const props = handlers();
    render(<StudioRecoveryNotice {...props} autoRestore={false} blockedReason={null} />);
    expect(screen.getByRole("heading", { name: "Check the save status" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue drawing" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Start a new drawing.*New tab/u }).getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("button", { name: "Delete earlier drawing…" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download backup" }));
    expect(props.onBackup).toHaveBeenCalledOnce();
    expect(props.onRestore).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("asks only after automatic recovery actually fails", async () => {
    const props = {
      ...handlers(),
      onRestore: vi.fn(() => Promise.reject(new Error("network"))),
    };
    render(<StudioRecoveryNotice blockedReason={null} {...props} />);

    expect(screen.queryByRole("link", { name: /새 그림 그리기/ })).toBeNull();
    expect(await screen.findByRole("heading", { name: "자동으로 이어 열지 못했어요" })).toBeTruthy();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "다시 이어 열기" })).toBeTruthy();
    const fresh = screen.getByRole("link", { name: /새 그림 그리기/ });
    expect(fresh.getAttribute("target")).toBe("_blank");
    expect(fresh.getAttribute("rel")).toContain("noopener");
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("keeps destructive recovery actions behind an explicit secondary disclosure", async () => {
    const props = {
      ...handlers(),
      onRestore: vi.fn(() => Promise.reject(new Error("restore failed"))),
    };
    render(<StudioRecoveryNotice blockedReason={null} {...props} />);
    await screen.findByRole("button", { name: "다시 이어 열기" });

    expect(screen.queryByRole("button", { name: /삭제/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "다른 방법" }));
    expect(screen.getByRole("button", { name: "백업 파일 받기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "이전 그림 삭제…" })).toBeTruthy();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(props.onBackup).not.toHaveBeenCalled();
  });

  it("serializes a manual retry after auto-resume failure", async () => {
    let complete!: () => void;
    const retry = new Promise<void>((resolve) => { complete = resolve; });
    const props = {
      ...handlers(),
      onRestore: vi
        .fn<() => void | Promise<void>>()
        .mockRejectedValueOnce(new Error("network"))
        .mockImplementationOnce(() => retry),
    };
    render(<StudioRecoveryNotice blockedReason={null} {...props} />);
    const restore = await screen.findByRole("button", { name: "다시 이어 열기" });

    act(() => { restore.click(); restore.click(); });
    expect(props.onRestore).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "그림 여는 중…" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /새 그림 그리기/ }).getAttribute("aria-disabled")).toBe("true");

    await act(async () => { complete(); });
    expect(screen.getByRole("button", { name: "다시 이어 열기" }).hasAttribute("disabled")).toBe(false);
  });

  it("creates independent canonical drawing links without inheriting a work or shared room", () => {
    const a = new URL(createStudioRecoveryNewDrawingHref(), "https://www.toonstudio.cloud");
    const b = new URL(createStudioRecoveryNewDrawingHref(), a.origin);
    expect(a.pathname).toMatch(/^\/studio\/draft\/[a-f0-9-]+$/);
    expect(b.pathname).not.toBe(a.pathname);
    expect(a.searchParams.get("workspace")).toBe("draw");
    expect(a.searchParams.has("room")).toBe(false);
    expect(a.searchParams.has("id")).toBe(false);
  });
});
