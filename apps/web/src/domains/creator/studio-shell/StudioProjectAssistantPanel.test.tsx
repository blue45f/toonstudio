// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { consumeStudioAiProjectHandoff } from "../ai/studio-ai-project-handoff";
import { createStudioProjectDefinition } from "../studio-project-definition";
import { createStudioProject } from "../studio-project-library-store";
import {
  readStudioAssistantSessionState,
  writeStudioAssistantSessionState,
} from "./guided-flow/studio-assistant-session-store";
import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("StudioProjectAssistantPanel", () => {
  it("creates a one-time handoff and routes to the existing editor assistant", () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-12"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "대본을 컷으로" }));
    fireEvent.click(screen.getByRole("button", { name: /편집기에서 검토/u }));

    expect(screen.getByLabelText("location").textContent).toContain(
      "/studio/work/project-12/comic",
    );
    expect(
      consumeStudioAiProjectHandoff(window.sessionStorage, "project-12"),
    ).toMatchObject({
      tool: "composition",
      source: "story",
    });
  });

  it("does not navigate when the request is empty", () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/production"]}>
        <StudioProjectAssistantPanel
          projectId="project-12"
          section="production"
          locale="ko"
          fetchImpl={fetchMock}
        />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: /편집기에서 검토/u }));

    expect(screen.getByRole("alert").textContent).toContain("요청할 내용을 입력");
    expect(screen.getByLabelText("location").textContent).toContain(
      "/studio/p/project-12/production",
    );
    expect(window.sessionStorage.length).toBe(0);
    expect(
      consumeStudioAiProjectHandoff(window.sessionStorage, "project-12"),
    ).toBeNull();
  });

  it("작성하던 초안을 비우면 불필요한 세션 기록도 함께 정리한다", () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-12"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText("요청 내용");
    fireEvent.change(textarea, { target: { value: "임시로 적어 둔 대사 초안" } });
    expect(window.sessionStorage.length).toBe(1);

    fireEvent.change(textarea, { target: { value: "   " } });
    expect(window.sessionStorage.length).toBe(0);
  });

  it("sessionStorage getter가 거부돼도 도우미 입력과 초기화를 현재 화면에서 계속 사용한다", () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    const getter = vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("session storage blocked", "SecurityError");
    });
    try {
      const view = render(
        <MemoryRouter initialEntries={["/studio/p/project-a/story"]}>
          <StudioProjectAssistantPanel
            projectId="project-a"
            section="story"
            locale="ko"
            fetchImpl={fetchMock}
          />
        </MemoryRouter>,
      );
      const textarea = screen.getByLabelText("요청 내용") as HTMLTextAreaElement;
      const initialPrompt = textarea.value;
      fireEvent.change(textarea, { target: { value: "저장소가 막혀도 현재 화면에 남을 대사" } });
      expect(textarea.value).toBe("저장소가 막혀도 현재 화면에 남을 대사");
      expect(readStudioAssistantSessionState("project-a")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "기본 예시로 초기화" }));
      expect(textarea.value).toBe(initialPrompt);
      fireEvent.change(textarea, { target: { value: "다시 이어 쓰는 입력" } });
      expect(textarea.value).toBe("다시 이어 쓰는 입력");
      expect(getter).toHaveBeenCalled();
      view.unmount();
    } finally {
      getter.mockRestore();
    }
  });

  it("프로젝트 전환(projectId 변경) 시 이전 작품 초안이 대상 작품의 세션 저장소를 덮어쓰지 않는다", () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    writeStudioAssistantSessionState(
      "project-b",
      {
        openAiMode: "idea-remix",
        prompt: "작품 B 고유 세계관 초안",
        lastResult: null,
      },
      window.sessionStorage,
    );

    const { rerender } = render(
      <MemoryRouter initialEntries={["/studio/p/project-a/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-a"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("요청 내용"), {
      target: { value: "작품 A 전용 대사 초안" },
    });
    expect(
      readStudioAssistantSessionState("project-a", window.sessionStorage)?.prompt,
    ).toBe("작품 A 전용 대사 초안");

    rerender(
      <MemoryRouter initialEntries={["/studio/p/project-b/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-b"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    expect((screen.getByLabelText("요청 내용") as HTMLTextAreaElement).value).toBe(
      "작품 B 고유 세계관 초안",
    );
    expect(
      readStudioAssistantSessionState("project-b", window.sessionStorage)?.prompt,
    ).toBe("작품 B 고유 세계관 초안");
    expect(
      readStudioAssistantSessionState("project-a", window.sessionStorage)?.prompt,
    ).toBe("작품 A 전용 대사 초안");
  });

  it("서버에 OPENAI_API_KEY가 없을 때 솔직하게 안내하고 다른 작업은 막지 않는다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          configured: false,
          provider: "openai",
          model: "gpt-4o-mini",
          keyLocation: "server-env-only",
          storeData: false,
          piiMasking: true,
          autoBillingDisabled: true,
          modes: [],
          limits: { burstPerMinute: 5, hourlyRequests: 20, dailyRequests: 60, maxInputChars: 6000 },
          setupNoticeKo:
            "현재 서버 로컬 환경변수에 OPENAI_API_KEY가 설정되어 있지 않습니다.",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-12"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("openai-assist-key-notice").textContent).toContain(
        "OPENAI_API_KEY가 설정되어 있지 않습니다",
      );
    });
    expect(screen.getByTestId("openai-assist-status-badge").textContent).toContain(
      "서버 OpenAI 키 확인 필요",
    );
  });

  it("서버 OpenAI 보조 결과를 사본으로 추가하고 새 응답을 다시 받으면 추가 버튼을 재활성화한다", async () => {
    createStudioProject(window.localStorage, {
      id: "project-12",
      title: "네 컷 일상기",
      kind: "webtoon",
      definition: createStudioProjectDefinition({
        format: "cuttoon",
        purpose: "serial",
        startPoint: "storyboard",
        collaboration: "solo",
        primaryWorkspace: "webtoon",
        enabledWorkspaces: ["webtoon"],
        deliveryProfileIds: ["social-card-sequence"],
      }),
    });

    const makeCutResponse = (goal: string) =>
      new Response(
        JSON.stringify({
          provider: "openai",
          model: "gpt-4o-mini",
          result: {
            mode: "script-to-cuts",
            data: {
              episodeGoal: goal,
              pacingTip: "1컷과 2컷 사이 여백을 충분히 두세요.",
              cuts: [
                {
                  cutNumber: 1,
                  beatKind: "setup",
                  shotType: "와이드 샷",
                  visualAction: "빗줄기가 쏟아지는 정류장 지붕",
                  dialogue: "",
                  scrollGapHint: "보통 여백",
                },
                {
                  cutNumber: 2,
                  beatKind: "dialogue",
                  shotType: "미디엄 샷",
                  visualAction: "우산을 내미는 손",
                  dialogue: "이거 쓰고 가세요.",
                  scrollGapHint: "여백 넓게",
                },
              ],
            },
          },
          privacy: { storeData: false, piiRedactedCount: 1 },
          quota: { remainingDaily: 58, dailyLimit: 60 },
          usage: { promptTokens: 100, completionTokens: 150, totalTokens: 250 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            configured: true,
            provider: "openai",
            model: "gpt-4o-mini",
            keyLocation: "server-env-only",
            storeData: false,
            piiMasking: true,
            autoBillingDisabled: true,
            modes: [],
            limits: { burstPerMinute: 5, hourlyRequests: 20, dailyRequests: 60, maxInputChars: 6000 },
            setupNoticeKo: "연결됨",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(makeCutResponse("비 오는 날 정류장의 긴장감 형성"))
      .mockResolvedValueOnce(makeCutResponse("두 번째 대본 분할 결과"));

    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-12"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("openai-assist-status-badge").textContent).toContain(
        "OpenAI 연결됨",
      );
    });

    fireEvent.click(screen.getByTestId("openai-mode-script-to-cuts"));
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("openai-assist-result-card")).toBeTruthy();
    });

    const postInit = fetchMock.mock.calls[1]?.[1];
    expect(String(postInit?.body ?? "")).toContain('"targetPlatform":"cuttoon"');

    expect(screen.getByText(/비 오는 날 정류장의 긴장감 형성/u)).toBeTruthy();
    expect(screen.getByText(/개인정보·민감 문자열 1건 자동 마스킹/u)).toBeTruthy();

    const appendBtn = screen.getByRole("button", { name: "기획 컷 목록에 사본으로 추가" });
    fireEvent.click(appendBtn);
    expect(screen.getByRole("button", { name: "기획 컷 목록에 추가됨" })).toBeTruthy();

    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    await waitFor(() => {
      expect(screen.getByText(/두 번째 대본 분할 결과/u)).toBeTruthy();
    });
    const reEnabledAppendBtn = screen.getByRole("button", {
      name: "기획 컷 목록에 사본으로 추가",
    }) as HTMLButtonElement;
    expect(reEnabledAppendBtn.disabled).toBe(false);
  });

  it("진행 중인 OpenAI 초안 요청을 사용자가 즉시 취소할 수 있고 입력한 문장은 그대로 보존된다", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            configured: true,
            provider: "openai",
            model: "gpt-4o-mini",
            keyLocation: "server-env-only",
            storeData: false,
            piiMasking: true,
            autoBillingDisabled: true,
            modes: [],
            limits: { burstPerMinute: 5, hourlyRequests: 20, dailyRequests: 60, maxInputChars: 6000 },
            setupNoticeKo: "연결됨",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockImplementationOnce((_url, init) => {
        capturedSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      });

    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/story"]}>
        <StudioProjectAssistantPanel
          projectId="project-12"
          section="story"
          locale="ko"
          fetchImpl={fetchMock}
        />
      </MemoryRouter>,
    );

    const textarea = screen.getByLabelText("요청 내용") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "취소 후에도 남을 소중한 대사 초안" } });

    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    const cancelBtn = await screen.findByTestId("openai-assist-cancel-btn");
    fireEvent.click(cancelBtn);

    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.queryByTestId("openai-assist-cancel-btn")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(textarea.value).toBe("취소 후에도 남을 소중한 대사 초안");
    expect(screen.getByRole("status").textContent).toContain("요청을 취소했어요");
  });
});
