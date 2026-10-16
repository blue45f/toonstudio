// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTH_IN_APP_NOTICE_DISMISS_KEY, AuthInAppBrowserNotice } from "./in-app-browser-notice";

const ORIGINAL_USER_AGENT = window.navigator.userAgent;

const DESKTOP_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const KAKAOTALK_ANDROID =
  "Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 2511290";
const INSTAGRAM_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21A329 Instagram 300.0.0.0 (iPhone14,2; iOS 17_0; ko_KR; ko-KR; scale=3.00; 1170x2532; 123456789)";

function useUserAgent(userAgent: string): void {
  Object.defineProperty(window.navigator, "userAgent", { value: userAgent, configurable: true });
}

function setClipboard(value: unknown): void {
  Object.defineProperty(window.navigator, "clipboard", { value, configurable: true });
}

beforeEach(() => {
  window.sessionStorage.clear();
  setClipboard(undefined);
});

afterEach(() => {
  cleanup();
  useUserAgent(ORIGINAL_USER_AGENT);
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("AuthInAppBrowserNotice", () => {
  it("일반 브라우저에서는 아무것도 그리지 않는다", () => {
    useUserAgent(DESKTOP_CHROME);
    const { container } = render(<AuthInAppBrowserNotice />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("카카오톡(Android)에서는 앱 이름을 말하고 기본 브라우저로 여는 링크를 준다", () => {
    useUserAgent(KAKAOTALK_ANDROID);
    render(<AuthInAppBrowserNotice />);

    const note = screen.getByRole("note");
    expect(note.textContent).toContain("카카오톡 안에서는 로그인이 끊길 수 있어요");
    const open = note.querySelector<HTMLAnchorElement>("a[data-auth-in-app-open]");
    expect(open).not.toBeNull();
    expect(open?.getAttribute("href")).toBe(
      `kakaotalk://web/openExternal?url=${encodeURIComponent(window.location.href)}`,
    );
    expect(note.textContent).toContain("다른 브라우저로 열기");
  });

  it("인스타그램(iOS)에서는 열기 링크 없이 메뉴 안내와 주소 복사만 준다", () => {
    useUserAgent(INSTAGRAM_IOS);
    render(<AuthInAppBrowserNotice />);

    const note = screen.getByRole("note");
    expect(note.querySelector("a[data-auth-in-app-open]")).toBeNull();
    expect(note.textContent).toContain("인스타그램 안에서는 로그인이 끊길 수 있어요");
    expect(note.textContent).toContain("Safari로 열기");
    expect(screen.getByRole("button", { name: /주소 복사/u })).toBeTruthy();
  });

  it("주소 복사에 성공하면 복사했다고 알리고 현재 주소를 클립보드에 쓴다", async () => {
    useUserAgent(INSTAGRAM_IOS);
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    render(<AuthInAppBrowserNotice />);

    fireEvent.click(screen.getByRole("button", { name: /주소 복사/u }));

    expect(await screen.findByText(/주소를 복사했어요/u)).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(window.location.href);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("클립보드를 쓸 수 없으면 실패를 알리고 주소를 직접 복사할 수 있게 보여 준다", async () => {
    useUserAgent(INSTAGRAM_IOS);
    render(<AuthInAppBrowserNotice />);

    fireEvent.click(screen.getByRole("button", { name: /주소 복사/u }));

    expect(await screen.findByText(/복사하지 못했어요/u)).toBeTruthy();
    const address = screen.getByRole("textbox", { name: /현재 주소/u }) as HTMLInputElement;
    expect(address.readOnly).toBe(true);
    expect(address.value).toBe(window.location.href);
  });

  it("‘이 화면에서 계속할게요’를 누르면 닫히고, 같은 탭에서는 다시 열어도 닫힌 채로 있다", () => {
    useUserAgent(KAKAOTALK_ANDROID);
    const first = render(<AuthInAppBrowserNotice />);

    fireEvent.click(screen.getByRole("button", { name: /이 화면에서 계속할게요/u }));

    expect(screen.queryByRole("note")).toBeNull();
    expect(window.sessionStorage.getItem(AUTH_IN_APP_NOTICE_DISMISS_KEY)).toBe("1");

    first.unmount();
    const second = render(<AuthInAppBrowserNotice />);
    expect(second.container.firstChild).toBeNull();
  });

  it("세션 저장소가 막혀 있어도 닫기가 이번 화면에서는 동작한다", () => {
    useUserAgent(KAKAOTALK_ANDROID);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<AuthInAppBrowserNotice />);

    fireEvent.click(screen.getByRole("button", { name: /이 화면에서 계속할게요/u }));

    expect(screen.queryByRole("note")).toBeNull();
  });

  it("모든 동작 버튼과 링크가 44px 이상 높이 클래스를 갖는다", () => {
    useUserAgent(KAKAOTALK_ANDROID);
    render(<AuthInAppBrowserNotice />);
    const note = screen.getByRole("note");
    const actions = [...note.querySelectorAll("a, button")];
    expect(actions.length).toBe(3);
    for (const action of actions) expect(action.className).toContain("min-h-11");
  });
});
