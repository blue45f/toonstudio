// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultStudioAppSettings } from "../studio-app-settings";
import { StudioAppSettingsPanel } from "../StudioAppSettingsPanel";
import {
  StudioDrawingQuickErgonomicsBar,
  type StudioDrawingErgonomicsSession,
} from "../studio-cuttoon-editor/StudioDrawingQuickErgonomicsBar";
import { ShortcutCustomizer } from "../workspace-layout/ShortcutCustomizer";
import { createDefaultShortcutAndDialProfile, exportShortcutProfileToJson } from "./studio-shortcut-profile-engine";
import { StudioShortcutProfileManagerSection } from "./StudioShortcutProfileManagerSection";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function createMinimalErgonomicsSession(
  overrides: Partial<StudioDrawingErgonomicsSession> = {},
): StudioDrawingErgonomicsSession {
  return {
    activeSurfaceReviewLocked: false,
    pageEditLocked: false,
    canvasInteractionBlocked: false,
    scopedCanvasDrawingAvailable: false,
    tool: "draw",
    drawMode: "pen",
    activatePrimaryCanvasTool: vi.fn(),
    strokeWidth: 8,
    setStrokeWidth: vi.fn(),
    stabilizer: 0,
    setStabilizer: vi.fn(),
    showWebtoonGuides: false,
    setShowWebtoonGuides: vi.fn(),
    effScale: 1,
    setZoom: vi.fn(),
    zoomLocked: false,
    viewTransformSuppressed: false,
    bg3dOpen: false,
    studioLeftToolRailHandlers: { toggleBg3dEditor: vi.fn() },
    exportMenuOpen: false,
    setExportMenuOpen: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    setEyedropperActive: vi.fn(),
    ...overrides,
  };
}

describe("StudioShortcutProfileManagerSection & 실진입점 연결", () => {
  it("프로필 프리셋 적용, 충돌 감지·자동 정리, JSON 내보내기/가져오기, 8방향 다이얼 미리보기를 수행한다", () => {
    const onApplyProfile = vi.fn();
    const onApplyShortcuts = vi.fn();
    const conflictedShortcuts = {
      ...defaultStudioAppSettings().shortcuts,
      "tool-fill": "B", // tool-pen("B")와 충돌
    };

    render(
      <StudioShortcutProfileManagerSection
        defaultOpen
        shortcuts={conflictedShortcuts}
        onApplyProfile={onApplyProfile}
        onApplyShortcuts={onApplyShortcuts}
      />,
    );

    // 실시간 충돌 감지 배너 노출 및 원클릭 자동 정리
    expect(screen.getByText(/단축키 충돌 1건/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "충돌 자동 정리" }));
    expect(onApplyShortcuts).toHaveBeenCalledTimes(1);
    expect(onApplyShortcuts.mock.calls[0]?.[0]?.["tool-fill"]).toBe("G");

    // 내장 프리셋("선화 집중 속도형") 전환
    fireEvent.click(screen.getByRole("button", { name: /선화 집중 속도형/ }));
    expect(onApplyProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "webtoon-inking-speed", dialDeadzonePx: 18 }),
    );

    // JSON 내보내기 및 잘못된 JSON 오류 검증
    fireEvent.click(screen.getByRole("button", { name: "JSON 내보내기" }));
    const textarea = screen.getByLabelText("단축키 프로필 JSON 입력") as HTMLTextAreaElement;
    expect(textarea.value).toContain('"schemaVersion": 1');

    fireEvent.change(textarea, { target: { value: "{broken" } });
    fireEvent.click(screen.getByRole("button", { name: "JSON 검증 후 적용" }));
    expect(screen.getByText(/JSON 형식이 올바르지 않습니다/)).toBeTruthy();

    // 유효한 커스텀 JSON 가져오기
    const importedJson = exportShortcutProfileToJson(
      createDefaultShortcutAndDialProfile({
        id: "imported-speed",
        name: "수입 단축키 세트",
        dialDeadzonePx: 20,
      }),
    );
    fireEvent.change(textarea, { target: { value: importedJson } });
    fireEvent.click(screen.getByRole("button", { name: "JSON 검증 후 적용" }));
    expect(onApplyProfile).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "imported-speed", name: "수입 단축키 세트", dialDeadzonePx: 20 }),
    );

    // 8방향 다이얼 시험·편집 버튼으로 실제 오버레이 열기
    fireEvent.click(screen.getByRole("button", { name: "8방향 다이얼 시험·편집" }));
    expect(screen.getByRole("menu", { name: /상황별 8방향 퀵 다이얼/ })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("StudioDrawingQuickErgonomicsBar에서 작업 상황을 자동 감지해 8방향 다이얼을 열고 실제 세션 동작을 실행한다", () => {
    const undo = vi.fn();
    const setShowWebtoonGuides = vi.fn();
    const setExportMenuOpen = vi.fn();

    const { rerender } = render(
      <StudioDrawingQuickErgonomicsBar
        session={createMinimalErgonomicsSession({ undo, stabilizer: 0 })}
      />,
    );

    const dialTrigger = screen.getByRole("button", { name: "8방향 다이얼 · 드로잉" });
    expect(dialTrigger.getAttribute("data-radial-dial-inferred-context")).toBe("drawing");

    // Alt+Q 단축키로 8방향 다이얼 열기 → 숫자 1(실행 취소) 실행
    fireEvent.keyDown(window, { key: "q", code: "KeyQ", altKey: true });
    expect(screen.getByRole("menu", { name: "상황별 8방향 퀵 다이얼 · 드로잉" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "1" });
    expect(undo).toHaveBeenCalledTimes(1);

    // 검수 잠금 상태로 전환하면 자동으로 review 컨텍스트 8방향 다이얼 최적화
    rerender(
      <StudioDrawingQuickErgonomicsBar
        session={createMinimalErgonomicsSession({
          activeSurfaceReviewLocked: true,
          setShowWebtoonGuides,
          setExportMenuOpen,
        })}
      />,
    );
    const reviewTrigger = screen.getByRole("button", { name: "8방향 다이얼 · 검수" });
    expect(reviewTrigger.getAttribute("data-radial-dial-inferred-context")).toBe("review");
    fireEvent.click(reviewTrigger);
    expect(screen.getByRole("menu", { name: "상황별 8방향 퀵 다이얼 · 검수" })).toBeTruthy();

    // 검수 7번 슬롯(마감·출고 열기) 실행
    fireEvent.keyDown(window, { key: "7" });
    expect(setExportMenuOpen).toHaveBeenCalledWith(true);
  });

  it("StudioAppSettingsPanel(단축키 탭)과 ShortcutCustomizer 양쪽에서 프로필 관리 섹션에 도달한다", () => {
    const { unmount } = render(
      <StudioAppSettingsPanel
        open
        settings={defaultStudioAppSettings()}
        initialTab="shortcuts"
        onClose={vi.fn()}
        onChange={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );
    expect(
      screen.getByText("8방향 퀵 다이얼 · 단축키 프로필 관리 (JSON 가져오기/내보내기)"),
    ).toBeTruthy();
    unmount();

    render(<ShortcutCustomizer />);
    expect(
      screen.getByText("8방향 퀵 다이얼 · 단축키 프로필 관리 (JSON 가져오기/내보내기)"),
    ).toBeTruthy();
  });
});
