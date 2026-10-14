// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT } from "./studio-simple-production-wizard";
import { StudioSimpleProductionWizard } from "./StudioSimpleProductionWizard";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
  document.documentElement.style.overflow = "";
});

function renderWizard() {
  const onComplete = vi.fn();
  const onOpenProEditor = vi.fn();
  const onCancel = vi.fn();
  render(
    <StudioSimpleProductionWizard
      onComplete={onComplete}
      onOpenProEditor={onOpenProEditor}
      onCancel={onCancel}
    />,
  );
  return { onComplete, onOpenProEditor, onCancel };
}

function goNext() {
  fireEvent.click(screen.getByRole("button", { name: "다음" }));
}

describe("StudioSimpleProductionWizard", () => {
  it("opens on the background step with defaults already applied", () => {
    renderWizard();

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByRole("dialog").getAttribute("data-studio-modal-owner")).toBe(
      "simple-production",
    );
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    expect(screen.getByText("1/4 · 배경")).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: /일상 대화 2컷/u }) as HTMLButtonElement).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");
    expect(
      document.querySelector("[data-studio-simple-wizard-scroll-body='true']")?.className,
    ).toContain("overflow-y-auto");
    expect(screen.getByRole("button", { name: "이전" })).toHaveProperty("disabled", true);
  });

  it("walks background → character → dialogue → effects and completes into the pro editor", () => {
    const { onComplete } = renderWizard();

    goNext();
    expect(screen.getByText("2/4 · 캐릭터")).toBeTruthy();
    expect((screen.getByLabelText("주인공 이름") as HTMLInputElement).value).toBe("주인공");
    expect(
      (screen.getByRole("radio", { name: /차분/u }) as HTMLButtonElement).getAttribute(
        "aria-checked",
      ),
    ).toBe("true");

    goNext();
    expect(screen.getByText("3/4 · 대사")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "웹툰 대사" }) as HTMLTextAreaElement).value).toBe(
      SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT,
    );
    expect(screen.getByText(/인식된 대사/u).textContent).toContain("2개");

    goNext();
    expect(screen.getByText("4/4 · 효과")).toBeTruthy();
    expect(screen.getByText("이렇게 완성됩니다")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /전문 에디터에서 이어서 편집/u }),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    const handoff = onComplete.mock.calls[0]![0];
    expect(handoff.comipoInput.sceneTemplateId).toBe("daily-talk");
    expect(handoff.comipoInput.dialogueScript).toBe(SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT);
    expect(handoff.sceneRecipe.cast[0]).toMatchObject({
      poseRef: "ni_calm_front",
      expressionRef: "xf_joy",
    });
    expect(handoff.editorExit).toMatchObject({
      target: "pro-editor",
      creationMode: "story",
      uiDensityMode: "full",
    });
  });

  it("auto-applies the default dialogue when the user leaves it empty", () => {
    const { onComplete } = renderWizard();
    goNext();
    goNext();
    fireEvent.change(screen.getByRole("textbox", { name: "웹툰 대사" }), {
      target: { value: "   " },
    });
    goNext();
    expect(screen.getByRole("status").textContent).toContain("기본값이 자동 적용");
    fireEvent.click(
      screen.getByRole("button", { name: /전문 에디터에서 이어서 편집/u }),
    );
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete.mock.calls[0]![0].draft.dialogueScript).toBe(
      SIMPLE_PRODUCTION_DEFAULT_DIALOGUE_SCRIPT,
    );
  });

  it("exits to the pro editor from any step without losing the current choices", () => {
    const { onOpenProEditor } = renderWizard();
    fireEvent.click(screen.getByRole("radio", { name: /고백 장면/u }));
    fireEvent.click(
      screen.getByRole("button", { name: /전문 에디터로 바로 가기/u }),
    );
    expect(onOpenProEditor).toHaveBeenCalledOnce();
    expect(onOpenProEditor.mock.calls[0]![0]).toMatchObject({
      backgroundSceneTemplateId: "confession",
    });
  });

  it("supports Escape to cancel and Alt-arrow step movement", () => {
    const { onCancel } = renderWizard();
    fireEvent.keyDown(document, { key: "ArrowRight", altKey: true });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    fireEvent.keyDown(document, { key: "ArrowLeft", altKey: true });
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("1");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
