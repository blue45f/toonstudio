// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioAiGenerationQueueStore,
  resetStudioAiGenerationQueueStoresForTest,
} from "./studio-ai-generation-queue-store";
import { StudioAiGenerationQueueGateway } from "./StudioAiGenerationQueueGateway";
import { StudioAiGenerationQueuePanel } from "./StudioAiGenerationQueuePanel";

function createMemoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

describe("StudioAiGenerationQueuePanel (AC-001)", () => {
  afterEach(() => {
    cleanup();
    resetStudioAiGenerationQueueStoresForTest();
  });

  it("enforces external transfer confirmation, shows progress, approves preview, and inserts a non-destructive draft layer", async () => {
    const storage = createMemoryStorage();
    const store = createStudioAiGenerationQueueStore({
      documentId: "doc-ac001",
      storage,
    });
    const onInsertDraftLayer = vi.fn().mockResolvedValue({
      mode: "copy" as const,
      targetDocumentId: "doc-ac001",
      createdObjectIds: ["inserted-draft-layer-1"],
    });
    const onAnnounce = vi.fn();

    render(
      <StudioAiGenerationQueuePanel
        documentId="doc-ac001"
        selectionId="sel-cut-1"
        store={store}
        stepDelayMs={0}
        onInsertDraftLayer={onInsertDraftLayer}
        onAnnounce={onAnnounce}
      />,
    );

    // Choose external transfer route and submit request
    fireEvent.click(screen.getByRole("radio", { name: "외부 전송" }));
    fireEvent.change(screen.getByLabelText("요청 내용"), {
      target: { value: "옥상 장면 석양 림라이트 추가" },
    });
    fireEvent.click(screen.getByRole("button", { name: "생성 요청" }));

    // External transfer confirmation gate is visible
    const confirmBtn = await screen.findByRole("button", { name: "외부 전송 동의 후 시작" });
    expect(confirmBtn).toBeTruthy();

    // Confirm -> runs -> preview-ready
    fireEvent.click(confirmBtn);

    const approveBtn = await screen.findByRole("button", { name: "결과 승인" });
    expect(screen.getByAltText(/비파괴 미리보기/)).toBeTruthy();

    // Approve -> enables apply button
    fireEvent.click(approveBtn);
    const applyBtn = await screen.findByRole("button", { name: "비파괴 초안 레이어 삽입" });
    expect(screen.getByRole("button", { name: "선택 영역에 적용" })).toBeTruthy();

    // Apply inserts real draft layer and renders celebratory applied burst badge
    fireEvent.click(applyBtn);
    await waitFor(() => {
      expect(onInsertDraftLayer).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByText(/새 사본 레이어에/)).toBeTruthy();
    expect(document.querySelector('[data-studio-ai-applied-burst="true"]')).not.toBeNull();
    expect(onAnnounce).toHaveBeenCalled();
  });

  it("provides a 1-click recommended first CTA in the empty state", async () => {
    const store = createStudioAiGenerationQueueStore({
      documentId: "doc-empty-cta",
      storage: createMemoryStorage(),
    });
    render(<StudioAiGenerationQueuePanel documentId="doc-empty-cta" store={store} />);
    const firstCta = await screen.findByRole("button", { name: "추천 선화 정리 바로 시작" });
    expect(firstCta.getAttribute("data-studio-ai-empty-first-cta")).toBe("true");
    fireEvent.click(firstCta);
    expect(await screen.findByRole("button", { name: "확인 후 시작" })).toBeTruthy();
  });

  it("supports decline, failure retry, cancel, and restores persisted jobs on remount", async () => {
    const storage = createMemoryStorage();
    let failOnce = true;
    const storeA = createStudioAiGenerationQueueStore({
      documentId: "doc-restore",
      storage,
    });

    const { unmount } = render(
      <StudioAiGenerationQueuePanel
        documentId="doc-restore"
        store={storeA}
        stepDelayMs={0}
        runner={async ({ job, reportProgress }) => {
          reportProgress(0.5);
          if (failOnce) {
            failOnce = false;
            throw new Error("일시적인 모델 지연이 발생했습니다.");
          }
          return {
            preview: {
              previewId: `prev-${job.id}`,
              outputRefs: [`out-${job.id}`],
              estimatedCreditsUsed: 0,
              warnings: [],
            },
            artifact: {
              previewId: `prev-${job.id}`,
              kind: "text",
              title: "대사 다듬기 초안",
              textDraft: "지금 당장 옥상으로 올라가!",
            },
          };
        }}
      />,
    );

    // 1. Decline a request
    fireEvent.change(screen.getByLabelText("요청 내용"), {
      target: { value: "취소할 배경 요청" },
    });
    fireEvent.click(screen.getByRole("button", { name: "생성 요청" }));
    fireEvent.click(await screen.findByRole("button", { name: "거절" }));
    expect(await screen.findByText("취소됨")).toBeTruthy();

    // 2. Fail once then retry into preview-ready
    fireEvent.change(screen.getByLabelText("요청 내용"), {
      target: { value: "긴장감 있는 대사 다듬기" },
    });
    fireEvent.click(screen.getByRole("button", { name: "생성 요청" }));
    fireEvent.click(await screen.findByRole("button", { name: "확인 후 시작" }));
    expect(await screen.findByText(/일시적인 모델 지연이 발생했습니다/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "다시 생성" }));
    expect(await screen.findByText("지금 당장 옥상으로 올라가!")).toBeTruthy();

    // Unmount and remount with a brand new store backed by the same storage
    unmount();
    const storeB = createStudioAiGenerationQueueStore({
      documentId: "doc-restore",
      storage,
    });
    render(<StudioAiGenerationQueuePanel documentId="doc-restore" store={storeB} />);

    expect(await screen.findByText("지금 당장 옥상으로 올라가!")).toBeTruthy();
    expect(screen.getByRole("button", { name: "결과 승인" })).toBeTruthy();
  });

  it("lazy-loads StudioAiGenerationQueuePanel through StudioAiGenerationQueueGateway on click", async () => {
    render(<StudioAiGenerationQueueGateway documentId="doc-gateway" />);
    expect(screen.queryByTestId("studio-ai-generation-queue-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /AI 생성 검토 큐/ }));
    expect(await screen.findByTestId("studio-ai-generation-queue-panel")).toBeTruthy();
  });
});
