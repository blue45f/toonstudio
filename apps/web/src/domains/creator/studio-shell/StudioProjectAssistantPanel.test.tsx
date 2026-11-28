// @vitest-environment jsdom

import { act, cleanup, fireEvent, render as renderReact, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren, ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SessionContext, type SessionContextValue } from "@/domains/auth/public/session/auth-session-store";
import { useI18n } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";

import { consumeStudioAiProjectHandoff } from "../ai/studio-ai-project-handoff";
import { createStudioProjectDefinition } from "../studio-project-definition";
import { createStudioProject, renameStudioProject } from "../studio-project-library-store";
import {
  readStudioAssistantSessionState,
  writeStudioAssistantSessionState,
} from "./guided-flow/studio-assistant-session-store";
import { StudioProjectAssistantPanel } from "./StudioProjectAssistantPanel";

function CurrentSession({ children }: PropsWithChildren) {
  const userId = useApp((state) => state.userId);
  const session: SessionContextValue = userId
    ? { ready: true, data: { user: { id: userId } }, status: "authenticated", update: async () => null }
    : { ready: true, data: null, status: "unauthenticated", update: async () => null };
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

function render(element: ReactElement) {
  return renderReact(element, { wrapper: CurrentSession });
}

function makeCutResponse(goal: string) {
  return new Response(
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
}

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
  useApp.getState().setSessionIdentity(null, null);
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
          autoBillingDisabled: null,
          modelConfigurationError: null,
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

  it("종료된 모델은 실행을 막고 과금 상태와 일반 편집 기능을 구분해 안내한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      configured: true,
      provider: "openai",
      model: "gpt-4.1-nano",
      modelConfigurationError: "retired",
      autoBillingDisabled: null,
      setupNoticeKo: "설정된 OpenAI 모델은 제공이 종료되었습니다. 서버의 모델 설정을 확인해 주세요.",
    }), { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/studio/p/project-12/story"]}>
        <StudioProjectAssistantPanel projectId="project-12" section="story" locale="ko" fetchImpl={fetchMock} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(screen.getByTestId("openai-assist-status-badge").textContent).toContain("모델 설정 확인 필요");
    });
    expect(screen.getByTestId("openai-assist-key-notice").textContent).toContain("제공이 종료");
    expect(screen.getByTestId("openai-assist-submit-btn")).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /편집기에서 검토/u })).toHaveProperty("disabled", false);
    expect(screen.getByTestId("openai-assist-billing-notice").textContent).toContain("별도 확인이 필요");
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("서버 OpenAI 보조 결과를 사본으로 추가하고 새 응답을 다시 받으면 추가 버튼을 재활성화한다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
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
            autoBillingDisabled: null,
            modelConfigurationError: null,
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
        "서버 OpenAI 키 설정됨",
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
    const firstKey = new Headers(postInit?.headers).get("Idempotency-Key");
    expect(firstKey).toMatch(/^[a-f0-9-]{36}$/u);
    expect(new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("Idempotency-Key")).not.toBe(firstKey);
    const reEnabledAppendBtn = screen.getByRole("button", {
      name: "기획 컷 목록에 사본으로 추가",
    }) as HTMLButtonElement;
    expect(reEnabledAppendBtn.disabled).toBe(false);
  });

  it("동기 중복 클릭은 차단하고 불확실한 같은 요청만 같은 키로 재시도한다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
    const keys: (string | null)[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "GET") return Response.json({ configured: true });
      keys.push(new Headers(init?.headers).get("Idempotency-Key"));
      if (keys.length === 1) {
        fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
        throw new TypeError("응답 연결 끊김");
      }
      return Response.json({ code: "OPENAI_REQUEST_OUTCOME_UNKNOWN", message: "기존 요청의 완료 여부를 확인할 수 없습니다." }, { status: 409 });
    });
    const panel = (id: string) => <MemoryRouter>
      <StudioProjectAssistantPanel projectId={id} section="story" locale="ko" fetchImpl={fetchImpl} />
    </MemoryRouter>;
    const view = render(panel("project-a"));
    const changePrompt = (value: string) => fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value } });
    const submit = async () => {
      fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
      await screen.findByRole("alert");
    };

    changePrompt("합성 원고");
    await submit();
    expect(keys).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toContain("NETWORK_ERROR");
    changePrompt(" 합성 원고 ");
    await submit();
    expect(keys[1]).toBe(keys[0]);
    expect(screen.getByRole("alert").textContent).toContain("OPENAI_REQUEST_OUTCOME_UNKNOWN");

    changePrompt("다른 합성 원고");
    await submit();
    fireEvent.click(screen.getByTestId("openai-mode-script-to-cuts"));
    await submit();
    createStudioProject(window.localStorage, { id: "project-a", title: "합성 제목", kind: "webtoon" });
    await submit();
    renameStudioProject(window.localStorage, "project-a", "수정한 제목");
    await submit();
    createStudioProject(window.localStorage, { id: "project-b", title: "수정한 제목", kind: "webtoon" });
    view.rerender(panel("project-b"));
    fireEvent.click(screen.getByTestId("openai-mode-script-to-cuts"));
    changePrompt("다른 합성 원고");
    await submit();
    expect(keys).toHaveLength(7);
    expect(keys).not.toContain(null);
    expect(new Set(keys.slice(1)).size).toBe(6);
  });

  it("계정이 바뀌면 이전 로그인 원고와 늦은 응답을 새 계정이나 로그아웃 화면에 표시하지 않는다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
    const pending = Promise.withResolvers<Response>();
    let postCount = 0;
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "GET") return Response.json({ configured: true });
      postCount += 1;
      return postCount === 1 ? makeCutResponse("첫 계정이 받은 기존 결과") : pending.promise;
    });
    render(<MemoryRouter>
      <StudioProjectAssistantPanel projectId="project-a" section="story" locale="ko" fetchImpl={fetchImpl} />
    </MemoryRouter>);
    const input = () => screen.getByLabelText<HTMLTextAreaElement>("요청 내용");
    fireEvent.click(screen.getByTestId("openai-mode-script-to-cuts"));
    fireEvent.change(input(), { target: { value: "첫 계정의 제출 원고" } });
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    expect(await screen.findByText("첫 계정이 받은 기존 결과")).toBeTruthy();
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    await screen.findByTestId("openai-assist-cancel-btn");
    act(() => useApp.getState().setSessionIdentity("author-b", null));
    expect(input().value).not.toContain("첫 계정의 제출 원고");
    await act(async () => {
      pending.resolve(makeCutResponse("첫 계정이 기다리던 결과"));
      await pending.promise;
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByTestId("openai-assist-result-card")).toBeNull();
    act(() => useApp.getState().setSessionIdentity(null, null));
    expect(input().value).not.toContain("첫 계정의 제출 원고");
    act(() => useApp.getState().setSessionIdentity("author-a", null));
    expect(input().value).toBe("첫 계정의 제출 원고");
    expect(await screen.findByText("첫 계정이 받은 기존 결과")).toBeTruthy();
    expect(screen.queryByText("첫 계정이 기다리던 결과")).toBeNull();
  });

  it("원고 A의 응답 유실 뒤 B를 완료하고 패널을 다시 열어도 A만 같은 키로 재시도한다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
    const pending = () => readStudioAssistantSessionState("project-a", undefined, "author-a")?.pendingRequests ?? [];
    const sent: { prompt: string; key: string | null; hashBeforeSend?: string; hasUserHeader: boolean }[] = [];
    const promptA = "첫 번째 합성 원고";
    const promptB = "두 번째 합성 원고";
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "GET") return Response.json({ configured: true });
      const headers = new Headers(init?.headers);
      const key = headers.get("Idempotency-Key");
      const prompt = JSON.parse(String(init?.body)).inputText;
      sent.push({ prompt, key, hashBeforeSend: pending().find((request) => request.key === key)?.requestHash,
        hasUserHeader: headers.has("x-user-id") });
      if (sent.length === 1) throw new TypeError("응답 유실");
      return makeCutResponse(`${prompt} 결과 ${sent.length}`);
    });
    const panel = <MemoryRouter>
      <StudioProjectAssistantPanel projectId="project-a" section="story" locale="ko" fetchImpl={fetchImpl} />
    </MemoryRouter>;
    const view = render(panel);
    const submit = (value: string) => {
      fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value } });
      fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    };
    fireEvent.click(screen.getByTestId("openai-mode-script-to-cuts"));
    submit(promptA);
    expect((await screen.findByRole("alert")).textContent).toContain("NETWORK_ERROR");
    submit(promptB);
    expect(await screen.findByText(`${promptB} 결과 2`)).toBeTruthy();
    const pendingAfterB = pending().map(({ key }) => key);
    view.unmount();
    render(panel);
    expect(screen.getByLabelText<HTMLTextAreaElement>("요청 내용").value).toBe(promptB);
    submit(promptA);
    expect(await screen.findByText(`${promptA} 결과 3`)).toBeTruthy();
    expect(pending()).toHaveLength(0);
    submit(promptA);
    expect(await screen.findByText(`${promptA} 결과 4`)).toBeTruthy();

    expect(sent.map(({ prompt }) => prompt)).toEqual([promptA, promptB, promptA, promptA]);
    const keys = sent.map(({ key }) => key);
    expect(keys[2]).toBe(keys[0]);
    expect(pendingAfterB).toEqual([keys[0]]);
    expect(new Set(keys).size).toBe(3);
    expect(keys).not.toContain(null);
    expect(sent.every(({ hashBeforeSend }) => /^[a-f0-9]{64}$/u.test(hashBeforeSend ?? ""))).toBe(true);
    expect(sent.some(({ hasUserHeader }) => hasUserHeader)).toBe(false);
  });

  it("다른 계정에서 같은 원고를 요청해도 각 계정은 자신의 보류 키만 이어 쓴다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
    const keys: (string | null)[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "GET") return Response.json({ configured: true });
      keys.push(new Headers(init?.headers).get("Idempotency-Key"));
      throw new TypeError("응답 유실");
    });
    render(<MemoryRouter>
      <StudioProjectAssistantPanel projectId="project-a" section="story" locale="ko" fetchImpl={fetchImpl} />
    </MemoryRouter>);
    async function submit() {
      fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value: "두 작가가 같은 내용으로 요청" } });
      fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
      expect((await screen.findByRole("alert")).textContent).toContain("NETWORK_ERROR");
    }
    await submit();
    act(() => useApp.getState().setSessionIdentity("author-b", null));
    await submit();
    act(() => useApp.getState().setSessionIdentity("author-a", null));
    await submit();
    expect(keys).toHaveLength(3);
    expect(keys).not.toContain(null);
    expect(keys[1]).not.toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
    for (const [actor, key] of [["author-a", keys[0]], ["author-b", keys[1]]] as const) {
      const pending = readStudioAssistantSessionState("project-a", undefined, actor)?.pendingRequests ?? [];
      expect(pending.map((request) => request.key)).toEqual([key]);
    }
  });

  it("만료한 A는 새 생성 확인을 요구하고 만료 전인 B는 원래 키로 재시도한다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
    const keys: (string | null)[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "GET") return Response.json({ configured: true });
      keys.push(new Headers(init?.headers).get("Idempotency-Key"));
      throw new TypeError("응답 유실");
    });
    const panel = <MemoryRouter>
      <StudioProjectAssistantPanel projectId="project-a" section="story" locale="ko" fetchImpl={fetchImpl} />
    </MemoryRouter>;
    const first = render(panel);
    const submit = (value: string) => {
      fireEvent.change(screen.getByLabelText("요청 내용"), { target: { value } });
      fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    };
    const clock = vi.spyOn(Date, "now");
    const start = Date.now();
    try {
      clock.mockReturnValue(start);
      submit("만료할 원고");
      expect((await screen.findByRole("alert")).textContent).toContain("NETWORK_ERROR");
      clock.mockReturnValue(start + 20 * 60 * 1_000);
      submit("계속 확인할 원고");
      expect((await screen.findByRole("alert")).textContent).toContain("NETWORK_ERROR");
      first.unmount();
      clock.mockReturnValue(start + 30 * 60 * 1_000);
      render(panel);
      expect(keys).toHaveLength(2);
      submit("만료할 원고");
      expect((await screen.findByRole("alert")).textContent).toContain("OPENAI_RETRY_WINDOW_EXPIRED");
      fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
      expect(keys).toHaveLength(2);
      fireEvent.click(await screen.findByRole("button", { name: "새 요청으로 초안 생성" }));
      expect((await screen.findByRole("alert")).textContent).toContain("NETWORK_ERROR");
      submit("계속 확인할 원고");
      expect((await screen.findByRole("alert")).textContent).toContain("NETWORK_ERROR");
      expect(keys).toHaveLength(4);
      expect(keys).not.toContain(null);
      expect(keys[2]).not.toBe(keys[0]);
      expect(keys[2]).not.toBe(keys[1]);
      expect(keys[3]).toBe(keys[1]);
    } finally {
      clock.mockRestore();
    }
  });

  it("저장소가 요청 키 쓰기를 거부하면 유료 본문을 보내지 않는다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ configured: true }));
    const denied = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("storage blocked", "QuotaExceededError");
    });
    try {
      render(<MemoryRouter>
        <StudioProjectAssistantPanel projectId="project-a" section="story" locale="ko" fetchImpl={fetchImpl} />
      </MemoryRouter>);
      fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
      expect((await screen.findByRole("alert")).textContent).toContain("OPENAI_RETRY_STORAGE_UNAVAILABLE");
      expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
    } finally {
      denied.mockRestore();
    }
  });

  it("서버 쿠키 세션 확인과 스토어 동기화 후에만 유료 요청을 계정 범위에서 시작한다", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) =>
      init?.method === "GET" ? Response.json({ configured: true }) :
        Response.json({ code: "OPENAI_REQUEST_IN_PROGRESS", message: "확인 중" }, { status: 425 }));
    const update = async () => null;
    const panel = (session: SessionContextValue) => <SessionContext.Provider value={session}><MemoryRouter>
      <StudioProjectAssistantPanel projectId="project-a" section="story" locale="ko" fetchImpl={fetchImpl} />
    </MemoryRouter></SessionContext.Provider>;
    const view = renderReact(panel({ ready: false, data: null, status: "unauthenticated", update }));
    const post = () => fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    post();
    expect(screen.getByRole("alert").textContent).toContain("로그인 상태를 확인");
    view.rerender(panel({ ready: true, data: null, status: "unauthenticated", update }));
    post();
    expect(screen.getByRole("alert").textContent).toContain("먼저 로그인");
    view.rerender(panel({ ready: true, data: { user: { id: "author-a" } }, status: "authenticated", update }));
    post();
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    act(() => useApp.getState().setSessionIdentity("author-a", null));
    post();
    expect((await screen.findByRole("alert")).textContent).toContain("OPENAI_REQUEST_IN_PROGRESS");
    expect(readStudioAssistantSessionState("project-a", undefined, "author-a")?.pendingRequests).toHaveLength(1);
    expect(readStudioAssistantSessionState("project-a")?.pendingRequests ?? []).toHaveLength(0);
  });

  it("세션 만료 응답을 받으면 화면과 복원할 초안에서 이전 생성 결과를 지운다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ configured: true }))
      .mockResolvedValueOnce(makeCutResponse("만료 전 생성 결과"))
      .mockResolvedValueOnce(Response.json({ code: "OPENAI_ASSIST_LOGIN_REQUIRED", message: "다시 로그인해 주세요." }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ configured: true }));
    const panel = <MemoryRouter>
      <StudioProjectAssistantPanel projectId="project-a" section="story" locale="ko" fetchImpl={fetchImpl} />
    </MemoryRouter>;
    const view = render(panel);
    fireEvent.click(screen.getByTestId("openai-mode-script-to-cuts"));
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    expect(await screen.findByText("만료 전 생성 결과")).toBeTruthy();
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    expect((await screen.findByRole("alert")).textContent).toContain("OPENAI_ASSIST_LOGIN_REQUIRED");
    expect(screen.queryByTestId("openai-assist-result-card")).toBeNull();
    view.unmount();
    render(panel);
    expect(screen.queryByTestId("openai-assist-result-card")).toBeNull();
  });

  it("진행 중인 OpenAI 초안 요청을 사용자가 즉시 취소할 수 있고 입력한 문장은 그대로 보존된다", async () => {
    useApp.getState().setSessionIdentity("author-a", null);
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
            autoBillingDisabled: null,
            modelConfigurationError: null,
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
    fetchMock.mockResolvedValueOnce(Response.json({ code: "OPENAI_REQUEST_IN_PROGRESS", message: "처리 중인 요청입니다." }, { status: 425 }));
    fireEvent.click(screen.getByTestId("openai-assist-submit-btn"));
    expect((await screen.findByRole("alert")).textContent).toContain("OPENAI_REQUEST_IN_PROGRESS");
    const keyAt = (index: number) => new Headers(fetchMock.mock.calls[index]?.[1]?.headers).get("Idempotency-Key");
    expect(keyAt(1)).toBeTruthy();
    expect(keyAt(2)).toBe(keyAt(1));
  });
});
