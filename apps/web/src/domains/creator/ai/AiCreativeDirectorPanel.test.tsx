// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiCreativeDirectorPanel } from "./AiCreativeDirectorPanel";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  complete: vi.fn(),
  signedIn: false,
  keyOrder: "none" as "fixed" | "first" | "after" | "none",
}));

vi.mock("../studio-server-ai-client", () => ({
  getStudioServerAiStatus: mocks.status,
  completeStudioServerText: mocks.complete,
  studioServerAiProviderLabel: (provider: string) => `label:${provider}`,
  studioTextKeyOrder: () => mocks.keyOrder,
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ data: mocks.signedIn ? { user: { id: "artist-1" } } : null }),
}));

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={["/studio/ai-lab"]}>
      <AiCreativeDirectorPanel />
    </MemoryRouter>,
  );
}

const configuredStatus = {
  configured: true,
  provider: "gemini",
  model: "gemini-flash",
  providers: [],
  selection: { default: "auto", order: [], fallback: false },
  capabilities: [],
  requiresAuth: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signedIn = false;
  mocks.keyOrder = "none";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AiCreativeDirectorPanel", () => {
  it("starts with the suggestion list and blocks requests with real alternatives when AI is offline", async () => {
    mocks.status.mockRejectedValue(new Error("offline"));
    renderPanel();

    expect(screen.getByRole("heading", { name: "무엇을 함께 만들까요?" })).toBeTruthy();
    const suggestions = screen.getByRole("list", { name: "제안 목록" });
    expect(within(suggestions).getAllByRole("button")).toHaveLength(5);
    expect(within(suggestions).getByRole("button", { name: /스토리 확장하기/u }).getAttribute("aria-pressed")).toBe("true");

    expect(await screen.findByText("지금은 AI 연결이 준비되지 않아 요청을 보낼 수 없어요.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/요청 내용/u), { target: { value: "비 오는 날의 첫 만남" } });
    expect(screen.getByRole("button", { name: "루나에게 요청" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("link", { name: /스토리 랩에서 직접 정리/u }).getAttribute("href")).toBe("/story-lab");

    fireEvent.click(within(suggestions).getByRole("button", { name: /장면 구도 추천/u }));
    expect(screen.getByRole("link", { name: /포즈 스튜디오에서 구도 잡기/u }).getAttribute("href")).toBe("/studio/poser");
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("sends the selected suggestion to the free AI route and shows the provider of the real answer", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.complete.mockResolvedValue({ ok: true, data: { content: "1화: 우산 아래의 만남", provider: "gemini", model: "gemini-flash" } });
    renderPanel();

    expect(await screen.findByText("ToonStudio AI 연결됨")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "예시 넣기" }));
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));

    expect(await screen.findByText("1화: 우산 아래의 만남")).toBeTruthy();
    expect(mocks.complete).toHaveBeenCalledOnce();
    const [request] = mocks.complete.mock.calls[0] as [{ task: string; system: string; user: string; operationId: string }];
    expect(request.task).toBe("scenario");
    expect(request.system).toContain("Answer in Korean.");
    expect(request.user).toContain("Request: Expand a story");
    expect(request.operationId).toMatch(/^director-[0-9a-f-]{36}$/u);
    expect(screen.getByText(/label:gemini · gemini-flash/u)).toBeTruthy();
  });

  it.each([
    [/스토리 확장하기/u, "scenario", "스토리 개요"],
    [/캐릭터 설정 분석/u, "assistant", "캐릭터 일관성"],
    [/장면 구도 추천/u, "composition", "콘티 구성"],
    [/웹툰 연출 스타일 제안/u, "assistant", "콘티 구성"],
    [/번역 & 현지화/u, "translation", "현지화 번역"],
  ] as const)("%s 요청을 제출하면 대기열에 선택한 작업 유형을 표시한다", async (suggestion, task, queueLabel) => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.complete.mockResolvedValue({ ok: true, data: { content: "검토할 초안", provider: "gemini", model: "gemini-flash" } });
    renderPanel();

    await screen.findByText("ToonStudio AI 연결됨");
    fireEvent.click(within(screen.getByRole("list", { name: "제안 목록" })).getByRole("button", { name: suggestion }));
    fireEvent.click(screen.getByRole("button", { name: "예시 넣기" }));
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));

    await screen.findByText("검토할 초안");
    expect(mocks.complete).toHaveBeenCalledWith(expect.objectContaining({ task }), expect.any(AbortSignal));
    const queue = screen.getByRole("region", { name: "AI 생성 검토 대기열" });
    expect(within(queue).getByText(queueLabel)).toBeTruthy();
  });

  it("copies the approved job's own draft even after a newer answer arrives", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.complete
      .mockResolvedValueOnce({ ok: true, data: { content: "첫 번째 제안", provider: "gemini", model: "gemini-flash" } })
      .mockResolvedValueOnce({ ok: true, data: { content: "두 번째 제안", provider: "gemini", model: "gemini-flash" } });
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", new Proxy(navigator, { get: (target, key) => key === "clipboard" ? { writeText } : Reflect.get(target, key, target) }));
    renderPanel();

    await screen.findByText("ToonStudio AI 연결됨");
    const input = screen.getByLabelText(/요청 내용/u);
    fireEvent.change(input, { target: { value: "첫 번째 요청" } });
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));
    await screen.findByText("첫 번째 제안");

    fireEvent.change(input, { target: { value: "두 번째 요청" } });
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));
    await screen.findByText("두 번째 제안");

    const row = within(screen.getByRole("region", { name: "AI 생성 검토 대기열" })).getByText("첫 번째 요청").closest("li");
    const newerRow = within(screen.getByRole("region", { name: "AI 생성 검토 대기열" })).getByText("두 번째 요청").closest("li");
    if (!row || !newerRow) throw new Error("두 작업이 대기열에 없습니다.");
    fireEvent.click(within(newerRow).getByRole("button", { name: "결과 승인" }));
    fireEvent.click(within(row).getByRole("button", { name: "결과 승인" }));
    fireEvent.click(within(row).getByRole("button", { name: /클립보드에 복사|사본으로 적용/u }));
    await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith("첫 번째 제안"));
    expect(await within(row).findByText("복사 완료")).toBeTruthy();
    expect(newerRow.dataset.status).toBe("approved");
    expect(screen.queryByText(/새 사본 레이어/u)).toBeNull();
  });

  it("keeps an approved draft retryable when the clipboard rejects the write", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.complete.mockResolvedValue({ ok: true, data: { content: "유지할 제안", provider: "gemini", model: "gemini-flash" } });
    const writeText = vi.fn().mockRejectedValueOnce(new DOMException("denied", "NotAllowedError")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", new Proxy(navigator, { get: (target, key) => key === "clipboard" ? { writeText } : Reflect.get(target, key, target) }));
    renderPanel();

    await screen.findByText("ToonStudio AI 연결됨");
    fireEvent.change(screen.getByLabelText(/요청 내용/u), { target: { value: "유지할 요청" } });
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));
    await screen.findByText("유지할 제안");

    const row = within(screen.getByRole("region", { name: "AI 생성 검토 대기열" })).getByText("유지할 요청").closest("li");
    if (!row) throw new Error("작업이 대기열에 없습니다.");
    fireEvent.click(within(row).getByRole("button", { name: "결과 승인" }));
    fireEvent.click(within(row).getByRole("button", { name: /클립보드에 복사|사본으로 적용/u }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(row.dataset.status).toBe("approved");
    expect((await screen.findByRole("alert")).textContent).toContain("결과를 복사하지 못했어요.");
    expect(within(row).queryByText("복사 완료")).toBeNull();

    fireEvent.click(within(row).getByRole("button", { name: /클립보드에 복사|사본으로 적용/u }));
    expect(await within(row).findByText("복사 완료")).toBeTruthy();
    expect(mocks.complete).toHaveBeenCalledOnce();
  });

  it("shows the failure honestly without inventing a result", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.complete.mockResolvedValue({ ok: false, code: "free_exhausted", error: "무료 한도가 모두 소진됐어요." });
    renderPanel();

    await screen.findByText("ToonStudio AI 연결됨");
    fireEvent.change(screen.getByLabelText(/요청 내용/u), { target: { value: "서아린, 17세" } });
    fireEvent.click(screen.getByRole("button", { name: "루나에게 요청" }));

    const failure = await screen.findByText("무료 한도가 모두 소진됐어요.");
    expect(failure.closest('[role="alert"]')).toBeTruthy();
    const queue = screen.getByRole("region", { name: "AI 생성 검토 대기열" });
    expect(within(queue).getByRole("alert").textContent).toContain("오류 (AI_ERROR): 무료 한도가 모두 소진됐어요.");
    await waitFor(() => expect(screen.queryByRole("heading", { name: /루나의 제안/u })).toBeNull());
  });

  it("says the registered key is used first when it runs before ToonStudio AI", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.keyOrder = "first";
    renderPanel();

    const badge = await screen.findByText("내 키 먼저 사용");
    expect(screen.queryByText("ToonStudio AI 연결됨")).toBeNull();
    // 내 키가 먼저 답하므로 서버 모델을 배지 설명으로 내세우지 않는다.
    expect(badge.closest("[title]")).toBeNull();
  });

  it("says only the fixed key is used in the single fixed mode, which never hands off to ToonStudio AI", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.keyOrder = "fixed";
    renderPanel();

    const badge = await screen.findByText("고정: 내 키");
    expect(screen.queryByText("내 키 먼저 사용")).toBeNull();
    expect(screen.queryByText("ToonStudio AI 연결됨")).toBeNull();
    expect(badge.closest("[title]")).toBeNull();
  });

  it("keeps the ToonStudio AI badge and its model when the custom order puts ToonStudio AI before my keys", async () => {
    mocks.status.mockResolvedValue(configuredStatus);
    mocks.keyOrder = "after";
    renderPanel();

    const badge = await screen.findByText("ToonStudio AI 연결됨");
    expect(badge.closest("[title]")?.getAttribute("title")).toBe("gemini-flash");
  });

  it("asks guests to sign in when the free pool requires an account", async () => {
    mocks.status.mockResolvedValue({ ...configuredStatus, requiresAuth: true });
    renderPanel();

    expect(await screen.findByText("로그인하면 자동 무료 AI로 바로 요청할 수 있어요.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인" }).getAttribute("href")).toBe("/auth/login");
  });
});
