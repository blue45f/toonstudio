// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFreeAiAssistWorkbench } from "./StudioFreeAiAssistWorkbench";

afterEach(cleanup);

describe("다국어 번역 용어집·문화 검수", () => {
  it("대상 언어, 모든 용어의 영어·일본어 번역과 표기 규칙, 문화 검수 의견을 표시하고 복사한다", async () => {
    const glossary = [
      { termKo: "청야", en: "Blue Night", ja: "青夜", ruleNote: "길드 이름은 띄어 쓴다." },
      { termKo: "잔향", en: "Echo", ja: "残響", ruleNote: "능력명은 대문자로 시작한다." },
      { termKo: "서리", en: "Seori", ja: "ソリ", ruleNote: "인명은 음차한다." },
      { termKo: "북문", en: "North Gate", ja: "北門", ruleNote: "지명 표기를 통일한다." },
      { termKo: "해무", en: "Sea Mist", ja: "海霧", ruleNote: "배 이름을 그대로 쓴다." },
    ];
    const culturalNotes = [
      { severity: "warn", topic: "말풍선 너비", adaptationTip: "긴 영문을 넣을 여백을 확보한다." },
      { severity: "info", topic: "인사말", adaptationTip: "말끝으로 인물 사이의 거리를 표현한다." },
    ];
    const mode = "localization-glossary-check";
    const fetchImpl: typeof fetch = async (_url, init) => init?.method === "POST"
      ? Response.json({
        provider: "github-models-free", providerTier: "cloud-free", model: "test-model",
        result: { mode, data: { targetLocales: ["en", "ja"], glossary, culturalNotes } },
      })
      : new Response(null, { status: 503 });
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(<StudioFreeAiAssistWorkbench initialMode={mode} fetchImpl={fetchImpl} />);
      fireEvent.click(screen.getByRole("button", { name: "₩0 무료 AI 실행" }));
      const result = await screen.findByTestId("studio-free-ai-workbench-result");
      const lines = within(result).getAllByRole("listitem").map((item) => item.textContent);
      expect(lines).toHaveLength(glossary.length + culturalNotes.length);
      glossary.forEach((entry, index) => {
        for (const field of Object.values(entry)) expect(lines[index]).toContain(field);
      });
      culturalNotes.forEach((note, index) => {
        const line = lines[glossary.length + index];
        expect(line).toContain(note.severity === "warn" ? "주의" : "참고");
        expect(line).toContain(note.topic);
        expect(line).toContain(note.adaptationTip);
      });
      expect(result.textContent).toContain("en, ja");
      expect(within(result).getByText("무료 클라우드", { exact: true })).toBeTruthy();
      fireEvent.click(within(result).getByRole("button", { name: "결과 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
      const [copied] = writeText.mock.calls[0];
      expect(copied).toContain("en, ja");
      expect(copied.split("\n").slice(1)).toEqual(lines.map((line) => `- ${line}`));
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("서버에 연결할 수 없는 창작 보조 워크벤치", () => {
  it.each([
    { mode: "script-to-cuts", input: "1컷: 안개가 걷힌다.\n2컷: 서리가 지도를 편다.\n3컷: 둘은 폐역을 떠난다.", expected: "3컷 · 둘은 폐역을 떠난다." },
    { mode: "dialogue-polish", input: "잠깐만요, 먼저 원본을 확인해야 합니다. 내일 오전까지 보내도 괜찮을까요?", expected: "내일 오전까지 보내도 괜찮을까요?" },
    { mode: "color-mood-director", input: "지정색 #def 와 #1357", expected: "[원고 지정색] #1357" },
  ] as const)("$mode 입력으로 생성한 결과를 표시하고 같은 내용을 복사한다", async ({ mode, input, expected }) => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(<StudioFreeAiAssistWorkbench initialMode={mode} fetchImpl={async () => { throw new Error("offline"); }} />);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: input } });
      fireEvent.click(screen.getByRole("button", { name: "₩0 무료 AI 실행" }));
      const result = await screen.findByTestId("studio-free-ai-workbench-result");
      expect(within(result).getByText("로컬 코치", { exact: true })).toBeTruthy();
      expect(result.textContent).toContain(expected);
      fireEvent.click(within(result).getByRole("button", { name: "결과 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(expected)));
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});

describe("창작 보조 처리 경로와 세부 정보", () => {
  it.each([
    { tier: "local-fallback", label: "로컬 코치", provider: "local-zero-cost-fallback", model: "toonstudio-deterministic-coach-v2" },
    { tier: "cloud-free", label: "무료 클라우드", provider: "github-models-free", model: "openai/gpt-4o-mini" },
  ])("$tier 응답은 읽기 쉬운 처리 경로를 표시하고 공급자 ID와 모델을 펼쳐 볼 수 있다", async ({ tier, label, provider, model }) => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => Promise.resolve(
      init?.method === "POST"
        ? Response.json({
          provider, providerTier: tier, model,
          result: { mode: "script-to-cuts", data: {
            episodeGoal: "밤기차 이야기의 첫 장면을 보여준다.",
            pacingTip: "기차가 출발하기 전 여백을 둔다.",
            cuts: [{ cutNumber: 1, beatKind: "setup", shotType: "전경", visualAction: "밤기차 출발", dialogue: "", scrollGapHint: "아래 여백 200px" }],
          } },
        })
        : new Response(null, { status: 503 }),
    ));
    render(<StudioFreeAiAssistWorkbench initialMode="script-to-cuts" fetchImpl={fetchImpl} />);
    expect(screen.getAllByText("창작자 이용료 ₩0 · 무료 경로만 사용")).toHaveLength(1);
    const run = screen.getByRole("button", { name: "₩0 무료 AI 실행" });
    fireEvent.click(run);
    const result = await screen.findByTestId("studio-free-ai-workbench-result");
    expect(within(result).getByText(label, { exact: true })).toBeTruthy();
    const summary = within(result).getByText("처리 정보", { exact: true });
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    expect(within(result).getByText(provider, { exact: true }).closest("details")).toBe(details);
    expect(within(result).getByText(model, { exact: true }).closest("details")).toBe(details);
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
  });
});
