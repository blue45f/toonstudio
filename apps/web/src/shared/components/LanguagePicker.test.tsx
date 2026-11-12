// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguagePicker } from "./LanguagePicker";

import { NORMALIZED_LOCALE_OPTIONS, useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LanguagePicker", () => {
  it("keeps the worldwide catalog out of the closed accessibility tree", () => {
    render(<LanguagePicker value="ko" onChange={() => undefined} />);

    expect(screen.getByRole("button", { name: "한국어 / Korean · 언어 선택" }).textContent).toContain("한국어");
    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(document.querySelectorAll("option")).toHaveLength(0);
  });

  it("보이는 현재 언어와 사용자 지정 목적을 이름에 함께 담고 선택 변경도 반영한다", () => {
    const onChange = vi.fn();
    const view = render(<LanguagePicker value="ko" onChange={onChange} ariaLabel="작품 언어" />);

    fireEvent.click(screen.getByRole("button", { name: "한국어 / Korean · 작품 언어" }));
    expect(screen.getByRole("dialog", { name: "언어 선택" })).toBeTruthy();
    fireEvent.click(screen.getByRole("option", { name: /^English\s*en$/ }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("en");

    view.rerender(<LanguagePicker value="en" onChange={onChange} ariaLabel="작품 언어" />);
    expect(screen.getByRole("button", { name: "English · 작품 언어" }).textContent).toBe("English");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["ko", "번역 진행 중", "작품 언어"],
    ["en", "Translation in progress", "Work language"],
  ])("%s의 보이는 번역 진행 상태도 음성 입력 이름에 포함한다", (language, progress, label) => {
    useI18n.getState().setLang(language);
    render(<LanguagePicker value="tlh" onChange={() => undefined} ariaLabel={label} />);

    const trigger = screen.getByRole("button");
    const visibleLabel = trigger.querySelector("span")?.textContent;
    expect(visibleLabel).toBeTruthy();
    expect(trigger.textContent).toBe(`${visibleLabel}${progress}`);
    expect(trigger.getAttribute("aria-label")).toBe(`${visibleLabel} ${progress} · ${label}`);
  });

  it("아이콘 전용 버튼은 지정 이름을 유지하고 보이지 않는 번역 배지를 이름에 추가하지 않는다", () => {
    render(<LanguagePicker value="tlh" onChange={() => undefined} ariaLabel="작품 언어" compact />);

    const trigger = screen.getByRole("button", { name: "작품 언어" });
    expect(trigger.querySelector("span")?.className).toContain("sr-only");
    expect(trigger.textContent).not.toContain("번역 진행 중");
  });

  it("shows translated choices first and searches every locale on demand", () => {
    const onChange = vi.fn();
    render(<LanguagePicker value="ko" onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "한국어 / Korean · 언어 선택" }));
    const initial = screen.getAllByRole("option");
    expect(initial.length).toBeGreaterThan(1);
    expect(initial.length).toBeLessThan(NORMALIZED_LOCALE_OPTIONS.length);

    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "zh-hant" },
    });
    const traditionalChinese = screen.getByRole("option", { name: /zh-hant/i });
    fireEvent.click(traditionalChinese);

    expect(onChange).toHaveBeenCalledWith("zh-hant");
    expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
  });

  it("labels in-progress locales instead of presenting them as finished translations", () => {
    render(<LanguagePicker value="ko" onChange={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "한국어 / Korean · 언어 선택" }));
    const choices = within(screen.getByRole("dialog", { name: "언어 선택" }));
    const localeOption = (code: string) => {
      const option = choices.getByText(code, { exact: true }).closest('[role="option"]');
      if (!option) throw new Error(`${code} 언어 선택지가 없습니다.`);
      return option;
    };
    // (G7 종결 이후 af·ja·de·fr·zh-hant 등 게시된 75종 로케일은 모두 90%를 넘어 번역 완료로 표시된다.)
    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "Afrikaans" },
    });
    expect(choices.getAllByRole("option").length).toBeGreaterThan(1);
    const afrikaans = localeOption("af");
    expect(afrikaans.textContent).not.toContain("번역 진행 중");

    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "한국어" },
    });
    const korean = localeOption("ko");
    expect(korean.textContent).not.toContain("번역 진행 중");

    // A locale with no published dictionary at all is labelled too, never left unmarked.
    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "tlh" },
    });
    const klingon = localeOption("tlh");
    expect(klingon.textContent).toContain("번역 진행 중");
    expect(klingon.textContent).toContain("0%");
  });

  it("caps broad results and restores the trigger after Escape", () => {
    render(<LanguagePicker value="ko" onChange={() => undefined} />);
    const trigger = screen.getByRole("button", { name: "한국어 / Korean · 언어 선택" });
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole("searchbox", { name: "언어 검색" }), {
      target: { value: "a" },
    });

    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(60);
    fireEvent.keyDown(screen.getByRole("searchbox", { name: "언어 검색" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape from the close button or empty search results and restores focus to trigger without bubbling to parent panels", () => {
    const onParentKeyDown = vi.fn();
    document.addEventListener("keydown", onParentKeyDown);
    try {
      render(<LanguagePicker value="ko" onChange={() => undefined} />);

      const trigger = screen.getByRole("button", { name: "한국어 / Korean · 언어 선택" });
      fireEvent.click(trigger);

      const dialog = screen.getByRole("dialog", { name: "언어 선택" });
      expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);

      const closeButton = screen.getByRole("button", { name: "언어 선택 닫기" });
      closeButton.focus();
      fireEvent.keyDown(closeButton, { key: "Escape" });

      expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(onParentKeyDown).not.toHaveBeenCalled();

      fireEvent.click(trigger);
      const searchbox = screen.getByRole("searchbox", { name: "언어 검색" });
      fireEvent.change(searchbox, { target: { value: "zzzz-no-match-999" } });
      expect(screen.queryAllByRole("option")).toHaveLength(0);

      const emptyListbox = screen.getByRole("listbox", { name: "언어 검색 결과" });
      emptyListbox.focus();
      fireEvent.keyDown(emptyListbox, { key: "Escape" });

      expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(onParentKeyDown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", onParentKeyDown);
    }
  });
});
