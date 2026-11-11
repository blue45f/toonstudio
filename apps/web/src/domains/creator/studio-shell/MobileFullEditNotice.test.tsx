// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mobileFullEditNoticeStorageKey } from "../mobile-full-edit-notice-storage";
import { resolveStudioMobileTouchPlan, STUDIO_TOUCH_NARROW_QUERY, STUDIO_TOUCH_TABLET_QUERY } from "../studio-mobile-touch-flow";

import { MobileFullEditNotice } from "./MobileFullEditNotice";

const language = vi.hoisted(() => ({ value: "ko" }));

vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string, en: string) => language.value === "en" ? en : ko,
}));

let narrowViewport = true;
let touchTabletViewport = false;

function notice(surface = "canvas", startCollapsed = false) {
  const plan = resolveStudioMobileTouchPlan(surface);
  return (
    <MobileFullEditNotice
      startCollapsed={startCollapsed}
      surfaceId={`studio-editor-${surface}`}
      surfaceLabel={plan.label}
      mobileCapabilities={plan.canDo}
      mobileLimitations={plan.cannotDo}
      touchTier={plan.tier}
    />
  );
}

beforeEach(() => {
  narrowViewport = true;
  touchTabletViewport = false;
  language.value = "ko";
  window.sessionStorage.clear();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: query === STUDIO_TOUCH_NARROW_QUERY ? narrowViewport : query === STUDIO_TOUCH_TABLET_QUERY && touchTabletViewport,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("모바일 편집 안내의 펼치기와 복귀", () => {
  it("캔버스의 작은 기기 안내도 제한을 다시 열 수 있고 확인 기록을 미리 만들지 않는다", () => {
    render(notice("canvas", true));
    const toggle = screen.getByRole("button", { name: "기기 안내" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "지금 할 수 있어요" })).toBeNull();
    expect(window.sessionStorage.getItem(mobileFullEditNoticeStorageKey("studio-editor-canvas"))).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("heading", { name: "이 기기에서는 안 돼요" })).toBeTruthy();
    for (const item of resolveStudioMobileTouchPlan("canvas").cannotDo) expect(screen.getByText(item.ko)).toBeTruthy();
    const close = screen.getByRole("button", { name: "안내 접고 계속하기" });
    close.focus();
    fireEvent.click(close);
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("첫 진입에는 정본 제한을 짧게 알리고 상세 목록을 접으며 작업 포커스를 가져가지 않는다", () => {
    render(<button type="button">그리기</button>);
    const drawingTool = screen.getByRole("button", { name: "그리기" });
    drawingTool.focus();
    render(notice());

    const guide = screen.getByRole("complementary", { name: "모바일 편집 안내" });
    const toggle = screen.getByRole("button", { name: "기기 안내 가능한 작업 보기" });
    const plan = resolveStudioMobileTouchPlan("canvas");
    expect(guide.querySelector("p")?.textContent).toContain(plan.cannotDo[0]?.ko);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(guide.getAttribute("data-studio-mobile-notice-compact")).toBe("false");
    expect(screen.queryByRole("heading", { name: "지금 할 수 있어요" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(drawingTool);
  });

  it("상세를 펼치면 표면별 가능한 작업과 제한을 빠짐없이 읽을 수 있다", () => {
    render(notice("poser"));
    const plan = resolveStudioMobileTouchPlan("poser");
    const toggle = screen.getByRole("button", { name: "기기 안내 가능한 작업 보기" });
    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("heading", { name: "지금 할 수 있어요" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "이 기기에서는 안 돼요" })).toBeTruthy();
    for (const item of [...plan.canDo, ...plan.cannotDo]) {
      expect(screen.getByText(item.ko).closest("[hidden]")).toBeNull();
    }
    expect(screen.getByRole("complementary").getAttribute("data-studio-mobile-touch-tier")).toBe("desktop-required");
  });

  it("계속하기로 닫으면 재진입 버튼으로 포커스를 돌리고 다시 같은 안내를 열 수 있다", () => {
    render(notice());
    const toggle = screen.getByRole("button", { name: "기기 안내 가능한 작업 보기" });
    fireEvent.click(toggle);
    const continueButton = screen.getByRole("button", { name: "안내 접고 계속하기" });
    continueButton.focus();
    fireEvent.click(continueButton);

    const reopen = screen.getByRole("button", { name: "기기 안내" });
    expect(reopen).toBe(toggle);
    expect(document.activeElement).toBe(reopen);
    expect(reopen.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByRole("complementary").getAttribute("data-studio-mobile-notice-compact")).toBe("true");
    expect(window.sessionStorage.getItem(mobileFullEditNoticeStorageKey("studio-editor-canvas"))).toBe("true");
    expect(screen.queryByRole("button", { name: "모바일 편집 안내 닫기" })).toBeNull();

    fireEvent.click(reopen);
    expect(screen.getByRole("heading", { name: "지금 할 수 있어요" })).toBeTruthy();
    expect(screen.getByRole("complementary").getAttribute("data-studio-mobile-notice-compact")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("닫기 버튼으로 요약을 접은 뒤 다시 진입할 수 있다", () => {
    render(notice());
    const close = screen.getByRole("button", { name: "모바일 편집 안내 닫기" });
    close.focus();
    fireEvent.click(close);

    const reopen = screen.getByRole("button", { name: "기기 안내" });
    expect(document.activeElement).toBe(reopen);
    fireEvent.click(reopen);
    expect(screen.getByRole("heading", { name: "이 기기에서는 안 돼요" })).toBeTruthy();
  });

  it("안내 안의 Escape만 처리하며 접힌 버튼에서는 편집기 키 입력을 가로채지 않는다", () => {
    const parentKeyDown = vi.fn();
    document.addEventListener("keydown", parentKeyDown);
    try {
      render(notice());
      fireEvent.click(screen.getByRole("button", { name: "기기 안내 가능한 작업 보기" }));
      const close = screen.getByRole("button", { name: "모바일 편집 안내 닫기" });
      close.focus();
      fireEvent.keyDown(close, { key: "Escape" });

      const reopen = screen.getByRole("button", { name: "기기 안내" });
      expect(document.activeElement).toBe(reopen);
      expect(parentKeyDown).not.toHaveBeenCalled();
      expect(reopen.getAttribute("aria-expanded")).toBe("false");
      fireEvent.keyDown(reopen, { key: "Escape" });
      expect(parentKeyDown).toHaveBeenCalledOnce();
    } finally {
      document.removeEventListener("keydown", parentKeyDown);
    }
  });

  it("이전 확인은 요약만 생략하며 기기 안내의 재진입 경로는 남는다", () => {
    window.sessionStorage.setItem(mobileFullEditNoticeStorageKey("studio-editor-canvas"), "true");
    render(notice());
    const reopen = screen.getByRole("button", { name: "기기 안내" });
    expect(screen.queryByRole("button", { name: "모바일 편집 안내 닫기" })).toBeNull();
    fireEvent.click(reopen);
    expect(screen.getByRole("heading", { name: "지금 할 수 있어요" })).toBeTruthy();
  });

  it("같은 컴포넌트의 도구가 바뀌면 새 표면의 제한을 다시 알리고 이전 확인은 보존한다", () => {
    const { rerender } = render(notice());
    fireEvent.click(screen.getByRole("button", { name: "모바일 편집 안내 닫기" }));
    rerender(notice("poser"));

    expect(screen.getByRole("button", { name: "기기 안내 가능한 작업 보기" })).toBeTruthy();
    expect(screen.getByRole("complementary").querySelector("p")?.textContent)
      .toContain(resolveStudioMobileTouchPlan("poser").cannotDo[0]?.ko);
    expect(window.sessionStorage.getItem(mobileFullEditNoticeStorageKey("studio-editor-poser"))).toBeNull();
    rerender(notice());
    expect(screen.getByRole("button", { name: "기기 안내" })).toBeTruthy();
  });

  it("세션 저장이 실패해도 안내 닫기·포커스 복귀·재진입은 동작한다", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    render(notice());
    fireEvent.click(screen.getByRole("button", { name: "모바일 편집 안내 닫기" }));
    const reopen = screen.getByRole("button", { name: "기기 안내" });
    expect(document.activeElement).toBe(reopen);
    fireEvent.click(reopen);
    expect(screen.getByRole("heading", { name: "지금 할 수 있어요" })).toBeTruthy();
  });

  it("영문에서도 안내·상세 목록·닫기 경로를 제공한다", () => {
    language.value = "en";
    render(notice());
    fireEvent.click(screen.getByRole("button", { name: "Device guide View available tasks" }));
    expect(screen.getByRole("heading", { name: "Available now" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Not available on this device" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close guide and continue" }));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Device guide" }));
  });
});

describe("모바일 편집 안내의 기기 경계", () => {
  it("데스크톱 폭과 마우스에서는 재진입 버튼도 노출하지 않는다", () => {
    narrowViewport = false;
    render(notice());
    expect(screen.queryByRole("complementary", { name: "모바일 편집 안내" })).toBeNull();
  });

  it("태블릿 가로에서도 현재 도구의 기기 제한을 알린다", () => {
    narrowViewport = false;
    touchTabletViewport = true;
    render(notice("bg3d"));
    const guide = screen.getByRole("complementary", { name: "모바일 편집 안내" });
    expect(guide.querySelector("p")?.textContent).toContain(resolveStudioMobileTouchPlan("bg3d").cannotDo[0]?.ko);
    expect(guide.getAttribute("data-studio-mobile-touch-tier")).toBe("desktop-required");
  });
});

describe("좁은 기기 안내의 정보 보존", () => {
  it("좁은 요약에서도 첫 한계 원문과 표면 이름을 자르거나 숨기지 않는다", () => {
    render(notice());
    const plan = resolveStudioMobileTouchPlan("canvas");
    const summary = screen.getByRole("complementary").querySelector("p");
    expect(summary?.textContent).toContain(plan.label.ko);
    expect(summary?.textContent).toContain(plan.cannotDo[0]?.ko);
    expect(summary?.closest("[hidden]")).toBeNull();
    expect(summary?.className).not.toMatch(/truncate|line-clamp|overflow-hidden/);
  });

  it("영문 요약에도 동일한 첫 한계를 보이고 모든 버튼은 reduced-motion을 따른다", () => {
    language.value = "en";
    render(notice());
    expect(screen.getByRole("complementary").querySelector("p")?.textContent)
      .toContain(resolveStudioMobileTouchPlan("canvas").cannotDo[0]?.en);
    fireEvent.click(screen.getByRole("button", { name: "Device guide View available tasks" }));
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/(?:size-11|min-h-11)/);
      expect(button.className).toContain("motion-reduce:transition-none");
    }
  });
});
