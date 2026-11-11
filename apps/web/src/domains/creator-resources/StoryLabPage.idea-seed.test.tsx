// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { creatorStoryDraftStorageKey } from "@/shared/lib/creator-workspace-persistence";

import { StoryLabPage } from "./StoryLabPage";
// 훅 모의가 소유자를 게스트로 고정하므로 초안도 게스트 파티션 키에 보관된다(소유자 스코프).
const GUEST_DRAFT_KEY = creatorStoryDraftStorageKey("guest");

vi.mock("./workspace", () => ({
  downloadText: vi.fn(),
  useCreatorWorkspace: () => ({
    workspace: { story: {} },
    saveStory: vi.fn(async () => true),
    clearError: vi.fn(),
    error: null,
    ready: true,
    saving: false,
    writable: true,
    ownerKey: "guest",
  }),
}));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("스토리 연구실 홈 아이디어 시딩", () => {
  it("기획 작성과 저장을 먼저 제공하고 관련 제작 도구는 기본 접힘으로 둔다", () => {
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const worksheet = screen.getByRole("form", { name: "기획 워크시트" });
    const save = screen.getByRole("button", { name: "기획서 저장" });
    const summary = screen.getByText("다음 작업·제작 도구", { selector: "summary" });
    const details = summary.closest("details");
    expect(worksheet.closest("details")).toBeNull();
    expect(save.closest("details")).toBeNull();
    expect(details?.open).toBe(false);
    expect(worksheet.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "스토리 연구실 화면 보기 모드 전환" })).toBeNull();
  });

  it("보조 메뉴를 열면 실제 도착 화면 이름과 기존 목적지를 유지한다", () => {
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const summary = screen.getByText("다음 작업·제작 도구", { selector: "summary" });
    const details = summary.closest("details");
    if (!details) throw new Error("제작 도구 disclosure 누락");
    fireEvent.click(summary);
    expect(details.open).toBe(true);
    for (const [name, href] of [
      ["기획 워크시트 열기", "/story-lab"],
      ["새 작업 설정 열기", "/studio/new"],
      ["웹툰 편집기 열기", "/studio/comic"],
      ["게시 준비 열기", "/studio/publish"],
    ] as const) {
      const link = screen.getByRole("link", { name: new RegExp(name, "u") });
      expect(link.getAttribute("href")).toBe(href);
      expect(link.closest("details")).toBe(details);
    }
    expect(screen.queryByRole("link", { name: /신작 대본 생성/u })).toBeNull();
    fireEvent.click(summary);
    expect(details.open).toBe(false);
  });

  it("?idea= 문장을 빈 가제에 채우고 임시 초안으로 보관한다", () => {
    window.sessionStorage.clear();
    render(<MemoryRouter initialEntries={["/story-lab?idea=비 오는 날의 첫사랑"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("비 오는 날의 첫사랑");
    expect(screen.getByText(/홈에서 입력한 아이디어를 작품 가제로 가져왔습니다/u)).toBeTruthy();
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toContain("비 오는 날의 첫사랑");
  });

  it("이미 가제가 있으면 아이디어로 덮지 않는다", () => {
    window.sessionStorage.clear();
    window.sessionStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ version: 1, base: {}, story: { title: "기존 가제" } }));
    render(<MemoryRouter initialEntries={["/story-lab?idea=새 아이디어"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("기존 가제");
  });

  it("아이디어 파라미터가 없으면 아무것도 채우지 않는다", () => {
    window.sessionStorage.clear();
    render(<MemoryRouter initialEntries={["/story-lab"]}><StoryLabPage /></MemoryRouter>);
    const title = document.querySelector<HTMLTextAreaElement>("#story-title");
    expect(title?.value).toBe("");
    expect(window.sessionStorage.getItem(GUEST_DRAFT_KEY)).toBeNull();
  });
});
