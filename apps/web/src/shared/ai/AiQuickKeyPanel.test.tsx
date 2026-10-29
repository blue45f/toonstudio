// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiQuickKeyPanel } from "./AiQuickKeyPanel";
import { getUserAiSnapshot, lockUserAi } from "./user-ai-store";
import { userAiRoutingSettings } from "./user-ai-types";

import type { FreeAiPoolStatus } from "./free-ai-pool-status";

// 실제 키가 아니라 형식만 맞춘 가짜 값이다.
const GEMINI = `AIza${"A".repeat(35)}`;
const GROQ = `gsk_${"b".repeat(52)}`;
const CLAUDE = `sk-ant-api03-${"c".repeat(40)}`;

const POOL: FreeAiPoolStatus = {
  configured: true,
  provider: "anthropic",
  model: "claude-opus-5-5",
  providers: [],
  selection: { default: "auto", order: ["anthropic", "gemini"], fallback: true },
  requiresAuth: true,
  premium: { configured: true, automatic: true, model: "claude-opus-5-5", userDailyRequestLimit: 30 },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function pasteInto(input: HTMLElement, text: string) {
  fireEvent.paste(input, { clipboardData: { getData: () => text } });
}

function renderPanel(onOpenAdvancedWizard = vi.fn()) {
  render(<AiQuickKeyPanel poolStatus={POOL} onOpenAdvancedWizard={onOpenAdvancedWizard} />);
  return { input: screen.getByLabelText("API 키 붙여넣기"), onOpenAdvancedWizard };
}

describe("AiQuickKeyPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
  });

  afterEach(() => {
    cleanup();
    lockUserAi(false);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("키 없이도 ToonStudio AI가 이어서 처리한다는 순서를 먼저 보여 준다", () => {
    renderPanel();
    const flow = screen.getByText("지금 AI는 이렇게 동작해요").closest("div") as HTMLElement;
    expect(within(flow).getByText("등록한 키가 없으면 건너뛰어요.")).toBeTruthy();
    expect(within(flow).getByText(/고성능 AI\(하루 30회까지\) → 무료 AI/u)).toBeTruthy();
  });

  it("서버 상태를 확인하지 못하면 '확인하는 중'에 머물지 않고 다음 행동을 알려 준다", () => {
    const { rerender } = render(<AiQuickKeyPanel poolStatus={null} onOpenAdvancedWizard={vi.fn()} />);
    const flow = screen.getByText("지금 AI는 이렇게 동작해요").closest("div") as HTMLElement;
    expect(within(flow).getByText("상태를 확인하는 중이에요.")).toBeTruthy();

    rerender(<AiQuickKeyPanel poolStatus={null} poolCheckFailed onOpenAdvancedWizard={vi.fn()} />);
    expect(within(flow).queryByText("상태를 확인하는 중이에요.")).toBeNull();
    expect(within(flow).getByText(/지금은 상태를 확인하지 못했어요/u)).toBeTruthy();
  });

  it("여러 키를 한 번에 붙여 넣으면 서비스를 알아보고 입력란에는 남기지 않는다", () => {
    const { input } = renderPanel();
    pasteInto(input, `${GEMINI}\n${GROQ}`);

    expect((input as HTMLInputElement).value).toBe("");
    const pending = screen.getByRole("list", { name: "등록할 키" });
    expect(within(pending).getByText("Google Gemini 키예요")).toBeTruthy();
    expect(within(pending).getByText("Groq 키예요")).toBeTruthy();
    // 가린 표기만 보인다.
    expect(within(pending).getByText("AIza…AAAA")).toBeTruthy();
    expect(pending.textContent).not.toContain(GROQ);
    expect(screen.getByRole("button", { name: "키 2개 등록" })).toBeTruthy();
  });

  it("모델 목록으로 키를 확인한 뒤 등록하고, 같은 서비스 키는 한 연결에 쌓는다", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("https://generativelanguage.googleapis.com/")) {
        return json({ data: [{ id: "models/gemini-2.5-flash" }, { id: "models/gemini-3.8-flash" }] });
      }
      return json({ data: [{ id: "openai/gpt-oss-120b" }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { input } = renderPanel();
    pasteInto(input, `${GEMINI}\n${GROQ}\ngsk_${"z".repeat(52)}`);
    fireEvent.click(screen.getByRole("button", { name: "키 3개 등록" }));

    expect(await screen.findByText("Google Gemini 키를 확인하고 등록했어요.")).toBeTruthy();
    expect(screen.getAllByText("Groq 키를 확인하고 등록했어요.")).toHaveLength(2);
    const { configuration } = getUserAiSnapshot();
    expect(configuration.connections.map((item) => item.label)).toEqual(["Google Gemini", "Groq"]);
    expect(configuration.connections[0]?.textModel).toBe("gemini-3.8-flash");
    expect(configuration.connections[1]?.apiKeys).toHaveLength(2);
    expect(screen.queryByRole("list", { name: "등록할 키" })).toBeNull();
    // 등록한 키 목록에도 가린 표기로만 보인다.
    const registered = screen.getByRole("list", { name: "등록한 키" });
    expect(registered.textContent).not.toContain(GEMINI);
  });

  it("공급자가 키를 거절하면 등록하지 않고 이유를 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "invalid" }, 401)));
    const { input } = renderPanel();
    pasteInto(input, GROQ);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(await screen.findByText(/Groq 키가 거절됐어요/u)).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
  });

  it("브라우저에서 확인하지 못한 키는 등록하되 그 사실을 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const { input } = renderPanel();
    pasteInto(input, GROQ);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(await screen.findByText(/Groq 키를 등록했어요\. 브라우저에서 서비스에 바로 닿지 못했어요/u)).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections[0]?.textModel).toBe("openai/gpt-oss-120b");
  });

  it("유료 서비스 키는 비용 청구를 확인해야 등록할 수 있다", () => {
    const { input } = renderPanel();
    pasteInto(input, CLAUDE);

    const register = screen.getByRole("button", { name: "등록" }) as HTMLButtonElement;
    expect(within(screen.getByRole("list", { name: "등록할 키" })).getByText("유료")).toBeTruthy();
    expect(register.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(register.disabled).toBe(false);
  });

  it("형식이 겹치는 키는 서비스를 고르기 전까지 등록하지 않는다", () => {
    const { input } = renderPanel();
    pasteInto(input, `sk-${"a1".repeat(16)}`);

    const register = screen.getByRole("button", { name: "등록" }) as HTMLButtonElement;
    expect(register.disabled).toBe(true);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "deepseek" } });
    // DeepSeek은 유료라 비용 확인까지 해야 한다.
    expect(register.disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(register.disabled).toBe(false);
  });

  it("키로 보이지 않는 글은 받지 않고 이유를 알린다", () => {
    const { input } = renderPanel();
    pasteInto(input, "hello");
    expect(screen.getByText(/API 키로 보이지 않아요/u)).toBeTruthy();
  });

  it("등록한 키를 지우면 목록과 보관함에서 함께 빠진다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [] })));
    const { input } = renderPanel();
    pasteInto(input, GROQ);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText("Groq 키를 확인하고 등록했어요.");
    expect(userAiRoutingSettings(getUserAiSnapshot().configuration).allowPaidFallback).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Groq 키 1 삭제" }));

    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "등록한 키" })).toBeNull();
  });

  it("목록에 없는 서비스는 직접 연결 마법사로 보낸다", () => {
    const { onOpenAdvancedWizard } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "목록에 없는 서비스 직접 연결" }));
    expect(onOpenAdvancedWizard).toHaveBeenCalledTimes(1);
  });
});
