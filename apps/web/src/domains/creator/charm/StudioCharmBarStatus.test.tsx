// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { lockNoticeText } from "./studio-charm-copy";
import { StudioCharmBarEmpty, StudioCharmBarNotices } from "./StudioCharmBarStatus";

import type { StudioCharmBarNoticesProps } from "./StudioCharmBarStatus";

import { useI18n } from "@/shared/lib/i18n";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
});

function notices(overrides: Partial<StudioCharmBarNoticesProps> = {}) {
  const props: StudioCharmBarNoticesProps = {
    starterCount: 0,
    onDismissStarter: vi.fn(),
    lock: null,
    persistence: "saved",
    onRetryPersistence: vi.fn(),
    libraryFailed: false,
    onRetryLibrary: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<StudioCharmBarNotices {...props} />) };
}

describe("편집 잠금 문구", () => {
  it("잠금이 없으면 문구도 없다", () => {
    expect(lockNoticeText(null)).toBeNull();
  });

  it("종류마다 이유를 알려 주고, 호스트가 준 공동 편집 안내가 있으면 그것을 쓴다", () => {
    expect(lockNoticeText({ kind: "review", message: null })).toContain("검수 중");
    expect(lockNoticeText({ kind: "page", message: null })).toContain("편집이 잠겨");
    expect(lockNoticeText({ kind: "collaboration", message: null })).toContain("공동 편집 잠금");
    expect(lockNoticeText({ kind: "collaboration", message: "다른 작가가 편집 중이에요." })).toBe("다른 작가가 편집 중이에요.");
  });

  it("영어 화면에서는 영어 문구가 나온다", () => {
    useI18n.getState().setLang("en");
    expect(lockNoticeText({ kind: "page", message: null })).toBe("Editing is locked on this page.");
  });
});

describe("참 바 안내", () => {
  it("아무 일이 없으면 아무것도 그리지 않는다", () => {
    const { container } = notices();
    expect(container.textContent).toBe("");
  });

  it("기본 참을 담았다고 한 번 알리고 닫을 수 있다", () => {
    const { props } = notices({ starterCount: 12 });
    const note = screen.getByRole("status");
    expect(note.getAttribute("data-studio-charm-note")).toBe("starter");
    expect(within(note).getByText("기본 참 12개를 담았어요. 필요 없는 건 편집에서 뺄 수 있어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(props.onDismissStarter).toHaveBeenCalledOnce();
  });

  it("같은 문구를 전체 문장과 짧은 말로 함께 그리고, 짧은 말은 스크린리더에서 뺀다", () => {
    notices({ starterCount: 12, lock: { kind: "page", message: null }, persistence: "memory-only" });
    const shorts = Array.from(document.querySelectorAll(".studio-charm-bar__short"));
    expect(shorts.map((node) => node.textContent)).toEqual(["기본 12개", "잠김", "저장 안 됨"]);
    expect(shorts.every((node) => node.getAttribute("aria-hidden") === "true")).toBe(true);
    // 마우스를 올리면 전체 문장이 보이는 설명으로 뜬다.
    expect(shorts[1]?.getAttribute("title")).toBe("이 페이지는 편집이 잠겨 있어요.");
    const fulls = Array.from(document.querySelectorAll(".studio-charm-bar__full")).map((node) => node.textContent);
    expect(fulls).toContain("이 페이지는 편집이 잠겨 있어요.");
  });

  it("편집이 잠겼으면 이유를 상태 안내로 알린다", () => {
    notices({ lock: { kind: "review", message: null } });
    const note = screen.getByRole("status");
    expect(note.getAttribute("data-studio-charm-note")).toBe("lock");
    expect(note.textContent).toContain("검수 중인 화면이라");
  });

  it("저장소에 연결하지 못하면 메모리 전용임을 알리고 다시 시도를 준다", () => {
    const { props } = notices({ persistence: "memory-only" });
    const note = screen.getByRole("status");
    expect(note.getAttribute("data-studio-charm-note")).toBe("storage");
    expect(note.textContent).toContain("이번 탭에서만 유지돼요");
    const retry = screen.getByRole("button", { name: "저장 다시 시도" });
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    expect(props.onRetryPersistence).toHaveBeenCalledOnce();
  });

  it("고정한 내 소재 목록을 읽지 못했으면 이유를 알리고 다시 불러오기를 준다", () => {
    const { props } = notices({ libraryFailed: true });
    const note = screen.getByRole("status");
    expect(note.getAttribute("data-studio-charm-note")).toBe("library");
    expect(note.textContent).toContain("내 소재 목록을 불러오지 못해");
    expect(document.querySelector(".studio-charm-bar__short")?.textContent).toBe("내 소재 오류");
    const retry = screen.getByRole("button", { name: "내 소재 다시 불러오기" });
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    expect(props.onRetryLibrary).toHaveBeenCalledOnce();
  });

  it("읽는 중이거나 저장돼 있을 때는 저장 실패 안내를 띄우지 않는다", () => {
    for (const persistence of ["idle", "loading", "saved"] as const) {
      const { container, unmount } = notices({ persistence });
      expect(container.textContent).toBe("");
      unmount();
    }
  });
});

describe("빈 참 바", () => {
  it("스타터 팩을 제안하는 버튼이 있고 이름은 전체 문장이다", () => {
    const onAddStarter = vi.fn();
    render(<StudioCharmBarEmpty onAddStarter={onAddStarter} />);
    const region = document.querySelector("[data-studio-charm-empty]");
    expect(region?.textContent).toContain("고정한 참이 없어요");
    expect(region?.textContent).toContain("집중선·땀방울·소품");
    const button = screen.getByRole("button", { name: "기본 참 담기" });
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("focus-visible:outline");
    fireEvent.click(button);
    expect(onAddStarter).toHaveBeenCalledOnce();
  });

  it("좁은 레일에서 감춰지는 설명 문단은 별도 클래스로 표시된다", () => {
    render(<StudioCharmBarEmpty onAddStarter={vi.fn()} />);
    expect(document.querySelector(".studio-charm-bar__hint")?.textContent).toContain("한 번에 붙이세요");
    expect(document.querySelector(".studio-charm-bar__short")?.textContent).toBe("비어 있음");
  });
});
