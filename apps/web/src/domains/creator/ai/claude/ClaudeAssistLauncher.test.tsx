// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClaudeBudgetForTests } from "@/shared/ai/claude/claude-budget";
import { resetClaudeUsage } from "@/shared/ai/claude/claude-usage-meter";
import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONNECTION, type UserAiConnection } from "@/shared/ai/user-ai-types";
import { useI18n } from "@/shared/lib/i18n";

import { closeClaudeAssistFeature } from "./claude-assist-dialog-store";
import { ClaudeAssistDialogHostEntry } from "./ClaudeAssistDialogHostEntry";
import { ClaudeAssistLauncher } from "./ClaudeAssistLauncher";

// 대화상자 본체는 각자의 시험이 있으므로 여기서는 열고 닫는 계약만 본다.
vi.mock("./ClaudeArtDirectorDialog", () => ({
  ClaudeArtDirectorDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="art-dialog"><button type="button" onClick={onClose}>art-close</button></div>
  ),
}));
vi.mock("./ClaudeCommandPlanDialog", () => ({
  ClaudeCommandPlanDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="plan-dialog"><button type="button" onClick={onClose}>plan-close</button></div>
  ),
}));
vi.mock("./ClaudeLocalizeDialog", () => ({
  ClaudeLocalizeDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="localize-dialog"><button type="button" onClick={onClose}>localize-close</button></div>
  ),
}));
vi.mock("./ClaudeAltTextDialog", () => ({
  ClaudeAltTextDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="alt-text-dialog"><button type="button" onClick={onClose}>alt-text-close</button></div>
  ),
}));

const INITIAL_LANGUAGE = useI18n.getState().lang;

function claudeConnection(overrides: Partial<UserAiConnection> = {}): UserAiConnection {
  return {
    ...structuredClone(EMPTY_AI_CONNECTION),
    id: "claude-byok",
    label: "Claude (Anthropic)",
    baseUrl: "https://api.anthropic.com",
    apiKey: "sk-test-launcher-0000",
    textModel: "claude-opus-5-5",
    imageModel: "",
    costPolicy: "user-funded-byok",
    apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "sk-test-launcher-0000", enabled: true, priority: 100 }],
    models: [{ id: "text-1", label: "Claude", model: "claude-opus-5-5", capability: "text", enabled: true, priority: 100 }],
    ...overrides,
  };
}

function connect(connection: UserAiConnection = claudeConnection()) {
  setUserAiConfiguration({
    version: 1,
    connections: [connection],
    assignments: { text: connection.id, image: null, inference: null, "three-d": null },
  });
}

/** 검색 줄 메뉴와, 대화상자를 그리는 호스트(스튜디오가 늘 마운트해 두는 쪽)를 함께 그린다. */
function renderLauncher() {
  return render(<MemoryRouter><ClaudeAssistLauncher /><ClaudeAssistDialogHostEntry /></MemoryRouter>);
}

async function openMenu() {
  const trigger = await screen.findByRole("button", { name: "Claude 보조 메뉴" });
  fireEvent.click(trigger);
  return { trigger, menu: await screen.findByRole("menu", { name: "Claude 보조 메뉴" }) };
}

describe("ClaudeAssistLauncher", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    closeClaudeAssistFeature();
  });

  afterEach(() => {
    cleanup();
    closeClaudeAssistFeature();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  describe("보이는 조건", () => {
    it("Claude 연결이 없으면 아무것도 그리지 않는다", () => {
      const { container } = renderLauncher();
      expect(container.firstChild).toBeNull();
    });

    it("무료 공급자만 연결돼 있어도 그리지 않는다", () => {
      connect({
        ...structuredClone(EMPTY_AI_CONNECTION),
        id: "openrouter-1",
        label: "OpenRouter",
        apiKey: "or-key",
        apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "or-key", enabled: true, priority: 100 }],
      });
      const { container } = renderLauncher();
      expect(container.firstChild).toBeNull();
    });

    it("정책을 통과하지 못한 Claude 연결(무료로 표시)은 그리지 않는다", () => {
      connect(claudeConnection({ costPolicy: "provider-free-tier" }));
      const { container } = renderLauncher();
      expect(container.firstChild).toBeNull();
    });

    it("연결이 사라지면 버튼도 사라진다", async () => {
      connect();
      renderLauncher();
      expect(await screen.findByRole("button", { name: "Claude 보조 메뉴" })).toBeTruthy();

      act(() => { lockUserAi(false); });

      expect(screen.queryByRole("button", { name: "Claude 보조 메뉴" })).toBeNull();
    });
  });

  describe("메뉴", () => {
    it("연결되면 별 버튼 하나만 보이고 메뉴는 닫혀 있다", async () => {
      connect();
      renderLauncher();

      const trigger = await screen.findByRole("button", { name: "Claude 보조 메뉴" });
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("열면 기능마다 이름·한 줄 설명·필요한 것을 보여 주고 첫 항목에 포커스를 둔다", async () => {
      connect();
      renderLauncher();

      const { trigger, menu } = await openMenu();

      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      const items = within(menu).getAllByRole("menuitem");
      expect(items.map((item) => item.getAttribute("data-claude-assist"))).toEqual(["art-director", "command-helper", "localize", "alt-text", null]);
      expect(within(items[0] as HTMLElement).getByText("AI 아트 디렉터")).toBeTruthy();
      expect(within(items[0] as HTMLElement).getByText("이미지 필요")).toBeTruthy();
      expect(within(items[0] as HTMLElement).getByText(/읽는 순서·말풍선·가독성을 위치와 함께/)).toBeTruthy();
      expect(within(items[1] as HTMLElement).getByText("확인 후 실행")).toBeTruthy();
      expect(within(items[2] as HTMLElement).getByText("AI 번역 도우미")).toBeTruthy();
      expect(within(items[2] as HTMLElement).getByText("대사 입력")).toBeTruthy();
      expect(within(items[3] as HTMLElement).getByText("AI 대체 텍스트 도우미")).toBeTruthy();
      expect(within(items[3] as HTMLElement).getByText("이미지 필요")).toBeTruthy();
      expect(document.activeElement).toBe(items[0]);
      expect(within(menu).getByRole("menuitem", { name: "AI 설정 열기" }).getAttribute("href")).toBe("/settings/ai?source=studio");
      // 사용량 막대는 메뉴 항목이 아니므로 role="menu" 바깥(패널)에 있다.
      expect(within(menu).queryByRole("progressbar")).toBeNull();
      expect(within(menu.parentElement as HTMLElement).getByText("아직 Claude 호출이 없어요.")).toBeTruthy();
    });

    it("화살표·Home·End로 항목을 옮기고 끝에서는 돌아 나온다", async () => {
      connect();
      renderLauncher();
      const { menu } = await openMenu();
      const items = within(menu).getAllByRole("menuitem");

      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[1]);
      fireEvent.keyDown(menu, { key: "End" });
      expect(document.activeElement).toBe(items[items.length - 1]);
      fireEvent.keyDown(menu, { key: "ArrowDown" });
      expect(document.activeElement).toBe(items[0]);
      fireEvent.keyDown(menu, { key: "ArrowUp" });
      expect(document.activeElement).toBe(items[items.length - 1]);
      fireEvent.keyDown(menu, { key: "Home" });
      expect(document.activeElement).toBe(items[0]);
    });

    it("Esc는 메뉴를 닫고 포커스를 버튼으로 돌려준다", async () => {
      connect();
      renderLauncher();
      const { trigger, menu } = await openMenu();

      fireEvent.keyDown(menu, { key: "Escape" });

      expect(screen.queryByRole("menu")).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("바깥을 누르면 닫고, 버튼의 ↓ 키로 다시 연다", async () => {
      connect();
      renderLauncher();
      const { trigger } = await openMenu();

      fireEvent.pointerDown(document.body);
      expect(screen.queryByRole("menu")).toBeNull();

      fireEvent.keyDown(trigger, { key: "ArrowDown" });
      expect(await screen.findByRole("menu")).toBeTruthy();
    });

    it("항목을 고르면 메뉴를 닫고 그 기능의 대화상자를 열며, 닫으면 포커스가 버튼으로 돌아온다", async () => {
      connect();
      renderLauncher();
      const { trigger, menu } = await openMenu();

      await act(async () => {
        fireEvent.click(within(menu).getByRole("menuitem", { name: /AI 명령 도우미/ }));
      });

      expect(await screen.findByRole("dialog", { name: "plan-dialog" })).toBeTruthy();
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.queryByRole("dialog", { name: "art-dialog" })).toBeNull();
      expect(document.activeElement).toBe(trigger);

      fireEvent.click(screen.getByRole("button", { name: "plan-close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it.each([
      ["AI 아트 디렉터", "art-dialog"],
      ["AI 번역 도우미", "localize-dialog"],
      ["AI 대체 텍스트 도우미", "alt-text-dialog"],
    ])("%s을(를) 고르면 그 기능의 대화상자가 열린다", async (menuName, dialogName) => {
      connect();
      renderLauncher();
      const { menu } = await openMenu();

      await act(async () => {
        fireEvent.click(within(menu).getByRole("menuitem", { name: new RegExp(menuName) }));
      });

      expect(await screen.findByRole("dialog", { name: dialogName })).toBeTruthy();
      expect(screen.getAllByRole("dialog")).toHaveLength(1);
    });

    it("영어 화면에서는 영어 이름을 쓴다", async () => {
      useI18n.setState({ lang: "en" });
      connect();
      renderLauncher();

      const trigger = await screen.findByRole("button", { name: "Claude assist menu" });
      fireEvent.click(trigger);
      const menu = await screen.findByRole("menu");

      expect(within(menu).getByText("AI Art Director")).toBeTruthy();
      expect(within(menu).getByText("AI Command Helper")).toBeTruthy();
      expect(within(menu).getByText("AI translation helper")).toBeTruthy();
      expect(within(menu).getByText("AI alt-text helper")).toBeTruthy();
      expect(within(menu).getAllByText("Needs an image")).toHaveLength(2);
      expect(within(menu).getByText("Needs text")).toBeTruthy();
    });
  });
});
