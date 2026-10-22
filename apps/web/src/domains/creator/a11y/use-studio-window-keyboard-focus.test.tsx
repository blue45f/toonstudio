// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState, type ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useStudioWindowKeyboardFocus } from "./use-studio-window-keyboard-focus";

afterEach(cleanup);

const WINDOW_SELECTOR = '[data-studio-tool-popover="demo"]';

/** 메뉴바 단추로 여는 떠 있는 창. 실제 창처럼 body 가 아니라 같은 트리 끝에 두어도 Tab 순서상 멀다는 점은 같다. */
function Fixture({ inToolbar = true }: { inToolbar?: boolean }) {
  const [open, setOpen] = useState(false);
  useStudioWindowKeyboardFocus(WINDOW_SELECTOR, open);
  const opener = (
    <button type="button" onClick={() => setOpen((value) => !value)}>
      소재 창 열기
    </button>
  );
  return (
    <div id="studio-app-shell" data-studio-editor="true">
      {inToolbar ? <div id="studio-menubar">{opener}</div> : <div id="elsewhere">{opener}</div>}
      <button type="button">다른 단추</button>
      {open ? (
        <div role="dialog" aria-label="소재" data-studio-tool-popover="demo" tabIndex={-1}>
          <button type="button">창 안 단추</button>
        </div>
      ) : null}
    </div>
  );
}

function markInput(kind: "keyboard" | "pointer"): void {
  const root = document.getElementById("studio-app-shell");
  if (root) root.dataset.studioInputModality = kind;
}

function open(): HTMLElement {
  const opener = screen.getByRole("button", { name: "소재 창 열기" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

describe.each([
  ["일반 렌더", (node: ReactElement): ReactElement => node],
  ["StrictMode(개발 모드 효과 이중 실행)", (node: ReactElement): ReactElement => <StrictMode>{node}</StrictMode>],
])("useStudioWindowKeyboardFocus — %s", (_name, wrap) => {
  it("메뉴바 단추를 키보드로 눌러 연 창은 포커스를 받고, 닫으면 여는 단추로 돌아온다", () => {
    render(wrap(<Fixture />));
    markInput("keyboard");
    const opener = open();

    const dialog = screen.getByRole("dialog", { name: "소재" });
    expect(document.activeElement).toBe(dialog);

    // 창 안에서 여는 단추를 다시 눌러(또는 Esc 처리가 같은 상태를 바꿔) 닫으면 포커스가 본문으로 떨어지지 않는다.
    fireEvent.click(opener);
    expect(screen.queryByRole("dialog", { name: "소재" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("마우스로 연 창은 포커스를 옮기지 않는다", () => {
    render(wrap(<Fixture />));
    markInput("pointer");
    const opener = open();

    expect(screen.getByRole("dialog", { name: "소재" })).toBeTruthy();
    expect(document.activeElement).toBe(opener);
  });

  it("메뉴바·도구 줄 밖의 단추(단축키·캔버스 등)로 연 창은 키보드 입력이어도 포커스를 옮기지 않는다", () => {
    render(wrap(<Fixture inToolbar={false} />));
    markInput("keyboard");
    const opener = open();

    expect(document.activeElement).toBe(opener);
  });

  it("닫는 순간 포커스가 이미 다른 단추에 가 있으면 그 선택을 존중한다", () => {
    render(wrap(<Fixture />));
    markInput("keyboard");
    const opener = open();
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "소재" }));

    const other = screen.getByRole("button", { name: "다른 단추" });
    other.focus();
    fireEvent.click(opener);
    expect(screen.queryByRole("dialog", { name: "소재" })).toBeNull();
    expect(document.activeElement).toBe(other);
  });
});

describe("useStudioWindowKeyboardFocus — 선택자", () => {
  it("올바르지 않은 선택자는 오류 없이 무시한다", () => {
    function Broken() {
      useStudioWindowKeyboardFocus("[data-x=", true);
      return <button type="button">단추</button>;
    }
    expect(() => render(<Broken />)).not.toThrow();
  });
});
