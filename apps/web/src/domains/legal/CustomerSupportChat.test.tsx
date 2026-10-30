// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportConversationDetail } from "@toonstudio/contracts/customer-support";

import { CustomerSupportChat } from "./CustomerSupportChat";

const service = vi.hoisted(() => ({
  getSupportAiStatus: vi.fn(),
  listMySupportConversations: vi.fn(),
  getSupportConversation: vi.fn(),
  createSupportConversation: vi.fn(),
  sendSupportMessage: vi.fn(),
  actOnSupportConversation: vi.fn(),
}));
const session = vi.hoisted(() => ({ status: "authenticated", id: "user-a" }));

vi.mock("./customer-support-api", () => service);
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: session.status, data: { user: { id: session.id } }, ready: true }),
}));

const conversation = {
  id: "conversation-a",
  subject: "저장 복구 문의",
  status: "ai" as const,
  createdAt: "2026-10-30T00:00:00.000Z",
  updatedAt: "2026-10-30T00:00:00.000Z",
};
const emptyDetail: SupportConversationDetail = { conversation, messages: [] };
const userMessage = { id: "message-user", conversationId: conversation.id, role: "user" as const, content: "저장이 안 돼요", createdAt: conversation.createdAt };
const answer = { id: "message-ai", conversationId: conversation.id, role: "assistant" as const, content: "버전 복구 화면을 확인해 주세요.", createdAt: conversation.createdAt };
const answeredDetail: SupportConversationDetail = { conversation, messages: [userMessage, answer] };
const renderChat = () => render(<MemoryRouter><CustomerSupportChat /></MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  session.status = "authenticated";
  session.id = "user-a";
  service.getSupportAiStatus.mockResolvedValue({ ai: { available: true, reason: "configured" } });
  service.listMySupportConversations.mockResolvedValue({ items: [], total: 0 });
  service.getSupportConversation.mockResolvedValue(emptyDetail);
  service.createSupportConversation.mockResolvedValue(emptyDetail);
  service.sendSupportMessage.mockResolvedValue(answeredDetail);
  service.actOnSupportConversation.mockResolvedValue(answeredDetail);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function startConversation() {
  await screen.findByText("아직 문의 내역이 없습니다.");
  fireEvent.change(screen.getByLabelText("문의 제목"), { target: { value: conversation.subject } });
  fireEvent.click(screen.getByRole("button", { name: "상담 시작" }));
  await screen.findByRole("log");
}

describe("비공개 고객센터", () => {
  it("로그인 전에 대화 API를 조회하지 않고 로그인 경로를 안내한다", () => {
    session.status = "unauthenticated";
    renderChat();
    expect(screen.getByRole("link", { name: "로그인하고 상담 시작하기" }).getAttribute("href")).toBe("/auth/login");
    expect(service.listMySupportConversations).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "문의 내용" })).toBeNull();
  });

  it("AI 상담을 만들고 실제 응답과 상담 이력을 표시한다", async () => {
    renderChat();
    await startConversation();
    expect(service.createSupportConversation).toHaveBeenCalledWith(conversation.subject, "ai", expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: userMessage.content } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    await screen.findByText(answer.content);
    expect(screen.getByText(userMessage.content)).toBeTruthy();
    expect(service.sendSupportMessage).toHaveBeenCalledWith(conversation.id, userMessage.content, expect.stringMatching(/^[0-9a-f-]{36}$/u), expect.any(AbortSignal));
    expect((screen.getByLabelText("문의 내용") as HTMLTextAreaElement).value).toBe("");
    expect(screen.getByRole("button", { name: /저장 복구 문의 · AI 상담 중/u }).getAttribute("aria-pressed")).toBe("true");
  });

  it("공백을 제외한 제목이 두 글자 이상일 때만 상담을 만든다", async () => {
    renderChat();
    await screen.findByText("아직 문의 내역이 없습니다.");
    const subject = screen.getByLabelText("문의 제목") as HTMLInputElement;
    const submit = screen.getByRole("button", { name: "상담 시작" }) as HTMLButtonElement;
    const form = subject.closest("form");
    if (!form) throw new Error("문의 생성 양식을 찾지 못했습니다.");
    expect(subject.minLength).toBe(2);
    for (const value of ["질", "  질  "]) {
      fireEvent.change(subject, { target: { value } });
      expect(submit.disabled).toBe(true);
      fireEvent.submit(form);
      expect(service.createSupportConversation).not.toHaveBeenCalled();
    }
    fireEvent.change(subject, { target: { value: "  문의  " } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await screen.findByRole("log");
    expect(service.createSupportConversation).toHaveBeenCalledExactlyOnceWith("문의", "ai", expect.any(AbortSignal));
  });

  it("전송 실패 시 입력을 보존하고 재전송에 같은 중복 방지 ID를 사용한다", async () => {
    service.sendSupportMessage.mockRejectedValueOnce(new Error("raw secret must not appear"));
    renderChat();
    await startConversation();
    fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: userMessage.content } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("전송 결과를 확인하지 못했어요");
    expect(alert.textContent).not.toContain("raw secret");
    expect((screen.getByLabelText("문의 내용") as HTMLTextAreaElement).value).toBe(userMessage.content);
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    await screen.findByText(answer.content);
    const first = service.sendSupportMessage.mock.calls[0];
    const second = service.sendSupportMessage.mock.calls[1];
    expect(first?.[2]).toBe(second?.[2]);
  });

  it("AI 실패를 답변 성공으로 바꾸지 않고 재시도·운영자 연결을 제공한다", async () => {
    service.sendSupportMessage.mockResolvedValue({ conversation, messages: [userMessage], aiError: { code: "SUPPORT_AI_UNAVAILABLE", message: "not displayed" } });
    renderChat();
    await startConversation();
    fireEvent.change(screen.getByLabelText("문의 내용"), { target: { value: userMessage.content } });
    fireEvent.click(screen.getByRole("button", { name: "메시지 보내기" }));
    await screen.findByText(/메시지는 저장했지만 AI 답변을 받지 못했어요/u);
    expect(screen.queryByText(answer.content)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "AI 답변 다시 요청" }));
    await screen.findByText(answer.content);
    expect(service.actOnSupportConversation).toHaveBeenCalledWith(conversation.id, "retry", expect.any(AbortSignal));
    service.actOnSupportConversation.mockResolvedValue({ ...answeredDetail, conversation: { ...conversation, status: "waiting" } });
    fireEvent.click(screen.getByRole("button", { name: "이 대화로 운영자 연결" }));
    await screen.findByText(/운영자에게 문의가 접수됐습니다/u);
    expect(service.actOnSupportConversation).toHaveBeenLastCalledWith(conversation.id, "escalate", expect.any(AbortSignal));
    expect(screen.getByText(answer.content)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI 답변 다시 요청" })).toBeNull();
  });

  it("AI가 설정되지 않았어도 운영자 1:1 문의를 만들 수 있다", async () => {
    service.getSupportAiStatus.mockResolvedValue({ ai: { available: false, reason: "missing_key" } });
    service.createSupportConversation.mockResolvedValue({ conversation: { ...conversation, status: "waiting" }, messages: [] });
    renderChat();
    await startConversation();
    expect(service.createSupportConversation).toHaveBeenCalledWith(conversation.subject, "human", expect.any(AbortSignal));
    expect(screen.getByText(/운영자에게 문의가 접수됐습니다/u)).toBeTruthy();
  });

  it("이력 조회 실패를 빈 목록으로 표시하지 않고 재시도한다", async () => {
    service.listMySupportConversations.mockRejectedValueOnce(new Error("down"));
    renderChat();
    expect((await screen.findByRole("alert")).textContent).toContain("문의 내용을 불러오지 못했어요");
    expect(screen.queryByText("아직 문의 내역이 없습니다.")).toBeNull();
    service.listMySupportConversations.mockResolvedValue({ items: [conversation], total: 1 });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    await screen.findByRole("button", { name: /저장 복구 문의 · AI 상담 중/u });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("50건보다 오래된 문의로 이동하고 선택한 대화는 계속 표시한다", async () => {
    const firstPage = [conversation, ...Array.from({ length: 49 }, (_, index) => ({
      ...conversation, id: `history-${index}`, subject: `다른 문의 ${index + 1}`,
    }))];
    const older = { ...conversation, id: "older-conversation", subject: "오래된 문의" };
    service.listMySupportConversations.mockImplementation((_signal: AbortSignal, page: { offset: number }) => Promise.resolve({
      items: page.offset === 0 ? firstPage : [older], total: 51,
    }));
    service.getSupportConversation.mockResolvedValue(answeredDetail);
    renderChat();
    fireEvent.click(await screen.findByRole("button", { name: /저장 복구 문의 · AI 상담 중/u }));
    await screen.findByText(answer.content);
    expect(screen.getByText("전체 51건 중 1–50건")).toBeTruthy();
    expect((screen.getByRole("button", { name: "이전 문의" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "다음 문의" }));
    await screen.findByRole("button", { name: /오래된 문의 · AI 상담 중/u });
    expect(service.listMySupportConversations).toHaveBeenLastCalledWith(expect.any(AbortSignal), { limit: 50, offset: 50 });
    expect(screen.getByText("전체 51건 중 51–51건")).toBeTruthy();
    expect(screen.getByText(answer.content)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /저장 복구 문의 · AI 상담 중/u })).toBeNull();
    expect((screen.getByRole("button", { name: "다음 문의" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "이전 문의" }));
    await screen.findByRole("button", { name: /저장 복구 문의 · AI 상담 중/u });
    expect(service.listMySupportConversations).toHaveBeenLastCalledWith(expect.any(AbortSignal), { limit: 50, offset: 0 });
  });

  it("종료된 문의는 읽기만 가능하며 종료 후 입력창을 제거한다", async () => {
    renderChat();
    await startConversation();
    service.actOnSupportConversation.mockResolvedValue({ ...answeredDetail, conversation: { ...conversation, status: "closed" } });
    fireEvent.click(screen.getByRole("button", { name: "문의 종료" }));
    await screen.findByText(/종료된 문의입니다/u);
    expect(screen.queryByLabelText("문의 내용")).toBeNull();
    expect(screen.queryByRole("button", { name: "이 대화로 운영자 연결" })).toBeNull();
  });

  it("로그아웃 시 이력을 제거하고 진행 중 읽기를 취소한다", async () => {
    service.listMySupportConversations.mockResolvedValue({ items: [conversation], total: 1 });
    let complete: ((value: SupportConversationDetail) => void) | undefined;
    service.getSupportConversation.mockImplementation(() => new Promise<SupportConversationDetail>((resolve) => { complete = resolve; }));
    const view = renderChat();
    fireEvent.click(await screen.findByRole("button", { name: /저장 복구 문의 · AI 상담 중/u }));
    const signal = service.getSupportConversation.mock.calls[0]?.[1] as AbortSignal;
    session.status = "unauthenticated";
    view.rerender(<MemoryRouter><CustomerSupportChat /></MemoryRouter>);
    expect(signal.aborted).toBe(true);
    await act(async () => { complete?.(answeredDetail); });
    expect(screen.queryByText(answer.content)).toBeNull();
    expect(screen.queryByText(conversation.subject)).toBeNull();
  });

  it("운영자 대화를 10초마다 갱신하고 화면 이탈 시 중지한다", async () => {
    vi.useFakeTimers();
    const waiting = { ...answeredDetail, conversation: { ...conversation, status: "waiting" as const } };
    service.listMySupportConversations.mockResolvedValue({ items: [waiting.conversation], total: 1 });
    service.getSupportConversation.mockResolvedValue(waiting);
    const view = renderChat();
    await act(async () => { await Promise.resolve(); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /저장 복구 문의 · 운영자 답변 대기/u })); });
    service.getSupportConversation.mockResolvedValue({ ...waiting, messages: [...waiting.messages, { ...answer, id: "operator-message", role: "admin", content: "복구 방법을 안내해 드릴게요." }] });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(screen.getByText("복구 방법을 안내해 드릴게요.")).toBeTruthy();
    const calls = service.getSupportConversation.mock.calls.length;
    view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(service.getSupportConversation).toHaveBeenCalledTimes(calls);
  });
});
