// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollaborationEditorPage } from "./CollaborationEditorPage";
import { collaborationTemplate, saveCollaborationDraft } from "./collaboration-draft";

import type { CollaborationPost } from "../../../../../packages/core/src/collaboration";

import { useApp } from "@/shared/lib/store";
import { collaborationClient } from "@/platform/collaboration-client";

vi.mock("@/platform/collaboration-client", () => ({
  collaborationClient: { get: vi.fn(), create: vi.fn(), update: vi.fn(), detail: vi.fn() },
}));

function renderEditor(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/collaborate/new" element={<CollaborationEditorPage />} />
        <Route path="/collaborate/:id/edit" element={<CollaborationEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function previewRoot(): HTMLElement {
  return screen.getByRole("complementary");
}

function titleInput(): HTMLInputElement {
  const input = screen.getByRole("textbox", { name: /공고 제목/u });
  if (!(input instanceof HTMLInputElement)) throw new Error("공고 제목 입력칸이 없습니다.");
  return input;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  useApp.setState({ userId: null, sessionToken: null });
  localStorage.clear();
});

describe("공고 작성 시작", () => {
  it("로그인 전에는 주소로 고른 작성 예시를 미리 보여 주고 다른 예시로 바꿀 수 있다", () => {
    useApp.setState({ userId: null, sessionToken: null });
    renderEditor("/collaborate/new?template=background");

    expect(screen.getByRole("heading", { name: "작성 예시 미리 보기" })).toBeTruthy();
    expect(screen.getByText(collaborationTemplate("background").title)).toBeTruthy();
    expect(screen.getByRole("button", { name: "배경 작업 의뢰" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "팀원 모집" }));
    expect(screen.getByText(collaborationTemplate("team").title)).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("로그인하면 저장된 초안이 없을 때 주소로 고른 예시로 양식을 채운다", () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    renderEditor("/collaborate/new?template=team");

    expect(titleInput().value).toBe(collaborationTemplate("team").title);
    expect(screen.queryByText(/쓰던 초안이 있어 초안을 먼저 열었어요/u)).toBeNull();
  });

  it("쓰던 초안이 있으면 예시로 덮지 않고, 초안을 먼저 연 이유를 알린다", () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    saveCollaborationDraft(localStorage, "user-1", { ...collaborationTemplate("ink"), title: "내가 쓰던 공고" });
    renderEditor("/collaborate/new?template=background");

    expect(titleInput().value).toBe("내가 쓰던 공고");
    expect(screen.getByText(/쓰던 초안이 있어 초안을 먼저 열었어요/u)).toBeTruthy();
  });
});

describe("공고 실시간 미리 보기", () => {
  it("게스트에게는 실시간 미리 보기가 없고 작성 예시만 보인다", () => {
    useApp.setState({ userId: null, sessionToken: null });
    renderEditor("/collaborate/new");

    expect(screen.getByRole("heading", { name: "작성 예시 미리 보기" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "공고 미리 보기" })).toBeNull();
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("제목·유형·역할 입력이 미리 보기 카드에 바로 반영된다", () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    renderEditor("/collaborate/new");
    const preview = previewRoot();

    // 비어 있는 제목은 카드에서 자리 표시로 보인다.
    expect(within(preview).getByRole("heading", { name: "공고 제목" })).toBeTruthy();
    expect(within(preview).getByText("작업 의뢰")).toBeTruthy();
    expect(within(preview).getByText("선화")).toBeTruthy();

    fireEvent.change(titleInput(), { target: { value: "주 2회 배경 보조 구합니다" } });
    expect(within(preview).getByRole("heading", { name: "주 2회 배경 보조 구합니다" })).toBeTruthy();

    fireEvent.change(screen.getByRole("combobox", { name: /작업 분야/u }), { target: { value: "background" } });
    expect(within(preview).getByText("배경")).toBeTruthy();
    expect(within(preview).queryByText("선화")).toBeNull();
  });

  it("보수 금액·단위와 마감일·도구가 카드 표시로 반영된다", () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    const { container } = renderEditor("/collaborate/new");
    const preview = previewRoot();

    fireEvent.change(screen.getByRole("spinbutton", { name: /최소 보수/u }), { target: { value: "50000" } });
    expect(within(preview).getByText("50,000원부터 / 회차")).toBeTruthy();

    expect(within(preview).getByText("상시 접수")).toBeTruthy();
    const deadline = container.querySelector('input[type="date"]');
    if (!(deadline instanceof HTMLInputElement)) throw new Error("모집 마감일 입력칸이 없습니다.");
    fireEvent.change(deadline, { target: { value: "2099-12-31" } });
    expect(within(preview).getByText("2099-12-31")).toBeTruthy();
    expect(within(preview).queryByText("상시 접수")).toBeNull();

    fireEvent.change(screen.getByRole("textbox", { name: /사용 도구/u }), { target: { value: "Clip Studio, , Blender" } });
    expect(within(preview).getByText("Clip Studio")).toBeTruthy();
    expect(within(preview).getByText("Blender")).toBeTruthy();
  });

  it("미리 보기 카드의 제목 링크는 이동하지 않고 저장 버튼은 눌 수 없다", () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    renderEditor("/collaborate/new");
    const preview = previewRoot();

    const cardLink = within(preview).getByRole("link");
    expect(cardLink.getAttribute("href")).toBe("/collaborate/preview");
    expect(fireEvent.click(cardLink)).toBe(false);

    const saveButton = within(preview).getByRole("button", { name: /저장/u });
    if (!(saveButton instanceof HTMLButtonElement)) throw new Error("미리 보기 저장 버튼이 없습니다.");
    expect(saveButton.disabled).toBe(true);
  });

  it("수정 화면에서는 기존 공고의 모집 상태가 미리 보기 카드에 그대로 보인다", async () => {
    useApp.setState({ userId: "user-1", sessionToken: "session-token" });
    const post: CollaborationPost = {
      ...collaborationTemplate("ink"),
      title: "마감한 선화 공고",
      id: "post-1",
      author: { id: "user-1", name: "작성자" },
      status: "closed",
      version: 3,
      hidden: false,
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
      saved: false,
      expired: false,
    };
    vi.mocked(collaborationClient.detail).mockResolvedValue({ post, application: null, canManage: true, canModerate: false });
    renderEditor("/collaborate/post-1/edit");

    const title = await screen.findByRole("textbox", { name: /공고 제목/u });
    if (!(title instanceof HTMLInputElement)) throw new Error("공고 제목 입력칸이 없습니다.");
    expect(title.value).toBe("마감한 선화 공고");
    const preview = previewRoot();
    expect(within(preview).getByText("마감")).toBeTruthy();
    expect(within(preview).getByRole("link").getAttribute("href")).toBe("/collaborate/post-1");
  });
});
