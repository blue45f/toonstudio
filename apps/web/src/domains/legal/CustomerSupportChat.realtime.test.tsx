// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CustomerSupportChat } from "./CustomerSupportChat";

const service = vi.hoisted(() => ({
  getSupportAiStatus: vi.fn(),
  listMySupportConversations: vi.fn(),
  getSupportConversation: vi.fn(),
  createSupportConversation: vi.fn(),
  sendSupportMessage: vi.fn(),
  actOnSupportConversation: vi.fn(),
}));

vi.mock("./customer-support-api", () => service);
vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: "user-rt" } }, ready: true }),
}));

const conversation = {
  id: "conv-rt",
  subject: "원고 자동저장 복구 문의",
  status: "waiting" as const,
  createdAt: "2026-11-19T00:00:00.000Z",
  updatedAt: "2026-11-19T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  service.getSupportAiStatus.mockResolvedValue({ ai: { available: true, reason: "configured" } });
  service.listMySupportConversations.mockResolvedValue({ items: [], total: 0 });
  service.createSupportConversation.mockResolvedValue({ conversation, messages: [] });
});

afterEach(cleanup);

describe("CustomerSupportChat 실시간·자가진단 고도화", () => {
  it("빠른 문의 주제 클릭으로 제목을 채우고 1:1 실시간 동기화 배지와 AI 자가진단을 표시한다", async () => {
    render(
      <MemoryRouter>
        <CustomerSupportChat />
      </MemoryRouter>,
    );

    await screen.findByText("아직 문의 내역이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "원고/OPFS 저장 복구" }));
    expect((screen.getByLabelText("문의 제목") as HTMLInputElement).value).toBe("원고 자동저장 복구 문의");

    fireEvent.click(screen.getByRole("button", { name: "상담 시작" }));
    await screen.findByText("1:1 실시간 동기화");

    fireEvent.change(screen.getByLabelText("문의 내용"), {
      target: { value: "OPFS 저장 복구가 필요해요" },
    });
    expect(screen.getByLabelText("AI 자가진단 가이드")).toBeTruthy();
  });
});
