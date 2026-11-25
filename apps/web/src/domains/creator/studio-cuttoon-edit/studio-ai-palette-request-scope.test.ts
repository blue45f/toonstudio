import { beforeEach, describe, expect, it, vi } from "vitest";

import { suggestColorPalette } from "../ai/studio-ai-client-lazy";
import { STUDIO_AI_DEFAULT_SETTINGS } from "../ai/studio-ai-settings";
import { cancelStudioAiRequest, runStudioExecuteSuggestColorPalette } from "./studio-host-wave2-ai-assist-helpers";

vi.mock("../ai/studio-ai-client-lazy", () => ({
  studioTextAiTransportForOperation: <T>(transport: T) => transport,
  suggestColorPalette: vi.fn(),
}));

type PaletteResult = Awaited<ReturnType<typeof suggestColorPalette>>;

const result: PaletteResult = {
  ok: true,
  data: {
    name: "비 오는 저녁",
    colors: [{ hex: "#ffffff", role: "배경" }],
    textProvenance: {
      provider: "gemini", model: "fixture-model", transport: "server", promptVersion: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  },
};

function setup() {
  const state = { workId: "work-a", documentGeneration: 0, accessGeneration: 0 };
  const { workId, accessGeneration } = state;
  const input = {
    collaborationLocked: false,
    moodText: "비 오는 저녁",
    busy: false,
    activePageId: "page-a",
    aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
    textAiTransport: { mode: "server" } as const,
    abortRef: { current: null as AbortController | null },
    isRequestScopeCurrent: () => state.workId === workId && state.accessGeneration === accessGeneration,
    pendingProvider: () => ({ provider: "gemini", model: "fixture-model", transport: "server" } as const),
    beginTrackedOperation: vi.fn().mockReturnValueOnce("palette-1").mockReturnValueOnce("palette-2"),
    settleTextOperation: vi.fn(),
    setBusy: vi.fn(),
    setError: vi.fn(),
    setSuggestion: vi.fn(),
    clearSavedMessage: vi.fn(),
  };
  return { input, state };
}

describe("팔레트 추천 요청의 원고 범위", () => {
  beforeEach(() => {
    vi.mocked(suggestColorPalette).mockReset();
  });

  it("같은 원고에서 새 획을 그린 뒤 도착한 추천을 표시하고 기록을 종결한다", async () => {
    const { input, state } = setup();
    const response = Promise.withResolvers<PaletteResult>();
    vi.mocked(suggestColorPalette).mockReturnValueOnce(response.promise);
    const pending = runStudioExecuteSuggestColorPalette(input);
    state.documentGeneration += 1;
    response.resolve(result);
    await pending;

    expect(input.settleTextOperation).toHaveBeenCalledTimes(1);
    expect(input.settleTextOperation.mock.calls[0]?.slice(0, 3)).toEqual(["palette-1", result, result.data.textProvenance]);
    expect(input.setSuggestion).toHaveBeenLastCalledWith(result.data);
    expect(input.setBusy).toHaveBeenLastCalledWith(false);
  });

  it("원고를 편집한 뒤 취소하면 한 번만 종결하고 다음 요청을 보존한다", async () => {
    const { input, state } = setup();
    const previous = Promise.withResolvers<PaletteResult>();
    const next = Promise.withResolvers<PaletteResult>();
    vi.mocked(suggestColorPalette).mockReturnValueOnce(previous.promise).mockReturnValueOnce(next.promise);
    const first = runStudioExecuteSuggestColorPalette(input);
    state.documentGeneration += 1;
    cancelStudioAiRequest(input.abortRef, input.setBusy);
    expect(input.settleTextOperation).toHaveBeenCalledExactlyOnceWith("palette-1", { ok: false }, undefined, true);

    const second = runStudioExecuteSuggestColorPalette(input);
    const nextController = input.abortRef.current;
    previous.resolve(result);
    await first;
    expect(input.abortRef.current).toBe(nextController);
    expect(input.setBusy).toHaveBeenLastCalledWith(true);
    expect(input.settleTextOperation).toHaveBeenCalledTimes(1);
    expect(input.setSuggestion).toHaveBeenLastCalledWith(null);

    next.resolve(result);
    await second;
    expect(input.settleTextOperation).toHaveBeenCalledTimes(2);
    expect(input.settleTextOperation.mock.calls[1]?.[0]).toBe("palette-2");
    expect(input.setSuggestion).toHaveBeenLastCalledWith(result.data);
    expect(input.setBusy).toHaveBeenLastCalledWith(false);
  });

  it("원고를 바꾼 뒤에는 이전 요청이 추천과 작업 기록을 변경하지 않는다", async () => {
    const { input, state } = setup();
    const response = Promise.withResolvers<PaletteResult>();
    vi.mocked(suggestColorPalette).mockReturnValueOnce(response.promise);
    const pending = runStudioExecuteSuggestColorPalette(input);
    input.setBusy.mockClear();
    input.setError.mockClear();
    input.setSuggestion.mockClear();
    state.workId = "work-b";
    const nextController = new AbortController();
    input.abortRef.current = nextController;
    response.resolve(result);
    await pending;

    expect(input.abortRef.current).toBe(nextController);
    expect(input.settleTextOperation).not.toHaveBeenCalled();
    expect(input.setSuggestion).not.toHaveBeenCalled();
    expect(input.setError).not.toHaveBeenCalled();
    expect(input.setBusy).not.toHaveBeenCalled();
  });

  it("같은 원고의 편집 권한이 바뀌면 이전 결과를 버리고 요청의 로딩 표시를 해제한다", async () => {
    const { input, state } = setup();
    const response = Promise.withResolvers<PaletteResult>();
    vi.mocked(suggestColorPalette).mockReturnValueOnce(response.promise);
    const pending = runStudioExecuteSuggestColorPalette(input);
    state.accessGeneration += 1;
    response.resolve(result);
    await pending;

    expect(input.abortRef.current).toBeNull();
    expect(input.settleTextOperation).not.toHaveBeenCalled();
    expect(input.setSuggestion).toHaveBeenCalledExactlyOnceWith(null);
    expect(input.setBusy).toHaveBeenLastCalledWith(false);
  });
});
