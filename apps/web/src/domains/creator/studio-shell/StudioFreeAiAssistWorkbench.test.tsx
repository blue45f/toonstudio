// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFreeAiAssistWorkbench } from "./StudioFreeAiAssistWorkbench";

afterEach(cleanup);

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
      expect(result.textContent).toContain("local-zero-cost-fallback");
      expect(result.textContent).toContain(expected);
      fireEvent.click(within(result).getByRole("button", { name: "결과 복사" }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining(expected)));
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });
});
