// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiQuickKeyPanel } from "./AiQuickKeyPanel";
import { addQuickKey } from "./ai-quick-key";
import { getUserAiSnapshot, lockUserAi, setUserAiConfiguration, userAiConnectionsForCapability } from "./user-ai-store";
import { EMPTY_AI_CONFIGURATION, userAiRoutingSettings, withPaidAutoUseChoice } from "./user-ai-types";

import type { FreeAiPoolStatus } from "./free-ai-pool-status";

// 실제 키가 아니라 형식만 맞춘 가짜 값이다.
const GEMINI = `AIza${"A".repeat(35)}`;
const GROQ = `gsk_${"b".repeat(52)}`;
const CLAUDE = `sk-ant-api03-${"c".repeat(40)}`;
const OPENAI = `sk-proj-${"p".repeat(48)}`;

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

  it("브라우저에서 서비스에 닿지 못한 키는 등록하지 않는다(실제 사용 때도 닿지 못해 텍스트 AI 전체를 막는다)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const { input } = renderPanel();
    pasteInto(input, GROQ);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(await screen.findByText(/브라우저에서 Groq에 연결하지 못해 등록하지 않았어요/u)).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
  });

  it("서비스가 다른 오류로 답해 확인만 못 한 키는 등록하되 그 사실을 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "unavailable" }, 503)));
    const { input } = renderPanel();
    pasteInto(input, GROQ);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(await screen.findByText(/Groq 키를 등록했어요\. 서비스가 HTTP 503로 답했어요/u)).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections[0]?.textModel).toBe("openai/gpt-oss-120b");
  });

  it("모델 목록 요청에 400으로 답한 키(Gemini·xAI의 잘못된 키)는 거절된 키로 보고 등록하지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: { message: "API key not valid" } }, 400)));
    const { input } = renderPanel();
    pasteInto(input, GEMINI);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    expect(await screen.findByText(/Google Gemini 키가 거절됐어요/u)).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
  });

  it("여러 서비스가 함께 쓰는 형식(32자 영숫자)은 서비스를 고르기 전까지 어느 곳으로도 보내지 않는다", () => {
    const { input } = renderPanel();
    pasteInto(input, "abcdEFGH1234abcdEFGH1234abcdEFGH");

    const pending = screen.getByRole("list", { name: "등록할 키" });
    expect(within(pending).getByText("어느 서비스 키인가요?")).toBeTruthy();
    expect((screen.getByRole("button", { name: "등록" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("유료 서비스 키는 비용 청구를 확인해야 등록할 수 있다", () => {
    const { input } = renderPanel();
    pasteInto(input, CLAUDE);

    const register = screen.getByRole("button", { name: "등록" }) as HTMLButtonElement;
    expect(within(screen.getByRole("list", { name: "등록할 키" })).getByText("유료")).toBeTruthy();
    expect(register.disabled).toBe(true);
    // 동의하면 바뀌는 설정과 되돌리는 곳을 함께 알린다.
    const consent = screen.getByRole("checkbox").closest("label") as HTMLElement;
    expect(consent.textContent).toContain("“내 유료 키를 먼저 사용”으로 바뀌어");
    expect(consent.textContent).toContain("설정에서 언제든 바꿀 수 있어요.");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(register.disabled).toBe(false);
  });

  it("키를 확인하는 동안에는 서비스 선택을 바꿀 수 없다", async () => {
    let release: (response: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      release = resolve;
    })));
    const { input } = renderPanel();
    // SiliconFlow·OpenAI가 함께 쓰는 형식이라 서비스를 고른 뒤에도 선택 목록이 남는다.
    pasteInto(input, `sk-${"q".repeat(44)}`);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "siliconflow" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await screen.findByRole("button", { name: "키 확인 중…" });
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    release(json({ data: [{ id: "Qwen/Qwen3-235B-A22B" }] }));
    await screen.findByText(/SiliconFlow 키를 (확인하고 )?등록했어요/u);
  });

  it("유료 키를 '먼저 쓴다'에 동의하고 등록하면 유료 키 먼저가 켜지고, 함께 먼저 쓰게 될 기존 유료 키를 미리 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ id: "claude-opus-5-5" }] })));
    const { input } = renderPanel();
    pasteInto(input, CLAUDE);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText(/키를 확인하고 등록했어요/u);
    const routing = userAiRoutingSettings(getUserAiSnapshot().configuration);
    expect(routing.allowPaidFallback).toBe(true);
    expect(routing.preferPaidKeys).toBe(true);
  });

  it("유료 키 동의 문구는 이번 동의로 순서가 바뀌는(이미 자동 사용에 동의한) 유료 키만 함께 알린다", () => {
    // Claude는 "무료 경로가 끝나면 사용"으로 동의해 두었고, DeepSeek은 동의 없이(대화상자용으로) 연결해 둔 상태.
    const claude = addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE, { allowPaid: true });
    const deepseek = addQuickKey(claude.configuration, "deepseek", `sk-${"d".repeat(32)}`);
    setUserAiConfiguration({
      ...deepseek.configuration,
      routing: { ...userAiRoutingSettings(deepseek.configuration), preferPaidKeys: false },
    });
    const { input } = renderPanel();
    pasteInto(input, `sk-proj-${"p".repeat(48)}`);

    const consent = screen.getByRole("checkbox").closest("label") as HTMLElement;
    expect(consent.textContent).toContain("이미 등록한 유료 키(Claude)도 함께 먼저 써요.");
    expect(consent.textContent).not.toContain("DeepSeek");
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

  it("결과 알림은 처음부터 있는 알림 영역 안의 목록으로 보여 준다", () => {
    const { input } = renderPanel();
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    pasteInto(input, "hello");
    expect(within(within(status).getByRole("list")).getByRole("listitem").textContent).toMatch(/API 키로 보이지 않아요/u);
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

    fireEvent.click(screen.getByRole("button", { name: "Groq 키 1 gsk_…bbbb 삭제" }));

    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
    expect(screen.queryByRole("list", { name: "등록한 키" })).toBeNull();
  });

  it("이미 등록한 키를 다시 붙여 넣으면 확인 요청 없이 바로 알리고, 새 키만 목록에 넣는다", async () => {
    const fetchMock = vi.fn(async () => json({ data: [{ id: "openai/gpt-oss-120b" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const { input } = renderPanel();
    pasteInto(input, GROQ);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText("Groq 키를 확인하고 등록했어요.");
    const calls = fetchMock.mock.calls.length;

    pasteInto(input, GROQ);
    expect(screen.getByText("이미 등록한 키예요. 다시 등록하지 않아도 돼요.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "등록할 키" })).toBeNull();

    pasteInto(input, `${GROQ}\n${GEMINI}`);
    expect(screen.getByText("이미 등록한 키 1개는 빼고 목록에 넣었어요.")).toBeTruthy();
    const pending = screen.getByRole("list", { name: "등록할 키" });
    expect(within(pending).getByText("Google Gemini 키예요")).toBeTruthy();
    expect(within(pending).queryByText("Groq 키예요")).toBeNull();
    // 붙여 넣기만으로는 공급자에 아무것도 보내지 않는다.
    expect(fetchMock.mock.calls.length).toBe(calls);
  });

  it("꺼 둔 키를 다시 붙여 넣으면 목록에 넣고, 등록하면 새로 만들지 않고 다시 켠다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ id: "openai/gpt-oss-120b" }] })));
    const { input } = renderPanel();
    pasteInto(input, GROQ);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText("Groq 키를 확인하고 등록했어요.");
    // 고급 설정에서 이 연결을 꺼 둔 상태.
    const registered = getUserAiSnapshot().configuration;
    act(() => {
      setUserAiConfiguration({ ...registered, connections: registered.connections.map((item) => ({ ...item, enabled: false })) });
    });
    // 꺼 둔 키는 먼저 쓰는 키로 세지 않고, 목록에는 꺼짐으로 남는다.
    const flow = screen.getByText("지금 AI는 이렇게 동작해요").closest("div") as HTMLElement;
    expect(within(flow).getByText(/지금 먼저 쓰는 키가 없어요/u)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "등록한 키" })).getByText("꺼짐")).toBeTruthy();

    pasteInto(input, GROQ);
    expect(screen.queryByText("이미 등록한 키예요. 다시 등록하지 않아도 돼요.")).toBeNull();
    expect(within(screen.getByRole("list", { name: "등록할 키" })).getByText("Groq 키예요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText("꺼 두었던 Groq 키를 확인하고 다시 켰어요.");
    const connections = getUserAiSnapshot().configuration.connections;
    expect(connections).toHaveLength(1);
    expect(connections[0]?.enabled).toBe(true);
    expect(within(flow).getByText("등록한 키 1개를 먼저 써요.")).toBeTruthy();
  });

  it("먼저 쓰기로 하지 않은 유료 키는 '먼저 쓰는 키'로 세지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ id: "claude-opus-5-5" }] })));
    const { input } = renderPanel();
    pasteInto(input, CLAUDE);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText(/키를 확인하고 등록했어요/u);
    const flow = screen.getByText("지금 AI는 이렇게 동작해요").closest("div") as HTMLElement;
    expect(within(flow).getByText("등록한 키 1개를 먼저 써요.")).toBeTruthy();

    // 설정에서 "무료 경로가 끝나면 사용"으로 바꾸면 이 유료 키는 ToonStudio AI 다음에 쓴다.
    const current = getUserAiSnapshot().configuration;
    act(() => {
      setUserAiConfiguration({ ...current, routing: { ...userAiRoutingSettings(current), preferPaidKeys: false } });
    });
    expect(within(flow).getByText(/지금 먼저 쓰는 키가 없어요/u)).toBeTruthy();
  });

  it("'하나만 고정'에서는 고른 키만 쓰고 ToonStudio AI로 넘기지 않는다고 알린다", () => {
    const groq = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    setUserAiConfiguration({ ...groq.configuration, routing: { ...userAiRoutingSettings(groq.configuration), mode: "manual" } });
    renderPanel();

    const flow = screen.getByText("지금 AI는 이렇게 동작해요").closest("div") as HTMLElement;
    expect(within(flow).getByText("“하나만 고정”으로 고른 키만 써요. ToonStudio AI로 넘기지 않아요.")).toBeTruthy();
    expect(within(flow).getByText(/“하나만 고정”을 쓰는 동안은 쓰지 않아요/u)).toBeTruthy();
    expect(within(flow).queryByText(/먼저 써요/u)).toBeNull();
  });

  it("'내가 정한 순서'에서 ToonStudio AI를 앞에 두면 내 키를 그다음에 쓴다고 알린다", () => {
    const groq = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    setUserAiConfiguration({
      ...groq.configuration,
      routing: { ...userAiRoutingSettings(groq.configuration), mode: "priority", managedPoolPriority: 1 },
    });
    renderPanel();

    const flow = screen.getByText("지금 AI는 이렇게 동작해요").closest("div") as HTMLElement;
    expect(within(flow).getByText("“내가 정한 순서”에 따라 ToonStudio AI 다음에 등록한 키 1개를 써요.")).toBeTruthy();
    expect(within(flow).queryByText("등록한 키 1개를 먼저 써요.")).toBeNull();
  });

  it("'하나만 고정'으로 다른 키를 고정해 두었으면, 유료 키 동의 문구가 이 키를 먼저 쓴다고 하지 않는다", () => {
    const groq = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    setUserAiConfiguration({ ...groq.configuration, routing: { ...userAiRoutingSettings(groq.configuration), mode: "manual" } });
    const { input } = renderPanel();
    pasteInto(input, `sk-proj-${"p".repeat(48)}`);

    const consent = screen.getByRole("checkbox").closest("label") as HTMLElement;
    expect(consent.textContent).toContain("지금은 “하나만 고정”이라 고정한 키만 쓰고, 이 키는 고정할 키로 고를 때 써요.");
    expect(consent.textContent).not.toContain("AI 기능이 이 키를 먼저 써요.");
  });

  it("'하나만 고정'인데 고정한 키가 없을 때 무료 키와 유료 키를 함께 붙이면, 유료 키를 고정해 쓴다고 하지 않는다", async () => {
    setUserAiConfiguration({ ...EMPTY_AI_CONFIGURATION, routing: { ...userAiRoutingSettings(EMPTY_AI_CONFIGURATION), mode: "manual" } });
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [] })));
    const { input } = renderPanel();
    pasteInto(input, `${GROQ}\n${OPENAI}`);

    // 먼저 붙인 무료 키(Groq)가 고정 키가 되고, 유료 키(OpenAI)는 고정할 키로 고를 때만 쓴다.
    const consent = screen.getByRole("checkbox").closest("label") as HTMLElement;
    expect(consent.textContent).toContain("지금은 “하나만 고정”이라 고정한 키만 쓰고, 이 키는 고정할 키로 고를 때 써요.");
    expect(consent.textContent).not.toContain("“하나만 고정”으로 이 키를 써요.");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "키 2개 등록" }));
    await screen.findByText("OpenAI 키를 확인하고 등록했어요.");
    expect(getUserAiSnapshot().configuration.assignments.text).toBe("quick-groq");
  });

  it("같은 서비스 연결이 둘이어도(동의 분리) 키 삭제 버튼의 이름이 서로 달라 어느 키를 지우는지 알 수 있다", () => {
    const openaiA = `sk-proj-${"a".repeat(48)}`;
    const openaiC = `sk-proj-${"c".repeat(48)}`;
    // 설정에서 "자동으로 사용하지 않음"을 고르면 동의가 지워지고, 그다음 동의와 함께 붙인 키는 따로 연결로 들어간다.
    const optedOut = withPaidAutoUseChoice(
      addQuickKey(EMPTY_AI_CONFIGURATION, "openai", openaiA, { allowPaid: true }).configuration,
      { allowPaidFallback: false, preferPaidKeys: false },
    );
    setUserAiConfiguration(addQuickKey(optedOut, "openai", openaiC, { allowPaid: true }).configuration);
    renderPanel();

    expect(getUserAiSnapshot().configuration.connections).toHaveLength(2);
    const names = screen.getAllByRole("button", { name: /삭제$/u }).map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual(["OpenAI 키 1 sk-p…aaaa 삭제", "OpenAI 키 1 sk-p…cccc 삭제"]);
  });

  it("대화상자용으로 연결한(동의하지 않은) 같은 서비스 키는 이번 동의로 자동 사용에 들지 않으므로 동의 문구에 적지 않는다", async () => {
    // AI 보조 카드처럼 비용 동의 없이 연결한 Claude 키.
    setUserAiConfiguration(addQuickKey(EMPTY_AI_CONFIGURATION, "anthropic", CLAUDE).configuration);
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [{ id: "claude-opus-5-5" }] })));
    const { input } = renderPanel();
    const second = `sk-ant-api03-${"s".repeat(40)}`;
    pasteInto(input, second);

    const consent = screen.getByRole("checkbox").closest("label") as HTMLElement;
    expect(consent.textContent).toContain("AI 기능이 이 키를 먼저 써요.");
    expect(consent.textContent).not.toContain("이미 등록한 유료 키");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await screen.findByText(/키를 확인하고 등록했어요/u);

    // 대화상자용 키의 연결에는 자동 사용 동의가 생기지 않는다.
    const connections = getUserAiSnapshot().configuration.connections;
    expect(connections.find((item) => item.apiKey === CLAUDE)?.paidAutoUse).not.toBe(true);
    expect(connections.find((item) => item.apiKey === second)?.paidAutoUse).toBe(true);
  });

  it("'하나만 고정'으로 고정한 키의 연결을 꺼 둔 뒤 같은 서비스 키를 붙여도 등록되고, 고정 경로가 붙인 키를 쓴다", async () => {
    const groq = addQuickKey(EMPTY_AI_CONFIGURATION, "groq", GROQ);
    const connection = groq.configuration.connections[0]!;
    setUserAiConfiguration({
      ...groq.configuration,
      connections: [{ ...connection, enabled: false }],
      routeAssignments: { ...groq.configuration.routeAssignments!, text: { connectionId: connection.id, apiKeyId: "key-1", modelId: "text-1" } },
      routing: { ...userAiRoutingSettings(groq.configuration), mode: "manual" },
    });
    vi.stubGlobal("fetch", vi.fn(async () => json({ data: [] })));
    const { input } = renderPanel();
    const second = `gsk_${"q".repeat(52)}`;
    pasteInto(input, second);
    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await screen.findByText("Groq 키를 확인하고 등록했어요.");
    expect(userAiConnectionsForCapability("text").map((route) => route.apiKey)).toEqual([second]);
  });

  it("목록에 없는 서비스는 직접 연결 마법사로 보낸다", () => {
    const { onOpenAdvancedWizard } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "목록에 없는 서비스 직접 연결" }));
    expect(onOpenAdvancedWizard).toHaveBeenCalledTimes(1);
  });
});
