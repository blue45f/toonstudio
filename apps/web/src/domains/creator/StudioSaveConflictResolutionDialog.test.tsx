// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioSaveConflictResolutionDialog } from "./StudioSaveConflictResolutionDialog";

const SUMMARY = {
  documentTitle: "1화 — 첫 만남",
  localSavedAtLabel: "방금 전 (18:55)",
  remoteSavedAtLabel: "3분 전 (18:52)",
  localChangedCount: 4,
  remoteChangedCount: 2,
};

describe("StudioSaveConflictResolutionDialog", () => {
  it("3가지 복구 선택지와 Escape 닫기를 지원하며 내부 기술 용어를 노출하지 않는다", () => {
    const onResolve = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioSaveConflictResolutionDialog
        open
        summary={SUMMARY}
        onResolve={onResolve}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/SQLite|OPFS|CRDT|lease|revision/i);

    fireEvent.click(screen.getByRole("button", { name: /두 버전 모두 보존하기/ }));
    expect(onResolve).toHaveBeenCalledWith("keep-both-copy");

    fireEvent.click(screen.getByRole("button", { name: /이 기기 작업본으로 계속하기/ }));
    expect(onResolve).toHaveBeenCalledWith("keep-local");

    fireEvent.click(screen.getByRole("button", { name: /다른 곳의 최신본 불러오기/ }));
    expect(onResolve).toHaveBeenCalledWith("use-remote");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("처리 중 상태에서는 중복 클릭과 Escape 닫기를 차단하고 오류 메시지를 표시한다", () => {
    const onResolve = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioSaveConflictResolutionDialog
        open
        summary={SUMMARY}
        resolvingChoice="keep-both-copy"
        errorMessage="사본 저장에 잠시 실패했습니다. 다시 선택해 주세요."
        onResolve={onResolve}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("사본 저장에 잠시 실패했습니다.");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
