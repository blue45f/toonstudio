// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { createEmptyStudioAiImageReferenceDocument } from "./ai/studio-ai-image-reference-roles";
import { StudioScenarioAutoLayoutPanel, type StudioScenarioAutoLayoutPanelProps } from "./StudioScenarioAutoLayoutPanel";
import type { ScenarioPreviewItem } from "./studio-scenario-layout";

const PREVIEW: ScenarioPreviewItem[] = [{
  frame: { x: 24, y: 24, width: 672, height: 480 }, bubbles: [],
  beatType: "setup", aspect: "landscape", summary: "약속 장소에 도착한다.",
  imagePrompt: "비 내리는 거리", dialogue: "서하: 기다려 줘.",
}];

function panelProps(overrides: Partial<StudioScenarioAutoLayoutPanelProps>): StudioScenarioAutoLayoutPanelProps {
  const noop = () => {};
  return {
    open: true, onClose: noop, textConfigured: true, imageConfigured: false,
    imageReferenceDocument: createEmptyStudioAiImageReferenceDocument(), imageReferenceAssetOptions: [],
    imageReferencesLoading: false, imageReferenceMissingCount: 0, onImageReferenceDocumentChange: noop,
    storyText: "약속 장소에 도착한다.", onStoryTextChange: noop, sceneCountHint: undefined, onSceneCountHintChange: noop,
    applyTarget: "current-page", onApplyTargetChange: noop, busy: false, stageLabel: null, progress: null, error: null,
    preview: PREVIEW, textProvenance: null, onGenerate: noop, onGenerateImages: noop, onChangeScene: noop,
    onRemoveScene: noop, onRegenerateScene: noop, regeneratingIndex: null, onCancel: noop, onApply: noop, onDiscard: noop,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

it("원고 쓰기 거절 뒤 기존 내용을 그대로 두고 같은 작업을 다시 적용한다", async () => {
  const applied = vi.fn();
  function ApplyRejectedOnce() {
    const [preview, setPreview] = useState<ScenarioPreviewItem[] | null>(PREVIEW);
    const [original, setOriginal] = useState(["기존 원고"]);
    const [error, setError] = useState<string | null>(null);
    const attempts = useRef(0);
    return <>
      <output data-testid="ack-manuscript">{original.join(" · ")}</output>
      <StudioScenarioAutoLayoutPanel {...panelProps({
        error, preview,
        onApply: () => {
          attempts.current += 1;
          if (attempts.current === 1) {
            setError("이 포인터에서는 쓰기를 완료하지 못했습니다.");
            return false;
          }
          if (!preview) return false;
          applied(preview);
          setOriginal((current) => [...current, "검토한 연출"]);
          setPreview(null);
          return true;
        },
      })} />
    </>;
  }
  render(<ApplyRejectedOnce />);
  fireEvent.click(screen.getByRole("button", { name: /마감·추가/u }));
  const apply = screen.getByRole("button", { name: "현재 페이지에 적용" });
  fireEvent.click(apply);
  const receiptKeys = () => Object.keys(sessionStorage).filter((key) =>
    key.startsWith("toonspectrum:studio-ai-comic-director:"));
  expect(screen.getByTestId("ack-manuscript").textContent).toBe("기존 원고");
  expect(screen.getByRole("alert").textContent).toContain("쓰기를 완료하지 못했습니다.");
  expect(applied).not.toHaveBeenCalled();
  expect(receiptKeys()).toEqual([]);

  fireEvent.click(screen.getByRole("button", { name: "원고 적용 다시 시도" }));
  await waitFor(() => expect(applied).toHaveBeenCalledOnce());
  expect(applied).toHaveBeenCalledWith(PREVIEW);
  expect(screen.getByTestId("ack-manuscript").textContent).toBe("기존 원고 · 검토한 연출");
  expect(receiptKeys()).toHaveLength(2);
  fireEvent.click(apply);
  expect(applied).toHaveBeenCalledOnce();
});
