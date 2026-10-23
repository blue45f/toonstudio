// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { lockUserAi, getUserAiSnapshot, setUserAiConfiguration } from "../user-ai-store";
import { EMPTY_AI_CONNECTION, userAiRoutingSettings, type UserAiConnection } from "../user-ai-types";

import { ClaudeConnectionCard } from "./ClaudeConnectionCard";
import { resetClaudeBudgetForTests } from "./claude-budget";
import { recordClaudeUsage, resetClaudeUsage } from "./claude-usage-meter";

import type { ClaudeModelListing } from "./claude-runtime";

const listClaudeModelsForKey = vi.hoisted(() => vi.fn());
vi.mock("./claude-transport", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./claude-transport")>()),
  listClaudeModelsForKey,
}));

const INITIAL_LANGUAGE = useI18n.getState().lang;
/** 실제 키가 아닌 시험용 자리 표시 값이다. */
const FAKE_KEY = "sk-test-claude-card-0000";

const LISTING: readonly ClaudeModelListing[] = [
  {
    id: "claude-opus-5-5",
    displayName: "Claude Opus 5.5",
    lifecycle: "active",
    imageInput: true,
    structuredOutputs: true,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 128_000,
  },
  {
    id: "claude-future-9",
    displayName: "Claude Future 9",
    lifecycle: "active",
    imageInput: true,
    structuredOutputs: true,
    maxInputTokens: 1_000_000,
    maxOutputTokens: 128_000,
  },
  {
    id: "claude-retired-1",
    displayName: "Claude Retired 1",
    lifecycle: "retired",
    imageInput: false,
    structuredOutputs: false,
    maxInputTokens: 200_000,
    maxOutputTokens: 8_000,
  },
];

function openRouterConnection(): UserAiConnection {
  return {
    ...structuredClone(EMPTY_AI_CONNECTION),
    id: "openrouter-1",
    label: "OpenRouter",
    apiKey: "or-key",
    apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "or-key", enabled: true, priority: 100 }],
  };
}

async function connect(key = FAKE_KEY) {
  fireEvent.change(screen.getByLabelText("Anthropic API 키"), { target: { value: key } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "연결하고 확인하기" }));
  await screen.findByText(/^연결됨 · /);
}

function claudeConnection(): UserAiConnection | undefined {
  return getUserAiSnapshot().configuration.connections.find((item) => item.baseUrl === "https://api.anthropic.com");
}

describe("ClaudeConnectionCard", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    listClaudeModelsForKey.mockReset();
    listClaudeModelsForKey.mockResolvedValue(LISTING);
  });

  afterEach(() => {
    cleanup();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  it("starts as a masked key form with the cost and data-flow notices visible", () => {
    render(<ClaudeConnectionCard />);

    const input = screen.getByLabelText("Anthropic API 키");
    expect(input.getAttribute("type")).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(screen.getByText(/비용은 내 Anthropic 계정에 청구돼요/)).toBeTruthy();
    expect(screen.getByText(/ToonStudio 서버는 거치지 않아요/)).toBeTruthy();
    expect(screen.getByText("이번 세션 사용량")).toBeTruthy();
    expect(screen.getByText("아직 Claude 호출이 없어요.")).toBeTruthy();
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
  });

  it("shows the three-step guide before connecting and hides it once connected", async () => {
    const { container } = render(<ClaudeConnectionCard />);

    const guide = container.querySelector("[data-claude-connection-steps]");
    expect(guide).not.toBeNull();
    expect(within(guide as HTMLElement).getByRole("link", { name: /키 만들러 가기/ }).getAttribute("target")).toBe("_blank");

    await connect();

    expect(container.querySelector("[data-claude-connection-steps]")).toBeNull();
  });

  it("offers a session budget limit next to the usage meter", () => {
    const { container } = render(<ClaudeConnectionCard />);

    expect(container.querySelector("[data-claude-budget-editor]")).not.toBeNull();
    expect(screen.getByLabelText("예산 한도 (USD)")).toBeTruthy();
  });

  it("toggles key visibility with a label that names the next action (no second pressed state)", () => {
    render(<ClaudeConnectionCard />);

    const toggle = screen.getByRole("button", { name: "키 보기" });
    expect(toggle.hasAttribute("aria-pressed")).toBe(false);
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Anthropic API 키").getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "키 숨기기" }).hasAttribute("aria-pressed")).toBe(false);
  });

  it("keeps password managers from offering to save or fill the API key", () => {
    render(<ClaudeConnectionCard />);

    const input = screen.getByLabelText("Anthropic API 키");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("data-lpignore")).toBe("true");
    expect(input.getAttribute("data-1p-ignore")).toBe("true");
    expect(input.getAttribute("data-bwignore")).toBe("true");
  });

  it("asks for the key and for consent before it calls Anthropic", () => {
    render(<ClaudeConnectionCard />);

    fireEvent.click(screen.getByRole("button", { name: "연결하고 확인하기" }));
    expect(screen.getByRole("status").textContent).toBe("API 키를 입력해 주세요.");

    fireEvent.change(screen.getByLabelText("Anthropic API 키"), { target: { value: FAKE_KEY } });
    fireEvent.click(screen.getByRole("button", { name: "연결하고 확인하기" }));
    expect(screen.getByRole("status").textContent).toBe("전송과 비용 조건을 확인해 주세요.");

    expect(listClaudeModelsForKey).not.toHaveBeenCalled();
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
  });

  it("verifies the key, saves a user-funded connection and never shows the key again", async () => {
    render(<ClaudeConnectionCard />);
    await connect();

    expect(listClaudeModelsForKey).toHaveBeenCalledTimes(1);
    expect(listClaudeModelsForKey).toHaveBeenCalledWith(FAKE_KEY);

    const saved = claudeConnection();
    expect(saved).toBeDefined();
    expect(saved?.costPolicy).toBe("user-funded-byok");
    expect(saved?.enabled).toBe(true);
    expect(saved?.apiKey).toBe(FAKE_KEY);
    expect(saved?.apiKeys?.[0]?.apiKey).toBe(FAKE_KEY);
    expect(saved?.textModel).toBe("claude-opus-5-5");
    expect(saved?.imageModel).toBe("");
    expect(saved?.models?.map((item) => item.model)).toEqual(["claude-opus-5-5"]);

    expect(screen.getByRole("status").textContent).toBe("키를 확인했어요 · 사용할 수 있는 모델 3개");
    expect(screen.queryByLabelText("Anthropic API 키")).toBeNull();
    expect(document.body.textContent).not.toContain(FAKE_KEY);
    for (const field of document.querySelectorAll("input, select, textarea")) {
      expect((field as HTMLInputElement).value).not.toContain(FAKE_KEY);
    }
  });

  it("keeps the existing routing untouched until the user picks Claude as the default", async () => {
    setUserAiConfiguration({
      version: 1,
      connections: [openRouterConnection()],
      assignments: { text: "openrouter-1", image: null, inference: null, "three-d": null },
    });
    render(<ClaudeConnectionCard />);
    await connect();

    const afterConnect = getUserAiSnapshot().configuration;
    expect(afterConnect.connections.map((item) => item.id).sort()).toEqual(["claude-byok", "openrouter-1"]);
    expect(afterConnect.assignments.text).toBe("openrouter-1");
    expect(userAiRoutingSettings(afterConnect).mode).not.toBe("manual");
    expect(screen.getByRole("button", { name: "텍스트 AI 기본으로 사용" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "텍스트 AI 기본으로 사용" }));

    const afterDefault = getUserAiSnapshot().configuration;
    expect(afterDefault.assignments.text).toBe("claude-byok");
    expect(afterDefault.routeAssignments?.text?.connectionId).toBe("claude-byok");
    expect(userAiRoutingSettings(afterDefault).mode).toBe("manual");
    expect(screen.getByRole("status").textContent).toContain("텍스트 AI를 Claude로 지정했어요");
    expect(screen.getByRole("button", { name: "텍스트 AI 기본으로 사용" }).hasAttribute("disabled")).toBe(true);
  });

  it("changes only the text model and keeps profiles edited in advanced settings", async () => {
    render(<ClaudeConnectionCard />);
    await connect();

    const current = claudeConnection();
    expect(current).toBeDefined();
    if (!current) return;
    setUserAiConfiguration({
      ...getUserAiSnapshot().configuration,
      connections: [{
        ...current,
        apiKeys: [
          ...(current.apiKeys ?? []),
          { id: "key-2", label: "보조 키", apiKey: "sk-test-second", enabled: false, priority: 200 },
        ],
      }],
    });

    const select = screen.getByLabelText("기본 모델") as HTMLSelectElement;
    const optionValues = [...select.options].map((option) => option.value);
    expect(optionValues).toContain("claude-future-9");
    expect(optionValues).not.toContain("claude-retired-1");

    fireEvent.change(select, { target: { value: "claude-sonnet-5-5" } });

    const next = claudeConnection();
    expect(next?.textModel).toBe("claude-sonnet-5-5");
    expect(next?.models?.find((item) => item.capability === "text")?.model).toBe("claude-sonnet-5-5");
    expect(next?.apiKeys?.map((item) => item.id)).toEqual(["key-1", "key-2"]);
    expect(next?.apiKey).toBe(FAKE_KEY);
    expect(screen.getByText(/^연결됨 · claude-sonnet-5-5$/)).toBeTruthy();
  });

  it("does not save anything when Anthropic rejects the key", async () => {
    listClaudeModelsForKey.mockRejectedValueOnce(new Error("키를 확인해 주세요. 인증에 실패했어요."));
    render(<ClaudeConnectionCard />);

    fireEvent.change(screen.getByLabelText("Anthropic API 키"), { target: { value: FAKE_KEY } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "연결하고 확인하기" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("키를 확인해 주세요. 인증에 실패했어요.");
    });
    expect(getUserAiSnapshot().configuration.connections).toHaveLength(0);
    // 실패해도 입력한 키는 사용자가 고칠 수 있게 입력창에 남는다.
    expect((screen.getByLabelText("Anthropic API 키") as HTMLInputElement).value).toBe(FAKE_KEY);
    expect(listClaudeModelsForKey).toHaveBeenCalledTimes(1);
  });

  it("removes the connection and clears every assignment that pointed at it", async () => {
    render(<ClaudeConnectionCard />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "텍스트 AI 기본으로 사용" }));
    expect(getUserAiSnapshot().configuration.assignments.text).toBe("claude-byok");

    fireEvent.click(screen.getByRole("button", { name: "연결 삭제" }));

    const configuration = getUserAiSnapshot().configuration;
    expect(configuration.connections).toHaveLength(0);
    expect(configuration.assignments.text).toBeNull();
    expect(configuration.routeAssignments?.text ?? null).toBeNull();
    expect(screen.getByLabelText("Anthropic API 키")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Claude 연결을 삭제했어요.");
  });

  it("re-checks the stored key without asking for it again", async () => {
    render(<ClaudeConnectionCard />);
    await connect();
    listClaudeModelsForKey.mockClear();
    listClaudeModelsForKey.mockResolvedValueOnce(LISTING.slice(0, 1));

    fireEvent.click(screen.getByRole("button", { name: "다시 확인하기" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe("키를 확인했어요 · 사용할 수 있는 모델 1개");
    });
    expect(listClaudeModelsForKey).toHaveBeenCalledWith(FAKE_KEY);
  });

  it("shows the session usage estimate with its price-date caveat and can reset it", () => {
    recordClaudeUsage("claude-opus-5-5", { input_tokens: 1_000, output_tokens: 500 });
    recordClaudeUsage("claude-unknown-model", { input_tokens: 10, output_tokens: 10 });
    render(<ClaudeConnectionCard />);

    const usage = screen.getByText("이번 세션 사용량").parentElement;
    expect(usage).not.toBeNull();
    if (!usage) return;
    expect(within(usage).getByText(/요청 2회/)).toBeTruthy();
    expect(within(usage).getByText(/단가를 모르는 모델로 보낸 1회는 비용에 들어 있지 않아요/)).toBeTruthy();
    expect(within(usage).getByText(/공개 가격 기준 추정이에요/)).toBeTruthy();

    fireEvent.click(within(usage).getByRole("button", { name: "사용량 초기화" }));
    expect(screen.getByText("아직 Claude 호출이 없어요.")).toBeTruthy();
  });

  it("renders the English copy when the UI language is English", () => {
    useI18n.setState({ lang: "en" });
    render(<ClaudeConnectionCard />);

    expect(screen.getByLabelText("Anthropic API key")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connect and verify" })).toBeTruthy();
    expect(screen.getByText(/billed to your own Anthropic account/)).toBeTruthy();
  });
});
