// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { VIRTUAL_THREE_THEMES } from "../themes/virtual-three-theme-catalog";
import { useVirtualThreeTheme } from "../themes/use-virtual-three-theme";
import { VIRTUAL_THREE_THEME_NOTICES, virtualThreeThemeStorageKey, type VirtualThreeThemeStorage } from "../themes/virtual-three-theme-store";
import { VirtualThreeThemePicker, type VirtualThreeThemePickerProps } from "./VirtualThreeThemePicker";

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

function props(): VirtualThreeThemePickerProps {
  return {
    shownThemeId: "creator-campus", requestedThemeId: "creator-campus", savedThemeId: null,
    hydrated: true, preview: { status: "ready" }, notice: null,
    onPreview: vi.fn(), onApply: vi.fn(), onRevert: vi.fn(), onRetry: vi.fn(), onDismissNotice: vi.fn(),
  };
}
const group = () => screen.getByRole("group", { name: "3D 공간 테마" });

describe("3D 전용 테마 선택기", () => {
  it("기존 baseline과 여섯 테마의 이름·설명·pressed 상태를 키보드 단추로 제공한다", () => {
    const input = props();
    render(<VirtualThreeThemePicker {...input} />);
    const cards = within(group()).getAllByRole("button").filter(button => button.hasAttribute("data-three-theme"));
    expect(cards).toHaveLength(7);
    for (const theme of VIRTUAL_THREE_THEMES) {
      const card = within(group()).getByRole("button", { name: theme.copy.ko.name });
      expect(card.getAttribute("aria-pressed")).toBe(String(theme.id === "creator-campus"));
      const descriptionId = card.getAttribute("aria-describedby");
      expect(descriptionId ? document.getElementById(descriptionId)?.textContent : null).toBe(theme.copy.ko.description);
    }
    fireEvent.click(screen.getByRole("button", { name: "SF 제작 실험실" }));
    expect(input.onPreview).toHaveBeenCalledExactlyOnceWith("sflab");
    expect(input.onApply).not.toHaveBeenCalled();
  });

  it("hydration 전에는 선택·저장을 막고 읽기 상태를 표시한다", () => {
    const input = { ...props(), hydrated: false };
    render(<VirtualThreeThemePicker {...input} />);
    fireEvent.click(screen.getByRole("button", { name: "SF 제작 실험실" }));
    fireEvent.click(screen.getByRole("button", { name: "이 테마 저장" }));
    expect(input.onPreview).not.toHaveBeenCalled();
    expect(input.onApply).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("저장한 테마를 읽는 중");
  });

  it("준비 중이거나 다른 테마가 보이면 저장하지 않고 실제 commit된 ID만 전달한다", () => {
    const input = props();
    const view = render(<VirtualThreeThemePicker {...input} requestedThemeId="sflab" preview={{ status: "loading", loaded: 1, total: 3 }} />);
    fireEvent.click(screen.getByRole("button", { name: "이 테마 저장" }));
    expect(input.onApply).not.toHaveBeenCalled();
    expect(group().getAttribute("aria-busy")).toBe("true");
    view.rerender(<VirtualThreeThemePicker {...input} requestedThemeId="sflab" preview={{ status: "ready" }} />);
    fireEvent.click(screen.getByRole("button", { name: "이 테마 저장" }));
    expect(input.onApply).not.toHaveBeenCalled();
    view.rerender(<VirtualThreeThemePicker {...input} requestedThemeId="sflab" shownThemeId="sflab" preview={{ status: "ready" }} />);
    fireEvent.click(screen.getByRole("button", { name: "이 테마 저장" }));
    expect(input.onApply).toHaveBeenCalledExactlyOnceWith("sflab");
  });

  it("준비 실패의 retry·revert와 저장 실패의 retry를 분리한다", () => {
    const input = props();
    const view = render(<VirtualThreeThemePicker {...input} savedThemeId="creator-campus" requestedThemeId="sflab" preview={{ status: "error" }} />);
    expect(screen.getByRole("alert").textContent).toContain("이전 공간은 그대로 유지");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    fireEvent.click(screen.getByRole("button", { name: "저장한 테마로 돌아가기" }));
    expect(input.onRetry).toHaveBeenCalledTimes(1);
    expect(input.onRevert).toHaveBeenCalledTimes(1);
    expect(input.onApply).not.toHaveBeenCalled();
    view.rerender(<VirtualThreeThemePicker {...input} savedThemeId="creator-campus" requestedThemeId="sflab" shownThemeId="sflab" notice={VIRTUAL_THREE_THEME_NOTICES.writeFailed} />);
    expect(screen.getByRole("alert").textContent).toContain("저장하지 못했습니다");
    fireEvent.click(screen.getByRole("button", { name: "저장 다시 시도" }));
    expect(input.onApply).toHaveBeenCalledExactlyOnceWith("sflab");
    fireEvent.click(screen.getByRole("button", { name: "알림 닫기" }));
    expect(input.onDismissNotice).toHaveBeenCalledTimes(1);
  });

  it("세계 이동 키를 소비하되 Escape와 Tab의 상위 접근성 동작은 막지 않는다", () => {
    const onKeyDown = vi.fn(); const onKeyUp = vi.fn();
    const ancestor = document.body;
    ancestor.addEventListener("keydown", onKeyDown);
    ancestor.addEventListener("keyup", onKeyUp);
    try {
      render(<VirtualThreeThemePicker {...props()} />);
      const card = screen.getByRole("button", { name: "SF 제작 실험실" });
      card.focus();
      expect(document.activeElement).toBe(card);
      fireEvent.keyDown(card, { key: "ArrowUp" });
      fireEvent.keyUp(card, { key: "ArrowUp" });
      expect(fireEvent.keyDown(card, { key: " " })).toBe(true);
      expect(fireEvent.keyUp(card, { key: " " })).toBe(true);
      expect(onKeyDown).not.toHaveBeenCalled();
      expect(onKeyUp).not.toHaveBeenCalled();
      for (const key of ["Escape", "Tab"]) {
        expect(fireEvent.keyDown(card, { key })).toBe(true);
        expect(fireEvent.keyUp(card, { key })).toBe(true);
      }
      expect(onKeyDown).toHaveBeenCalledTimes(2);
      expect(onKeyUp).toHaveBeenCalledTimes(2);
    } finally {
      ancestor.removeEventListener("keydown", onKeyDown);
      ancestor.removeEventListener("keyup", onKeyUp);
    }
  });

  it("전역 i18n 영어 선택에 맞춰 테마와 action·오류 문구를 함께 바꾼다", () => {
    act(() => { useI18n.getState().setLang("en"); });
    render(<VirtualThreeThemePicker {...props()} notice={VIRTUAL_THREE_THEME_NOTICES.writeFailed} />);
    expect(screen.getByRole("group", { name: "3D space theme" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Original Creator Campus" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry saving" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("could not be saved");
  });

  it("picker와 실제 storage hook을 연결해 stage 준비 중에는 write 0, commit 표시 뒤에만 저장한다", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    } satisfies VirtualThreeThemeStorage;
    function Owner(input: Pick<VirtualThreeThemePickerProps, "shownThemeId" | "requestedThemeId" | "preview">) {
      const saved = useVirtualThreeTheme("space/ui-contract", () => storage);
      return <VirtualThreeThemePicker {...props()} {...input} hydrated={saved.hydrated}
        savedThemeId={saved.persistedSelection?.themeId ?? null} notice={saved.notice}
        onApply={id => { saved.selectTheme(id); }} onDismissNotice={saved.dismissNotice} />;
    }
    const view = render(<Owner shownThemeId="creator-campus" requestedThemeId="sflab" preview={{ status: "loading", loaded: 0, total: 3 }} />);
    fireEvent.click(screen.getByRole("button", { name: "이 테마 저장" }));
    expect(storage.setItem).not.toHaveBeenCalled();
    view.rerender(<Owner shownThemeId="sflab" requestedThemeId="sflab" preview={{ status: "ready" }} />);
    expect(storage.setItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "이 테마 저장" }));
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(JSON.parse(values.get(virtualThreeThemeStorageKey("space/ui-contract")) ?? "null")).toMatchObject({ themeId: "sflab", spaceScopeId: "space/ui-contract" });
    expect(within(screen.getByRole("button", { name: "SF 제작 실험실" })).getByText("저장됨")).toBeTruthy();
  });
});
