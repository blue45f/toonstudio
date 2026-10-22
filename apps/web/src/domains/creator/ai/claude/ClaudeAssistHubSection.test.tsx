// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClaudeBudgetForTests, setClaudeBudgetLimit } from "@/shared/ai/claude/claude-budget";
import { recordClaudeUsage, resetClaudeUsage } from "@/shared/ai/claude/claude-usage-meter";
import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";
import { useI18n } from "@/shared/lib/i18n";

import { closeClaudeAssistFeature } from "./claude-assist-dialog-store";
import { ClaudeAssistDialogHostEntry } from "./ClaudeAssistDialogHostEntry";
import { ClaudeAssistHubEntry } from "./ClaudeAssistHubEntry";

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

function connect(model = "claude-opus-5-5") {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      ...structuredClone(EMPTY_AI_CONNECTION),
      id: "claude-byok",
      label: "Claude (Anthropic)",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-test-hub-0000",
      textModel: model,
      imageModel: "",
      costPolicy: "user-funded-byok",
      apiKeys: [{ id: "key-1", label: "기본 키", apiKey: "sk-test-hub-0000", enabled: true, priority: 100 }],
      models: [{ id: "text-1", label: "Claude", model, capability: "text", enabled: true, priority: 100 }],
    }],
    assignments: { text: "claude-byok", image: null, inference: null, "three-d": null },
  });
}

/** 허브와, 대화상자를 그리는 호스트(스튜디오가 늘 마운트해 두는 쪽)를 따로 그린다. */
function renderHub(onOpenSettings = vi.fn()) {
  const view = render(
    <MemoryRouter>
      <ClaudeAssistHubEntry onOpenSettings={onOpenSettings} />
      <ClaudeAssistDialogHostEntry />
    </MemoryRouter>,
  );
  return { onOpenSettings, ...view };
}

describe("ClaudeAssistHubSection", () => {
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

  it("불러오는 동안은 자리를 알리는 빈 틀을 둔다", () => {
    const { container } = render(
      <MemoryRouter>
        <ClaudeAssistHubEntry onOpenSettings={() => undefined} />
      </MemoryRouter>,
    );
    const skeleton = container.querySelector("[aria-hidden='true']");
    expect(skeleton?.className).toContain("min-h-28");
  });

  it("연결이 없으면 기능을 숨기지 않고 연결 안내와 설정 버튼을 보여 준다", async () => {
    const { onOpenSettings } = renderHub();

    const section = await screen.findByRole("region", { name: "Claude 보조" });
    expect(section.getAttribute("data-claude-assist-hub-section")).toBe("connect");
    expect(within(section).getByText("연결 필요")).toBeTruthy();
    expect(within(section).getByText(/요금은 내 Anthropic 계정에 청구돼요/)).toBeTruthy();
    fireEvent.click(within(section).getByRole("button", { name: /AI 설정에서 연결하기/ }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(within(section).queryByRole("button", { name: /AI 아트 디렉터/ })).toBeNull();
  });

  it("연결되면 모델과 함께 상태를 알리고 기능 카드를 보여 준다", async () => {
    connect("claude-sonnet-5-5");
    renderHub();

    const section = await screen.findByRole("region", { name: "Claude 보조" });
    expect(section.getAttribute("data-claude-assist-hub-section")).toBe("connected");
    expect(within(section).getByText("연결됨 · Claude Sonnet 5.5")).toBeTruthy();
    const art = within(section).getByRole("button", { name: /AI 아트 디렉터/ });
    const plan = within(section).getByRole("button", { name: /AI 명령 도우미/ });
    const localize = within(section).getByRole("button", { name: /AI 번역 도우미/ });
    const altText = within(section).getByRole("button", { name: /AI 대체 텍스트 도우미/ });
    expect(art.getAttribute("aria-haspopup")).toBe("dialog");
    expect(within(art).getByText("이미지 필요")).toBeTruthy();
    expect(within(plan).getByText("확인 후 실행")).toBeTruthy();
    expect(within(localize).getByText("대사 입력")).toBeTruthy();
    expect(within(altText).getByText("이미지 필요")).toBeTruthy();
    expect(section.querySelectorAll("button[data-claude-assist]")).toHaveLength(4);
  });

  it("카드를 누르면 그 기능의 대화상자를 열고 닫는다", async () => {
    connect();
    renderHub();
    const section = await screen.findByRole("region", { name: "Claude 보조" });

    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: /AI 명령 도우미/ }));
    });
    expect(await screen.findByRole("dialog", { name: "plan-dialog" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "plan-close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("AI 허브(도구 팝오버)가 닫혀 허브가 사라져도 열린 대화상자는 남는다", async () => {
    connect();
    const { rerender } = renderHub();
    const section = await screen.findByRole("region", { name: "Claude 보조" });
    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: /AI 명령 도우미/ }));
    });
    expect(await screen.findByRole("dialog", { name: "plan-dialog" })).toBeTruthy();

    // 스튜디오는 팝오버 바깥을 누르면 메뉴를 닫아 허브를 내려 버린다. 대화상자는 허브가 아니라 호스트가 쥐고 있어야 한다.
    rerender(
      <MemoryRouter>
        <ClaudeAssistDialogHostEntry />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("region", { name: "Claude 보조" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "plan-dialog" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "plan-close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["AI 번역 도우미", "localize-dialog", "localize-close"],
    ["AI 대체 텍스트 도우미", "alt-text-dialog", "alt-text-close"],
  ])("%s 카드로도 대화상자를 열고 닫는다", async (cardName, dialogName, closeName) => {
    connect();
    renderHub();
    const section = await screen.findByRole("region", { name: "Claude 보조" });

    await act(async () => {
      fireEvent.click(within(section).getByRole("button", { name: new RegExp(cardName) }));
    });
    expect(await screen.findByRole("dialog", { name: dialogName })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: closeName }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("이번 세션 사용량과 예산을 보여 주고 설정으로 가는 길을 둔다", async () => {
    connect();
    setClaudeBudgetLimit(1);
    recordClaudeUsage("claude-opus-5-5", { input_tokens: 5_000, output_tokens: 2_000 }); // $0.06
    const { onOpenSettings } = renderHub();
    const section = await screen.findByRole("region", { name: "Claude 보조" });

    expect(within(section).getByText(/이번 세션 추정 \$0\.06 · 요청 1회/)).toBeTruthy();
    expect(within(section).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("6");
    fireEvent.click(within(section).getByRole("button", { name: /AI 설정 열기/ }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("연결을 지우면 연결 안내로 돌아간다", async () => {
    connect();
    renderHub();
    const section = await screen.findByRole("region", { name: "Claude 보조" });
    expect(section.getAttribute("data-claude-assist-hub-section")).toBe("connected");

    act(() => { lockUserAi(false); });

    expect(screen.getByRole("region", { name: "Claude 보조" }).getAttribute("data-claude-assist-hub-section")).toBe("connect");
  });

  it("영어 화면에서는 영어 문구를 쓴다", async () => {
    useI18n.setState({ lang: "en" });
    renderHub();

    const section = await screen.findByRole("region", { name: "Claude assist" });
    expect(within(section).getByText("Not connected")).toBeTruthy();
    expect(within(section).getByRole("button", { name: /Connect in AI settings/ })).toBeTruthy();
  });
});
