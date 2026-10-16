// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPublishResultReceipt } from "./StudioPublishResultReceipt";
import type { StudioPublishReceiptDetails } from "./studio-publish-receipt-data";

afterEach(cleanup);

describe("StudioPublishResultReceipt", () => {
  it("shows a reader action only for a published work", () => {
    render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-1"
          revision={7}
          environment="production"
          details={{
            title: "성운의 왕관",
            visibility: "public",
            publishedAt: "2026-09-24T10:47:13.708Z",
            pages: [{ name: "page.webp", width: 1280, height: 1600 }],
            source: {
              version: 1,
              kind: "studio_document",
              projectId: "project-1",
              documentId: "document-1",
              revisionId: "studio-generation:7:history:12",
              contentChecksum: "a".repeat(64),
              disclosure: "브라우저 편집기에서 제작",
            },
            community: {
              kind: "illustration",
              provenance: "agent_assisted",
              portfolio: false,
              downloadAllowed: false,
              trainingAllowed: false,
              attributionText: "AI 에이전트 드로잉 · 소유자 최종 검수",
              altText: "별빛 왕관을 쓴 판타지 소녀",
            },
            rights: {
              comments: "open",
              allowRemix: true,
              searchIndexing: true,
              contentRating: "all",
            },
            preflight: { errors: 0, warnings: 0 },
          }}
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "작품 게시가 완료됐습니다" })).toBeTruthy();
    expect(screen.getByText("work-1")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("운영 환경")).toBeTruthy();
    expect(screen.getByRole("link", { name: "독자 화면 열기" }).getAttribute("href")).toBe(
      "/showcase/work/work-1",
    );
    expect(screen.getByText("studio-generation:7:history:12")).toBeTruthy();
    expect(screen.getByText("a".repeat(64))).toBeTruthy();
    expect(screen.getByRole("button", { name: "게시 영수증 JSON" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "비로그인 독자 보기" }).getAttribute("href")).toBe(
      "/showcase/work/work-1?view=reader&publicPreview=1",
    );
  });

  it("keeps private drafts out of the reader flow and exposes recovery actions", () => {
    const onContinueEditing = vi.fn();
    const onReviewSettings = vi.fn();
    render(
      <StudioPublishResultReceipt
        kind="private"
        workId="work-private"
        environment="preview"
        onContinueEditing={onContinueEditing}
        onReviewSettings={onReviewSettings}
      />,
    );

    expect(screen.getByRole("heading", { name: "비공개 원고를 저장했습니다" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "독자 화면 열기" })).toBeNull();
    expect(screen.queryByRole("link", { name: "비로그인 독자 보기" })).toBeNull();
    expect(screen.getByRole("button", { name: "게시 영수증 JSON" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "원고 수정 계속" }));
    fireEvent.click(screen.getByRole("button", { name: "공개 설정 다시 확인" }));
    expect(onContinueEditing).toHaveBeenCalledOnce();
    expect(onReviewSettings).toHaveBeenCalledOnce();
  });

  it("shows the verdict trail (status, next feedback point, caps) after a challenge publish", () => {
    render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-challenge"
          environment="production"
          verdict={{
            kind: "challenge",
            status: "in-review",
            submittedAt: "2026-10-14T01:00:00.000Z",
            caps: { periodEnd: "2026-10-18T14:59:59.000Z" },
          }}
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("현재 상태: 검토 중")).toBeTruthy();
    expect(screen.getByText(/다음 피드백·판단 시점:/)).toBeTruthy();
    expect(screen.getByText(/상한/)).toBeTruthy();
    expect(screen.getByText(/포트폴리오에 그대로 남습니다/)).toBeTruthy();
  });

  it("hides the verdict card for private results even when a verdict is passed", () => {
    render(
      <StudioPublishResultReceipt
        kind="private"
        workId="work-private-verdict"
        environment="preview"
        verdict={{
          kind: "publish",
          status: "in-review",
          submittedAt: "2026-10-14T01:00:00.000Z",
        }}
        onContinueEditing={() => undefined}
        onReviewSettings={() => undefined}
      />,
    );

    expect(screen.queryByText("현재 상태: 검토 중")).toBeNull();
    expect(screen.queryByText(/다음 피드백·판단 시점:/)).toBeNull();
  });

  it("offers an explicit rollback for published and scheduled results", () => {
    const onMakePrivate = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-live"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
          onMakePrivate={onMakePrivate}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "즉시 비공개 전환" }));
    expect(onMakePrivate).toHaveBeenCalledOnce();

    rerender(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="scheduled"
          workId="work-scheduled"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
          onMakePrivate={onMakePrivate}
          recoveryBusy
          recoveryError="다른 창의 변경을 먼저 확인해 주세요."
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "비공개 전환 중..." })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("alert").textContent).toContain("다른 창의 변경");
  });

  function labeledDetails(
    community: Partial<StudioPublishReceiptDetails["community"]>,
  ): StudioPublishReceiptDetails {
    return {
      title: "성운의 왕관",
      visibility: "public",
      publishedAt: "2026-09-24T10:47:13.708Z",
      pages: [{ name: "page.webp", width: 1280, height: 1600 }],
      source: null,
      community: {
        kind: "illustration",
        provenance: "human",
        portfolio: false,
        downloadAllowed: false,
        trainingAllowed: false,
        attributionText: "",
        altText: "별빛 왕관을 쓴 판타지 소녀",
        ...community,
      },
      rights: { comments: "open", allowRemix: true, searchIndexing: true, contentRating: "all" },
      preflight: { errors: 0, warnings: 0 },
    };
  }

  it("shows the creator's AI training label in the receipt summary", () => {
    render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-label"
          environment="production"
          details={labeledDetails({ aiTraining: "prohibited" })}
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("AI 학습 표기")).toBeTruthy();
    expect(screen.getByText("AI 학습 불허 표기")).toBeTruthy();
  });

  it("renders a published receipt without retired series actions", () => {
    render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-9"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "원고 수정 계속" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "공개 설정 다시 확인" })).toBeTruthy();
  });

  it("reads a receipt without the label as 'not specified' unless the legacy flag was on", () => {
    const { rerender } = render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-legacy"
          environment="production"
          details={labeledDetails({})}
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("AI 학습 미지정")).toBeTruthy();

    rerender(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-legacy"
          environment="production"
          details={labeledDetails({ trainingAllowed: true })}
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("AI 학습 허용 표기")).toBeTruthy();
  });

  it("renders a private receipt", () => {
    render(
      <StudioPublishResultReceipt
        kind="private"
        workId="work-private-2"
        environment="preview"
        onContinueEditing={() => undefined}
        onReviewSettings={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "원고 수정 계속" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "공개 설정 다시 확인" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "다음 회차 5화 원고 시작" })).toBeNull();
  });

  it("omits the label row while the receipt details are not available yet", () => {
    render(
      <MemoryRouter>
        <StudioPublishResultReceipt
          kind="published"
          workId="work-pending"
          environment="production"
          onContinueEditing={() => undefined}
          onReviewSettings={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.queryByText("AI 학습 표기")).toBeNull();
  });
});
