// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAutoActionsPanel } from "./StudioAutoActionsPanel";

import type { StudioAutoActionsPanelProps } from "./StudioAutoActionsPanel";

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

function makeProps(overrides: Partial<StudioAutoActionsPanelProps> = {}): StudioAutoActionsPanelProps {
  return {
    open: true,
    actionSet: null,
    scope: { kind: "current" },
    pageOptions: [{ id: "page-1", label: "1페이지" }],
    selectedPageIds: ["page-1"],
    plan: null,
    busy: false,
    error: null,
    onClose: vi.fn(),
    onScopeChange: vi.fn(),
    onSelectedPageIdsChange: vi.fn(),
    onImportJson: vi.fn(),
    onExportJson: vi.fn(),
    onRequestPlan: vi.fn(),
    onExecute: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe("StudioAutoActionsPanel — macro recording", () => {
  it("starts recording and closes the modal so the canvas is reachable", () => {
    const onStartMacroRecord = vi.fn();
    const onClose = vi.fn();
    render(
      <StudioAutoActionsPanel
        {...makeProps({
          onStartMacroRecord,
          onStopMacroRecord: vi.fn(),
          onClose,
        })}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /매크로 녹음/ }));
    expect(onStartMacroRecord).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("lists recorded steps while recording and removes one by index", () => {
    const onRemoveMacroCommand = vi.fn();
    const onStopMacroRecord = vi.fn();
    const onClose = vi.fn();
    render(
      <StudioAutoActionsPanel
        {...makeProps({
          macroRecording: true,
          macroCommandCount: 2,
          macroCommands: [
            { type: "set-opacity", opacity: 0.4 },
            { type: "lettering-font", font: "나눔고딕" },
          ],
          onRemoveMacroCommand,
          onStartMacroRecord: vi.fn(),
          onStopMacroRecord,
          onClose,
        })}
      />
    );
    const list = screen.getByRole("list", { name: "녹음된 매크로 명령 목록" });
    expect(list.textContent).toContain("요소 불투명도");
    expect(list.textContent).toContain("40%");
    expect(list.textContent).toContain("글꼴");
    expect(list.textContent).toContain("나눔고딕");

    fireEvent.click(screen.getByRole("button", { name: "2단계 글꼴 삭제" }));
    expect(onRemoveMacroCommand).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: /녹음 종료/ }));
    expect(onStopMacroRecord).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows the truncation notice while recording when the cap dropped steps", () => {
    render(
      <StudioAutoActionsPanel
        {...makeProps({
          macroRecording: true,
          macroCommandCount: 80,
          macroCommands: [{ type: "set-opacity", opacity: 0.4 }],
          macroTruncationNotice: "매크로 녹화 상한 80개에 도달해 이후 명령 2개가 잘렸습니다.",
          onStartMacroRecord: vi.fn(),
          onStopMacroRecord: vi.fn(),
        })}
      />
    );
    expect(screen.getByText(/이후 명령 2개가 잘렸습니다/)).toBeTruthy();
  });

  it("shows the empty recorded-steps guidance while recording with no steps yet", () => {
    render(
      <StudioAutoActionsPanel
        {...makeProps({
          macroRecording: true,
          macroCommandCount: 0,
          macroCommands: [],
          onStartMacroRecord: vi.fn(),
          onStopMacroRecord: vi.fn(),
        })}
      />
    );
    expect(screen.getByText(/아직 기록된 단계가 없어요/)).toBeTruthy();
  });
});
