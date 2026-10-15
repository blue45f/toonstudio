// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ResearchHomeRoute } from "./research-home-route";
import { refineMaterialSentenceWithFreeAi } from "./research-material-refine";

import type { StudioServerAiCompletion, StudioServerAiResult } from "@/domains/creator/studio-server-ai-client";

const mocks = vi.hoisted(() => ({
  complete: vi.fn<(system: string, user: string, signal?: AbortSignal) => Promise<unknown>>(),
}));

vi.mock("@/domains/creator/studio-server-ai-client", () => ({ completeAutomaticFreeText: mocks.complete }));

vi.mock("@/domains/creator-resources/CreatorHubPage", () => ({
  CreatorHubPage: ({ refineMaterialSentence }: { refineMaterialSentence?: (sentence: string, signal: AbortSignal) => Promise<string | null> }) => {
    const [result, setResult] = useState("대기");
    return (
      <div>
        <button
          type="button"
          onClick={() => { void refineMaterialSentence?.("비 와서 으스스한 동네 뒷길", new AbortController().signal).then((value) => setResult(value ?? "null")); }}
        >
          다듬기
        </button>
        <output aria-label="결과">{result}</output>
      </div>
    );
  },
}));

function completion(content: string): StudioServerAiResult<StudioServerAiCompletion> {
  return { ok: true, data: { content, provider: "gemini", model: "test" } };
}

beforeEach(() => {
  mocks.complete.mockReset();
});
afterEach(cleanup);

describe("ResearchHomeRoute", () => {
  it("라우트를 그리는 것만으로는 AI 를 부르지 않는다", () => {
    render(<ResearchHomeRoute />);
    expect(screen.getByRole("button", { name: "다듬기" })).toBeTruthy();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("버튼을 누르면 그때 무료 풀 AI 를 한 번 부르고, 정리된 문장을 돌려준다", async () => {
    mocks.complete.mockResolvedValue(completion("“비 오는 골목 밤 풍경”"));
    render(<ResearchHomeRoute />);
    fireEvent.click(screen.getByRole("button", { name: "다듬기" }));
    await waitFor(() => expect(screen.getByLabelText("결과").textContent).toBe("비 오는 골목 밤 풍경"));
    expect(mocks.complete).toHaveBeenCalledTimes(1);
    const [system, user, signal] = mocks.complete.mock.calls[0] ?? [];
    expect(system).toContain("지어내지 않습니다");
    expect(user).toBe("비 와서 으스스한 동네 뒷길");
    expect(signal).toBeInstanceOf(AbortSignal);
  });
});

describe("refineMaterialSentenceWithFreeAi", () => {
  const signal = new AbortController().signal;

  it("로그인 필요·한도 소진 같은 실패는 null 이다(허브는 규칙 기반 해석을 유지한다)", async () => {
    mocks.complete.mockResolvedValue({ ok: false, code: "login_required", error: "로그인이 필요해요." });
    await expect(refineMaterialSentenceWithFreeAi("비 오는 골목", signal)).resolves.toBeNull();
    mocks.complete.mockResolvedValue({ ok: false, code: "free_exhausted", error: "무료 한도를 모두 썼어요." });
    await expect(refineMaterialSentenceWithFreeAi("비 오는 골목", signal)).resolves.toBeNull();
  });

  it("원문과 같거나 쓸 수 없는 응답도 null 이다", async () => {
    mocks.complete.mockResolvedValue(completion("비 오는 골목"));
    await expect(refineMaterialSentenceWithFreeAi("비 오는 골목", signal)).resolves.toBeNull();
    mocks.complete.mockResolvedValue(completion("   "));
    await expect(refineMaterialSentenceWithFreeAi("비 오는 골목", signal)).resolves.toBeNull();
  });

  it("네트워크 예외는 호출한 쪽(허브)이 조용히 처리하도록 그대로 던진다", async () => {
    mocks.complete.mockRejectedValue(new Error("offline"));
    await expect(refineMaterialSentenceWithFreeAi("비 오는 골목", signal)).rejects.toThrow("offline");
  });
});
