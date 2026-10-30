// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as assistTransport from "@/shared/ai/assist/assist-transport";

import { StudioCharacterCanonEditor } from "./StudioCharacterCanonEditor";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditorWithAuthorText() {
  render(<StudioCharacterCanonEditor onSubmit={() => []} onCancel={() => undefined} />);
  const appearance = screen.getByPlaceholderText(/얼굴 생김새|Face, hairstyle/u) as HTMLTextAreaElement;
  const outfit = screen.getByPlaceholderText(/남색 교복 재킷|navy school blazer/u) as HTMLTextAreaElement;
  const tags = screen.getByPlaceholderText(/안경, 왼쪽 눈 밑 점|glasses, mole/u) as HTMLInputElement;
  fireEvent.change(appearance, { target: { value: "30대 초반, 회색 단발, 오른쪽 뺨 흉터" } });
  fireEvent.change(outfit, { target: { value: "낡은 갈색 가죽 재킷" } });
  fireEvent.change(tags, { target: { value: "흉터, 단발" } });
  return { appearance, outfit, tags };
}

describe("캐릭터 캐논 편집기의 AI 자동 완성", () => {
  it("AI 호출이 실패하면 작가가 쓴 외모·의상·태그를 예시 문구로 덮지 않고 알린다", async () => {
    const parseSpy = vi.spyOn(assistTransport, "assistParse").mockRejectedValue(new Error("simulated offline"));
    const { appearance, outfit, tags } = renderEditorWithAuthorText();

    fireEvent.click(screen.getByTestId("canon-claude-auto-architect-btn"));

    await screen.findByTestId("canon-ai-unavailable-notice");
    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(appearance.value).toBe("30대 초반, 회색 단발, 오른쪽 뺨 흉터");
    expect(outfit.value).toBe("낡은 갈색 가죽 재킷");
    expect(tags.value).toBe("흉터, 단발");
    expect(screen.queryByTestId("canon-claude-insight-box")).toBeNull();
  });

  it("다시 실행해 AI 결과가 오면 알림을 지우고 외모·의상을 바꾸며 작가 태그는 앞에 남긴다", async () => {
    vi.spyOn(assistTransport, "assistParse")
      .mockRejectedValueOnce(new Error("simulated offline"))
      .mockResolvedValueOnce({
        message: { model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 10 } } as never,
        parsed: {
          appearanceKo: "30대 초반, 회색 단발, 오른쪽 뺨 흉터, 회색 눈",
          outfitKo: "낡은 갈색 가죽 재킷과 검은 바지",
          traitTags: ["회색 눈"],
          englishPromptLockTokens: "early thirties, gray bob hair, scar on right cheek",
          negativeDriftTokens: "missing scar, hair color drift",
          speechStyleSummaryKo: "짧은 반말",
        },
      });
    const { appearance, outfit, tags } = renderEditorWithAuthorText();
    const runButton = screen.getByTestId("canon-claude-auto-architect-btn");

    fireEvent.click(runButton);
    await screen.findByTestId("canon-ai-unavailable-notice");
    await vi.waitFor(() => expect(runButton.hasAttribute("disabled")).toBe(false));
    fireEvent.click(runButton);

    await screen.findByTestId("canon-claude-insight-box");
    expect(screen.queryByTestId("canon-ai-unavailable-notice")).toBeNull();
    expect(appearance.value).toBe("30대 초반, 회색 단발, 오른쪽 뺨 흉터, 회색 눈");
    expect(outfit.value).toBe("낡은 갈색 가죽 재킷과 검은 바지");
    expect(tags.value).toBe("흉터, 단발, 회색 눈");
  });
});
