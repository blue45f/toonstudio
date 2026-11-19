// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createStudioSaveSyncSignalStore } from "../studio-save-sync-signals";
import { planStudioToolHintPosition } from "../studio-tool-hint-position";
import { StudioWorkspaceNavigator } from "../StudioWorkspaceNavigator";

import {
  StudioDrawingClarityCoreTools,
  type StudioDrawingClarityCoreSession,
} from "./StudioDrawingClarityCoreTools";
import { StudioDrawingClaritySaveButton } from "./StudioDrawingClaritySaveButton";
import {
  StudioDrawingQuickErgonomicsBar,
  type StudioDrawingErgonomicsSession,
} from "./StudioDrawingQuickErgonomicsBar";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("200% 확대 및 키보드 전용 도구→옵션→캔버스→저장 접근성 계약 (Item 16)", () => {
  it("640×360(200% 리플로우) 뷰포트에서 우상단 컨트롤 툴팁이 포커스 대상을 덮지 않고 반대편으로 배치된다", () => {
    const undoAnchor = {
      left: 520,
      top: 60,
      right: 568,
      bottom: 108,
      width: 48,
      height: 48,
    };

    const pos = planStudioToolHintPosition({
      anchor: undoAnchor,
      viewportWidth: 640,
      viewportHeight: 360,
      popupWidth: 240,
      popupHeight: 92,
      preferredSide: "right",
      gap: 10,
      viewportPadding: 10,
    });

    expect(pos.side).toBe("left");
    expect(pos.left + 240).toBeLessThanOrEqual(undoAnchor.left - 10);

    const topPreferredPos = planStudioToolHintPosition({
      anchor: undoAnchor,
      viewportWidth: 640,
      viewportHeight: 360,
      popupWidth: 240,
      popupHeight: 92,
      preferredSide: "top",
      gap: 10,
      viewportPadding: 10,
    });

    expect(topPreferredPos.side).toBe("bottom");
    expect(topPreferredPos.top).toBeGreaterThanOrEqual(undoAnchor.bottom + 10);
  });

  it("Clarity 모드에서 고전 #studio-tool-belt가 inert여도 건너뛰기·F6가 실제 보이는 도구·옵션·캔버스로 이동하고 포커스 요소를 스크롤 노출한다", () => {
    const scrollSpy = vi.fn();
    render(
      <div id="studio-app-shell" data-studio-editor="true">
        <StudioWorkspaceNavigator />
        <header id="studio-menubar" tabIndex={-1}>
          메뉴
        </header>
        <div inert>
          <div id="studio-tool-belt" tabIndex={-1}>
            비활성 고전 벨트
          </div>
        </div>
        <div data-studio-draw-options="true" tabIndex={-1}>
          실제 옵션 바
        </div>
        <nav className="studio-drawing-clarity-rail" tabIndex={-1}>
          <button
            type="button"
            ref={(el) => {
              if (el) el.scrollIntoView = scrollSpy;
            }}
          >
            펜 도구
          </button>
        </nav>
        <div id="studio-canvas-workspace" tabIndex={-1}>
          <button type="button" data-studio-canvas-viewport aria-label="작업 캔버스">
            작업 캔버스
          </button>
          <div id="studio-status-bar" tabIndex={-1}>
            상태 바
          </div>
        </div>
      </div>,
    );

    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.click(screen.getByRole("button", { name: "도구 옵션으로 이동" }));
    expect(document.activeElement?.getAttribute("data-studio-draw-options")).toBe("true");

    fireEvent.keyDown(document, { key: "F6" });
    expect(document.activeElement?.classList.contains("studio-drawing-clarity-rail")).toBe(true);

    fireEvent.keyDown(document, { key: "F6" });
    expect(document.activeElement?.id).toBe("studio-canvas-workspace");
    fireEvent.keyDown(document, { key: "F6" });
    expect(document.activeElement?.id).toBe("studio-status-bar");
    fireEvent.keyDown(document, { key: "F6" });
    expect(document.activeElement?.id).toBe("studio-menubar");

    const penBtn = screen.getByRole("button", { name: "펜 도구" });
    penBtn.focus();
    expect(scrollSpy).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });

  it("도구(aria-pressed) → 옵션(aria-valuetext·aria-describedby·live) → 저장(saveSyncStore 설명) 활성값이 스크린리더에 전달된다", () => {
    const store = createStudioSaveSyncSignalStore();
    store.reset("doc-a11y-16");
    store.noteBaseline(1);
    store.noteEditGeneration(2);

    function Harness() {
      const [width, setWidth] = useState(8);
      const [stabilizer, setStabilizer] = useState(1);
      const coreSession: StudioDrawingClarityCoreSession = {
        activeSurfaceReviewLocked: false,
        pageEditLocked: false,
        canvasInteractionBlocked: false,
        scopedCanvasDrawingAvailable: false,
        tool: "draw",
        drawMode: "pen",
        color: "#111111",
        colorWheelOpen: false,
        advancedFillActive: true,
        advancedFillArmed: true,
        commentPinArmed: false,
        clarityPanel: "pages",
        activatePrimaryCanvasTool: vi.fn(),
        setColorWheelOpen: vi.fn(),
        menuEditUndoDisabled: false,
        menuEditRedoDisabled: false,
        studioMenubarContentHandlers: { undo: vi.fn(), redo: vi.fn() },
      };
      const ergonomicsSession: StudioDrawingErgonomicsSession = {
        activeSurfaceReviewLocked: false,
        pageEditLocked: false,
        canvasInteractionBlocked: false,
        scopedCanvasDrawingAvailable: false,
        tool: "draw",
        drawMode: "pen",
        activatePrimaryCanvasTool: vi.fn(),
        strokeWidth: width,
        setStrokeWidth: setWidth,
        stabilizer,
        setStabilizer,
        showWebtoonGuides: false,
        setShowWebtoonGuides: vi.fn(),
        effScale: 2,
        setZoom: vi.fn(),
        zoomLocked: false,
        viewTransformSuppressed: false,
        bg3dOpen: false,
        studioLeftToolRailHandlers: { toggleBg3dEditor: vi.fn() },
        exportMenuOpen: false,
        setExportMenuOpen: vi.fn(),
      };
      return (
        <div>
          <StudioDrawingClarityCoreTools
            session={coreSession}
            v4Actions={{
              onSelectTool: vi.fn(),
              onOpenFill: vi.fn(),
              onOpenCutSplit: vi.fn(),
              onOpenBubble: vi.fn(),
              onToggleBg3d: vi.fn(),
              onPlacePinComment: vi.fn(),
              onOpenAllTools: vi.fn(),
            }}
          />
          <StudioDrawingQuickErgonomicsBar session={ergonomicsSession} />
          <StudioDrawingClaritySaveButton
            session={{
              saving: false,
              collaborationDocumentLocked: false,
              sharedDocument: null,
              saveSyncStore: store,
              collaborationLockMessage: () => "잠김",
              studioMenubarContentHandlers: { handleSave: vi.fn().mockResolvedValue(undefined) },
            }}
          />
        </div>
      );
    }

    render(<Harness />);

    expect(screen.getByRole("button", { name: "채우기" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "컷 분할" }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "핀 댓글" }).getAttribute("aria-pressed")).toBe("false");

    const growBtn = screen.getByRole("button", { name: "브러시 크기 키우기" });
    const descId = growBtn.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.getAttribute("aria-label")).toContain("8px");

    fireEvent.click(growBtn);
    expect(document.getElementById(descId!)?.getAttribute("aria-label")).toContain("10px");
    expect(
      document.querySelector('[data-studio-options-live-summary="true"]')?.textContent,
    ).toContain("두께 10px");

    const slider = screen.getByLabelText("손떨림 보정 슬라이더");
    expect(slider.getAttribute("aria-valuetext")).toBe("보정 약함");
    fireEvent.change(slider, { target: { value: "3" } });
    expect(slider.getAttribute("aria-valuetext")).toBe("보정 강함");

    const saveBtn = screen.getByRole("button", { name: "초안 저장" });
    const saveDescId = saveBtn.getAttribute("aria-describedby");
    expect(saveDescId).toBeTruthy();
    expect(document.getElementById(saveDescId!)?.textContent).toContain("아직 이 기기에 저장된 기록이 없습니다");

    act(() => {
      store.noteDurableReceipt({
        savedAtMs: Date.now(),
        authority: "opfs-journal",
        sequence: 2,
        revision: 2,
        generation: 2,
      });
    });
    expect(document.getElementById(saveDescId!)?.textContent).toContain(
      "모든 작업이 로컬에 안전하게 저장되었습니다",
    );

    act(() => {
      store.noteEditGeneration(3);
    });
    expect(document.getElementById(saveDescId!)?.textContent).toContain("내구 저장되지 않았습니다");
  });
});
