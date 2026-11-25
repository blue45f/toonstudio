// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPaletteSuggestPanel } from "../StudioPaletteSuggestPanel";
import {
  runStudioAbortableAiBackgroundGenerate,
  runStudioAbortableAiCharacter,
  runStudioExecuteSuggestColorPalette,
} from "../studio-cuttoon-edit/studio-host-ai-target-lock-helpers";
import { StudioAiBackgroundPanel } from "./StudioAiBackgroundPanel";
import { StudioAiCharacterConsistencyPanel } from "./StudioAiCharacterConsistencyPanel";
import { StudioAiColorizePanel } from "./StudioAiColorizePanel";

const { generateBgMock, generateCharMock, suggestPaletteMock } = vi.hoisted(() => ({
  generateBgMock: vi.fn(),
  generateCharMock: vi.fn(),
  suggestPaletteMock: vi.fn(),
}));

vi.mock("./studio-ai-client-lazy", async () => {
  const actual = await vi.importActual<typeof import("./studio-ai-client-lazy")>("./studio-ai-client-lazy");
  return {
    ...actual,
    generateBackgroundImage: (...args: unknown[]) => generateBgMock(...args),
    generateConsistentCharacterImage: (...args: unknown[]) => generateCharMock(...args),
    suggestColorPalette: (...args: unknown[]) => suggestPaletteMock(...args),
  };
});

afterEach(() => {
  cleanup();
  generateBgMock.mockReset();
  generateCharMock.mockReset();
  suggestPaletteMock.mockReset();
});

const dummySettings = {
  baseUrl: "https://example.invalid/v1",
  apiKey: "test-key",
  imageModel: "gpt-image-1",
  textModel: "gpt-4o-mini",
} as never;

describe("Studio AI image & palette panel ergonomics, cancel, and local-preview fixes", () => {
  it("allows drafting colorize prompts, presets, hints, and palettes when unconfigured and exposes cancel while busy", () => {
    const onPromptChange = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <StudioAiColorizePanel
        configured={false}
        prompt=""
        onPromptChange={onPromptChange}
        busy={false}
        error={null}
        onColorize={vi.fn()}
        onCancel={onCancel}
      />,
    );

    const input = screen.getByPlaceholderText(/파스텔톤 웹툰 셀 채색/u) as HTMLInputElement;
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "야간 네온 셀 채색" } });
    expect(onPromptChange).toHaveBeenCalledWith("야간 네온 셀 채색");

    // Run CTA remains disabled while unconfigured, while presets remain clickable
    const runBtn = screen.getByRole("button", { name: /선택 이미지 채색/u }) as HTMLButtonElement;
    expect(runBtn.disabled).toBe(true);

    rerender(
      <StudioAiColorizePanel
        configured={true}
        prompt="야간 네온 셀 채색"
        onPromptChange={onPromptChange}
        busy={true}
        error={null}
        onColorize={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId("ai-colorize-cancel-btn"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders cancel controls for Background & Character Consistency panels and aborts in-flight jobs cleanly", async () => {
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
    fireEvent.click(screen.getByTestId("ai-character-cancel-btn"));
    expect(onBgCancel).toHaveBeenCalledTimes(1);
    expect(onCharCancel).toHaveBeenCalledTimes(1);

    let resolveBg!: (value: unknown) => void;
    let capturedBgSignal: AbortSignal | undefined;
    generateBgMock.mockImplementation((_s: unknown, _p: unknown, opts: { signal?: AbortSignal }) => {
      capturedBgSignal = opts.signal;
      return new Promise((r) => { resolveBg = r; });
    });

    const bgAbortRef = { current: null as AbortController | null };
    const insertBackground = vi.fn(() => true);
    const setBusy = vi.fn();
    const pendingBg = runStudioAbortableAiBackgroundGenerate({
      prompt: "빗속 정류장", size: "1024x1024", collaborationLocked: false,
      activePageId: "page-a", selectedFrameId: null, aiSettings: dummySettings,
      abortRef: bgAbortRef, editorMountedRef: { current: true },
      captureMutationTicket: () => 1, canApplyMutation: () => true,
      beginTrackedOperation: () => "op-bg-1", settleOperation: vi.fn(),
      setBusy, setError: vi.fn(), insertBackground, applyFailedMessage: "fail", onApplied: vi.fn(),
    });
    expect(bgAbortRef.current).not.toBeNull();
    bgAbortRef.current?.abort();
    expect(capturedBgSignal?.aborted).toBe(true);
    resolveBg({ ok: true, data: { dataUrl: "data:image/png;base64,BBBB", width: 1024, height: 1024, model: "gpt-image-1" } });
    await pendingBg;
    expect(insertBackground).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(false);

    let resolveChar!: (value: unknown) => void;
    let capturedCharSignal: AbortSignal | undefined;
    generateCharMock.mockImplementation((_s: unknown, _ref: unknown, _p: unknown, opts: { signal?: AbortSignal }) => {
      capturedCharSignal = opts.signal;
      return new Promise((r) => { resolveChar = r; });
    });
    const charAbortRef = { current: null as AbortController | null };
    const insertCharacter = vi.fn(() => true);
    const pendingChar = runStudioAbortableAiCharacter({
      reference: { elementId: "img-1", src: "data:image/png;base64,AAAA", width: 400, height: 600 },
      prompt: "골목길", collaborationLocked: false, activePageId: "page-a", aiSettings: dummySettings,
      abortRef: charAbortRef, editorMountedRef: { current: true },
      captureMutationTicket: () => 1, canApplyMutation: () => true,
      beginTrackedOperation: () => "op-char-1", settleOperation: vi.fn(),
      setBusy: vi.fn(), setError: vi.fn(), insertCharacter, applyFailedMessage: "fail", onApplied: vi.fn(),
    });
    charAbortRef.current?.abort();
    expect(capturedCharSignal?.aborted).toBe(true);
    resolveChar({ ok: true, data: { dataUrl: "data:image/png;base64,CCCC" } });
    await pendingChar;
    expect(insertCharacter).not.toHaveBeenCalled();
  });

  it("lets local palette recommendation override an existing server palette and aborts in-flight palette requests", async () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <StudioPaletteSuggestPanel
        configured={true}
        moodText="스릴러 야간 비 오는 골목"
        onMoodTextChange={vi.fn()}
        busy={false}
        error={null}
        suggestion={{
          name: "이전 서버 팔레트",
          colors: [{ hex: "#112233", role: "어두운 배경" }],
        }}
        savedMessage={null}
        onGenerate={vi.fn()}
        onCancel={onCancel}
        onSaveToLibrary={vi.fn()}
      />,
    );

    expect(screen.getByText("이전 서버 팔레트")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기본 웹툰 배색 즉시 추천" }));
    expect(screen.queryByText("이전 서버 팔레트")).toBeNull();

    rerender(
      <StudioPaletteSuggestPanel
        configured={true}
        moodText="스릴러 야간"
        onMoodTextChange={vi.fn()}
        busy={true}
        error={null}
        suggestion={null}
        savedMessage={null}
        onGenerate={vi.fn()}
        onCancel={onCancel}
        onSaveToLibrary={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("palette-suggest-cancel-btn"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    let resolvePalette!: (value: unknown) => void;
    suggestPaletteMock.mockImplementation(() => new Promise((r) => { resolvePalette = r; }));
    const paletteAbortRef = { current: null as AbortController | null };
    const settleTextOperation = vi.fn();
    const setSuggestion = vi.fn();
    const pendingPalette = runStudioExecuteSuggestColorPalette({
      collaborationLocked: false, moodText: "청춘 로맨스", busy: false, activePageId: "page-a",
      aiSettings: dummySettings, textAiTransport: { mode: "server" }, abortRef: paletteAbortRef,
      pendingProvider: () => ({ provider: "gemini", model: "gemini-2.5-flash", transport: "server" }),
      beginTrackedOperation: () => "op-pal-1", settleTextOperation,
      setBusy: vi.fn(), setError: vi.fn(), setSuggestion, clearSavedMessage: vi.fn(),
    });
    paletteAbortRef.current?.abort();
    resolvePalette({ ok: true, data: { name: "지연 팔레트", colors: [{ hex: "#ffffff", role: "배경" }] } });
    await pendingPalette;
    expect(settleTextOperation).toHaveBeenCalledWith("op-pal-1", expect.anything(), undefined, true);
    expect(setSuggestion).toHaveBeenCalledTimes(1); // Only the initial null reset, NEVER stale result
    expect(setSuggestion).toHaveBeenCalledWith(null);
  });
});
