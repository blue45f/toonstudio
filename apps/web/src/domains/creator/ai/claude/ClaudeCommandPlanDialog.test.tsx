// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { resetClaudeBudgetForTests, setClaudeBudgetLimit } from "@/shared/ai/claude/claude-budget";
import { resetClaudeUsage } from "@/shared/ai/claude/claude-usage-meter";
import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";
import { useI18n } from "@/shared/lib/i18n";

import {
  installStudioCommandExecutionBindings,
  resetStudioCommandExecutionBindingsForTests,
  type StudioCommandExecutionBinding,
} from "../../studio-command-execution-registry";

import { resetRecentRequestsForTests } from "./claude-assist-recents";
import { ClaudeCommandPlanDialog } from "./ClaudeCommandPlanDialog";

import type { CommandAnswerRunResult, CommandPlanRunResult } from "./claude-command-plan-run";

const runCommandPlan = vi.hoisted(() => vi.fn());
const runCommandAnswer = vi.hoisted(() => vi.fn());
vi.mock("./claude-command-plan-run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./claude-command-plan-run")>()),
  runCommandPlan,
  runCommandAnswer,
}));

const INITIAL_LANGUAGE = useI18n.getState().lang;
const FAKE_KEY = "sk-test-command-plan-0000";

function connectClaude(model = "claude-opus-5-5") {
  setUserAiConfiguration({
    version: 1,
    connections: [{
      ...structuredClone(EMPTY_AI_CONNECTION),
      id: "claude-byok",
      label: "Claude (Anthropic)",
      baseUrl: "https://api.anthropic.com",
      apiKey: FAKE_KEY,
      textModel: model,
      imageModel: "",
      costPolicy: "user-funded-byok",
      apiKeys: [{ id: "key-1", label: "기본 키", apiKey: FAKE_KEY, enabled: true, priority: 100 }],
      models: [{ id: "text-1", label: "Claude", model, capability: "text", enabled: true, priority: 100 }],
    }],
    assignments: { text: "claude-byok", image: null, inference: null, "three-d": null },
  });
}

interface Executors {
  readonly grid: Mock<() => void>;
  readonly fit: Mock<() => void>;
  readonly brush: Mock<() => void>;
}

function installBindings(overrides: Partial<Record<string, Partial<StudioCommandExecutionBinding>>> = {}): Executors {
  const executors: Executors = { grid: vi.fn<() => void>(), fit: vi.fn<() => void>(), brush: vi.fn<() => void>() };
  const make = (commandId: string, label: string, execute: () => void): StudioCommandExecutionBinding => ({
    commandId,
    label,
    execute,
    disabled: false,
    ...overrides[commandId],
  });
  installStudioCommandExecutionBindings([
    make("view.grid", "격자 보기", executors.grid),
    make("view.zoom-fit", "화면에 맞추기", executors.fit),
    make("tool.brush", "브러시", executors.brush),
    { commandId: "view.rulers", label: "눈금자", execute: vi.fn(), disabled: true, unavailableReason: "페이지 없음" },
  ]);
  return executors;
}

function planResult(overrides: Partial<CommandPlanRunResult["plan"]> = {}): CommandPlanRunResult {
  return {
    plan: {
      intent: "화면을 맞추고 격자를 켜요",
      steps: [
        { commandId: "view.zoom-fit", label: "화면에 맞추기", reason: "캔버스를 창에 맞춰요" },
        { commandId: "view.grid", label: "격자 보기", reason: "격자를 켜요" },
      ],
      questions: [],
      rejected: [],
      ...overrides,
    },
    model: "claude-opus-5-5",
    usage: { inputTokens: 1_200, outputTokens: 300, cacheReadTokens: 6_000, cacheWriteTokens: 0 },
    estimatedUsd: 0.0123,
  };
}

function answerResult(overrides: Partial<CommandAnswerRunResult["answer"]> = {}): CommandAnswerRunResult {
  return {
    answer: {
      answer: "확대는 = 키이고, 저장은 ⌘S예요.",
      commands: [
        { commandId: "view.zoom-in", label: "확대", shortcut: "=", why: "화면을 키워요", executable: true },
        { commandId: "file.save-draft", label: "초안 저장", shortcut: "⌘S", why: "작업을 저장해요", executable: false },
        { commandId: "edit.undo", label: "되돌리기", why: "마지막 작업을 되돌려요", executable: true },
      ],
      followUps: ["축소 단축키는요?"],
      rejected: 1,
      ...overrides,
    },
    model: "claude-opus-5-5",
    usage: { inputTokens: 900, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
    estimatedUsd: 0.0076,
  };
}

/** "방법 알려 줘"의 지식은 실제 카탈로그라서, 이 모드의 시험은 카탈로그에 있는 진짜 id로 바인딩을 만든다. */
function installRealBindings(overrides: Partial<Record<string, Partial<StudioCommandExecutionBinding>>> = {}) {
  const zoomIn = vi.fn<() => void>();
  const undo = vi.fn<() => void>();
  installStudioCommandExecutionBindings([
    { commandId: "view.zoom-in", label: "확대", execute: zoomIn, disabled: false, ...overrides["view.zoom-in"] },
    { commandId: "edit.undo", label: "되돌리기", execute: undo, disabled: false, ...overrides["edit.undo"] },
  ]);
  return { zoomIn, undo };
}

function renderDialog(props: Partial<React.ComponentProps<typeof ClaudeCommandPlanDialog>> = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <MemoryRouter>
      <ClaudeCommandPlanDialog onClose={onClose} {...props} />
    </MemoryRouter>,
  );
  return { onClose };
}

const MAKE = /계획 만들기|계획 다시 만들기/;

function typeRequest(text: string) {
  fireEvent.change(screen.getByLabelText(/^(요청|질문)$/), { target: { value: text } });
}

async function askForPlan(request = "화면을 맞추고 격자를 켜 줘") {
  typeRequest(request);
  fireEvent.click(screen.getByRole("button", { name: MAKE }));
  await screen.findByText("제안한 단계");
}

describe("ClaudeCommandPlanDialog", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetStudioCommandExecutionBindingsForTests();
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    resetRecentRequestsForTests();
    runCommandPlan.mockReset();
    runCommandPlan.mockResolvedValue(planResult());
    runCommandAnswer.mockReset();
    runCommandAnswer.mockResolvedValue(answerResult());
  });

  afterEach(() => {
    cleanup();
    lockUserAi(false);
    resetStudioCommandExecutionBindingsForTests();
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    resetRecentRequestsForTests();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  describe("처음 열었을 때", () => {
    it("연결이 없으면 연결 안내와 설정 링크를 보여 주고 계획을 만들 수 없다", () => {
      installBindings();
      renderDialog();

      expect(screen.getByRole("dialog", { name: "AI 명령 도우미" })).toBeTruthy();
      expect(screen.getByText("Claude 연결이 필요해요.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "AI 설정에서 연결하기" }).getAttribute("href")).toBe("/settings/ai?source=studio");
      typeRequest("격자 켜 줘");
      expect((screen.getByRole("button", { name: MAKE }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("빈 칸에서 막막하지 않도록 예시를 보여 주고, 누르면 요청 칸에 채운다", () => {
      connectClaude();
      installBindings();
      renderDialog();

      const examples = document.querySelector("[data-claude-examples]") as HTMLElement;
      expect(within(examples).getByText("이렇게 말해 보세요")).toBeTruthy();
      fireEvent.click(within(examples).getByRole("button", { name: "브러시 도구로 바꿔 줘" }));

      expect((screen.getByLabelText("요청") as HTMLTextAreaElement).value).toBe("브러시 도구로 바꿔 줘");
      expect(document.querySelector("[data-claude-examples]")).toBeNull();
      // 눌렀던 예시 칩이 사라져도 포커스가 문서로 떨어지지 않고 입력칸으로 간다.
      expect(document.activeElement).toBe(screen.getByLabelText("요청"));
    });

    it("보낼 명령 수와 비용 상한을 요청 전에 보여 주고, 요청이 비면 만들 수 없다고 이유를 말한다", () => {
      connectClaude();
      installBindings();
      renderDialog();

      // 비활성 눈금자도 이름은 보내므로(캐시가 상태에 흔들리지 않게) 네 개를 보내고 그중 세 개만 지금 쓸 수 있다.
      expect(screen.getByText("명령 4개를 보냈어요. 지금 쓸 수 있는 것은 3개예요.")).toBeTruthy();
      const run = screen.getByRole("button", { name: MAKE }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      const hint = screen.getByText("요청을 먼저 입력해 주세요.");
      expect(hint.getAttribute("data-claude-need-hint")).toBe("true");
      expect(run.getAttribute("aria-describedby")).toBe(hint.id);
      // 요청이 없으면 비용 상한을 계산할 수 없다. "단가를 모른다"는 경고가 아니라 "입력하면 계산해요"로 알린다.
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("입력하면 계산해요");
      expect(document.querySelector("[data-claude-footer-cap]")).toBeNull();

      typeRequest("격자");
      expect(run.disabled).toBe(false);
      expect(document.querySelector("[data-claude-footer-cap]")?.textContent).toMatch(/^최대 약 \$0\.0[0-9]+$/u);
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toMatch(/^최대 약 \$0\.0[0-9]+$/u);
      expect(within(document.querySelector("[data-claude-preflight]") as HTMLElement).getByText("Claude Opus 5.5")).toBeTruthy();
      expect(runCommandPlan).not.toHaveBeenCalled();
    });

    it("실행 가능한 명령이 하나도 없으면 안내하고 요청을 보내지 않는다", () => {
      connectClaude();
      renderDialog();

      expect(screen.getByText(/지금은 AI가 쓸 수 있는 명령이 없어요/)).toBeTruthy();
      typeRequest("격자");
      expect((screen.getByRole("button", { name: MAKE }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("초기 요청과 모드를 받아 채워 연다", () => {
      connectClaude();
      installBindings();
      renderDialog({ initialRequest: "저장 단축키가 뭐예요?", initialMode: "explain" });

      expect((screen.getByLabelText("질문") as HTMLTextAreaElement).value).toBe("저장 단축키가 뭐예요?");
      expect(screen.getByRole("radio", { name: "방법 알려 줘" }).getAttribute("aria-checked")).toBe("true");
    });
  });

  describe("실행 계획 모드", () => {
    it("계획만 만들 뿐 명령은 실행하지 않고, 선택한 모델과 라이브 후보를 넘긴다", async () => {
      connectClaude();
      const executors = installBindings();
      renderDialog();

      fireEvent.change(screen.getByLabelText("사용할 모델"), { target: { value: "claude-haiku-5-5" } });
      await askForPlan();

      expect(runCommandPlan).toHaveBeenCalledTimes(1);
      const [route, request, candidates, options] = runCommandPlan.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY, model: "claude-opus-5-5" });
      expect(request).toBe("화면을 맞추고 격자를 켜 줘");
      expect(candidates.map((item: { commandId: string }) => item.commandId).sort()).toEqual(["tool.brush", "view.grid", "view.rulers", "view.zoom-fit"]);
      expect(options.model).toBe("claude-haiku-5-5");
      expect(options.signal).toBeInstanceOf(AbortSignal);

      expect(screen.getByText("화면을 맞추고 격자를 켜요")).toBeTruthy();
      expect(screen.getByText(/계획은 제안일 뿐이에요/)).toBeTruthy();
      expect(executors.grid).not.toHaveBeenCalled();
      expect(executors.fit).not.toHaveBeenCalled();
      expect(executors.brush).not.toHaveBeenCalled();
      expect(screen.getByText(/모델 claude-opus-5-5 · 입력 7,200 · 출력 300 토큰 · 추정 \$0\.01/)).toBeTruthy();
    });

    it("계획이 나오면 주 버튼이 실행으로 바뀌고, 다시 만들기는 보조 버튼으로 남는다", async () => {
      connectClaude();
      installBindings();
      renderDialog();
      await askForPlan();

      expect(screen.getByRole("button", { name: "선택한 2단계 실행" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "계획 다시 만들기 (요금 발생)" })).toBeTruthy();
      // 단계를 실행하는 단축키는 없다 — 실행은 단추를 직접 눌러야 한다.
      expect(document.querySelector("[data-claude-shortcut-hint]")).toBeNull();
    });

    it("선택한 단계만 순서대로 실행하고 결과와 되돌리기 안내를 보여 준다", async () => {
      connectClaude();
      const order: string[] = [];
      const executors = installBindings();
      executors.fit.mockImplementation(() => { order.push("fit"); });
      executors.grid.mockImplementation(() => { order.push("grid"); });
      renderDialog();
      await askForPlan();

      fireEvent.click(screen.getByLabelText("격자 보기 실행에 포함"));
      expect(screen.getByRole("button", { name: "선택한 1단계 실행" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "선택한 1단계 실행" }));

      await waitFor(() => { expect(screen.getByText("1단계를 실행했어요.")).toBeTruthy(); });
      expect(order).toEqual(["fit"]);
      const results = screen.getByText("실행 결과").parentElement as HTMLElement;
      expect(within(results).getByText("실행함")).toBeTruthy();
      expect(within(results).getByText("되돌리기(Ctrl+Z / ⌘+Z)로 돌아가는 명령도 있지만, 보기·도구 설정은 직접 바꿔야 할 수 있어요.")).toBeTruthy();
    });

    it("Ctrl+Enter는 계획을 만들 때만 쓰고, 계획이 나온 뒤에는 단계를 실행하지도 다시 만들지도 않는다", async () => {
      connectClaude();
      const executors = installBindings();
      renderDialog();
      const dialog = screen.getByRole("dialog");

      typeRequest("화면을 맞추고 격자를 켜 줘");
      fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true });
      await screen.findByText("제안한 단계");
      expect(runCommandPlan).toHaveBeenCalledTimes(1);
      expect(executors.fit).not.toHaveBeenCalled();

      fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true });
      fireEvent.keyDown(dialog, { key: "Enter", metaKey: true });
      await act(async () => { await Promise.resolve(); });
      expect(executors.fit).not.toHaveBeenCalled();
      expect(executors.grid).not.toHaveBeenCalled();
      expect(runCommandPlan).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("2단계를 실행했어요.")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "선택한 2단계 실행" }));
      await waitFor(() => { expect(screen.getByText("2단계를 실행했어요.")).toBeTruthy(); });
      expect(executors.fit).toHaveBeenCalledTimes(1);
      expect(executors.grid).toHaveBeenCalledTimes(1);
    });

    it("예산을 넘어도 진행하겠다고 고른 요청은 그 사실을 실행기에 넘긴다", async () => {
      connectClaude();
      installBindings();
      setClaudeBudgetLimit(0.01);
      renderDialog();
      typeRequest("격자");
      fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
      fireEvent.click(screen.getByRole("button", { name: MAKE }));
      await screen.findByText("제안한 단계");

      expect(runCommandPlan).toHaveBeenCalledTimes(1);
      expect(runCommandPlan.mock.calls[0]?.[3]).toMatchObject({ budgetOverride: true });
      // 동의는 한 번만 쓴다. 다시 만들려면 다시 확인해야 한다.
      expect((screen.getByRole("button", { name: /계획 다시 만들기/ }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("요청을 고치면 이전 계획임을 알리고 주 버튼을 다시 만들기로 돌려놓는다", async () => {
      connectClaude();
      installBindings();
      renderDialog();
      await askForPlan();

      typeRequest("브러시로 바꿔 줘");

      expect(screen.getByText("요청을 바꿨어요. 아래 계획은 이전 요청의 것이에요.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /선택한 \d단계 실행/ })?.getAttribute("class") ?? "").not.toContain("border-accent bg-accent");
      expect(screen.getByRole("button", { name: "계획 다시 만들기 (요금 발생)" })).toBeTruthy();
    });

    it("선택한 단계가 없으면 실행하지 않는다", async () => {
      connectClaude();
      const executors = installBindings();
      renderDialog();
      await askForPlan();

      fireEvent.click(screen.getByLabelText("화면에 맞추기 실행에 포함"));
      fireEvent.click(screen.getByLabelText("격자 보기 실행에 포함"));

      expect((screen.getByRole("button", { name: "선택한 0단계 실행" }) as HTMLButtonElement).disabled).toBe(true);
      expect(executors.fit).not.toHaveBeenCalled();
      expect(executors.grid).not.toHaveBeenCalled();
    });

    it("계획을 만든 뒤 명령이 비활성이 되면 실행하지 않고 사유를 보여 준다", async () => {
      connectClaude();
      const executors = installBindings();
      renderDialog();
      await askForPlan();

      act(() => {
        installBindings({ "view.zoom-fit": { disabled: true, unavailableReason: "선택 영역이 없어요" } });
      });
      fireEvent.click(screen.getByRole("button", { name: "선택한 2단계 실행" }));

      await waitFor(() => { expect(screen.getByText("1단계를 실행했어요.")).toBeTruthy(); });
      expect(executors.fit).not.toHaveBeenCalled();
      expect(screen.getByText("건너뜀")).toBeTruthy();
      expect(screen.getByText("선택 영역이 없어요")).toBeTruthy();
    });

    it("한 단계가 실패하면 거기서 멈추고 나머지는 앞 단계에서 멈췄다고 알린다", async () => {
      connectClaude();
      const executors = installBindings();
      executors.fit.mockImplementation(() => { throw new Error("캔버스를 찾을 수 없어요"); });
      renderDialog();
      await askForPlan();

      fireEvent.click(screen.getByRole("button", { name: "선택한 2단계 실행" }));

      await waitFor(() => { expect(screen.getByText("0단계를 실행했어요.")).toBeTruthy(); });
      expect(executors.grid).not.toHaveBeenCalled();
      expect(screen.getByText("실행 안 됨")).toBeTruthy();
      expect(screen.getByText("캔버스를 찾을 수 없어요")).toBeTruthy();
      expect(screen.getByText("앞 단계에서 멈춰서 실행하지 않았어요.")).toBeTruthy();
      expect(screen.queryByText("되돌리기(Ctrl+Z / ⌘+Z)로 돌아가는 명령도 있지만, 보기·도구 설정은 직접 바꿔야 할 수 있어요.")).toBeNull();
    });

    it("맞는 명령이 없으면 질문을 보여 주고, 목록 밖 명령을 뺐다고 알린다", async () => {
      connectClaude();
      installBindings();
      runCommandPlan.mockResolvedValueOnce(planResult({
        intent: "프로젝트를 지워 줘",
        steps: [],
        questions: ["어떤 프로젝트를 말씀하시나요?"],
        rejected: [{ commandId: "file.delete", why: "unknown" }],
      }));
      renderDialog();

      typeRequest("프로젝트를 지워 줘");
      fireEvent.click(screen.getByRole("button", { name: MAKE }));

      expect(await screen.findByText(/이 요청에 맞는 명령을 찾지 못했어요/)).toBeTruthy();
      expect(screen.getByText("어떤 프로젝트를 말씀하시나요?")).toBeTruthy();
      expect(screen.getByText("목록에 없거나 쓸 수 없는 명령 1개는 제외했어요.")).toBeTruthy();
      expect(screen.queryByRole("button", { name: /선택한 \d단계 실행/ })).toBeNull();
    });

    it("실패하면 사유를 알리고 다시 요청할 수 있다", async () => {
      connectClaude();
      installBindings();
      runCommandPlan.mockRejectedValueOnce(new Error("키를 확인해 주세요. 인증에 실패했어요."));
      renderDialog();

      typeRequest("격자");
      fireEvent.click(screen.getByRole("button", { name: MAKE }));

      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toContain("계획을 만들지 못했어요");
      expect(alert.textContent).toContain("키를 확인해 주세요. 인증에 실패했어요.");
      expect((screen.getByRole("button", { name: MAKE }) as HTMLButtonElement).disabled).toBe(false);
      expect(runCommandPlan).toHaveBeenCalledTimes(1);
    });
  });

  describe("방법 알려 줘 모드", () => {
    it("모드를 바꾸면 질문 칸과 전송 내용 설명이 바뀌고 카탈로그 전체를 근거로 삼는다고 알린다", () => {
      connectClaude();
      installBindings();
      renderDialog();

      fireEvent.click(screen.getByRole("radio", { name: "방법 알려 줘" }));

      expect(screen.getByLabelText("질문")).toBeTruthy();
      expect(screen.getByText(/스튜디오 기능 \d+개를 근거로 답해요\./)).toBeTruthy();
      expect(screen.getByText("기능이나 단축키를 물어보면 알려 줘요. 스튜디오는 바뀌지 않아요.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "답 받기 (요금 발생)" })).toBeTruthy();
      expect(screen.getByText("되돌리기 단축키가 뭐예요?")).toBeTruthy();
    });

    it("질문하면 설명과 관련 기능을 단축키·실행 가능 여부와 함께 보여 주고 아무것도 실행하지 않는다", async () => {
      connectClaude();
      const executors = installRealBindings();
      renderDialog({ initialMode: "explain" });

      typeRequest("확대와 저장 단축키가 뭐예요?");
      fireEvent.click(screen.getByRole("button", { name: "답 받기 (요금 발생)" }));

      expect(await screen.findByText("확대는 = 키이고, 저장은 ⌘S예요.")).toBeTruthy();
      const [route, question, knowledge, options] = runCommandAnswer.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY });
      expect(question).toBe("확대와 저장 단축키가 뭐예요?");
      // 카탈로그 전체가 지식이고, 라이브 바인딩이 있는 명령만 실행 가능으로 표시된다.
      expect(knowledge.length).toBeGreaterThan(50);
      expect(knowledge.find((item: { commandId: string }) => item.commandId === "view.zoom-in")).toMatchObject({ executable: true, shortcut: "=" });
      expect(knowledge.find((item: { commandId: string }) => item.commandId === "file.save-draft")).toMatchObject({ executable: false, shortcut: "⌘S" });
      expect(options.signal).toBeInstanceOf(AbortSignal);

      const answer = screen.getByRole("region", { name: "답" });
      expect(within(answer).getByText("=")).toBeTruthy();
      expect(within(answer).getByText("⌘S")).toBeTruthy();
      expect(within(answer).getByText("단축키 없음")).toBeTruthy();
      expect(within(answer).getByText("메뉴에서 직접 해요")).toBeTruthy();
      expect(within(answer).getAllByRole("button", { name: "지금 실행" })).toHaveLength(2);
      expect(within(answer).getByText("목록에 없거나 쓸 수 없는 명령 1개는 제외했어요.")).toBeTruthy();
      expect(executors.zoomIn).not.toHaveBeenCalled();
      expect(executors.undo).not.toHaveBeenCalled();
    });

    it("지금 실행은 그 명령 하나만 실행하고 결과를 그 줄에 보여 준다", async () => {
      connectClaude();
      const executors = installRealBindings();
      renderDialog({ initialMode: "explain" });
      typeRequest("확대하려면?");
      fireEvent.click(screen.getByRole("button", { name: "답 받기 (요금 발생)" }));
      await screen.findByText("확대는 = 키이고, 저장은 ⌘S예요.");

      const answer = screen.getByRole("region", { name: "답" });
      const zoomRow = within(answer).getByText("화면을 키워요").closest("li") as HTMLElement;
      fireEvent.click(within(zoomRow).getByRole("button", { name: "지금 실행" }));

      await waitFor(() => { expect(within(zoomRow).getByText("실행함")).toBeTruthy(); });
      expect(executors.zoomIn).toHaveBeenCalledTimes(1);
      expect(executors.undo).not.toHaveBeenCalled();
    });

    it("지금은 쓸 수 없는 명령은 실행 버튼을 막고 이유를 알린다", async () => {
      connectClaude();
      installRealBindings({ "view.zoom-in": { disabled: true, unavailableReason: "선택 영역이 없어요" } });
      renderDialog({ initialMode: "explain" });
      typeRequest("확대하려면?");
      fireEvent.click(screen.getByRole("button", { name: "답 받기 (요금 발생)" }));
      await screen.findByText("확대는 = 키이고, 저장은 ⌘S예요.");

      const zoomRow = within(screen.getByRole("region", { name: "답" })).getByText("화면을 키워요").closest("li") as HTMLElement;
      expect((within(zoomRow).getByRole("button", { name: "지금 실행" }) as HTMLButtonElement).disabled).toBe(true);
      expect(within(zoomRow).getByText("지금은 사용할 수 없는 상태예요.")).toBeTruthy();
    });

    it("이어서 물어볼 만한 질문을 누르면 질문 칸에 채운다", async () => {
      connectClaude();
      installRealBindings();
      renderDialog({ initialMode: "explain" });
      typeRequest("확대하려면?");
      fireEvent.click(screen.getByRole("button", { name: "답 받기 (요금 발생)" }));
      await screen.findByText("축소 단축키는요?");

      fireEvent.click(screen.getByRole("button", { name: "축소 단축키는요?" }));

      expect((screen.getByLabelText("질문") as HTMLTextAreaElement).value).toBe("축소 단축키는요?");
      // 질문이 채워져도 저절로 보내지 않고(요금), 눌렀던 칩 대신 입력칸에 포커스를 둔다.
      expect(runCommandAnswer).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(screen.getByLabelText("질문"));
    });

    it("방식 칩은 방향키로 옮기며 고른다", () => {
      connectClaude();
      installBindings();
      renderDialog();

      const doRadio = screen.getByRole("radio", { name: "실행 계획" });
      expect(doRadio.getAttribute("aria-checked")).toBe("true");
      doRadio.focus();
      fireEvent.keyDown(doRadio, { key: "ArrowRight" });

      expect(screen.getByRole("radio", { name: "방법 알려 줘" }).getAttribute("aria-checked")).toBe("true");
      expect(screen.getByLabelText("질문")).toBeTruthy();
      expect(document.activeElement).toBe(screen.getByRole("radio", { name: "방법 알려 줘" }));
      // 선택된 칩만 탭 순서에 들어 있다.
      expect(screen.getByRole("radio", { name: "실행 계획" }).getAttribute("tabindex")).toBe("-1");
    });
  });

  describe("최근 요청", () => {
    it("성공한 요청을 모드별로 기억하고, 누르면 다시 채우며, 한 번에 지울 수 있다", async () => {
      connectClaude();
      installBindings();
      renderDialog();
      await askForPlan("격자 켜 줘");
      typeRequest("");

      const recents = document.querySelector("[data-claude-recents]") as HTMLElement;
      expect(within(recents).getByText("최근 요청")).toBeTruthy();
      fireEvent.click(within(recents).getByRole("button", { name: "격자 켜 줘" }));
      expect((screen.getByLabelText("요청") as HTMLTextAreaElement).value).toBe("격자 켜 줘");

      // 알려 줘 모드에는 이 요청이 보이지 않는다.
      fireEvent.click(screen.getByRole("radio", { name: "방법 알려 줘" }));
      expect(document.querySelector("[data-claude-recents]")).toBeNull();

      fireEvent.click(screen.getByRole("radio", { name: "실행 계획" }));
      fireEvent.click(within(document.querySelector("[data-claude-recents]") as HTMLElement).getByRole("button", { name: "지우기" }));
      expect(document.querySelector("[data-claude-recents]")).toBeNull();
    });

    it("실패한 요청은 기억하지 않는다", async () => {
      connectClaude();
      installBindings();
      runCommandPlan.mockRejectedValueOnce(new Error("실패"));
      renderDialog();

      typeRequest("격자 켜 줘");
      fireEvent.click(screen.getByRole("button", { name: MAKE }));
      await screen.findByRole("alert");

      expect(document.querySelector("[data-claude-recents]")).toBeNull();
    });
  });

  describe("예산 가드", () => {
    it("넘을 수 있으면 확인하기 전까지 보내지 않는다", () => {
      connectClaude();
      installBindings();
      setClaudeBudgetLimit(0.01);
      renderDialog();

      typeRequest("격자");

      expect((screen.getByRole("button", { name: MAKE }) as HTMLButtonElement).disabled).toBe(true);
      expect(screen.getByRole("alert").textContent).toContain("예산을 넘을 수 있어요");
      fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
      expect((screen.getByRole("button", { name: MAKE }) as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe("중단과 닫기", () => {
    it("중단하면 요청을 취소하고 계획을 올리지 않는다", async () => {
      connectClaude();
      installBindings();
      let signal: AbortSignal | undefined;
      runCommandPlan.mockImplementationOnce((_route, _request, _candidates, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      });
      renderDialog();

      typeRequest("격자");
      fireEvent.click(screen.getByRole("button", { name: MAKE }));
      const status = await waitFor(() => {
        const node = document.querySelector("[data-claude-task-status]") as HTMLElement;
        expect(node.textContent).toMatch(/계획을 만드는 중이에요\. · 0초 경과/);
        return node;
      });
      // 매초 바뀌는 경과 시간은 화면에만 보이고, 안내(status) 영역에는 문장만 들어 있다.
      expect(status.querySelector("[role=status]")?.textContent).toBe("계획을 만드는 중이에요.");
      fireEvent.click(screen.getByRole("button", { name: "중단" }));

      await waitFor(() => { expect(signal?.aborted).toBe(true); });
      expect(await screen.findByText("계획 만들기를 중단했어요. 이미 처리된 부분은 요금이 청구됐을 수 있어요. 필요하면 다시 시도해 주세요.")).toBeTruthy();
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByText("제안한 단계")).toBeNull();
    });

    it("닫으면 진행 중인 요청도 취소한다", async () => {
      connectClaude();
      installBindings();
      let signal: AbortSignal | undefined;
      runCommandPlan.mockImplementationOnce((_route, _request, _candidates, options: { signal: AbortSignal }) => {
        signal = options.signal;
        return new Promise(() => undefined);
      });
      const { onClose } = renderDialog();
      typeRequest("격자");
      fireEvent.click(screen.getByRole("button", { name: MAKE }));
      await screen.findByText(/계획을 만드는 중이에요/);

      fireEvent.click(screen.getByRole("button", { name: "닫기" }));

      expect(signal?.aborted).toBe(true);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it("영어 화면에서는 영어 문구를 쓴다", () => {
    useI18n.setState({ lang: "en" });
    connectClaude();
    installBindings();
    renderDialog();

    expect(screen.getByRole("dialog", { name: "AI Command Helper" })).toBeTruthy();
    expect(screen.getByText("Sent 4 commands. 3 can be used right now.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Make a plan/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Explain how" })).toBeTruthy();
  });
});
