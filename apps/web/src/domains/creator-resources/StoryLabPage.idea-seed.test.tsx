// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { creatorStoryDraftStorageKey } from "@/shared/lib/creator-workspace-persistence";

// 훅 모의가 소유자를 게스트로 고정하므로 초안도 게스트 파티션 키에 보관된다(소유자 스코프).
const GUEST_DRAFT_KEY = creatorStoryDraftStorageKey("guest");
import { StoryLabPage } from "./StoryLabPage";

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
