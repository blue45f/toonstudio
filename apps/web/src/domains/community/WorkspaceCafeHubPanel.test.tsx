// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";

import { WorkspaceCafeHubPanel } from "./WorkspaceCafeHubPanel";
import { createDefaultWorkspaceCafes } from "./workspace-cafe-hub";

vi.mock("@/platform/studio-ecosystem-client", () => ({
  studioEcosystemClient: { listCafePosts: vi.fn(), createCafePost: vi.fn() },
}));
vi.mock("@/platform/use-studio-ecosystem-stream", () => ({
  useStudioEcosystemStream: () => ({ events: [] }),
}));

beforeEach(() => {
  vi.mocked(studioEcosystemClient.listCafePosts).mockResolvedValue({ items: [] });
  vi.mocked(studioEcosystemClient.createCafePost).mockResolvedValue({ id: "new-post" });
});

afterEach(cleanup);

async function openImagePreview() {
  const cafes = createDefaultWorkspaceCafes();
  vi.mocked(studioEcosystemClient.listCafePosts).mockResolvedValue({ items: [{
    id: "image-post", cafeId: cafes[0].id, scope: cafes[0].scope, channel: cafes[0].channels[0],
    authorName: "작가", title: "이미지 피드백", body: "참고 이미지", createdAt: "2026-11-19T00:00:00Z",
    attachments: [{ id: "image", fileName: "reference.png", caption: "참고 이미지", dataUrl: "data:image/png;base64,AA==" }],
  }] });
  render(<WorkspaceCafeHubPanel cafes={cafes} />);
  const trigger = await screen.findByRole("button", { name: "reference.png 크게 보기" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "reference.png 이미지 미리보기" });
  return { trigger, dialog };
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

  it("이미지 미리보기로 초점을 옮기고 Escape로 닫은 뒤 원래 버튼에 복원한다", async () => {
    const { trigger, dialog } = await openImagePreview();
    const close = within(dialog).getByRole("button", { name: "닫기" });
    await waitFor(() => expect(document.activeElement).toBe(close));
    fireEvent.keyDown(close, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("미리보기 내용 클릭은 창을 유지하고 닫기 버튼을 지원한다", async () => {
    const { dialog } = await openImagePreview();
    fireEvent.click(within(dialog).getByRole("img", { name: "참고 이미지" }));
    expect(screen.getByRole("dialog")).toBe(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "닫기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
