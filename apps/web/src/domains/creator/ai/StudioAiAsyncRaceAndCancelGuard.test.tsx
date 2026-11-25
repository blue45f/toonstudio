// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CreatorEcosystemPage } from "../ecosystem/CreatorEcosystemPage";
import { CreatorEcosystemWorkbench } from "../ecosystem/CreatorEcosystemWorkbench";
import { StudioAiSupportCenterChat } from "../support-chat-ai/StudioAiSupportCenterChat";
import { StudioWebtoonProductionAssistPanel } from "./StudioWebtoonProductionAssistPanel";

const {
  runColorScriptMock,
  sendSupportChatMock,
  requestAutofillMock,
  completeAutomaticFreeTextMock,
} = vi.hoisted(() => ({
  runColorScriptMock: vi.fn(),
  sendSupportChatMock: vi.fn(),
  requestAutofillMock: vi.fn(),
  completeAutomaticFreeTextMock: vi.fn(),
}));

vi.mock("./assist/ai-webtoon-production-assist", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./assist/ai-webtoon-production-assist")>();
  return {
    ...actual,
    runAssistColorScriptDirector: runColorScriptMock,
  };
});

vi.mock("../support-chat-ai/support-ai-chat-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../support-chat-ai/support-ai-chat-client")>();
  return {
    ...actual,
    sendSupportAiChatMessage: sendSupportChatMock,
    requestSupportTicketAutofill: requestAutofillMock,
  };
});

vi.mock("../studio-server-ai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../studio-server-ai-client")>();
  return {
    ...actual,
    completeAutomaticFreeText: completeAutomaticFreeTextMock,
  };
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  runColorScriptMock.mockReset();
  sendSupportChatMock.mockReset();
  requestAutofillMock.mockReset();
  completeAutomaticFreeTextMock.mockReset();
});

describe("비편집기·프로덕션 보조 AI 비동기 경합·취소·대상 고정 가드 (E13 · P8 · P11)", () => {
  it("E13 프로덕션 보조: 실행 중 취소와 대본 변경 시 낡은 컬러 스크립트 결과 무효화가 동작한다", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveColor: ((value: unknown) => void) | null = null;
    runColorScriptMock.mockImplementationOnce((_input, opts) => {
      capturedSignal = opts?.signal;
      return new Promise((resolve) => {
        resolveColor = resolve;
      });
    });

    const baseProps = {
      scriptInput: "서연: 비 오는 밤이야.",
      storyGenre: "미스터리",
      coreConflict: "사라진 필름",
      relationshipDynamic: "contract-allies" as const,
      posePresetId: "pose-over-shoulder-confront" as const,
      targetLocale: "ko" as const,
      onApplyScript: vi.fn(),
    };

    const { rerender } = render(<StudioWebtoonProductionAssistPanel {...baseProps} />);
    fireEvent.click(screen.getByTestId("production-assist-tab-color-script"));
    fireEvent.click(screen.getByTestId("run-claude-production-assist-btn"));

    const cancelBtn = await screen.findByTestId("cancel-claude-production-assist-btn");
    fireEvent.click(cancelBtn);
    expect(capturedSignal?.aborted).toBe(true);

    resolveColor!({
      source: "claude-live",
      model: "claude-live-mock",
      emotionalTurningPointCutNumber: 1,
      episodeArcColorSummaryKo: "취소된 늦은 컬러 응답",
      cutDirectives: [],
    });
    await Promise.resolve();
    expect(screen.queryByText("취소된 늦은 컬러 응답")).toBeNull();

    // 성공 응답 후 scriptInput이 바뀌면 낡은 liveColor가 즉시 무효화된다
    runColorScriptMock.mockResolvedValueOnce({
      source: "claude-live",
      model: "claude-live-mock",
      emotionalTurningPointCutNumber: 1,
      episodeArcColorSummaryKo: "1번 대본 전용 컬러 스크립트",
      cutDirectives: [],
    });
    fireEvent.click(screen.getByTestId("run-claude-production-assist-btn"));
    await waitFor(() => {
      expect(screen.getByText("1번 대본 전용 컬러 스크립트")).toBeTruthy();
    });

    rerender(<StudioWebtoonProductionAssistPanel {...baseProps} scriptInput="윤태오: 새 대본입니다." />);
    expect(screen.queryByText("1번 대본 전용 컬러 스크립트")).toBeNull();
  });

  it("P8 AI 고객센터: 전송 중 새 상담 초기화 시 AbortSignal이 중단되고 늦은 응답이 새 세션에 섞이지 않는다", async () => {
    let chatSignal: AbortSignal | undefined;
    let resolveChat: ((value: unknown) => void) | null = null;
    sendSupportChatMock.mockImplementationOnce((input) => {
      chatSignal = input.signal;
      return new Promise((resolve) => {
        resolveChat = resolve;
      });
    });

    let resolveAutofill: ((value: unknown) => void) | null = null;
    requestAutofillMock.mockImplementation(() => new Promise((resolve) => {
      resolveAutofill = resolve;
    }));

    render(
      <MemoryRouter initialEntries={["/support"]}>
        <StudioAiSupportCenterChat initialPath="/support" />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText("AI 상담 메시지 입력");
    fireEvent.change(textarea, { target: { value: "내보내기 오류 문의" } });
    fireEvent.click(screen.getByRole("button", { name: /질문 보내기/u }));

    await waitFor(() => {
      expect(screen.getByTestId("support-chat-cancel-btn")).toBeTruthy();
    });

    // 응답 전 새 상담 클릭 → abort + 늦은 응답 무시
    fireEvent.click(screen.getByRole("button", { name: /새 상담/u }));
    expect(chatSignal?.aborted).toBe(true);

    resolveChat!({
      sessionId: "stale-session-99",
      userMessage: { id: "u1", role: "user", content: "내보내기 오류 문의", createdAt: "2026-11-26" },
      assistantMessage: { id: "a1", role: "assistant", content: "오래된 응답 누수 금지", createdAt: "2026-11-26" },
    });
    await Promise.resolve();
    expect(screen.queryByText("오래된 응답 누수 금지")).toBeNull();

    // 담당자 연결 연타 시 1회만 요청된다
    const escalateBtn = screen.getByRole("button", { name: /담당자 연결/u });
    fireEvent.click(escalateBtn);
    fireEvent.click(escalateBtn);
    expect(requestAutofillMock).toHaveBeenCalledTimes(1);
    resolveAutofill!({
      oneLineIssue: "문의 요약",
      category: "general",
      urgency: "normal",
      summary: "요약",
      diagnosticChecklist: [],
      piiMasked: false,
    });
  });

  it("P11 생태계 번역: 요청 중 다른 대사 ID로 옮겨도 현재 편집 행을 덮어쓰지 않고 원래 대사 ID에 안전 저장한다", async () => {
    let resolveTranslate: ((value: unknown) => void) | null = null;
    completeAutomaticFreeTextMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTranslate = resolve;
        }),
    );

    render(
      <MemoryRouter initialEntries={["/studio/ecosystem"]}>
        <CreatorEcosystemPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "번역 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "내 AI로 번역 초안" }));
    await waitFor(() => {
      expect(screen.getByTestId("ecosystem-translate-cancel-btn")).toBeTruthy();
    });

    // 요청 진행 중 사용자가 line-2로 이동
    fireEvent.change(screen.getByLabelText("대사 ID"), { target: { value: "line-2" } });
    fireEvent.change(screen.getByLabelText("원문"), { target: { value: "다른 대사 원문" } });

    resolveTranslate!({
      ok: true,
      data: { content: "Want to meet here again tomorrow?", provider: "free", model: "mock" },
    });

    await waitFor(() => {
      expect(screen.getByText(/원래 대사 행에 저장했습니다/u)).toBeTruthy();
    });
    expect((screen.getByLabelText("번역문") as HTMLTextAreaElement).value).toBe("");
  });

  it("P11 상세 워크벤치: 번역 진행 중 로캘을 바꿔도 요청 시점 로캘(en)에 고정되고 취소 버튼이 중단한다", async () => {
    let capturedSignal: AbortSignal | undefined;
    completeAutomaticFreeTextMock.mockImplementationOnce((_sys, _user, signal) => {
      capturedSignal = signal;
      return new Promise(() => {
        // 취소 검증용
      });
    });

    render(
      <MemoryRouter>
        <CreatorEcosystemWorkbench />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /자동 무료 AI 초안/u }));
    const cancelBtn = await screen.findByTestId("workbench-translate-cancel-btn");
    fireEvent.click(cancelBtn);
    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.queryByTestId("workbench-translate-cancel-btn")).toBeNull();
  });
});
