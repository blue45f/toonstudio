// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetClaudeBudgetForTests, setClaudeBudgetLimit } from "@/shared/ai/claude/claude-budget";
import { resetClaudeUsage } from "@/shared/ai/claude/claude-usage-meter";
import { lockUserAi, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import { EMPTY_AI_CONNECTION } from "@/shared/ai/user-ai-types";
import { useI18n } from "@/shared/lib/i18n";

import { normalizeLocalizeResult, type LocalizeRaw } from "./claude-localize";
import { ClaudeLocalizeDialog } from "./ClaudeLocalizeDialog";

import type { LocalizeRunResult } from "./claude-localize-run";

const runLocalize = vi.hoisted(() => vi.fn());
vi.mock("./claude-localize-run", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./claude-localize-run")>();
  return { ...actual, runLocalize };
});

const INITIAL_LANGUAGE = useI18n.getState().lang;
const FAKE_KEY = "sk-test-localize-0000";
const LINES = ["어, 비 온다.", "하늘이 우산이 없대", "같이 쓸래?"];

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

// 폭: 1번 원문 12 → "Oh, it's raining."(17) 142%로 넘침. 2번 원문 18 → 21 117%. 3번 원문 10 → 6 60%.
const RAW: LocalizeRaw = {
  items: [
    { index: 1, translation: "Oh, it's raining.", shorter: "Oh, rain.", note: "혼잣말이라 가볍게 옮겼어요." },
    { index: 2, translation: "No umbrella, says sky", shorter: null, note: null },
    { index: 3, translation: "Share?", shorter: null, note: null },
  ],
  warnings: ["말하는 사람이 분명하지 않아 존댓말 여부는 추측했어요."],
};

function result(raw: LocalizeRaw = RAW): LocalizeRunResult {
  return {
    view: normalizeLocalizeResult(raw, { lines: LINES }),
    model: "claude-opus-5-5",
    usage: { inputTokens: 900, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 },
    estimatedUsd: 0.012,
  };
}

function renderDialog(onClose = vi.fn()) {
  render(
    <MemoryRouter>
      <ClaudeLocalizeDialog onClose={onClose} />
    </MemoryRouter>,
  );
  return { onClose };
}

const RUN = /Claude로 번역하기|다시 번역하기/;

function typeLines(lines: readonly string[] = LINES) {
  fireEvent.change(screen.getByLabelText("말풍선 대사"), { target: { value: lines.join("\n") } });
}

function preset(name: string): HTMLInputElement {
  return screen.getByRole("radio", { name: new RegExp(name) }) as HTMLInputElement;
}

function footerCap(): string | undefined {
  return document.querySelector("[data-claude-footer-cap]")?.textContent ?? undefined;
}

async function runAndWait() {
  fireEvent.click(screen.getByRole("button", { name: RUN }));
  await screen.findByRole("region", { name: "번역 결과" });
}

describe("ClaudeLocalizeDialog", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    runLocalize.mockReset();
    runLocalize.mockResolvedValue(result());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  describe("처음 열었을 때", () => {
    it("연결이 없으면 연결 안내와 설정 링크를 보여 주고 실행할 수 없다", () => {
      renderDialog();
      typeLines();

      expect(screen.getByRole("dialog", { name: "AI 번역 도우미" }).getAttribute("aria-modal")).toBe("true");
      expect(screen.getByText("Claude 연결이 필요해요.")).toBeTruthy();
      expect(screen.getByRole("link", { name: "AI 설정에서 연결하기" }).getAttribute("href")).toBe("/settings/ai?source=studio");
      expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("대사가 없으면 실행 버튼이 이유를 말해 주고, 대사 입력칸에 처음 포커스가 간다", () => {
      connectClaude();
      renderDialog();

      const run = screen.getByRole("button", { name: RUN }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      expect(run.getAttribute("aria-describedby")).toBe(document.querySelector("[data-claude-need-hint]")?.id);
      expect(screen.getByText("대사를 먼저 입력해 주세요.")).toBeTruthy();
      expect(screen.getByLabelText("말풍선 대사").hasAttribute("data-claude-initial-focus")).toBe(true);
    });

    it("예시 넣기로 줄을 채우고, 비우기로 되돌린다", () => {
      connectClaude();
      renderDialog();

      fireEvent.click(screen.getByRole("button", { name: "예시 넣기" }));
      expect((screen.getByLabelText("말풍선 대사") as HTMLTextAreaElement).value).toBe("어, 비 온다.\n우산 없는데…\n같이 쓸래?");
      expect(screen.getByText("3줄 · 한 번에 최대 50줄")).toBeTruthy();
      expect(screen.queryByRole("button", { name: "예시 넣기" })).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "비우기" }));
      expect((screen.getByLabelText("말풍선 대사") as HTMLTextAreaElement).value).toBe("");
      expect(screen.getByRole("button", { name: "예시 넣기" })).toBeTruthy();
    });

    it("영어 화면에서는 번역할 언어가 한국어로 잡힌다", () => {
      useI18n.setState({ lang: "en" });
      connectClaude();
      renderDialog();

      expect((screen.getByLabelText("Target language") as HTMLSelectElement).value).toBe("ko");
    });

    it("실행 전 확인에 모델·처리 경로·전송 내용을 항상 보여 준다", () => {
      connectClaude();
      renderDialog();

      const preflight = document.querySelector("[data-claude-preflight]") as HTMLElement;
      expect(within(preflight).getByText("Claude Opus 5.5")).toBeTruthy();
      expect(within(preflight).getByText(/이 브라우저 → Anthropic/)).toBeTruthy();
      expect(within(preflight).getByText("아직 대사가 없어요. 입력하면 줄 수가 여기에 보여요.")).toBeTruthy();

      typeLines();
      fireEvent.change(screen.getByLabelText("용어집 (선택)"), { target: { value: "하늘 = Sora" } });
      expect(within(preflight).getByText("대사 3줄(24자), 용어집 1개, 입력한 맥락 글")).toBeTruthy();
    });
  });

  describe("입력 검증", () => {
    it("빈 줄은 건너뛰고 알려 준다", () => {
      connectClaude();
      renderDialog();
      fireEvent.change(screen.getByLabelText("말풍선 대사"), { target: { value: "첫 줄\n\n  \n둘째 줄\n" } });

      expect(screen.getByText("2줄 · 한 번에 최대 50줄")).toBeTruthy();
      expect(screen.getByText("빈 줄 3개는 건너뛰어요.")).toBeTruthy();
    });

    it("줄 수가 한도를 넘으면 자르지 않고 막은 뒤 나눠 달라고 알린다", () => {
      connectClaude();
      renderDialog();
      typeLines(Array.from({ length: 51 }, (_, index) => `대사 ${index + 1}`));

      expect(screen.getByText("대사가 51줄이에요. 한 번에 50줄까지 번역할 수 있어요. 나누어 실행해 주세요.")).toBeTruthy();
      const run = screen.getByRole("button", { name: RUN }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      expect(run.getAttribute("aria-describedby")).toBe(screen.getByText("대사가 51줄이에요. 한 번에 50줄까지 번역할 수 있어요. 나누어 실행해 주세요.").id);
      expect(footerCap()).toBeUndefined();
      expect(screen.getByLabelText("말풍선 대사").getAttribute("aria-invalid")).toBe("true");
    });

    it("한 줄이 너무 길면 몇 번째 줄인지 알린다", () => {
      connectClaude();
      renderDialog();
      typeLines(["짧은 줄", "가".repeat(241)]);

      expect(screen.getByText("2번째 줄이 241자예요. 한 줄은 240자까지 쓸 수 있어요. 줄을 나눠 주세요.")).toBeTruthy();
      expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("용어집에서 형식이 틀린 줄은 건너뛴다고 알린다", () => {
      connectClaude();
      renderDialog();
      fireEvent.change(screen.getByLabelText("용어집 (선택)"), { target: { value: "하늘 = Sora\n잘못된 줄\n우산 -> umbrella" } });

      expect(screen.getByText("형식이 맞지 않는 1줄은 건너뛰어요. '원문 = 번역' 모양으로 적어 주세요.")).toBeTruthy();
    });
  });

  describe("번역 방식과 비용 상한", () => {
    it("대사를 넣으면 방식마다 비용 상한이 카드에 보이고 기본 방식이 골라져 있다", () => {
      connectClaude();
      renderDialog();
      typeLines();

      expect(preset("기본").checked).toBe(true);
      const quick = (preset("빠르게").closest("label") as HTMLElement).textContent ?? "";
      const standard = (preset("기본").closest("label") as HTMLElement).textContent ?? "";
      expect(quick).toMatch(/최대 약 \$/);
      expect(standard).toMatch(/최대 약 \$/);
      expect(footerCap()).toMatch(/^최대 약 \$/);
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe(footerCap());
      expect(footerCap()).not.toBe(quick.match(/최대 약 \$[\d.]+/)?.[0]);
    });

    it("방식을 바꾸면 비용 상한과 실행 설정이 함께 바뀐다", async () => {
      connectClaude();
      renderDialog();
      typeLines();
      const before = footerCap();

      fireEvent.click(preset("빠르게"));
      expect(footerCap()).not.toBe(before);
      expect(within(document.querySelector("[data-claude-preflight]") as HTMLElement).getByText("Claude Haiku 5.5")).toBeTruthy();

      await runAndWait();
      const [route, , options] = runLocalize.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY, model: "claude-opus-5-5" });
      expect(options).toMatchObject({ model: "claude-haiku-5-5", depth: "low" });
    });

    it("정밀 방식은 연결 모델을 그대로 쓰고 깊이만 높인다", async () => {
      connectClaude("claude-sonnet-5-5");
      renderDialog();
      typeLines();

      fireEvent.click(preset("꼼꼼하게"));
      await runAndWait();

      expect(runLocalize.mock.calls[0]?.[2]).toMatchObject({ model: "claude-sonnet-5-5", depth: "high" });
    });

    it("단가를 모르는 모델이면 숫자를 지어내지 않고 가격을 모른다고 말한다", () => {
      connectClaude("claude-future-9");
      renderDialog();
      typeLines();

      expect(footerCap()).toBeUndefined();
      expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("가격을 몰라요");
    });
  });

  describe("예산 가드", () => {
    it("넘을 수 있는 요청은 확인하기 전까지 보내지 않고, 한 번 확인하면 한 번만 보낸다", async () => {
      connectClaude();
      setClaudeBudgetLimit(0.02);
      renderDialog();
      typeLines();

      const run = screen.getByRole("button", { name: RUN }) as HTMLButtonElement;
      expect(run.disabled).toBe(true);
      expect(screen.getByText("예산 확인을 체크하면 실행할 수 있어요.")).toBeTruthy();

      fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
      expect(run.disabled).toBe(false);
      await runAndWait();
      expect(runLocalize).toHaveBeenCalledTimes(1);
      expect((screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요") as HTMLInputElement).checked).toBe(false);
    });
  });

  describe("실행과 결과", () => {
    it("입력한 설정 그대로 실행하고, 번역·점검·사용량을 보여 준다", async () => {
      connectClaude();
      renderDialog();
      typeLines();
      fireEvent.change(screen.getByLabelText("용어집 (선택)"), { target: { value: "하늘 = Sora" } });
      fireEvent.click(screen.getByRole("radio", { name: "공손하게" }));
      fireEvent.click(screen.getByRole("radio", { name: "빠듯하게" }));
      await runAndWait();

      expect(runLocalize).toHaveBeenCalledTimes(1);
      const [route, input, options] = runLocalize.mock.calls[0] ?? [];
      expect(route).toMatchObject({ apiKey: FAKE_KEY, model: "claude-opus-5-5" });
      expect(input).toEqual({
        lines: LINES,
        sourceLang: "auto",
        targetLang: "en",
        tone: "polite",
        budget: "tight",
        glossary: [{ source: "하늘", target: "Sora" }],
        genre: "",
        notes: "",
      });
      expect(options).toMatchObject({ model: "claude-opus-5-5", depth: "medium" });
      expect(options.signal).toBeInstanceOf(AbortSignal);

      const region = screen.getByRole("region", { name: "번역 결과" });
      expect((within(region).getByLabelText("1번 번역") as HTMLTextAreaElement).value).toBe("Oh, it's raining.");
      expect((within(region).getByLabelText("3번 번역") as HTMLTextAreaElement).value).toBe("Share?");
      expect(within(region).getByText(/모델 claude-opus-5-5 · 입력 900 · 출력 400 토큰 · 추정 \$0\.01/)).toBeTruthy();
      expect(within(region).getByText("말하는 사람이 분명하지 않아 존댓말 여부는 추측했어요.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "다시 번역하기 (요금 발생)" })).toBeTruthy();
      expect(screen.getByText("번역을 마쳤어요. 줄마다 바로 고쳐 쓸 수 있어요.")).toBeTruthy();
    });

    it("말풍선 폭을 넘는 줄과 용어집과 다른 줄을 줄마다 짚어 준다", async () => {
      connectClaude();
      renderDialog();
      typeLines();
      fireEvent.change(screen.getByLabelText("용어집 (선택)"), { target: { value: "하늘 = Sora" } });
      await runAndWait();

      const region = screen.getByRole("region", { name: "번역 결과" });
      expect(within(region).getByText("번역 3줄 · 폭 넘침 1줄 · 용어 확인 1줄 · 빠진 줄 0줄")).toBeTruthy();
      const first = region.querySelector('[data-claude-localize-line="1"]') as HTMLElement;
      expect(within(first).getByText("폭 142% · 넘침")).toBeTruthy();
      expect(within(first).getByText("더 짧은 안")).toBeTruthy();
      expect(within(first).getByText("혼잣말이라 가볍게 옮겼어요.")).toBeTruthy();
      const second = region.querySelector('[data-claude-localize-line="2"]') as HTMLElement;
      expect(within(second).getByText("폭 117%")).toBeTruthy();
      expect(within(second).getByText("용어집과 달라요: 하늘 → Sora")).toBeTruthy();
      const third = region.querySelector('[data-claude-localize-line="3"]') as HTMLElement;
      expect(within(third).getByText("폭 60%")).toBeTruthy();
    });

    it("번역을 고치면 폭·용어 점검이 고친 글 기준으로 다시 계산되고 '고침'이 붙는다", async () => {
      connectClaude();
      renderDialog();
      typeLines();
      fireEvent.change(screen.getByLabelText("용어집 (선택)"), { target: { value: "하늘 = Sora" } });
      await runAndWait();

      const region = screen.getByRole("region", { name: "번역 결과" });
      fireEvent.change(within(region).getByLabelText("1번 번역"), { target: { value: "Oh, rain." } });
      fireEvent.change(within(region).getByLabelText("2번 번역"), { target: { value: "Sora has no umbrella" } });

      expect(within(region).getByText("번역 3줄 · 폭 넘침 0줄 · 용어 확인 0줄 · 빠진 줄 0줄")).toBeTruthy();
      expect(within(region).getAllByText("고침")).toHaveLength(2);
      expect(within(region).getByText("폭 75%")).toBeTruthy();
    });

    it("더 짧은 안 쓰기를 누르면 번역이 그 안으로 바뀐다", async () => {
      connectClaude();
      renderDialog();
      typeLines();
      await runAndWait();

      const region = screen.getByRole("region", { name: "번역 결과" });
      fireEvent.click(within(region).getByRole("button", { name: "이 안 쓰기" }));

      expect((within(region).getByLabelText("1번 번역") as HTMLTextAreaElement).value).toBe("Oh, rain.");
      expect(within(region).queryByRole("button", { name: "이 안 쓰기" })).toBeNull();
      expect(within(region).getByText(/폭 75%/)).toBeTruthy();
    });

    it("빠진 줄은 빠졌다고 알리고, 직접 적으면 채워진다", async () => {
      connectClaude();
      runLocalize.mockResolvedValue(result({ ...RAW, items: RAW.items.filter((item) => item.index !== 3) }));
      renderDialog();
      typeLines();
      await runAndWait();

      const region = screen.getByRole("region", { name: "번역 결과" });
      expect(within(region).getByText("번역 2줄 · 폭 넘침 1줄 · 용어 확인 0줄 · 빠진 줄 1줄")).toBeTruthy();
      expect(within(region).getByText("이 줄은 번역이 오지 않았어요. 직접 적거나 다시 번역해 주세요.")).toBeTruthy();

      fireEvent.change(within(region).getByLabelText("3번 번역"), { target: { value: "Wanna share?" } });
      expect(within(region).queryByText("이 줄은 번역이 오지 않았어요. 직접 적거나 다시 번역해 주세요.")).toBeNull();
      expect(within(region).getByText("번역 3줄 · 폭 넘침 1줄 · 용어 확인 0줄 · 빠진 줄 0줄")).toBeTruthy();
    });

    it("번호가 맞지 않아 버린 항목이 있으면 몇 개인지 알린다", async () => {
      connectClaude();
      runLocalize.mockResolvedValue(result({ ...RAW, items: [...RAW.items, { index: 9, translation: "stray", shorter: null, note: null }] }));
      renderDialog();
      typeLines();
      await runAndWait();

      expect(screen.getByText("번호가 맞지 않는 항목 1개는 버렸어요.")).toBeTruthy();
    });

    it("복사는 고친 글을 기준으로 번역만·표·JSON 세 가지로 나간다", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
      connectClaude();
      renderDialog();
      typeLines();
      await runAndWait();
      const region = screen.getByRole("region", { name: "번역 결과" });
      fireEvent.change(within(region).getByLabelText("3번 번역"), { target: { value: "Wanna share?" } });

      fireEvent.click(within(region).getByRole("button", { name: "번역만 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(writeText).toHaveBeenLastCalledWith("Oh, it's raining.\nNo umbrella, says sky\nWanna share?");
      await waitFor(() => expect(within(region).getByRole("button", { name: "복사했어요." })).toBeTruthy());

      fireEvent.click(within(region).getByRole("button", { name: "표(TSV) 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
      expect(writeText).toHaveBeenLastCalledWith(["1\t어, 비 온다.\tOh, it's raining.", "2\t하늘이 우산이 없대\tNo umbrella, says sky", "3\t같이 쓸래?\tWanna share?"].join("\n"));

      fireEvent.click(within(region).getByRole("button", { name: "JSON 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(3));
      const json = JSON.parse(String(writeText.mock.calls[2]?.[0])) as { sourceLang: string; targetLang: string; lines: Array<{ index: number; translation: string }> };
      expect(json).toMatchObject({ sourceLang: "auto", targetLang: "en" });
      expect(json.lines.map((line) => line.translation)).toEqual(["Oh, it's raining.", "No umbrella, says sky", "Wanna share?"]);
    });

    it("결과를 본 뒤 대사를 고치면 이전 대사 기준이라고 알리고, 점검은 이전 설정 기준으로 남는다", async () => {
      connectClaude();
      renderDialog();
      typeLines();
      await runAndWait();
      expect(screen.queryByText(/아래 결과는 이전 대사 기준이에요/)).toBeNull();

      fireEvent.change(screen.getByLabelText("말풍선 대사"), { target: { value: `${LINES.join("\n")}\n새 대사` } });
      expect(screen.getByText("대사를 고쳤어요. 아래 결과는 이전 대사 기준이에요. 다시 번역하면 새로 만들어져요.")).toBeTruthy();
      expect(screen.getByRole("region", { name: "번역 결과" })).toBeTruthy();
    });

    it("다시 번역하면 고친 글은 지워지고 새 결과로 바뀐다", async () => {
      connectClaude();
      renderDialog();
      typeLines();
      await runAndWait();
      fireEvent.change(screen.getByLabelText("1번 번역"), { target: { value: "edited" } });

      runLocalize.mockResolvedValue(result({ ...RAW, items: RAW.items.map((item) => (item.index === 1 ? { ...item, translation: "Rain!" } : item)) }));
      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await waitFor(() => expect((screen.getByLabelText("1번 번역") as HTMLTextAreaElement).value).toBe("Rain!"));
      expect(runLocalize).toHaveBeenCalledTimes(2);
    });

    it("Ctrl+Enter로 입력 중에도 실행하고, 실행할 수 없을 때는 아무 일도 없다", async () => {
      connectClaude();
      renderDialog();
      const dialog = screen.getByRole("dialog");

      fireEvent.keyDown(dialog, { key: "Enter", ctrlKey: true });
      expect(runLocalize).not.toHaveBeenCalled();

      typeLines();
      fireEvent.keyDown(screen.getByLabelText("말풍선 대사"), { key: "Enter", ctrlKey: true });
      await screen.findByRole("region", { name: "번역 결과" });
      expect(runLocalize).toHaveBeenCalledTimes(1);
    });
  });

  describe("언어 쌍", () => {
    it("원문 언어를 정하면 서로 바꿀 수 있고, 자동 감지일 때는 바꿀 수 없다", () => {
      connectClaude();
      renderDialog();
      const swap = screen.getByRole("button", { name: "원문·번역 언어 바꾸기" }) as HTMLButtonElement;
      expect(swap.disabled).toBe(true);

      fireEvent.change(screen.getByLabelText("원문 언어"), { target: { value: "ko" } });
      fireEvent.change(screen.getByLabelText("번역할 언어"), { target: { value: "ja" } });
      expect(swap.disabled).toBe(false);

      fireEvent.click(swap);
      expect((screen.getByLabelText("원문 언어") as HTMLSelectElement).value).toBe("ja");
      expect((screen.getByLabelText("번역할 언어") as HTMLSelectElement).value).toBe("ko");
    });
  });

  describe("실패·중단·닫기", () => {
    it("실패하면 사유와 다음 행동을 알리고 자동으로 다시 보내지 않는다", async () => {
      connectClaude();
      runLocalize.mockRejectedValue(new Error("요청이 너무 많아요."));
      renderDialog();
      typeLines();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("번역을 마치지 못했어요. 내용을 확인하고 다시 시도해 주세요. (요청이 너무 많아요.)");
      expect(runLocalize).toHaveBeenCalledTimes(1);
      expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(false);
    });

    it("중단하면 요청을 취소하고 오류가 아니라 중단으로 보여 준다", async () => {
      connectClaude();
      let signal: AbortSignal | undefined;
      runLocalize.mockImplementation((_route, _input, options: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
        signal = options.signal;
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }));
      renderDialog();
      typeLines();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByRole("button", { name: "중단" });
      expect(screen.getByText(/번역하는 중이에요\. 줄이 많으면 몇 분 걸릴 수 있어요\./)).toBeTruthy();
      // 매초 바뀌는 경과 시간은 화면에만 보이고 안내 영역(role=status)에는 들어가지 않는다.
      expect(screen.getByText(/0초 경과/).closest("[role=status]")).toBeNull();
      expect((screen.getByLabelText("말풍선 대사") as HTMLTextAreaElement).disabled).toBe(true);

      fireEvent.click(screen.getByRole("button", { name: "중단" }));
      expect(signal?.aborted).toBe(true);
      await screen.findByText("번역을 중단했어요. 이미 처리된 부분은 요금이 청구됐을 수 있어요. 필요하면 다시 시도해 주세요.");
      expect(screen.queryByRole("alert")).toBeNull();
      expect((screen.getByLabelText("말풍선 대사") as HTMLTextAreaElement).disabled).toBe(false);
    });

    it("닫으면 진행 중인 요청도 취소한다", async () => {
      connectClaude();
      let signal: AbortSignal | undefined;
      runLocalize.mockImplementation((_route, _input, options: { signal: AbortSignal }) => new Promise(() => {
        signal = options.signal;
      }));
      const { onClose } = renderDialog();
      typeLines();

      fireEvent.click(screen.getByRole("button", { name: RUN }));
      await screen.findByRole("button", { name: "중단" });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "닫기" }));
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(true);
    });
  });
});

describe("ClaudeLocalizeDialog — 리뷰 반영", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
    localStorage.clear();
    sessionStorage.clear();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    runLocalize.mockReset();
    runLocalize.mockResolvedValue(result());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    lockUserAi(false);
    resetClaudeUsage();
    resetClaudeBudgetForTests();
    useI18n.setState({ lang: INITIAL_LANGUAGE });
  });

  it("대사를 넣기 전에는 '입력하면 계산해요'를 보여 주고 예산 경고를 띄우지 않는다", () => {
    connectClaude();
    setClaudeBudgetLimit(0.02);
    renderDialog();

    expect(document.querySelector("[data-claude-cap-chip]")?.textContent).toBe("입력하면 계산해요");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText("이번 한 번만 예산을 넘어도 진행해요")).toBeNull();
  });

  it("너무 긴 줄은 입력칸에서 보이는 줄 번호(빈 줄 포함)로 알린다", () => {
    connectClaude();
    renderDialog();
    fireEvent.change(screen.getByLabelText("말풍선 대사"), { target: { value: `짧아요\n\n\n${"가".repeat(241)}` } });

    expect(screen.getByText(/^4번째 줄이 241자예요/)).toBeTruthy();
  });

  it("원문과 번역할 언어가 같으면 보내지 않고 이유를 알린다", () => {
    connectClaude();
    renderDialog();
    typeLines();
    fireEvent.change(screen.getByLabelText("원문 언어"), { target: { value: "ko" } });
    fireEvent.change(screen.getByLabelText("번역할 언어"), { target: { value: "ko" } });

    expect((screen.getByRole("button", { name: RUN }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("원문 언어와 번역할 언어가 같아요. 하나를 바꿔 주세요.").length).toBeGreaterThan(0);
    expect(footerCap()).toBeUndefined();
  });

  it("줄이 많으면 나눠서 번역하라고 권한다", () => {
    connectClaude();
    renderDialog();
    typeLines(Array.from({ length: 26 }, (_, index) => `대사 ${index + 1}`));

    expect(document.querySelector("[data-claude-many-lines]")?.textContent).toContain("26줄");
    typeLines(LINES);
    expect(document.querySelector("[data-claude-many-lines]")).toBeNull();
  });

  it("용어집에 같은 원문이 겹치면 몇 줄이 건너뛰어졌는지 알린다", () => {
    connectClaude();
    renderDialog();
    fireEvent.change(screen.getByLabelText("용어집 (선택)"), { target: { value: "지훈 = Jihoon\n지훈 = Ji-hoon\nＪ = x" } });

    expect(screen.getByText("같은 원문이 겹치는 1줄은 앞의 것만 써요.")).toBeTruthy();
  });

  it("'이번 한 번만'을 고른 요청만 전송 계층에 예산 판정 건너뛰기를 알린다", async () => {
    connectClaude();
    setClaudeBudgetLimit(0.02);
    renderDialog();
    typeLines();

    fireEvent.click(screen.getByLabelText("이번 한 번만 예산을 넘어도 진행해요"));
    await runAndWait();

    expect(runLocalize.mock.calls[0]?.[2]).toMatchObject({ budgetOverride: true });
  });

  it("결과를 고치는 칸에서는 Ctrl+Enter가 새 요청을 보내지 않아 고친 번역이 지워지지 않는다", async () => {
    connectClaude();
    renderDialog();
    typeLines();
    await runAndWait();
    const region = screen.getByRole("region", { name: "번역 결과" });
    const field = within(region).getByLabelText("1번 번역");
    fireEvent.change(field, { target: { value: "내가 고친 번역" } });

    fireEvent.keyDown(field, { key: "Enter", ctrlKey: true });

    expect(runLocalize).toHaveBeenCalledTimes(1);
    expect((within(region).getByLabelText("1번 번역") as HTMLTextAreaElement).value).toBe("내가 고친 번역");
  });

  it("번호를 0부터 매겨 밀어 맞춘 결과면 줄이 제대로 짝지어졌는지 확인하라고 알린다", async () => {
    connectClaude();
    const shifted = result();
    runLocalize.mockResolvedValue({ ...shifted, view: { ...shifted.view, indexShifted: true } });
    renderDialog();
    typeLines();
    await runAndWait();

    expect(document.querySelector("[data-claude-index-shifted]")?.textContent).toContain("0부터 매겨서");
  });

  it("줄어든 항목이 있으면 몇 곳인지 알린다", async () => {
    connectClaude();
    const trimmed = result();
    runLocalize.mockResolvedValue({ ...trimmed, view: { ...trimmed.view, trimmed: 2 } });
    renderDialog();
    typeLines();
    await runAndWait();

    expect(document.querySelector("[data-claude-trimmed]")?.textContent).toContain("2곳의 내용이 줄었어요");
  });

  it("복사에 실패하면 조용히 넘기지 않고 알린다", async () => {
    connectClaude();
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    renderDialog();
    typeLines();
    await runAndWait();
    const region = screen.getByRole("region", { name: "번역 결과" });

    fireEvent.click(within(region).getByRole("button", { name: "번역만 복사" }));

    expect((await within(region).findByRole("alert")).textContent).toMatch(/복사하지 못했어요/);
  });

  it("실행하면 포커스가 중단 버튼으로 가고, 끝나면 실행 버튼으로 돌아온다", async () => {
    connectClaude();
    let finish: (value: LocalizeRunResult) => void = () => undefined;
    runLocalize.mockImplementation(() => new Promise<LocalizeRunResult>((resolve) => { finish = resolve; }));
    renderDialog();
    typeLines();

    fireEvent.click(screen.getByRole("button", { name: RUN }));
    const stop = await screen.findByRole("button", { name: "중단" });
    await waitFor(() => expect(document.activeElement).toBe(stop));

    await act(async () => { finish(result()); });
    await screen.findByRole("region", { name: "번역 결과" });
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: /다시 번역하기/ })));
  });
});
