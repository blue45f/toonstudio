// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAiJobQueuePanel } from "./StudioAiJobQueuePanel";
import { createStudioAiJob, transitionStudioAiJob, type StudioAiJob } from "../studio-ai-job";

afterEach(cleanup);

function makeDraftJob(overrides: Partial<Parameters<typeof createStudioAiJob>[0]> = {}): StudioAiJob {
  return createStudioAiJob({
    id: "job-001",
    skill: "line-cleanup",
    providerId: "local-ink-v1",
    privacy: "local",
    cost: "free",
    estimatedCredits: 0,
    request: {
      prompt: "컷 3 인물 선화 노이즈를 정리하고 외곽선 강약을 살려주세요.",
      inputSnapshotId: "snap-100",
      selectionId: "sel-panel-3",
      references: [],
    },
    at: "2026-11-19T09:00:00.000Z",
    ...overrides,
  });
}

describe("StudioAiJobQueuePanel", () => {
  it("로딩·빈 상태·오류 복구 3가지 기본 상태를 모두 렌더링한다", () => {
    const onRetryLoad = vi.fn();
    const onCreateFirstJob = vi.fn();

    const { rerender } = render(<StudioAiJobQueuePanel jobs={[]} loading />);
    expect(screen.getByLabelText("AI 생성 대기열 불러오는 중")).toBeTruthy();

    rerender(<StudioAiJobQueuePanel jobs={[]} onCreateFirstJob={onCreateFirstJob} />);
    fireEvent.click(screen.getByRole("button", { name: /첫 초안 요청 만들기/ }));
    expect(onCreateFirstJob).toHaveBeenCalledTimes(1);

    rerender(
      <StudioAiJobQueuePanel
        jobs={[]}
        errorMessage="로컬 작업 대기열을 읽지 못했습니다."
        onRetryLoad={onRetryLoad}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("로컬 작업 대기열을 읽지 못했습니다.");
    fireEvent.click(screen.getByRole("button", { name: /다시 시도/ }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
  });

  it("외부 전송 확인 대기 -> 실행 -> 미리보기 승인 -> 비파괴 사본/선택 적용 콜백을 정확히 연결한다", () => {
    const onConfirm = vi.fn();
    const onApprove = vi.fn();
    const onApply = vi.fn();
    const onRetry = vi.fn();
    const onCancel = vi.fn();

    const awaiting = transitionStudioAiJob(
      makeDraftJob({
        id: "job-confirm",
        privacy: "cloud-provider",
        cost: "metered",
        estimatedCredits: 12,
      }),
      { type: "request-confirmation", at: "2026-11-19T09:00:01.000Z" },
    );

    const running = transitionStudioAiJob(
      transitionStudioAiJob(
        transitionStudioAiJob(
          transitionStudioAiJob(makeDraftJob({ id: "job-running" }), {
            type: "request-confirmation",
            at: "2026-11-19T09:00:01.000Z",
          }),
          { type: "confirm", accepted: true, at: "2026-11-19T09:00:02.000Z" },
        ),
        { type: "start", at: "2026-11-19T09:00:03.000Z" },
      ),
      { type: "progress", value: 0.65, at: "2026-11-19T09:00:04.000Z" },
    );

    const previewReady = transitionStudioAiJob({ ...running, id: "job-preview" }, {
      type: "preview",
      at: "2026-11-19T09:00:05.000Z",
      preview: {
        previewId: "prev-1",
        outputRefs: ["asset-out-1", "asset-out-2"],
        estimatedCreditsUsed: 4,
        warnings: ["외곽선 굵기가 원본 대비 10% 증가했습니다."],
      },
    });

    const approved = transitionStudioAiJob(
      { ...previewReady, id: "job-approved" },
      { type: "approve", at: "2026-11-19T09:00:06.000Z" },
    );

    const failed = transitionStudioAiJob(
      transitionStudioAiJob(
        transitionStudioAiJob(
          transitionStudioAiJob(makeDraftJob({ id: "job-failed" }), {
            type: "request-confirmation",
            at: "2026-11-19T09:00:01.000Z",
          }),
          { type: "confirm", accepted: true, at: "2026-11-19T09:00:02.000Z" },
        ),
        { type: "start", at: "2026-11-19T09:00:03.000Z" },
      ),
      { type: "fail", code: "TIMEOUT", message: "응답 시간이 초과되었습니다.", at: "2026-11-19T09:00:10.000Z" },
    );

    render(
      <StudioAiJobQueuePanel
        jobs={[awaiting, running, previewReady, approved, failed]}
        onConfirm={onConfirm}
        onApprove={onApprove}
        onApply={onApply}
        onRetry={onRetry}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /외부 전송 동의 후 시작/ }));
    expect(onConfirm).toHaveBeenCalledWith("job-confirm", true);

    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("65");

    fireEvent.click(screen.getByRole("button", { name: /결과 승인/ }));
    expect(onApprove).toHaveBeenCalledWith("job-preview");

    fireEvent.click(screen.getByRole("button", { name: /사본으로 적용/ }));
    expect(onApply).toHaveBeenCalledWith("job-approved", "copy");

    fireEvent.click(screen.getByRole("button", { name: /선택 영역에 적용/ }));
    expect(onApply).toHaveBeenCalledWith("job-approved", "selection");

    expect(screen.getByRole("alert").textContent).toContain("TIMEOUT");
    fireEvent.click(screen.getAllByRole("button", { name: /다시 생성/ })[2]);
    expect(onRetry).toHaveBeenCalledWith("job-failed");
  });
});
