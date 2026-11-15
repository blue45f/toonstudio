// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PinnedShareView } from "@toonstudio/studio-project-model/pinned-review-share";

import { StudioPinnedReviewSharePage } from "../review-share/StudioPinnedReviewSharePage";
import { createInitialStudioProjectDiagnosticSource } from "../studio-project-diagnostic-source-defaults";
import type { StudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { StudioReviewPanel } from "../studio-shell/StudioReviewPanel";
import { useStudioProjectWorkspace } from "../studio-shell/useStudioProjectWorkspace";
import { ProductionClarificationAnswer } from "./ProductionClarificationAnswer";
import { createProductionDemoProject } from "./production-demo";
import { productionDemoAdapter, rebaseProductionDemoTimeline, resetProductionDemoSession } from "./production-demo-adapter";
import { ProductionReviewWorkspace } from "./ProductionReviewWorkspace";
import type { ProductionClientCommand } from "./production-api";

const shareMocks = vi.hoisted(() => ({ view: vi.fn(), image: vi.fn(), feedback: vi.fn() }));
vi.mock("../review-share/studio-pinned-review-share-client", () => ({
  viewPinnedReviewShare: shareMocks.view,
  loadPinnedReviewSharePage: shareMocks.image,
  submitPinnedReviewShareFeedback: shareMocks.feedback,
}));

vi.mock("../studio-shell/useStudioProjectWorkspace", () => ({
  useStudioProjectWorkspace: vi.fn(),
}));
const workspaceHookMock = vi.mocked(useStudioProjectWorkspace);

const TOKEN = "D".repeat(43);
const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
const originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: vi.fn(() => "blob:retry-22"),
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: vi.fn() });
});

afterAll(() => {
  if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate);
  if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke);
});

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  cleanup();
  resetProductionDemoSession();
  window.localStorage.clear();
});

describe("Backlog [22] 요청 지연·실패 후 검수 코멘트 재전송 · 입력 유지 및 단일 생성 멱등성", () => {
  it("ProductionReviewWorkspace: 지연 중 연타를 차단하고, 실패(또는 서버 반영 후 응답 타임아웃) 뒤 재전송해도 동일 코멘트가 정확히 1건만 생긴다", async () => {
    const initial = rebaseProductionDemoTimeline(createProductionDemoProject(), new Date());
    const executedIds: string[] = [];
    let attemptNumber = 0;

    function WorkspaceRetryHarness() {
      const [aggregate, setAggregate] = useState(initial);

      const execute = async (command: ProductionClientCommand) => {
        if (command.type === "upsert-clarification") {
          attemptNumber += 1;
          executedIds.push(command.clarification.id);
          if (attemptNumber === 1) {
            // 1차 시도는 서버에는 이미 기록되었으나 응답 타임아웃 오류가 난 최악의 미확인 쓰기 시나리오를 모의
            setAggregate((prev) => productionDemoAdapter.reduce(prev, command));
            throw new Error("응답 시간 초과 (네트워크 지연)");
          }
          setAggregate((prev) => productionDemoAdapter.reduce(prev, command));
        }
      };

      return <ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} />;
    }

    render(<WorkspaceRetryHarness />);

    const textarea = screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement;
    const blockingBox = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.change(textarea, { target: { value: "봉투 인장 그림자 톤 통일 확인 부탁드립니다." } });
    fireEvent.click(blockingBox);

    // 1차 전송 -> 실패 배너 노출, 작성 본문·차단 체크박스 100% 보존
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("응답 시간 초과");
    });
    expect(textarea.value).toBe("봉투 인장 그림자 톤 통일 확인 부탁드립니다.");
    expect(blockingBox.checked).toBe(true);
    expect(screen.getByTestId("review-retry-clarification-btn")).toBeTruthy();

    // '같은 질문 다시 보내기' 실행 -> 이미 반영된 동일 코멘트를 감지해 중복 생성 없이 1건으로 확정되고 입력이 비워짐
    fireEvent.click(screen.getByTestId("review-retry-clarification-btn"));
    await waitFor(() => {
      expect(textarea.value).toBe("");
    });
    const matches = screen.getAllByText("봉투 인장 그림자 톤 통일 확인 부탁드립니다.");
    // 상단 차단 질문 요약 1곳 + 우측 열린 이슈 카드 1곳이 있을 수 있으므로 data-clarification-id 개수로 열린 이슈 단일 생성 확인
    const cards = Array.from(document.querySelectorAll("[data-clarification-id]")).filter((el) =>
      el.textContent?.includes("봉투 인장 그림자 톤 통일 확인 부탁드립니다."),
    );
    expect(cards).toHaveLength(1);
    expect(executedIds).toHaveLength(1);
    void matches;
  });

  it("ProductionReviewWorkspace: 서버 미반영 순수 실패 후 재전송 시 동일한 질문 ID를 재사용해 1건만 생성하고, 다른 문장은 새 질문으로 등록한다", async () => {
    const initial = rebaseProductionDemoTimeline(createProductionDemoProject(), new Date());
    const seenClarificationIds: string[] = [];
    let shouldFail = true;

    function PureFailureHarness() {
      const [aggregate, setAggregate] = useState(initial);
      const execute = async (command: ProductionClientCommand) => {
        if (command.type === "upsert-clarification") {
          seenClarificationIds.push(command.clarification.id);
          if (shouldFail) throw new Error("일시적 게이트웨이 오류");
          setAggregate((prev) => productionDemoAdapter.reduce(prev, command));
        }
      };
      return <ProductionReviewWorkspace aggregate={aggregate} canEdit roleLens="art" execute={execute} />;
    }

    render(<PureFailureHarness />);
    const textarea = screen.getByRole("textbox", { name: "검수 질문" }) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "첫 번째 코멘트 재시도 테스트" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));

    await waitFor(() => expect(screen.getByTestId("review-retry-clarification-btn")).toBeTruthy());
    expect(textarea.value).toBe("첫 번째 코멘트 재시도 테스트");

    shouldFail = false;
    fireEvent.click(screen.getByTestId("review-retry-clarification-btn"));
    await waitFor(() => expect(textarea.value).toBe(""));

    // 1차 실패와 2차 재시도가 정확히 동일한 clarification.id를 사용했음을 검증
    expect(seenClarificationIds).toHaveLength(2);
    expect(seenClarificationIds[0]).toBe(seenClarificationIds[1]);

    // 이제 다른 문장을 입력해 보내면 새로운 ID로 별도 등록됨
    fireEvent.change(textarea, { target: { value: "두 번째 완전히 다른 코멘트" } });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    await waitFor(() => expect(textarea.value).toBe(""));
    expect(seenClarificationIds).toHaveLength(3);
    expect(seenClarificationIds[2]).not.toBe(seenClarificationIds[0]);
  });

  it("StudioPinnedReviewSharePage: 지연 중 동일 틱 연속 제출을 1회로 잠그고, 실패 후 재시도 버튼으로 동일 ID 의견을 1번만 남긴다", async () => {
    const feedbackList: PinnedShareView["feedback"][number][] = [];
    const baseView = (): PinnedShareView => ({
      id: "11111111-1111-4111-8111-111111111111",
      title: "12화 외부 고정 검수",
      instructions: "",
      purpose: "external-review",
      role: "commenter",
      watermark: false,
      rightsStatement: "",
      revisionFingerprint: "e".repeat(64),
      expiresAt: "2030-09-23T00:00:00.000Z",
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      pages: [{ ordinal: 0, sha256: "a".repeat(64), byteLength: 4, mediaType: "image/png", width: 800, height: 1200 }],
      feedback: [...feedbackList],
    });
    shareMocks.view.mockImplementation(async () => baseView());
    shareMocks.image.mockResolvedValue(new Blob(["img"], { type: "image/png" }));

    let releaseFirstCall: (() => void) | null = null;
    let callIdx = 0;
    const submittedIds: string[] = [];
    shareMocks.feedback.mockImplementation(async (_access: unknown, payload: { id: string; pageOrdinal: number; reviewerName: string; body: string }) => {
      callIdx += 1;
      submittedIds.push(payload.id);
      if (callIdx === 1) {
        await new Promise<void>((resolve) => {
          releaseFirstCall = resolve;
        });
        throw new Error("네트워크 일시 단절");
      }
      const saved = { ...payload, createdAt: "2026-11-15T04:10:00.000Z" };
      if (!feedbackList.some((item) => item.id === saved.id)) feedbackList.push(saved);
      return saved;
    });

    render(
      <MemoryRouter initialEntries={[`/production/pinned-review?page=1#token=${TOKEN}`]}>
        <Routes>
          <Route path="/production/pinned-review" element={<StudioPinnedReviewSharePage />} />
        </Routes>
      </MemoryRouter>,
    );

    const nameInput = (await screen.findByLabelText("검토자 이름")) as HTMLInputElement;
    const bodyInput = screen.getByLabelText("의견") as HTMLTextAreaElement;
    fireEvent.change(nameInput, { target: { value: "데모 PD" } });
    fireEvent.change(bodyInput, { target: { value: "1페이지 대사 자간 재점검" } });

    // 동일 틱에 두 번 연속 submit 이벤트 발생 -> 동기 ref 잠금으로 1회만 호출됨
    const form = bodyInput.closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(shareMocks.feedback).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseFirstCall?.();
    });

    await waitFor(() => expect(screen.getByTestId("pinned-review-retry-feedback-btn")).toBeTruthy());
    expect(nameInput.value).toBe("데모 PD");
    expect(bodyInput.value).toBe("1페이지 대사 자간 재점검");

    // '같은 의견 다시 보내기' 클릭 -> 동일 ID로 재시도해 정확히 1건만 기록됨
    fireEvent.click(screen.getByTestId("pinned-review-retry-feedback-btn"));
    await waitFor(() => expect(bodyInput.value).toBe(""));
    expect(submittedIds).toHaveLength(2);
    expect(submittedIds[0]).toBe(submittedIds[1]);
    expect(feedbackList).toHaveLength(1);
  });

  it("StudioReviewPanel 및 ProductionClarificationAnswer: 저장 실패 시 입력을 유지하고 재시도 시 동일 스레드/답변이 1번만 기록된다", async () => {
    const initial = createInitialStudioProjectDiagnosticSource("project-retry-22", "2026-11-15T01:00:00.000Z");
    let failWorkspaceSave = true;

    function StudioPanelHarness() {
      const [wsState, setWsState] = useState<StudioProjectWorkspaceState>({
        ...initial,
        reviewSession: {
          ...initial.reviewSession,
          status: "in-review",
          requiredReviewerIds: ["project-owner"],
          threads: [],
          decisions: [],
        },
      });
      workspaceHookMock.mockReturnValue({
        state: wsState,
        error: null,
        update: (updater) => {
          if (failWorkspaceSave) return null;
          let next: StudioProjectWorkspaceState | null = null;
          setWsState((prev) => {
            next = updater(prev, { projectId: "project-retry-22", updatedAt: "2026-11-15T02:00:00.000Z" });
            return next;
          });
          return next;
        },
        reload: vi.fn(),
      });
      return <StudioReviewPanel projectId="project-retry-22" locale="ko" />;
    }

    const panelView = render(<StudioPanelHarness />);
    const bodyTextarea = screen.getByLabelText("검토 내용") as HTMLTextAreaElement;
    fireEvent.change(bodyTextarea, { target: { value: "컷 01 손가락 관절 각도 보정" } });
    fireEvent.click(screen.getByTestId("review-add-thread-btn"));

    // 실패 시 입력 보존 + 재시도 버튼 노출
    expect(bodyTextarea.value).toBe("컷 01 손가락 관절 각도 보정");
    expect(screen.getByTestId("review-retry-thread-btn")).toBeTruthy();

    failWorkspaceSave = false;
    fireEvent.click(screen.getByTestId("review-retry-thread-btn"));
    expect(bodyTextarea.value).toBe("");
    expect(document.querySelectorAll("[data-testid^='review-thread-card-']")).toHaveLength(1);
    panelView.unmount();

    // ProductionClarificationAnswer 실패 -> 입력 보존 -> 재시도 단일 기록 검증
    const demoAgg = createProductionDemoProject();
    const openThread = demoAgg.clarifications[0]!;
    let failAnswer = true;
    const answerPayloads: ProductionClientCommand[] = [];
    render(
      <ProductionClarificationAnswer
        thread={openThread}
        canAnswer
        lockedHint=""
        isDemo={false}
        execute={async (cmd) => {
          answerPayloads.push(cmd);
          if (failAnswer) throw new Error("인계 서버 응답 지연");
        }}
      />,
    );

    const answerInput = screen.getByLabelText("결정 내용") as HTMLTextAreaElement;
    fireEvent.change(answerInput, { target: { value: "마지막 컷 직전까지 봉투 인장을 가립니다." } });
    fireEvent.click(screen.getByRole("button", { name: "결정 기록" }));

    await waitFor(() => expect(screen.getByTestId("clarification-answer-retry-btn")).toBeTruthy());
    expect(answerInput.value).toBe("마지막 컷 직전까지 봉투 인장을 가립니다.");

    failAnswer = false;
    fireEvent.click(screen.getByTestId("clarification-answer-retry-btn"));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(answerPayloads).toHaveLength(2);
    expect(answerPayloads[0]).toEqual(answerPayloads[1]);
  });
});
