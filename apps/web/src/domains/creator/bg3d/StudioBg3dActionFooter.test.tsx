// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dActionFooter } from "./StudioBg3dActionFooter";

afterEach(() => {
  cleanup();
});

function renderFooter(overrides: Partial<Parameters<typeof StudioBg3dActionFooter>[0]> = {}) {
  return render(
    <StudioBg3dActionFooter
      captureElementCount={3}
      deletingModelInProgress={false}
      error={null}
      hasCloneFailure={false}
      hasFilledOutput={true}
      hasPendingClone={false}
      hasPendingSharedCharacter={false}
      insertDisabled={false}
      isCapturing={false}
      isRestoringScene={false}
      materializationKind="live-stage"
      mutationKind="connect"
      operation="insert"
      saveDisabled={false}
      saveNotice={null}
      sceneRecoveryError={null}
      sharedStageUpdateBlockedReason={null}
      toneOutputType="color"
      onClose={() => undefined}
      onEnableFilledOutput={() => undefined}
      onInsert={() => undefined}
      onOpenSharedStage={() => undefined}
      onSave={() => undefined}
      {...overrides}
    />,
  );
}

describe("StudioBg3dActionFooter mobile UX & WebGL recovery", () => {
  it("renders a calm Korean WebGL recovery banner while context is lost or restoring", () => {
    const { rerender } = renderFooter({ webglContextState: "lost" });
    const lostBanner = screen.getByRole("status");
    expect(lostBanner.getAttribute("data-studio-bg3d-webgl-recovery")).toBe("true");
    expect(lostBanner.textContent).toContain("백그라운드 전환으로 3D 화면이 잠시 중단되었습니다");
    expect(lostBanner.className).toContain("break-keep");

    rerender(
      <StudioBg3dActionFooter
        captureElementCount={3}
        deletingModelInProgress={false}
        error={null}
        hasCloneFailure={false}
        hasFilledOutput={true}
        hasPendingClone={false}
        hasPendingSharedCharacter={false}
        insertDisabled={false}
        isCapturing={false}
        isRestoringScene={false}
        materializationKind="live-stage"
        mutationKind="connect"
        operation="insert"
        saveDisabled={false}
        saveNotice={null}
        sceneRecoveryError={null}
        sharedStageUpdateBlockedReason={null}
        toneOutputType="color"
        webglContextState="restoring"
        onClose={() => undefined}
        onEnableFilledOutput={() => undefined}
        onInsert={() => undefined}
        onOpenSharedStage={() => undefined}
        onSave={() => undefined}
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("3D 그래픽 컨텍스트를 복구하고 있습니다");
  });

  it("preserves mobile safe-area footer padding, tabular-nums, and 44px touch targets", () => {
    const onInsert = vi.fn();
    const { container } = renderFooter({ onInsert });
    const footer = container.querySelector("footer");
    expect(footer?.className).toContain("env(safe-area-inset-bottom)");

    const insertButton = screen.getByRole("button", { name: /3명과 연결해 추가/u });
    expect(insertButton.className).toContain("tabular-nums");
    fireEvent.click(insertButton);
    expect(onInsert).toHaveBeenCalledTimes(1);
  });
});
