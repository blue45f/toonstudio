// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceCafeHubPanel } from "./WorkspaceCafeHubPanel";
import type { WorkspaceCafePost } from "./workspace-cafe-hub";

const { listCafePosts, createCafePost } = vi.hoisted(() => ({
  listCafePosts: vi.fn<typeof import("@/platform/studio-ecosystem-client").studioEcosystemClient.listCafePosts>(),
  createCafePost: vi.fn<typeof import("@/platform/studio-ecosystem-client").studioEcosystemClient.createCafePost>(),
}));
vi.mock("@/platform/studio-ecosystem-client", () => ({
  studioEcosystemClient: { listCafePosts, createCafePost },
}));
vi.mock("@/platform/use-studio-ecosystem-stream", () => ({
  useStudioEcosystemStream: () => ({ status: "offline", events: [] }),
}));

const imagePost: WorkspaceCafePost = {
  id: "post-image-preview",
  cafeId: "cafe-work-gate",
  scope: "work",
  channel: "notice",
  authorName: "메인 작가",
  authorRoleBadge: "작품별 카페",
  title: "첨부 이미지 확인",
  body: "원고 미리보기",
  createdAt: "2026-11-19T00:00:00Z",
  attachments: [{
    id: "image-preview",
    fileName: "preview.png",
    mimeType: "image/png",
    sizeBytes: 8,
    dataUrl: "data:image/png;base64,iVBORw0KGgo=",
    caption: "원고 조명 수정안",
    spoilerBlur: false,
  }],
};

beforeEach(() => {
  listCafePosts.mockReset().mockResolvedValue({ items: [] });
  createCafePost.mockReset().mockResolvedValue({ id: "created-post" });
});

afterEach(cleanup);

async function openImagePreview() {
  listCafePosts.mockResolvedValue({ items: [imagePost] });
  render(<WorkspaceCafeHubPanel />);
  const trigger = await screen.findByRole("button", { name: "preview.png 크게 보기" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "preview.png 이미지 미리보기" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  const close = within(dialog).getByRole("button", { name: "닫기" });
  expect(document.activeElement).toBe(close);
  // Dialog가 열기 동작 다음 턴에 등록하는 바깥 포인터 리스너까지 준비한다.
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  return { trigger, dialog, close };
}

describe("WorkspaceCafeHubPanel", () => {
  it("스튜디오별 카페로 전환하고 새 게시글을 등록한다", () => {
    const onPostCreated = vi.fn();
    render(<WorkspaceCafeHubPanel onPostCreated={onPostCreated} />);

    fireEvent.click(screen.getByRole("tab", { name: "스튜디오별 카페" }));
    fireEvent.change(screen.getByPlaceholderText("게시글 제목을 입력하세요"), {
      target: { value: "신규 3D 배경 에셋 공유" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("원고 피드백, 레퍼런스, 공지 내용을 작성하고 이미지를 첨부해 보세요"),
      { target: { value: "이번 주 마감용 실내 세트 업로드했습니다." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "게시하기" }));

    expect(onPostCreated).toHaveBeenCalledTimes(1);
    expect(screen.getByText("신규 3D 배경 에셋 공유")).toBeTruthy();
  });

  it("이미지와 내부 영역 클릭은 유지하고 배경 클릭만 미리보기를 닫는다", async () => {
    const { trigger, dialog } = await openImagePreview();
    const image = within(dialog).getByRole("img", { name: "원고 조명 수정안" });
    fireEvent.pointerDown(image, { pointerType: "mouse", button: 0 });
    fireEvent.click(image);
    fireEvent.pointerDown(dialog, { pointerType: "mouse", button: 0 });
    fireEvent.click(dialog);
    expect(screen.getByRole("dialog", { name: "preview.png 이미지 미리보기" })).toBe(dialog);

    const backdrop = dialog.parentElement;
    if (!backdrop) throw new Error("이미지 미리보기 배경이 없습니다.");
    fireEvent.pointerDown(backdrop, { pointerType: "mouse", button: 0 });
    fireEvent.click(backdrop);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("Tab 포커스를 미리보기에 유지하고 Escape로 닫아 이미지 버튼으로 돌려준다", async () => {
    const { trigger, close } = await openImagePreview();
    expect(fireEvent.keyDown(close, { key: "Tab" })).toBe(false);
    expect(document.activeElement).toBe(close);
    expect(fireEvent.keyDown(close, { key: "Tab", shiftKey: true })).toBe(false);
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("명시적인 닫기 버튼으로 닫고 이미지 버튼 포커스를 복구한다", async () => {
    const { trigger, close } = await openImagePreview();
    fireEvent.click(close);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
