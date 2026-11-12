// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioFormalSaveDialog, type StudioFormalSaveDialogProps } from "./StudioFormalSaveDialog";

function props(overrides: Partial<StudioFormalSaveDialogProps> = {}): StudioFormalSaveDialogProps {
  return {
    open: true, locale: "ko", projectTitle: "검토용 원고", firstSave: true,
    busy: false, error: null, onClose: vi.fn(), onSaveFile: vi.fn(), onOpenPersonalDrive: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
  const rect = new DOMRect(0, 0, 100, 48);
  const visibleRects: DOMRectList = Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
  // jsdom은 레이아웃을 하지 않는다. 실제 modal hook의 보이는 요소 판정에만 사각형을 제공한다.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(visibleRects);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useI18n.getState().setLang("ko");
});

describe("StudioFormalSaveDialog 작업 파일 저장", () => {
  it("닫힌 제어 상태에서는 portal이나 저장 동작을 만들지 않는다", () => {
    const callbacks = props({ open: false });
    render(<StudioFormalSaveDialog {...callbacks} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(callbacks.onSaveFile).not.toHaveBeenCalled();
    expect(callbacks.onOpenPersonalDrive).not.toHaveBeenCalled();
  });

  it("첫 행동은 기기 작업 파일 저장이며 백업·닫기와 콜백을 섞지 않는다", () => {
    const callbacks = props();
    render(<StudioFormalSaveDialog {...callbacks} />);
    const dialog = screen.getByRole("dialog", { name: "작업 파일을 저장하세요" });
    const save = within(dialog).getByRole("button", { name: "이 기기에 작업 파일 저장" });
    expect(document.activeElement).toBe(save);
    fireEvent.click(save);
    expect(callbacks.onSaveFile).toHaveBeenCalledTimes(1);
    expect(callbacks.onOpenPersonalDrive).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByText("검토용 원고")).toBeTruthy();
    expect(dialog.textContent).toContain("임시 자동저장은 이 기기·브라우저에 보관돼요.");
    expect(dialog.textContent).toContain("사이트 데이터를 지우면 사라질 수 있어요.");
    expect(dialog.textContent).not.toContain("FIRST SAVE");
    expect(dialog.textContent).not.toContain("정식 저장");
  });

  it("드라이브 행동은 기존 연결 콜백만 호출하고 백업 완료로 표시하지 않는다", () => {
    const callbacks = props();
    render(<StudioFormalSaveDialog {...callbacks} />);
    const dialog = screen.getByRole("dialog");
    const backup = within(dialog).getByRole("button", { name: "개인 드라이브에 백업" });
    const help = document.getElementById(backup.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toBe("연결 화면 열기 · 연결 후 백업 진행");
    fireEvent.click(backup);
    expect(callbacks.onOpenPersonalDrive).toHaveBeenCalledTimes(1);
    expect(callbacks.onSaveFile).not.toHaveBeenCalled();
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(dialog.textContent).not.toContain("백업 완료");
  });

  it("초기 저장 초점·Tab 순환·배경 inert와 Escape 후 트리거 복귀를 실제 modal hook으로 유지한다", async () => {
    const closed = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return <><button type="button" onClick={() => setOpen(true)}>저장 창 열기</button>
        <StudioFormalSaveDialog {...props({ open, onClose: () => { closed(); setOpen(false); } })} /></>;
    }
    const { container } = render(<Harness />);
    const trigger = screen.getByRole("button", { name: "저장 창 열기" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    const save = within(dialog).getByRole("button", { name: "이 기기에 작업 파일 저장" });
    const close = within(dialog).getByRole("button", { name: "저장 창 닫기" });
    const back = within(dialog).getByRole("button", { name: "그리기로 돌아가기" });
    expect(document.activeElement).toBe(save);
    expect(container.hasAttribute("inert")).toBe(true);
    back.focus(); fireEvent.keyDown(back, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(back);
    trigger.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement ?? dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(closed).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    expect(container.hasAttribute("inert")).toBe(false);
  });

  it("저장 중에는 닫기·돌아가기·Escape·배경을 포함한 모든 행동을 막고 해제 뒤 재시도한다", () => {
    const callbacks = props({ busy: true, error: "저장 경로를 다시 확인해 주세요." });
    const { rerender } = render(<StudioFormalSaveDialog {...callbacks} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-busy")).toBe("true");
    const buttons = within(dialog).getAllByRole<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(4);
    for (const button of buttons) { expect(button.disabled).toBe(true); fireEvent.click(button); }
    fireEvent.keyDown(dialog, { key: "Escape" });
    const backdrop = dialog.parentElement;
    if (!backdrop) throw new Error("저장 창의 배경이 없습니다.");
    fireEvent.mouseDown(backdrop);
    expect(callbacks.onClose).not.toHaveBeenCalled();
    expect(callbacks.onSaveFile).not.toHaveBeenCalled();
    expect(callbacks.onOpenPersonalDrive).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert").textContent).toBe(callbacks.error);
    rerender(<StudioFormalSaveDialog {...callbacks} busy={false} />);
    expect(dialog.getAttribute("aria-busy")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "이 기기에 작업 파일 저장" }));
    expect(callbacks.onSaveFile).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByRole("alert").textContent).toBe(callbacks.error);
  });

  it("닫기와 그리기로 돌아가기는 저장을 실행하지 않는 같은 복귀 행동이다", () => {
    const callbacks = props();
    render(<StudioFormalSaveDialog {...callbacks} />);
    fireEvent.click(screen.getByRole("button", { name: "저장 창 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "그리기로 돌아가기" }));
    expect(callbacks.onClose).toHaveBeenCalledTimes(2);
    expect(callbacks.onSaveFile).not.toHaveBeenCalled();
    expect(callbacks.onOpenPersonalDrive).not.toHaveBeenCalled();
  });

  it("긴 원본 오류를 alert와 저장 행동의 설명으로 유지하고 재시도를 허용한다", () => {
    const error = `저장하지 못했습니다.\n${"긴경로설명".repeat(100)}`;
    const callbacks = props({ error, projectTitle: "긴 작업 제목 ".repeat(20) });
    render(<StudioFormalSaveDialog {...callbacks} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(error);
    const save = screen.getByRole<HTMLButtonElement>("button", { name: "이 기기에 작업 파일 저장" });
    expect(save.disabled).toBe(false);
    expect(save.getAttribute("aria-describedby")?.split(" ")).toContain(alert.id);
    fireEvent.click(save);
    expect(callbacks.onSaveFile).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert").textContent).toBe(error);
    expect(callbacks.onClose).not.toHaveBeenCalled();
  });

  it("영어 재저장도 기기 파일·연결 후 백업·브라우저 범위를 구분한다", () => {
    useI18n.getState().setLang("en");
    const callbacks = props({ locale: "en", firstSave: false });
    render(<StudioFormalSaveDialog {...callbacks} />);
    const dialog = screen.getByRole("dialog", { name: "Save your work file again?" });
    const save = within(dialog).getByRole("button", { name: "Save work file on this device" });
    expect(document.activeElement).toBe(save);
    expect(within(dialog).getByRole("button", { name: "Back up to a personal drive" })).toBeTruthy();
    expect(dialog.textContent).toContain("Open connections · Continue backup after connecting");
    expect(dialog.textContent).toContain("Clearing site data can remove them.");
    expect(callbacks.onSaveFile).not.toHaveBeenCalled();
    expect(callbacks.onOpenPersonalDrive).not.toHaveBeenCalled();
  });
});
