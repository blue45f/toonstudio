// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  addColorizeCandidate,
  createColorizeCandidateSession,
  selectColorizeCandidate,
} from "../ai/studio-ai-colorize-candidates";
import { STUDIO_AI_DEFAULT_SETTINGS } from "../ai/studio-ai-client";
import { StudioAiCompositionPanel } from "../ai/StudioAiCompositionPanel";
import type { El } from "../studio-element-model";
import { StudioDialogueSuggestPanel } from "../StudioDialogueSuggestPanel";
import {
  runStudioApplyColorizeCandidate,
  runStudioApplyDialogueSuggestion,
  runStudioExecuteSuggestDialogueLines,
} from "./studio-host-wave2-ai-assist-helpers";

const { suggestDialogueLinesMock, suggestSceneCompositionMock } = vi.hoisted(() => ({
  suggestDialogueLinesMock: vi.fn(),
  suggestSceneCompositionMock: vi.fn(),
}));

vi.mock("../ai/studio-ai-client-lazy", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/studio-ai-client-lazy")>();
  return {
    ...actual,
    suggestDialogueLines: suggestDialogueLinesMock,
  };
});

vi.mock("../ai/studio-ai-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ai/studio-ai-client")>();
  return {
    ...actual,
    suggestSceneComposition: suggestSceneCompositionMock,
  };
});

afterEach(() => {
  cleanup();
  suggestDialogueLinesMock.mockReset();
  suggestSceneCompositionMock.mockReset();
});

describe("편집기 AI 기능 A컷→B컷 이동 대상 고정·원문 비교·요청 취소", () => {
  it("E5 대사 제안: A컷에서 생성 후 B컷으로 이동해도 원문 비교와 A컷 고정 안내가 보이고 A컷 말풍선에만 삽입한다", () => {
    const onInsert = vi.fn();
    render(
      <StudioDialogueSuggestPanel
        configured={true}
        situationText="비 오는 정류장에서 우산을 건네는 장면"
        onSituationTextChange={vi.fn()}
        hasContext={true}
        includeContext={true}
        onIncludeContextChange={vi.fn()}
        busy={false}
        error={null}
        candidates={[{ speaker: "서연", text: "비 맞지 말고 이거 써요.", kind: "speech" }]}
        onGenerate={vi.fn()}
        onGenerateLocally={vi.fn()}
        canInsertToSelected={true}
        lockedTarget={{
          pageId: "cut-a",
          elementId: "bubble-a",
          pageLabel: "1컷",
          originalText: "원래 A컷 말풍선 대사",
        }}
        currentPageId="cut-b"
        currentSelectedId="bubble-b"
        currentSelectedOriginalText="절대 덮어쓰면 안 되는 B컷 대사"
        onAddToScript={vi.fn()}
        onInsertToSelected={onInsert}
      />,
    );

    expect(screen.getByTestId("dialogue-suggest-target-lock-banner").textContent).toContain("1컷");
    expect(screen.getByTestId("dialogue-suggest-original-box").textContent).toContain(
      "원래 A컷 말풍선 대사",
    );
    expect(screen.getByTestId("dialogue-suggest-original-box").textContent).not.toContain("B컷");

    const insertBtn = screen.getByRole("button", { name: /원래 1컷 말풍선에 삽입/u });
    fireEvent.click(insertBtn);
    expect(onInsert).toHaveBeenCalledWith({
      speaker: "서연",
      text: "비 맞지 말고 이거 써요.",
      kind: "speech",
    });
  });

  it("E5 대사 제안 실행 헬퍼: 진행 중 취소하면 AbortSignal이 중단되고 늦은 응답이 상태를 덮지 않는다", async () => {
    const abortRef = { current: null as AbortController | null };
    let capturedSignal: AbortSignal | undefined;
    let resolveSuggest:
      | ((value: { ok: true; data: { candidates: { speaker: string; text: string; kind: "speech" }[] } }) => void)
      | null = null;

    suggestDialogueLinesMock.mockImplementationOnce((_settings, _sit, opts) => {
      capturedSignal = opts?.signal;
      return new Promise((resolve) => {
        resolveSuggest = resolve;
      });
    });

    const setCandidates = vi.fn();
    const setBusy = vi.fn();
    const settleTextOperation = vi.fn();
    const setLockedTarget = vi.fn();

    const pending = runStudioExecuteSuggestDialogueLines({
      collaborationLocked: false,
      situationText: "열쇠를 건네는 장면",
      busy: false,
      includeContext: false,
      pages: [],
      activePageId: "cut-a",
      aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
      textAiTransport: { mode: "server", provider: "zai" },
      abortRef,
      captureMutationTicket: () => 1,
      canApplyMutation: () => true,
      lockedTarget: { pageId: "cut-a", elementId: "bubble-a", pageLabel: "1컷", originalText: "원문" },
      setLockedTarget,
      pendingProvider: () => ({ provider: "zai", model: "glm", transport: "server" }),
      beginTrackedOperation: () => "op-1",
      settleTextOperation,
      setBusy,
      setError: vi.fn(),
      setCandidates,
    });

    expect(setLockedTarget).toHaveBeenCalledWith({
      pageId: "cut-a",
      elementId: "bubble-a",
      pageLabel: "1컷",
      originalText: "원문",
    });

    abortRef.current?.abort();
    expect(capturedSignal?.aborted).toBe(true);
    resolveSuggest!({
      ok: true,
      data: { candidates: [{ speaker: "서연", text: "늦게 도착한 대사", kind: "speech" }] },
    });
    await pending;

    // setCandidates는 초기 null 리셋 1회만 호출되고 취소된 응답은 반영되지 않아야 한다
    expect(setCandidates).toHaveBeenCalledTimes(1);
    expect(setCandidates).toHaveBeenCalledWith(null);
    expect(settleTextOperation).toHaveBeenCalledWith("op-1", expect.anything(), undefined, true);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it("취소된 A 요청의 늦은 정리는 새 B 요청의 진행 상태를 변경하지 않는다", async () => {
    const pendingResponses: ((value: unknown) => void)[] = [];
    suggestDialogueLinesMock.mockImplementation(
      () => new Promise((resolve) => { pendingResponses.push(resolve); }),
    );
    const abortRef = { current: null as AbortController | null };
    const setBusy = vi.fn();
    const setCandidates = vi.fn();
    const settleTextOperation = vi.fn();
    const common = {
      collaborationLocked: false, busy: false, includeContext: false,
      pages: [], aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
      textAiTransport: { mode: "server", provider: "zai" } as const,
      abortRef,
      pendingProvider: () => ({ provider: "zai", model: "glm", transport: "server" } as const),
      settleTextOperation, setBusy, setError: vi.fn(), setCandidates,
    };
    const first = runStudioExecuteSuggestDialogueLines({
      ...common, activePageId: "a", situationText: "A 구상", beginTrackedOperation: () => "first",
    });
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
    const second = runStudioExecuteSuggestDialogueLines({
      ...common, activePageId: "b", situationText: "B 구상", beginTrackedOperation: () => "second",
    });
    pendingResponses[0]({ ok: true, data: { candidates: [{ text: "늦은 A" }] } });
    await first;
    expect(setBusy).toHaveBeenLastCalledWith(true);
    expect(settleTextOperation).toHaveBeenCalledWith("first", expect.anything(), undefined, true);
    expect(setCandidates).toHaveBeenCalledTimes(2);
    const responseB = [{ text: "정상 B" }];
    pendingResponses[1]({ ok: true, data: { candidates: responseB } });
    await second;
    expect(setCandidates).toHaveBeenLastCalledWith(responseB);
    expect(setBusy).toHaveBeenLastCalledWith(false);
  });

  it("고정된 말풍선의 수동 수정은 지키고 앞서 적용한 제안은 다른 후보로 바꿀 수 있다", () => {
    const lockedTarget = { pageId: "a", elementId: "text-a", originalText: "제안할 때의 대사" };
    const textElement = (id: string, text: string): El => ({
      id, type: "text", text, x: 0, y: 0, width: 200, fontSize: 16, fill: "#000", rotation: 0,
    });
    const selected = textElement("text-b", "B컷 대사");
    const patchDialogueText = vi.fn(() => true);
    const setError = vi.fn();
    const common = {
      activePageId: "b", selected, lockedTarget, text: "새 후보",
      patchDialogueText, setError,
    };
    expect(runStudioApplyDialogueSuggestion({
      ...common,
      pages: [
        { id: "a", elements: [textElement("text-a", "사용자가 초안을 고친 대사")] },
        { id: "b", elements: [selected] },
      ],
    })).toBe(false);
    expect(patchDialogueText).not.toHaveBeenCalled();
    expect(setError).toHaveBeenCalledWith(expect.stringContaining("바뀐 대사를 그대로"));

    expect(runStudioApplyDialogueSuggestion({
      ...common,
      lockedTarget: { ...lockedTarget, lastAppliedText: "앞서 적용한 후보" },
      pages: [
        { id: "a", elements: [textElement("text-a", "앞서 적용한 후보")] },
        { id: "b", elements: [selected] },
      ],
    })).toBe(true);
    expect(patchDialogueText).toHaveBeenCalledExactlyOnceWith("a", "text-a", "새 후보");
  });

  it("기본 대사 제안 버튼은 서버 제안과 같은 대상 슬롯에 현재 B컷을 고정하고 호출하지 않는다", async () => {
    const setLockedTarget = vi.fn();
    const setCandidates = vi.fn();
    const beginTrackedOperation = vi.fn(() => "unexpected-operation");
    const lockedTarget = {
      pageId: "b", elementId: "text-b", pageLabel: "2컷", originalText: "B컷 원문",
    };
    const runLocal = vi.fn(() => runStudioExecuteSuggestDialogueLines({
      localOnly: true, collaborationLocked: false, activePageId: "b", situationText: "놀라는 재회 장면",
      busy: false, includeContext: false, pages: [], aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
      textAiTransport: { mode: "server", provider: "zai" },
      lockedTarget, setLockedTarget,
      pendingProvider: () => ({ provider: "zai", model: "glm", transport: "server" }),
      beginTrackedOperation, settleTextOperation: vi.fn(), setBusy: vi.fn(),
      setError: vi.fn(), setCandidates,
    }));
    render(
      <StudioDialogueSuggestPanel
        configured={false}
        situationText="놀라는 재회 장면"
        onSituationTextChange={vi.fn()}
        hasContext={false}
        includeContext={false}
        onIncludeContextChange={vi.fn()}
        busy={false}
        error={null}
        candidates={null}
        onGenerate={vi.fn()}
        onGenerateLocally={() => void runLocal()}
        canInsertToSelected
        onAddToScript={vi.fn()}
        onInsertToSelected={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "기본 대사·나레이션 즉시 제안" }));
    await waitFor(() => expect(setLockedTarget).toHaveBeenCalledExactlyOnceWith(lockedTarget));
    expect(setCandidates).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ text: expect.any(String) }),
      expect.objectContaining({ text: expect.any(String) }),
      expect.objectContaining({ text: expect.any(String) }),
    ]);
    expect(suggestDialogueLinesMock).not.toHaveBeenCalled();
    expect(beginTrackedOperation).not.toHaveBeenCalled();
  });

  it("E3 채색 후보 적용: A컷에서 후보를 모은 뒤 B컷으로 이동해도 A컷의 원본 이미지 레이어를 정확히 패치한다", () => {
    const added = addColorizeCandidate(createColorizeCandidateSession(), {
      id: "cand-1",
      dataUrl: "data:image/png;base64,AAA",
      prompt: "밤비 수채화 채색",
      createdAt: 1,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;
    const selectedSession = selectColorizeCandidate(added.session, "cand-1");
    expect(selectedSession.ok).toBe(true);
    if (!selectedSession.ok) return;

    const targetImageEl: El = {
      id: "img-cut-a",
      type: "image",
      x: 0,
      y: 0,
      width: 400,
      height: 400,
      src: "data:image/png;base64,ORIG",
      rotation: 0,
    };
    const patchEl = vi.fn(() => false);
    const patchElOnPage = vi.fn(() => true);
    const setError = vi.fn();

    runStudioApplyColorizeCandidate({
      targetId: "img-cut-a",
      targetPageId: "cut-a",
      candidateSession: selectedSession.session,
      targetElement: targetImageEl,
      candidateProvenanceRef: { current: new Map() },
      patchEl,
      patchElOnPage,
      setError,
    });

    expect(patchElOnPage).toHaveBeenCalledWith("cut-a", "img-cut-a", {
      src: "data:image/png;base64,AAA",
    });
    expect(patchEl).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it("E7 구도 제안 패널: A컷에서 요청 후 B컷으로 이동해도 메모 삽입 대상은 A컷으로 고정되고 요청 취소도 동작한다", async () => {
    let resolveComposition: ((value: unknown) => void) | null = null;
    suggestSceneCompositionMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveComposition = resolve;
        }),
    );

    const onInsertAsNote = vi.fn();
    const { rerender } = render(
      <StudioAiCompositionPanel
        settings={STUDIO_AI_DEFAULT_SETTINGS}
        configured={true}
        activePageId="cut-a"
        activePageLabel="1컷"
        onInsertAsNote={onInsertAsNote}
      />,
    );

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "비 오는 옥상 대치 장면" } });
    fireEvent.click(screen.getByRole("button", { name: "구도 제안 받기" }));

    // 진행 중 취소 확인
    fireEvent.click(screen.getByTestId("composition-cancel-btn"));
    resolveComposition!({ ok: true, data: { suggestion: "취소된 늦은 응답" } });
    await waitFor(() => {
      expect(screen.queryByText("취소된 늦은 응답")).toBeNull();
    });

    // 다시 요청 후 A컷 → B컷 이동 시 대상 고정 확인
    suggestSceneCompositionMock.mockResolvedValueOnce({
      ok: true,
      data: { suggestion: "로우 앵글 투 샷으로 긴장감을 강조하세요." },
    });
    fireEvent.click(screen.getByRole("button", { name: "구도 제안 받기" }));
    await waitFor(() => {
      expect(screen.getByText(/로우 앵글 투 샷/u)).toBeTruthy();
    });

    rerender(
      <StudioAiCompositionPanel
        settings={STUDIO_AI_DEFAULT_SETTINGS}
        configured={true}
        activePageId="cut-b"
        activePageLabel="2컷"
        onInsertAsNote={onInsertAsNote}
      />,
    );

    expect(screen.getByTestId("composition-target-lock-banner").textContent).toContain("1컷");
    fireEvent.click(screen.getByRole("button", { name: /원래 1컷에 메모로 추가/u }));
    expect(onInsertAsNote).toHaveBeenCalledWith(
      "로우 앵글 투 샷으로 긴장감을 강조하세요.",
      "cut-a",
    );
  });
});
