// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as freeAiPoolStatus from "./free-ai-pool-status";
import { guardFreeAiRuntimeRequest, resetFreeAiRuntimeBudget } from "./free-ai-runtime-budget";
import { getUserAiSnapshot, lockUserAi, setUserAiConfiguration, userAiConnectionsForCapability } from "./user-ai-store";
import { EMPTY_AI_CONNECTION, userAiRoutingSettings, type UserAiConnection } from "./user-ai-types";
import { UnifiedAiSettings, UnifiedAiSettingsEntryCard } from "./UnifiedAiSettings";

import { useI18n } from "@/shared/lib/i18n";

const INITIAL_LANGUAGE = useI18n.getState().lang;

function textConnection(id: string, label: string, priority: number): UserAiConnection {
  return {
    ...structuredClone(EMPTY_AI_CONNECTION),
    id,
    label,
    priority,
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: `key-${id}`,
    textModel: "openrouter/free",
    imageModel: "",
    costPolicy: "openrouter-free",
    apiKeys: [{ id: `key-${id}`, label: "기본 키", apiKey: `key-${id}`, enabled: true, priority: 10 }],
    models: [{ id: `model-${id}`, label: "무료 자동", model: "openrouter/free", capability: "text", enabled: true, priority: 10 }],
  };
}
const POOL_STATUS: freeAiPoolStatus.FreeAiPoolStatus = {
  configured: true,
  provider: "gemini",
  model: "managed-free-model",
  providers: [
    { id: "gemini", label: "Google Gemini", configured: true, model: "managed-free-model" },
    { id: "groq", label: "Groq", configured: true, model: "managed-free-model" },
  ],
  selection: { default: "auto", order: ["gemini", "groq"], fallback: true },
  requiresAuth: true,
  freePool: true,
};

describe("UnifiedAiSettings guided setup", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    vi.spyOn(freeAiPoolStatus, "getFreeAiPoolStatus").mockResolvedValue(POOL_STATUS);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })));
  });

  afterEach(() => {
    cleanup();
    lockUserAi(false);
    useI18n.setState({ lang: INITIAL_LANGUAGE });
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("applies the paid-key choice to every paid key and offers to include a paid key connected without consent", async () => {
    const paid = (id: string, label: string, paidAutoUse?: boolean): UserAiConnection => ({
      ...textConnection(id, label, 20),
      baseUrl: "https://api.deepseek.com",
      textModel: "deepseek-chat",
      costPolicy: "user-funded-byok",
      models: [{ id: `model-${id}`, label: "deepseek-chat", model: "deepseek-chat", capability: "text", enabled: true, priority: 10 }],
      ...(paidAutoUse ? { paidAutoUse } : {}),
    });
    setUserAiConfiguration({
      version: 1,
      connections: [paid("consented", "동의한 유료 키", true), paid("dialog-only", "대화상자용 유료 키")],
      assignments: { text: "consented", image: null, inference: null, "three-d": null },
      routing: { mode: "automatic", allowPaidFallback: true, preferPaidKeys: true, managedPoolPriority: 50, serverProviderOrder: [], paidAutoUsePerKey: true },
    });
    render(<UnifiedAiSettings />);

    // 동의하지 않은 유료 키는 자동으로 쓰지 않는다고 알리고, 한 번에 포함할 수 있게 한다.
    expect(await screen.findByText("자동으로 쓰지 않는 유료 키: 대화상자용 유료 키")).toBeTruthy();
    const include = screen.getByRole("button", { name: "이 키도 자동으로 쓰기" });
    include.focus();
    fireEvent.click(include);
    expect(getUserAiSnapshot().configuration.connections.every((item) => item.paidAutoUse === true)).toBe(true);
    expect(screen.queryByText(/자동으로 쓰지 않는 유료 키/u)).toBeNull();
    // 버튼이 사라져도 포커스를 잃지 않고(지금 고른 선택지로 옮긴다), 결과를 알림 영역으로 알린다.
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: "내 유료 키를 먼저 사용" }));
    const announcement = screen.getByText("자동으로 쓰는 유료 키에 넣었어요: 대화상자용 유료 키");
    expect(announcement.getAttribute("role")).toBe("status");

    // "자동으로 사용하지 않음"은 모든 유료 키의 동의를 지운다.
    fireEvent.click(screen.getByRole("radio", { name: "자동으로 사용하지 않음" }));
    const off = getUserAiSnapshot().configuration;
    expect(off.connections.some((item) => item.paidAutoUse === true)).toBe(false);
    expect(userAiRoutingSettings(off)).toMatchObject({ allowPaidFallback: false, preferPaidKeys: false });
    // 지난 결과("넣었어요")가 알림 영역에 남아 지금 상태와 어긋나지 않는다.
    expect(announcement.textContent).toBe("");

    // 다시 "먼저 사용"을 고르고 대화상자용 키를 다시 연결하면(AI 보조 카드에서 삭제 후 연결) 같은 안내가 다시 나온다.
    fireEvent.click(screen.getByRole("radio", { name: "내 유료 키를 먼저 사용" }));
    act(() => {
      const current = getUserAiSnapshot().configuration;
      setUserAiConfiguration({
        ...current,
        connections: [...current.connections.filter((item) => item.id !== "dialog-only"), paid("dialog-only", "대화상자용 유료 키")],
      });
    });
    fireEvent.click(await screen.findByRole("button", { name: "이 키도 자동으로 쓰기" }));
    // 같은 문구라도 알림 영역에 새로 써지므로 화면 읽기 프로그램이 다시 읽는다.
    expect(announcement.textContent).toBe("자동으로 쓰는 유료 키에 넣었어요: 대화상자용 유료 키");
  });

  it("in the single fixed mode, does not list the fixed paid key as unused and says it is billed on every request", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [{
        ...textConnection("claude-fixed", "Claude (Anthropic)", 10),
        baseUrl: "https://api.deepseek.com",
        textModel: "deepseek-chat",
        costPolicy: "user-funded-byok",
        models: [{ id: "model-claude-fixed", label: "deepseek-chat", model: "deepseek-chat", capability: "text", enabled: true, priority: 10 }],
      }],
      assignments: { text: "claude-fixed", image: null, inference: null, "three-d": null },
      routing: { mode: "manual", allowPaidFallback: true, preferPaidKeys: false, managedPoolPriority: 50, serverProviderOrder: [], paidAutoUsePerKey: true },
    });
    render(<UnifiedAiSettings />);

    expect(await screen.findByText("“하나만 고정”으로 고른 유료 키(Claude (Anthropic))는 이 설정과 상관없이 요청마다 내 계정에 비용이 청구돼요.")).toBeTruthy();
    expect(screen.queryByText(/자동으로 쓰지 않는 유료 키/u)).toBeNull();
    expect(screen.queryByRole("button", { name: "이 키도 자동으로 쓰기" })).toBeNull();
  });

  it("shows today's real remaining app safety limit for a free connection, read from its key routes", async () => {
    resetFreeAiRuntimeBudget();
    setUserAiConfiguration({
      version: 1,
      connections: [textConnection("free-a", "무료 연결", 10)],
      assignments: { text: "free-a", image: null, inference: null, "three-d": null },
    });
    const route = userAiConnectionsForCapability("text")[0]!;
    for (let index = 0; index < 3; index += 1) {
      await guardFreeAiRuntimeRequest(route, "text", "/models", "GET", undefined);
    }
    render(<UnifiedAiSettings />);
    fireEvent.click(screen.getByRole("tab", { name: "고급 설정" }));

    expect(await screen.findByText("오늘 남은 앱 안전 한도 22회", {}, { timeout: 10_000 })).toBeTruthy();
    resetFreeAiRuntimeBudget();
  });

  it("shows the beginner flow first and keeps technical controls behind advanced settings", async () => {
    render(<UnifiedAiSettings />);

    expect(screen.getByRole("tab", { name: "시작하기" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: "목록에 없는 서비스 직접 연결" })).toBeTruthy();
    expect(await screen.findByText("AI를 사용할 준비가 되었어요")).toBeTruthy();
    expect(screen.queryByText("API 키 프로필")).toBeNull();
    expect(screen.queryByText("공개 HTTPS API baseURL")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "고급 설정" }));

    expect(await screen.findByText("전문가용 설정")).toBeTruthy();
    expect(await screen.findByText(
      "API 키 프로필",
      {},
      { timeout: 10_000 },
    )).toBeTruthy();
    expect(screen.getByText("클라우드 연결 편집")).toBeTruthy();
  });

  it("connects an OpenRouter key with one guided action and assigns it to text work", async () => {
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("button", { name: "목록에 없는 서비스 직접 연결" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "sk-or-test-key" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));

    expect(await screen.findByText("OpenRouter 연결 완료")).toBeTruthy();
    expect(screen.getByText("API 키 확인까지 완료했어요.")).toBeTruthy();

    const snapshot = getUserAiSnapshot();
    expect(snapshot.configuration.connections).toHaveLength(1);
    expect(snapshot.configuration.connections[0]?.label).toBe("OpenRouter");
    expect(snapshot.configuration.assignments.text).toBe(snapshot.configuration.connections[0]?.id);
    const providerCalls = vi.mocked(globalThis.fetch).mock.calls.filter(([url]) =>
      String(url).startsWith("https://openrouter.ai/"),
    );
    expect(providerCalls).toHaveLength(1);
  });

  it("does not save a key when provider authentication fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid key" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("button", { name: "목록에 없는 서비스 직접 연결" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "invalid-key" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));

    expect((await screen.findByRole("alert")).textContent).toContain("키를 확인해 주세요");
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
  });

  it("saves a valid key even when the provider reports exhausted free quota", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "quota exhausted" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    })));
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("button", { name: "목록에 없는 서비스 직접 연결" }));
    fireEvent.click(screen.getByRole("button", { name: /OpenRouter/ }));
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "quota-limited-key" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "연결하기" }));

    expect(await screen.findByText("OpenRouter 연결 완료")).toBeTruthy();
    expect(screen.getByText("키는 저장했지만 현재 무료 사용량이 소진되어 있어요.")).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(1);
  });

  it("stores accessible priority changes made with the up and down controls", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [textConnection("first", "첫 번째", 10), textConnection("second", "두 번째", 20)],
      assignments: { text: "first", image: null, inference: null, "three-d": null },
    });
    render(<UnifiedAiSettings />);

    fireEvent.click(screen.getByRole("tab", { name: "AI 사용 순서" }));
    fireEvent.click(screen.getByRole("radio", { name: "내가 정한 순서" }));
    fireEvent.click(screen.getByRole("button", { name: "두 번째 위로" }));

    const connections = getUserAiSnapshot().configuration.connections;
    expect(connections.find((item) => item.id === "second")?.priority).toBe(10);
    expect(connections.find((item) => item.id === "first")?.priority).toBe(20);
  });

  it("renders a secret-free compact entry card for embedded Studio surfaces", () => {
    render(<UnifiedAiSettingsEntryCard source="studio" />);

    const link = screen.getByRole("link", { name: /AI 설정 열기/ });
    expect(link.getAttribute("href")).toBe("/settings/ai?source=studio");
    expect(screen.getByText("키 없이 ToonStudio AI로 바로 시작할 수 있어요")).toBeTruthy();
    expect(document.body.textContent).not.toContain("sk-");
  });
});
