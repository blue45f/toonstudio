// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorCommunityPublicationPanel } from "../CreatorCommunityPublicationPanel";

import { useI18n } from "@/shared/lib/i18n";
import type { WorkDetail } from "@/platform/creator-client";

const client = vi.hoisted(() => ({
  createWorkRelease: vi.fn(),
  listExternalPublications: vi.fn(),
  listWorkReleases: vi.fn(),
  removeExternalPublication: vi.fn(),
  reportWork: vi.fn(),
  saveExternalPublication: vi.fn(),
  updateWork: vi.fn(),
}));

vi.mock("@/platform/creator-client", () => client);

beforeEach(() => {
  useI18n.getState().setLang("ko");
  client.listWorkReleases.mockResolvedValue([]);
  client.listExternalPublications.mockResolvedValue([]);
  client.updateWork.mockResolvedValue({ revision: 4 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function workFixture(overrides: Partial<WorkDetail> = {}): WorkDetail {
  return {
    id: "work-1",
    title: "성운의 왕관",
    description: "",
    cover: "",
    tags: [],
    format: "upload",
    titleId: null,
    status: "published",
    author: { id: "user-1", name: "작가", avatar: "#7c5cfc" },
    likes: 0,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-10-01T00:00:00.000Z",
    pages: ["page-1"],
    doc: { pagesList: [{ id: "page-1" }] },
    isOwner: true,
    revision: 3,
    ...overrides,
  };
}

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /작품 공개·포트폴리오 관리/u }));
}

describe("CreatorCommunityPublicationPanel AI 학습 허용 표기", () => {
  it("저장된 값이 없는 작품은 미지정으로, 레거시 허용 값은 허용으로 보여 준다", () => {
    const { unmount } = render(
      <CreatorCommunityPublicationPanel work={workFixture()} onUpdated={() => undefined} />,
    );
    openPanel();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "미지정 (기본)" }).checked).toBe(true);
    expect(screen.queryByRole("checkbox", { name: /AI 학습/u })).toBeNull();
    unmount();

    render(
      <CreatorCommunityPublicationPanel
        work={workFixture({ doc: { community: { trainingAllowed: true } } })}
        onUpdated={() => undefined}
      />,
    );
    openPanel();
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "허용" }).checked).toBe(true);
  });

  it("표기를 바꿔 저장하면 같은 revision 에 aiTraining 과 파생 불리언을 함께 쓴다", async () => {
    const onUpdated = vi.fn();
    render(<CreatorCommunityPublicationPanel work={workFixture()} onUpdated={onUpdated} />);
    openPanel();

    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    const status = screen.getAllByRole("status").find((node) => node.textContent?.includes("'불허'"));
    expect(status?.textContent).toContain("다음 게시(릴리스)부터");
    // 저장 전에는 서버에 아무것도 쓰지 않는다.
    expect(client.updateWork).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "작품 정보 저장" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));

    expect(client.updateWork).toHaveBeenCalledExactlyOnceWith(
      "work-1",
      expect.objectContaining({
        baseRevision: 3,
        doc: expect.objectContaining({
          pagesList: [{ id: "page-1" }],
          community: expect.objectContaining({ aiTraining: "prohibited", trainingAllowed: false }),
        }),
      }),
    );
    expect(onUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 4,
        community: expect.objectContaining({ aiTraining: "prohibited", trainingAllowed: false }),
        doc: expect.objectContaining({
          community: expect.objectContaining({ aiTraining: "prohibited" }),
        }),
      }),
    );
  });

  it("허용으로 바꿔 저장하면 파생 불리언이 참이 되고 기존 편집기 필드는 그대로다", async () => {
    const onUpdated = vi.fn();
    render(<CreatorCommunityPublicationPanel work={workFixture()} onUpdated={onUpdated} />);
    openPanel();
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    fireEvent.click(screen.getByRole("button", { name: "작품 정보 저장" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));

    expect(client.updateWork).toHaveBeenCalledWith(
      "work-1",
      expect.objectContaining({
        doc: expect.objectContaining({
          pagesList: [{ id: "page-1" }],
          community: expect.objectContaining({ aiTraining: "allowed", trainingAllowed: true }),
        }),
      }),
    );
  });

  it("초안은 게시 반영 시점 단서를 붙이지 않는다", () => {
    render(
      <CreatorCommunityPublicationPanel
        work={workFixture({ status: "draft" })}
        onUpdated={() => undefined}
      />,
    );
    openPanel();
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    const status = screen.getAllByRole("status").find((node) => node.textContent?.includes("'허용'"));
    expect(status?.textContent).not.toContain("다음 게시(릴리스)부터");
  });

  it("저장에 실패하면 오류를 안내하고 작업 상태를 갱신하지 않는다", async () => {
    client.updateWork.mockRejectedValueOnce(new Error("다른 저장이 먼저 반영되었습니다."));
    const onUpdated = vi.fn();
    render(<CreatorCommunityPublicationPanel work={workFixture()} onUpdated={onUpdated} />);
    openPanel();
    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    fireEvent.click(screen.getByRole("button", { name: "작품 정보 저장" }));

    expect(await screen.findByText("다른 저장이 먼저 반영되었습니다.")).toBeTruthy();
    expect(onUpdated).not.toHaveBeenCalled();
    // 실패해도 작가가 고른 값은 그대로 남아 다시 저장할 수 있다.
    expect(screen.getByRole<HTMLInputElement>("radio", { name: "불허" }).checked).toBe(true);
  });

  it("저장하는 동안에는 표기를 바꿀 수 없다", async () => {
    let finishSave: (value: { revision: number }) => void = () => undefined;
    client.updateWork.mockReturnValueOnce(
      new Promise<{ revision: number }>((resolve) => {
        finishSave = resolve;
      }),
    );
    render(<CreatorCommunityPublicationPanel work={workFixture()} onUpdated={() => undefined} />);
    openPanel();
    fireEvent.click(screen.getByRole("radio", { name: "불허" }));
    fireEvent.click(screen.getByRole("button", { name: "작품 정보 저장" }));

    await waitFor(() =>
      expect(screen.getByRole<HTMLInputElement>("radio", { name: "허용" }).disabled).toBe(true),
    );
    finishSave({ revision: 4 });
    await waitFor(() =>
      expect(screen.getByRole<HTMLInputElement>("radio", { name: "허용" }).disabled).toBe(false),
    );
  });
});
