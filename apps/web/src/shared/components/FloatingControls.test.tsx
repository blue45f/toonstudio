// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FloatingControls } from "./FloatingControls";

import { useI18n } from "@/shared/lib/i18n";
import { SITE_OST_PANEL_TOGGLE_EVENT } from "@/shared/lib/site-background-music";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(cleanup);

function renderCluster() {
  const view = render(<FloatingControls placement="bottom-right" showSound={false} />);
  const root = view.container.querySelector<HTMLElement>('[data-floating-controls="true"]');
  const toggle = screen.getByRole("button", { name: "화면·언어·OST 설정" });
  return { ...view, root, toggle };
}

describe("FloatingControls 휴대폰 설정 묶음", () => {
  it("메뉴 연결 모드도 실제 전체 메뉴가 없는 화면에서는 설정 토글과 음악 진입을 보존한다", () => {
    const view = render(<FloatingControls placement="bottom-right" mobileMode="menu" />);
    const toggle = screen.getByRole("button", { name: "화면·언어·OST 설정" });
    const root = view.container.querySelector('[data-floating-controls="true"]');
    expect(root?.getAttribute("data-floating-controls-mobile")).toBe("disabled");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "오리지널 OST 열기" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(toggle);
  });

  it("하단 탭 기준선 변수 위에 단일 토글로 놓이고 펼침 상태를 data 속성으로 알린다", () => {
    const { root, toggle } = renderCluster();

    expect(root?.className).toContain("max-md:bottom-[var(--site-float-base)]");
    expect(root?.className).not.toContain("9rem");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(root?.hasAttribute("data-floating-controls-open")).toBe(false);

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(root?.getAttribute("data-floating-controls-open")).toBe("true");
    expect(screen.getByRole("button", { name: "오리지널 OST 열기" })).toBeTruthy();
  });

  it("Esc로 닫으면 토글로 초점을 돌려주고, 바깥을 누르면 그대로 닫힌다", () => {
    const { toggle } = renderCluster();

    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);

    fireEvent.click(toggle);
    fireEvent.keyDown(document, { key: "Escape", isComposing: true });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    fireEvent.pointerDown(document.body);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("묶음 안을 누르는 동안에는 닫히지 않는다", () => {
    const { toggle } = renderCluster();
    fireEvent.click(toggle);

    fireEvent.pointerDown(screen.getByRole("button", { name: "오리지널 OST 열기" }));

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
  });

  it("OST 버튼은 묶음을 닫고 OST 패널 열기 요청을 한 번만 보낸다", () => {
    const listener = vi.fn();
    window.addEventListener(SITE_OST_PANEL_TOGGLE_EVENT, listener);
    try {
      const { toggle } = renderCluster();
      fireEvent.click(toggle);
      fireEvent.click(screen.getByRole("button", { name: "오리지널 OST 열기" }));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(toggle.getAttribute("aria-expanded")).toBe("false");
    } finally {
      window.removeEventListener(SITE_OST_PANEL_TOGGLE_EVENT, listener);
    }
  });

  it("휴대폰 패널의 언어 선택은 한 열(44px)을 지키도록 아이콘만 남기고 데스크톱 행은 이름을 보여 준다", () => {
    const { root, toggle } = renderCluster();
    fireEvent.click(toggle);

    const triggers = [...(root?.querySelectorAll<HTMLButtonElement>('[data-language-picker="true"] > button') ?? [])];
    expect(triggers).toHaveLength(2);
    const [desktop, phone] = triggers;
    expect(desktop?.className).not.toContain("size-11");
    expect(desktop?.querySelector("span")?.className).not.toContain("sr-only");
    expect(phone?.className).toContain("size-11");
    expect(phone?.querySelector("span")?.className).toContain("sr-only");
  });

  it("무동작 뒤 숨은 행은 가까이 온 포인터로 깨어나며, 거리 계산은 프레임당 한 번만 한다", () => {
    vi.useFakeTimers();
    try {
      const { root } = renderCluster();
      const row = root?.firstElementChild;

      act(() => { vi.advanceTimersByTime(4_100); });
      expect(row?.getAttribute("aria-hidden")).toBe("true");

      // 렌더·타이머 중 다른 코드가 부른 프레임 요청과 섞이지 않도록 포인터를 보내기 직전에 감시를 시작한다.
      const frames: FrameRequestCallback[] = [];
      const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => frames.push(callback));
      for (let index = 0; index < 5; index += 1) {
        window.dispatchEvent(new MouseEvent("pointermove", { clientX: 1, clientY: 1 }));
      }
      expect(raf).toHaveBeenCalledTimes(1);

      act(() => { frames.shift()?.(0); });
      expect(row?.hasAttribute("aria-hidden")).toBe(false);
    } finally {
      vi.useRealTimers();
      vi.restoreAllMocks();
    }
  });

  it("영어 모드에서는 토글 이름을 영어로 알린다", () => {
    useI18n.getState().setLang("en");
    render(<FloatingControls placement="bottom-right" />);

    expect(screen.getByRole("button", { name: "Display, language and OST settings" })).toBeTruthy();
  });

  it("모바일 펼침 시 토글 버튼 뒤에 패널 DOM이 배치되어 정방향 Tab이 패널로 진입하고 내부 언어 선택 Esc는 부모 패널을 닫지 않는다", () => {
    const { root, toggle } = renderCluster();
    fireEvent.click(toggle);

    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const mobilePanel = panelId ? document.getElementById(panelId) : null;
    expect(mobilePanel).toBeTruthy();

    // toggle precedes mobilePanel in DOM order (DOCUMENT_POSITION_FOLLOWING = 4)
    expect(
      Boolean(toggle.compareDocumentPosition(mobilePanel!) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(toggle.parentElement?.className).toContain("flex-col-reverse");

    // Open mobile LanguagePicker and press Escape on its close button: only LanguagePicker closes
    const langTriggers = [
      ...(root?.querySelectorAll<HTMLButtonElement>('[data-language-picker="true"] > button') ?? []),
    ];
    const mobileLangTrigger = langTriggers[1];
    expect(mobileLangTrigger).toBeTruthy();
    fireEvent.click(mobileLangTrigger!);
    const closeLangBtn = screen.getByRole("button", { name: "언어 선택 닫기" });
    closeLangBtn.focus();
    fireEvent.keyDown(closeLangBtn, { key: "Escape" });

    expect(screen.queryByRole("dialog", { name: "언어 선택" })).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(mobileLangTrigger);

    // Pressing Escape again closes the mobile FloatingControls panel and returns focus to toggle
    fireEvent.keyDown(document, { key: "Escape" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });
});
