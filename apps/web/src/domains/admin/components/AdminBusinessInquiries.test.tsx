// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminBusinessInquiries, AdminCustomerSupport } from "./AdminBusinessInquiries";
import type { SupportConversation, SupportConversationDetail } from "@toonstudio/contracts/customer-support";
import "../admin-i18n-loader";

const get = vi.hoisted(() => vi.fn<(path: string, options?: unknown) => Promise<unknown>>());
const post = vi.hoisted(() => vi.fn<(path: string, body?: unknown, options?: unknown) => Promise<unknown>>());
vi.mock("@/platform/api", () => ({
  api: { get, post },
  getApiErrorMessage: async (_cause: unknown, fallback: string) => fallback,
  httpStatus: (cause: unknown) => cause && typeof cause === "object" && "status" in cause ? cause.status : null,
}));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => {
  const bilingual = (ko: string) => ko;
  return {
  translateCurrentStaticSourceText: (_id: string, _lang: string, text: string) => text,
  formatI18nTemplate: (template: string) => template,
  // admin-ui 공용 컴포넌트(AdminSpinner·AdminNotice)가 쓰는 훅 — ko 원문을 그대로 돌려준다.
  useBilingual: () => bilingual,
  getCurrentUiLocale: () => "ko-KR",
  };
});

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  get.mockImplementation((path: string) =>
    path.includes("verifications")
      ? Promise.resolve({ items: [] })
      : Promise.resolve({ items: [], total: 0 }),
  );
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("AdminBusinessInquiries 상태 표면 (관리자 킷)", () => {
  it("로딩 중에는 킷 스피너(status)를 보여주고, 빈 결과는 킷 빈 상태로 구분한다", async () => {
    const pending = Promise.withResolvers<unknown>();
    get.mockImplementation((path: string) =>
      path.includes("verifications") ? Promise.resolve({ items: [] }) : pending.promise,
    );
    render(<AdminBusinessInquiries />);
    // 문의·인증 두 패널 모두 관리자 킷 AdminSpinner(role=status)를 렌더한다.
    expect(screen.getAllByRole("status", { name: "불러오는 중" }).length).toBeGreaterThan(0);
    pending.resolve({ items: [], total: 0 });
    // 성공했지만 비어 있는 결과는 오류가 아니라 빈 상태로 표시된다.
    expect(await screen.findByText("해당 상태의 문의가 없습니다.")).toBeTruthy();
    expect(await screen.findByText("해당 상태의 기업 인증 요청이 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("요청 실패는 빈 상태가 아니라 alert로 알린다", async () => {
    get.mockImplementation((path: string) =>
      path.includes("verifications")
        ? Promise.resolve({ items: [] })
        : Promise.reject(new Error("network down")),
    );
    render(<AdminBusinessInquiries />);
    expect(await within(screen.getByRole("region", { name: "비즈니스 문의" })).findByRole("alert")).toBeTruthy();
    expect(screen.getByText("비즈니스 문의를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByText("해당 상태의 문의가 없습니다.")).toBeNull();
  });
});

const firstConversation: SupportConversation = {
  id: "e8faf982-7caa-4fcb-bc88-03b99a3d2101",
  subject: "저장된 작업 복구 문의",
  status: "waiting",
  createdAt: "2026-10-30T00:00:00.000Z",
  updatedAt: "2026-10-30T00:01:00.000Z",
};
const secondConversation: SupportConversation = {
  ...firstConversation,
  id: "8e1bc081-992e-4d1e-bf04-21fe6ca12102",
  subject: "브러시 설정 문의",
};

function conversationDetail(conversation: SupportConversation, content = "개인 작업 복구를 도와주세요."): SupportConversationDetail {
  return {
    conversation,
    messages: [{ id: "message-1", conversationId: conversation.id, role: "user", content, createdAt: conversation.createdAt }],
  };
}

function mockSupportReads(items = [firstConversation]) {
  get.mockImplementation((path: string) => path === "/admin/support/conversations"
    ? Promise.resolve({ items, total: items.length })
    : Promise.resolve(conversationDetail(items.find((item) => path.endsWith(item.id)) ?? firstConversation)));
}

async function openFirstConversation() {
  fireEvent.click(await screen.findByRole("button", { name: /저장된 작업 복구 문의/u }));
  await screen.findByRole("textbox", { name: "상담원 답변" });
}

describe("비공개 고객 상담 관리자", () => {
  it("상담원 답변 대기 목록과 AI 대화 내역을 불러오고 답변을 보낸다", async () => {
    mockSupportReads();
    const updated = conversationDetail({ ...firstConversation, status: "open" });
    post.mockResolvedValue(updated);
    render(<AdminCustomerSupport />);
    await openFirstConversation();
    expect(get).toHaveBeenCalledWith("/admin/support/conversations", expect.objectContaining({ params: { status: "waiting", limit: 50, offset: 0 } }));
    expect(screen.getByRole("log", { name: "고객 상담 대화 내역" }).textContent).toContain("개인 작업 복구를 도와주세요.");
    expect(screen.getByRole("log").tabIndex).toBe(0);
    expect(within(screen.getByRole("log")).getByRole("list")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "상담원 답변" }), { target: { value: "버전 복구 메뉴에서 저장 이력을 확인해 주세요." } });
    fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
    expect(await screen.findByText("상담원 답변을 보냈습니다.")).toBeTruthy();
    expect(post).toHaveBeenCalledWith(`/admin/support/conversations/${firstConversation.id}/messages`, {
      content: "버전 복구 메뉴에서 저장 이력을 확인해 주세요.",
      clientMessageId: expect.stringMatching(/^[\da-f-]{36}$/u),
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect((screen.getByRole("textbox", { name: "상담원 답변" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("답변 실패 시 초안을 보존하고 같은 메시지 ID로 재시도한다", async () => {
    mockSupportReads();
    post.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(conversationDetail(firstConversation));
    render(<AdminCustomerSupport />);
    await openFirstConversation();
    const textarea = screen.getByRole("textbox", { name: "상담원 답변" });
    fireEvent.change(textarea, { target: { value: "재시도할 상담원 답변" } });
    fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((textarea as HTMLTextAreaElement).value).toBe("재시도할 상담원 답변");
    fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
    await screen.findByText("상담원 답변을 보냈습니다.");
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
  });

  it("문의 종료와 다시 열기를 서버에 요청한다", async () => {
    mockSupportReads();
    const closed = conversationDetail({ ...firstConversation, status: "closed" });
    post.mockImplementation((_path, body) => {
      const next = body && typeof body === "object" && "status" in body && body.status === "closed" ? closed : conversationDetail({ ...firstConversation, status: "open" });
      get.mockImplementation((path) => path === "/admin/support/conversations" ? Promise.resolve({ items: [next.conversation], total: 1 }) : Promise.resolve(next));
      return Promise.resolve(next);
    });
    render(<AdminCustomerSupport />);
    await openFirstConversation();
    fireEvent.click(screen.getByRole("button", { name: "문의 종료" }));
    fireEvent.click(await screen.findByRole("button", { name: "상담 다시 열기" }));
    await screen.findByRole("textbox", { name: "상담원 답변" });
    expect(post.mock.calls.map((call) => call[1])).toEqual([{ status: "closed" }, { status: "open" }]);
  });

  it("선택을 바꾸면 이전 문의의 늦은 응답을 버리고 초안을 지운다", async () => {
    const first = Promise.withResolvers<SupportConversationDetail>();
    get.mockImplementation((path) => path === "/admin/support/conversations"
      ? Promise.resolve({ items: [firstConversation, secondConversation], total: 2 })
      : path.endsWith(firstConversation.id) ? first.promise : Promise.resolve(conversationDetail(secondConversation, "두 번째 문의 내용")));
    render(<AdminCustomerSupport />);
    fireEvent.click(await screen.findByRole("button", { name: /저장된 작업 복구 문의/u }));
    fireEvent.click(screen.getByRole("button", { name: /브러시 설정 문의/u }));
    await screen.findByText("두 번째 문의 내용");
    first.resolve(conversationDetail(firstConversation, "첫 번째 문의 비공개 내용"));
    await waitFor(() => expect(screen.queryByText("첫 번째 문의 비공개 내용")).toBeNull());
    expect(screen.getByRole("log").textContent).toContain("두 번째 문의 내용");
  });

  it("현재 문의를 다시 누르면 내역과 작성 중인 답변을 유지한다", async () => {
    mockSupportReads();
    render(<AdminCustomerSupport />);
    await openFirstConversation();
    fireEvent.change(screen.getByRole("textbox", { name: "상담원 답변" }), { target: { value: "작성 중인 답변" } });
    fireEvent.click(screen.getByRole("button", { name: /저장된 작업 복구 문의/u }));
    expect(screen.getByRole("log").textContent).toContain("개인 작업 복구를 도와주세요.");
    expect((screen.getByRole("textbox", { name: "상담원 답변" }) as HTMLTextAreaElement).value).toBe("작성 중인 답변");
  });

  it.each([401, 403])("답변 도중 권한 오류 %i가 발생하면 개인정보와 입력란을 지운다", async (status) => {
    mockSupportReads();
    post.mockRejectedValue({ status });
    render(<AdminCustomerSupport />);
    await openFirstConversation();
    fireEvent.change(screen.getByRole("textbox", { name: "상담원 답변" }), { target: { value: "비공개 답변 초안" } });
    fireEvent.click(screen.getByRole("button", { name: "답변 보내기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("관리자 권한을 확인할 수 없습니다");
    expect(screen.queryByRole("log")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(firstConversation.subject)).toBeNull();
  });

  it("필터 변경 시 전체 목록을 요청하고 기존 대화를 닫는다", async () => {
    mockSupportReads();
    render(<AdminCustomerSupport />);
    await openFirstConversation();
    fireEvent.change(screen.getByRole("combobox", { name: "고객 상담 상태" }), { target: { value: "all" } });
    await waitFor(() => expect(get).toHaveBeenLastCalledWith("/admin/support/conversations", expect.objectContaining({ params: { status: undefined, limit: 50, offset: 0 } })));
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("이전·다음 페이지로 오래된 문의를 열고 필터 변경 시 첫 페이지로 돌아간다", async () => {
    get.mockResolvedValueOnce({ items: [firstConversation], total: 51 })
      .mockResolvedValueOnce({ items: [secondConversation], total: 51 })
      .mockResolvedValueOnce({ items: [firstConversation], total: 51 })
      .mockResolvedValueOnce({ items: [secondConversation], total: 51 })
      .mockResolvedValueOnce({ items: [], total: 0 });
    render(<AdminCustomerSupport />);
    await screen.findByRole("button", { name: /저장된 작업 복구 문의/u });
    fireEvent.click(screen.getByRole("button", { name: "고객 상담 다음 페이지" }));
    await screen.findByRole("button", { name: /브러시 설정 문의/u });
    expect(get).toHaveBeenLastCalledWith("/admin/support/conversations", expect.objectContaining({ params: { status: "waiting", limit: 50, offset: 50 } }));
    expect((screen.getByRole("button", { name: "고객 상담 다음 페이지" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "고객 상담 이전 페이지" }));
    await screen.findByRole("button", { name: /저장된 작업 복구 문의/u });
    expect(get).toHaveBeenLastCalledWith("/admin/support/conversations", expect.objectContaining({ params: { status: "waiting", limit: 50, offset: 0 } }));
    fireEvent.click(screen.getByRole("button", { name: "고객 상담 다음 페이지" }));
    await screen.findByRole("button", { name: /브러시 설정 문의/u });
    fireEvent.change(screen.getByRole("combobox", { name: "고객 상담 상태" }), { target: { value: "open" } });
    await screen.findByText("해당 상태의 고객 상담이 없습니다.");
    expect(get).toHaveBeenLastCalledWith("/admin/support/conversations", expect.objectContaining({ params: { status: "open", limit: 50, offset: 0 } }));
  });

  it("빈 목록과 로딩 실패를 구분하고 새로고침으로 복구한다", async () => {
    get.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ items: [], total: 0 });
    render(<AdminCustomerSupport />);
    await screen.findByRole("alert");
    expect(screen.queryByText("해당 상태의 고객 상담이 없습니다.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "고객 상담 새로고침" }));
    expect(await screen.findByText("해당 상태의 고객 상담이 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("10초마다 선택한 문의를 갱신하고 화면을 벗어나면 중단한다", async () => {
    vi.useFakeTimers();
    mockSupportReads();
    const { unmount } = render(<AdminCustomerSupport />);
    await act(async () => { await Promise.resolve(); });
    fireEvent.click(screen.getByRole("button", { name: /저장된 작업 복구 문의/u }));
    await act(async () => { await Promise.resolve(); });
    const initialReads = get.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(10_000); });
    expect(get.mock.calls.length).toBe(initialReads + 2);
    unmount();
    const finalReads = get.mock.calls.length;
    await act(async () => { vi.advanceTimersByTime(20_000); });
    expect(get.mock.calls.length).toBe(finalReads);
  });
});
