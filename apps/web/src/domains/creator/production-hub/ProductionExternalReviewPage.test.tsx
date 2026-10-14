// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductionExternalReviewPage } from "./ProductionExternalReviewPage";

import { useI18n } from "@/shared/lib/i18n";

import type { ProductionExternalReviewView } from "./production-api";

const getProductionExternalReview = vi.fn();
const submitProductionExternalReview = vi.fn();

vi.mock("./production-api", () => ({
  getProductionExternalReview: (...args: unknown[]) => getProductionExternalReview(...args),
  submitProductionExternalReview: (...args: unknown[]) => submitProductionExternalReview(...args),
}));

const reviewView: ProductionExternalReviewView = {
  projectId: "project-1",
  projectTitle: "밤의 우편배달부",
  review: {
    id: "review-1",
    label: "편집부 최종 검수",
    watermark: true,
    permissions: ["view", "comment", "approve", "download"],
    expiresAt: "2027-09-17T00:00:00.000Z",
    responses: [],
  },
  submissions: [{
    id: "submission-1",
    status: "approved",
    submittedAt: "2026-09-17T00:00:00.000Z",
    revisionRef: {
      id: "revision-1",
      lineage: "integrated",
      revision: 4,
      digest: `sha256:${"1".repeat(64)}`,
      createdAt: "2026-09-17T00:00:00.000Z",
    },
    evidenceRefs: ["https://example.test/review.png"],
    protectedEvidenceCount: 0,
    deliverable: {
      id: "deliverable-1",
      type: "통합 웹툰 원고",
      expectedFormat: "PNG sequence",
      completionCriteria: ["오탈자 없음", "플랫폼 규격 통과"],
    },
  }],
};

afterEach(() => {
  cleanup();
  getProductionExternalReview.mockReset();
  submitProductionExternalReview.mockReset();
});

function renderPage() {
  render(
    <MemoryRouter initialEntries={["/production/review/project-1/review-1?token=" + "a".repeat(64)]}>
      <Routes>
        <Route path="/production/review/:projectId/:reviewId" element={<ProductionExternalReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProductionExternalReviewPage", () => {
  it("loads only the shared review package and records an approval", async () => {
    getProductionExternalReview.mockResolvedValue(reviewView);
    submitProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: {
        ...reviewView.review,
        responses: [{
          id: "response-1",
          reviewerName: "외부 편집자",
          decision: "approve",
          note: "최종 확인했습니다.",
          createdAt: "2026-09-17T01:00:00.000Z",
        }],
      },
    });

    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.getByText("밤의 우편배달부")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "통합 웹툰 원고" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /검수 자료 이미지 1 원본 열기/u }).getAttribute("href")).toBe("https://example.test/review.png");
    expect(screen.getByAltText("검수 자료 이미지 1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("검수자 이름"), { target: { value: "외부 편집자" } });
    fireEvent.click(screen.getByLabelText("승인"));
    fireEvent.change(screen.getByLabelText("의견"), { target: { value: "최종 확인했습니다." } });
    fireEvent.click(screen.getByRole("button", { name: "승인 기록" }));

    await waitFor(() => expect(submitProductionExternalReview).toHaveBeenCalledWith(
      "project-1",
      "review-1",
      expect.objectContaining({
        reviewerName: "외부 편집자",
        decision: "approve",
        note: "최종 확인했습니다.",
      }),
    ));
    expect(await screen.findByText("승인 의견을 안전하게 기록했습니다.")).toBeTruthy();
    expect(screen.getByText("외부 편집자")).toBeTruthy();
  });

  it("깨진 검수 이미지는 빈 상자 대신 실패 안내를 그 자리에 보여준다", async () => {
    getProductionExternalReview.mockResolvedValue(reviewView);
    renderPage();
    const image = await screen.findByRole("img", { name: "검수 자료 이미지 1" });
    fireEvent.error(image);
    expect(await screen.findByText(/이미지 1을 불러오지 못했습니다/)).toBeTruthy();
  });

  it("shows a neutral invalid-link screen without leaking project data", async () => {
    getProductionExternalReview.mockRejectedValue(new Error("not found"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "검수 링크를 열 수 없습니다" })).toBeTruthy();
    expect(screen.queryByText("밤의 우편배달부")).toBeNull();
  });

  it("retries loading from the error screen and recovers when the link works again", async () => {
    getProductionExternalReview
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValue(reviewView);
    renderPage();
    expect(await screen.findByRole("heading", { name: "검수 링크를 열 수 없습니다" })).toBeTruthy();
    // 공용 ErrorState의 재시도 라벨(사이트 표준 "재시도")을 누른다.
    fireEvent.click(screen.getByRole("button", { name: "재시도" }));
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(getProductionExternalReview).toHaveBeenCalledTimes(2);
  });

  it("does not expose original evidence links without download permission", async () => {
    getProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: {
        ...reviewView.review,
        permissions: ["view", "comment", "approve"],
      },
      submissions: reviewView.submissions.map((submission) => ({
        ...submission,
        evidenceRefs: [],
        protectedEvidenceCount: 1,
      })),
    });

    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /자료 열기/u })).toBeNull();
    expect(screen.getByText(/원본 검수 자료 1개는 다운로드 권한이 없어/u)).toBeTruthy();
  });

  it("summarizes the link permission granted to the external reviewer", async () => {
    getProductionExternalReview.mockResolvedValue(reviewView);
    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.getByText(/권한 보기·댓글·승인/u)).toBeTruthy();

    cleanup();
    getProductionExternalReview.mockReset();
    getProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: { ...reviewView.review, permissions: ["view"] },
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.getByText(/권한 보기 전용/u)).toBeTruthy();
  });

  it("shows a view-only notice instead of the feedback form for view permission links", async () => {
    getProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: { ...reviewView.review, permissions: ["view"] },
    });
    renderPage();
    expect(await screen.findByRole("heading", { name: "보기 전용 링크" })).toBeTruthy();
    expect(screen.queryByLabelText("검수자 이름")).toBeNull();
    expect(screen.queryByRole("button", { name: /기록/u })).toBeNull();
  });

  it("링크 진입 안내와 권한 범위를 항목별로 표시한다", async () => {
    getProductionExternalReview.mockResolvedValue(reviewView);
    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    expect(screen.getByText(/계정 가입이나 프로젝트 합류 없이/u)).toBeTruthy();
    expect(screen.getByText("이 링크의 권한 범위")).toBeTruthy();
    expect(screen.getByText("제출본 보기")).toBeTruthy();
    expect(screen.getByText("댓글 남기기")).toBeTruthy();
    expect(screen.getByText("승인·수정 요청")).toBeTruthy();
    expect(screen.getByText("원본 다운로드")).toBeTruthy();
    expect(screen.getAllByText("허용")).toHaveLength(4);
  });

  it("이전 응답을 #태그와 이름으로 검색할 수 있다", async () => {
    getProductionExternalReview.mockResolvedValue({
      ...reviewView,
      review: {
        ...reviewView.review,
        responses: [
          { id: "r1", reviewerName: "김검수", decision: "comment", note: "말풍선 위치 #레이아웃 확인", createdAt: "2026-09-17T01:00:00.000Z" },
          { id: "r2", reviewerName: "Lee", decision: "approve", note: "좋습니다", createdAt: "2026-09-17T02:00:00.000Z" },
        ],
      },
    });
    renderPage();
    expect(await screen.findByText("김검수")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "#레이아웃" }));
    expect(screen.getByText("응답 1건 표시 중")).toBeTruthy();
    expect(screen.queryByText("Lee")).toBeNull();
    fireEvent.change(screen.getByPlaceholderText("이름·내용·#태그로 검색"), { target: { value: "없는검색어" } });
    expect(screen.getByText(/검색과 일치하는 응답이 없어요/u)).toBeTruthy();
  });

  it("작성 중인 의견은 이 기기에 임시 저장되고 다시 열면 복원된다", async () => {
    window.localStorage.clear();
    getProductionExternalReview.mockResolvedValue(reviewView);
    renderPage();
    expect(await screen.findByRole("heading", { name: "편집부 최종 검수" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("검수자 이름"), { target: { value: "임시 검수자" } });
    fireEvent.change(screen.getByLabelText(/의견/u), { target: { value: "중간 의견" } });
    await waitFor(() => expect(window.localStorage.getItem("toonstudio.external-review-draft.review-1")).toBeTruthy());
    cleanup();
    renderPage();
    expect(await screen.findByDisplayValue("임시 검수자")).toBeTruthy();
    expect(screen.getByDisplayValue("중간 의견")).toBeTruthy();
    window.localStorage.clear();
  });

  it("영어 로케일에서는 검수 화면 문구가 영어로 렌더된다", async () => {
    useI18n.setState({ lang: "en" });
    try {
      getProductionExternalReview.mockResolvedValue(reviewView);
      renderPage();
      expect(await screen.findByRole("heading", { name: "Leave your review" })).toBeTruthy();
      expect(screen.getByText(/Permissions View · Comment · Approve/u)).toBeTruthy();
      expect(screen.getByText("Approved")).toBeTruthy();
      expect(screen.getByLabelText("Your name")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Record Comment" })).toBeTruthy();
    } finally {
      useI18n.setState({ lang: "ko" });
    }
  });

});
