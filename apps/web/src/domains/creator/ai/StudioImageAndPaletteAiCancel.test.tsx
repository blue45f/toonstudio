// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPaletteSuggestPanel } from "../StudioPaletteSuggestPanel";
import { runStudioExecuteSuggestColorPalette } from "../studio-cuttoon-edit/studio-host-wave2-ai-assist-helpers";
import { createStudioImageAiExecutors } from "../studio-cuttoon-edit/studio-image-ai-executors";
import { buildLocalWebtoonPaletteSuggestion } from "../studio-palette-suggest";
import { StudioAiBackgroundPanel } from "./StudioAiBackgroundPanel";
import { StudioAiCharacterConsistencyPanel } from "./StudioAiCharacterConsistencyPanel";
import { StudioAiColorizePanel } from "./StudioAiColorizePanel";
import {
  generateBackgroundImage,
  generateConsistentCharacterImage,
  suggestColorPalette,
} from "./studio-ai-client-lazy";
import { STUDIO_AI_DEFAULT_SETTINGS } from "./studio-ai-settings";

vi.mock("./studio-ai-client-lazy", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-ai-client-lazy")>(),
  generateBackgroundImage: vi.fn(),
  generateConsistentCharacterImage: vi.fn(),
  suggestColorPalette: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.mocked(generateBackgroundImage).mockReset();
  vi.mocked(generateConsistentCharacterImage).mockReset();
  vi.mocked(suggestColorPalette).mockReset();
});

const mutationTicket = { accessGeneration: 0, documentGeneration: 0, authScopeKey: null, workId: null };

function createTestImageRuntime() {
  const documentWrites = {
    addRenderedImage: vi.fn(() => true),
    patchImageElOnPage: vi.fn(() => true),
    patchEl: vi.fn(() => true),
    commit: vi.fn(() => true),
    commitPages: vi.fn(() => true),
  };
  const setFailure = vi.fn();
  const setMenu = vi.fn();
  const settleTrackedStudioAiOperation = vi.fn();
  const executors = createStudioImageAiExecutors({
    currentPageIdRef: { current: "page-a" },
    readCurrentPages: () => [],
    activePage: { id: "page-a" },
    selected: null,
    elements: [],
    canvasH: 1080,
    aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
    t: (key) => key,
    canApplyStudioMutation: () => true,
    beginTrackedStudioAiOperation: () => "operation",
    settleTrackedStudioAiOperation,
    setSelectedId: vi.fn(),
    setTool: vi.fn(),
    setFailure,
    setMenu,
    ...documentWrites,
  });
  return { executors, documentWrites, setFailure, setMenu, settleTrackedStudioAiOperation };
}

describe("AI 이미지 도구와 팔레트의 요청 준비·취소", () => {
  it("개인 키가 없어도 채색 지시와 색 힌트를 준비하고 실행 중에는 취소한다", () => {
    const onPromptChange = vi.fn();
    const onCancel = vi.fn();
    const panel = (configured: boolean, busy: boolean) => (
      <StudioAiColorizePanel
        configured={configured}
        prompt="야간 셀 채색"
        onPromptChange={onPromptChange}
        busy={busy}
        error={null}
        onColorize={vi.fn()}
        onCancel={onCancel}
      />
    );
    const { rerender } = render(panel(false, false));
    const input = screen.getByPlaceholderText<HTMLInputElement>(/파스텔톤 웹툰 셀 채색/u);
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "밤거리 셀 채색" } });
    expect(onPromptChange).toHaveBeenLastCalledWith("밤거리 셀 채색");
    fireEvent.click(screen.getByRole("button", { name: "파스텔 셀" }));
    expect(onPromptChange).toHaveBeenLastCalledWith(expect.stringContaining("파스텔톤 웹툰 셀 채색"));
    fireEvent.click(screen.getByRole("button", { name: "밝은 피부" }));
    expect(onPromptChange).toHaveBeenLastCalledWith(expect.stringContaining("밝은 피부"));
    fireEvent.click(screen.getByRole("button", { name: "야간" }));
    expect(onPromptChange).toHaveBeenLastCalledWith(expect.stringContaining("야간 팔레트"));
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /선택 이미지 채색/u }).disabled).toBe(true);

    rerender(panel(true, true));
    fireEvent.click(screen.getByTestId("ai-colorize-cancel-btn"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("배경·캐릭터 생성 중 취소 버튼이 해당 요청의 콜백을 호출한다", () => {
    const onBgCancel = vi.fn();
    const onCharCancel = vi.fn();
    render(
      <>
        <StudioAiBackgroundPanel
          configured={true}
          prompt="비 오는 지하철 출구"
          onPromptChange={vi.fn()}
          size="1024x1024"
          onSizeChange={vi.fn()}
          busy={true}
          error={null}
          onGenerate={vi.fn()}
          onCancel={onBgCancel}
        />
        <StudioAiCharacterConsistencyPanel
          configured={true}
          hasReference={true}
          referenceThumbnail="data:image/png;base64,AAAA"
          prompt="우산을 쓰고 서 있는 모습"
          onPromptChange={vi.fn()}
          busy={true}
          error={null}
          onGenerate={vi.fn()}
          onCancel={onCharCancel}
          onRequestSelectReference={vi.fn()}
        />
      </>,
    );
    fireEvent.click(screen.getByTestId("ai-bg-cancel-btn"));
    expect(onBgCancel).toHaveBeenCalledTimes(1);
    expect(onCharCancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("ai-character-cancel-btn"));
    expect(onBgCancel).toHaveBeenCalledTimes(1);
    expect(onCharCancel).toHaveBeenCalledTimes(1);
  });

  it("배경 실행기의 취소 신호가 전달되고 늦은 성공 응답은 원고에 쓰이지 않는다", async () => {
    const controller = new AbortController();
    const response = Promise.withResolvers<Awaited<ReturnType<typeof generateBackgroundImage>>>();
    vi.mocked(generateBackgroundImage).mockReturnValueOnce(response.promise);
    const { executors, documentWrites, setFailure, setMenu, settleTrackedStudioAiOperation } = createTestImageRuntime();

    const pending = executors.executeAiBackgroundGenerate(
      "빗속 정류장", "1024x1024", mutationTicket, controller,
    );
    expect(generateBackgroundImage).toHaveBeenCalledExactlyOnceWith(
      STUDIO_AI_DEFAULT_SETTINGS, "빗속 정류장", { size: "1024x1024", signal: controller.signal },
    );
    const signal = vi.mocked(generateBackgroundImage).mock.calls[0]?.[2]?.signal;
    expect(signal).toBe(controller.signal);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    response.resolve({
      ok: true,
      data: { dataUrl: "data:image/png;base64,BBBB", width: 1024, height: 1024, model: "fixture-model" },
    });
    await pending;

    expect(settleTrackedStudioAiOperation).toHaveBeenCalledExactlyOnceWith(
      "operation", { ok: false }, { aborted: true },
    );
    for (const write of Object.values(documentWrites)) expect(write).not.toHaveBeenCalled();
    expect(setFailure).not.toHaveBeenCalled();
    expect(setMenu).not.toHaveBeenCalled();
  });

  it("캐릭터 실행기의 취소 신호가 전달되고 늦은 성공 응답은 원고에 쓰이지 않는다", async () => {
    const controller = new AbortController();
    const response = Promise.withResolvers<Awaited<ReturnType<typeof generateConsistentCharacterImage>>>();
    vi.mocked(generateConsistentCharacterImage).mockReturnValueOnce(response.promise);
    const { executors, documentWrites, setFailure, setMenu, settleTrackedStudioAiOperation } = createTestImageRuntime();
    const reference = { elementId: "img-1", src: "data:image/png;base64,AAAA", width: 400, height: 600 };

    const pending = executors.executeAiCharacterConsistency(reference, "골목길", mutationTicket, controller);
    expect(generateConsistentCharacterImage).toHaveBeenCalledExactlyOnceWith(
      STUDIO_AI_DEFAULT_SETTINGS, reference.src, "골목길", { signal: controller.signal },
    );
    const signal = vi.mocked(generateConsistentCharacterImage).mock.calls[0]?.[3]?.signal;
    expect(signal).toBe(controller.signal);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    response.resolve({ ok: true, data: { dataUrl: "data:image/png;base64,CCCC" } });
    await pending;

    expect(settleTrackedStudioAiOperation).toHaveBeenCalledExactlyOnceWith(
      "operation", { ok: false }, { aborted: true },
    );
    for (const write of Object.values(documentWrites)) expect(write).not.toHaveBeenCalled();
    expect(setFailure).not.toHaveBeenCalled();
    expect(setMenu).not.toHaveBeenCalled();
  });

  it("기본 배색을 고르면 이전 서버 팔레트 대신 그 결과를 저장하고 요청 중에는 취소한다", () => {
    const moodText = "스릴러 야간 비 오는 골목";
    const onCancel = vi.fn();
    const onGenerate = vi.fn();
    const onSaveToLibrary = vi.fn();
    const panel = (busy: boolean) => (
      <StudioPaletteSuggestPanel
        configured={true}
        moodText={moodText}
        onMoodTextChange={vi.fn()}
        busy={busy}
        error={null}
        suggestion={{ name: "이전 서버 팔레트", colors: [{ hex: "#112233", role: "어두운 배경" }] }}
        savedMessage={null}
        onGenerate={onGenerate}
        onCancel={onCancel}
        onSaveToLibrary={onSaveToLibrary}
      />
    );
    const { rerender } = render(panel(false));

    expect(screen.getByText("이전 서버 팔레트")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기본 웹툰 배색 즉시 추천" }));
    const localSuggestion = buildLocalWebtoonPaletteSuggestion(moodText);
    expect(screen.getByText(localSuggestion.name)).toBeTruthy();
    expect(screen.queryByText("이전 서버 팔레트")).toBeNull();
    expect(onGenerate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "내 팔레트에 저장" }));
    expect(onSaveToLibrary).toHaveBeenCalledExactlyOnceWith(localSuggestion);

    rerender(panel(true));
    fireEvent.click(screen.getByTestId("palette-suggest-cancel-btn"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("팔레트 요청을 취소하면 늦은 응답을 제안에 반영하지 않는다", async () => {
    const response = Promise.withResolvers<Awaited<ReturnType<typeof suggestColorPalette>>>();
    vi.mocked(suggestColorPalette).mockReturnValueOnce(response.promise);
    const abortRef = { current: null as AbortController | null };
    const settleTextOperation = vi.fn();
    const setSuggestion = vi.fn();
    const setBusy = vi.fn();
    const pending = runStudioExecuteSuggestColorPalette({
      collaborationLocked: false, moodText: "청춘 로맨스", busy: false, activePageId: "page-a",
      aiSettings: STUDIO_AI_DEFAULT_SETTINGS, textAiTransport: { mode: "server" }, abortRef,
      pendingProvider: () => ({ provider: "gemini", model: "fixture-model", transport: "server" }),
      beginTrackedOperation: () => "op-palette", settleTextOperation,
      setBusy, setError: vi.fn(), setSuggestion, clearSavedMessage: vi.fn(),
    });
    const controller = abortRef.current;
    expect(controller).not.toBeNull();
    expect(suggestColorPalette).toHaveBeenCalledExactlyOnceWith(
      STUDIO_AI_DEFAULT_SETTINGS, "청춘 로맨스", expect.objectContaining({ signal: controller?.signal }),
    );
    const signal = vi.mocked(suggestColorPalette).mock.calls[0]?.[2]?.signal;
    expect(signal).toBe(controller?.signal);
    controller?.abort();
    expect(signal?.aborted).toBe(true);
    const result = {
      ok: true,
      data: {
        name: "지연 팔레트",
        colors: [{ hex: "#ffffff", role: "배경" }],
        textProvenance: {
          provider: "gemini", model: "fixture-model", transport: "server", promptVersion: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      },
    } satisfies Awaited<ReturnType<typeof suggestColorPalette>>;
    response.resolve(result);
    await pending;

    expect(settleTextOperation).toHaveBeenCalledExactlyOnceWith("op-palette", { ok: false }, undefined, true);
    expect(setSuggestion).toHaveBeenCalledExactlyOnceWith(null);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });
});
