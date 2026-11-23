// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccessibleTooltipLayer } from "./AccessibleTooltipLayer";
import {
  PREDICTABLE_ACTION_CATALOG,
  actionScopeBadgeClass,
  actionScopeLabel,
  resolvePredictableActionPreview,
  type ActionScope,
} from "./predictable-action-previews";

function rect({
  left = 100,
  top = 100,
  width = 36,
  height = 36,
}: Partial<DOMRect> = {}): DOMRect {
  return {
    x: left, y: top, left, top, width, height,
    right: left + width, bottom: top + height, toJSON: () => ({}),
  } as DOMRect;
}

class ResizeObserverStub implements ResizeObserver {
  disconnect(): void {}
  observe(): void {}
  unobserve(): void {}
}

function renderWithTooltips(children: ReactNode) {
  return render(
    <>
      <AccessibleTooltipLayer />
      {children}
    </>,
  );
}

function revealByHover(target: HTMLElement): HTMLElement {
  fireEvent.pointerOver(target, { pointerType: "mouse" });
  act(() => vi.advanceTimersByTime(360));
  return screen.getByRole("tooltip");
}

beforeEach(() => {
  document.documentElement.lang = "ko";
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.matches('[data-app-tooltip-layer="true"]')) {
      return rect({ left: 0, top: 0, width: 220, height: 84 });
    }
    return rect();
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

describe("predictable-action-previews 사전 및 순수 매처", () => {
  it("핵심 동작 28종 사전이 고유 ID·이중언어 문구·원시 색상 없는 시맨틱 배지 토큰을 유지한다", () => {
    expect(PREDICTABLE_ACTION_CATALOG).toHaveLength(28);
    const ids = new Set(PREDICTABLE_ACTION_CATALOG.map((entry) => entry.id));
    expect(ids.size).toBe(28);

    const scopes: ActionScope[] = ["undoable", "local-save", "navigate", "panel", "safe-view"];
    for (const scope of scopes) {
      const cls = actionScopeBadgeClass(scope);
      expect(cls).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|hsl\(/iu);
      expect(actionScopeLabel(scope, true).length).toBeGreaterThan(2);
      expect(actionScopeLabel(scope, false).length).toBeGreaterThan(2);
    }

    for (const entry of PREDICTABLE_ACTION_CATALOG) {
      expect(entry.ko.trim().length).toBeGreaterThan(8);
      expect(entry.en.trim().length).toBeGreaterThan(8);
      const button = document.createElement("button");
      button.setAttribute("data-tool", entry.id);
      const ko = resolvePredictableActionPreview(button, { title: entry.id, korean: true });
      const en = resolvePredictableActionPreview(button, { title: entry.id, korean: false });
      expect(ko.id).toBe(entry.id);
      expect(ko.description).toBe(entry.ko);
      expect(en.description).toBe(entry.en);
      expect(ko.actionScope).toBe(entry.scope);
      expect(ko.reversible).toBe(entry.scope === "undoable");
    }
  });

  it.each([
    ["펜 · B", "pen-brush", "되돌리기 가능 (⌘Z)", true, undefined],
    ["지우개", "eraser", "되돌리기 가능 (⌘Z)", true, "E"],
    ["올가미 선택", "lasso", "되돌리기 가능 (⌘Z)", true, "L"],
    ["마법봉", "magic-wand", "되돌리기 가능 (⌘Z)", true, "W"],
    ["채우기·틈 닫기", "fill-bucket", "되돌리기 가능 (⌘Z)", true, "G"],
    ["스포이트", "eyedropper", "원본 유지", false, "I"],
    ["손바닥", "hand-pan", "원본 유지", false, "H"],
    ["말풍선·대사", "text-bubble", "되돌리기 가능 (⌘Z)", true, "T"],
    ["컷 분할·프레임", "shape-frame", "되돌리기 가능 (⌘Z)", true, "U"],
    ["투시선 자", "ruler-perspective", "되돌리기 가능 (⌘Z)", true, "R"],
    ["스크린톤 (만화망점)", "screentone", "되돌리기 가능 (⌘Z)", true, undefined],
    ["벡터 선 수정", "vector-edit", "되돌리기 가능 (⌘Z)", true, undefined],
    ["레이어·속성 패널 열기", "layers", "미리보기 열기", false, undefined],
    ["실행 취소", "undo", "되돌리기 가능 (⌘Z)", true, "⌘Z"],
    ["다시 · Ctrl/⌘+Shift+Z", "redo", "되돌리기 가능 (⌘Z)", true, undefined],
    ["3D 배경·캐릭터 배치", "bg3d", "미리보기 열기", false, undefined],
    ["3D 포즈 · VRM", "pose-vrm", "미리보기 열기", false, undefined],
    ["스마트 필터", "smart-filter", "되돌리기 가능 (⌘Z)", true, undefined],
    ["자동 저장", "save-local", "이 기기 저장", false, "⌘S"],
    ["원본 다운로드", "export-work", "이 기기 저장", false, undefined],
    ["오프라인·클라우드 동기화", "offline-sync", "이 기기 저장", false, undefined],
    ["AI 도우미", "ai-assistant", "미리보기 열기", false, undefined],
    ["검색 열기", "search", "미리보기 열기", false, "⌘K"],
    ["새 작품 시작하기", "new-work", "화면 이동", false, undefined],
  ] as const)(
    "한글 제목 '%s'를 '%s'로 정확히 매칭하고 배지 '%s'를 보강한다",
    (title, expectedId, expectedBadge, expectedReversible, expectedShortcut) => {
      const button = document.createElement("button");
      const result = resolvePredictableActionPreview(button, { title, korean: true });
      expect(result.id).toBe(expectedId);
      expect(result.actionBadge).toBe(expectedBadge);
      expect(result.reversible).toBe(expectedReversible);
      expect(result.shortcut).toBe(expectedShortcut);
    },
  );

  it("충돌하기 쉬운 문구(이름 변경 취소·색상 선택·자동 저장)에서 오탐을 내지 않는다", () => {
    const cancelRename = document.createElement("button");
    expect(resolvePredictableActionPreview(cancelRename, { title: "이름 변경 취소", korean: true }).id).toBeUndefined();

    const colorPicker = document.createElement("button");
    expect(resolvePredictableActionPreview(colorPicker, { title: "색상 선택", korean: true }).id).toBe("color-picker");

    const autosave = document.createElement("button");
    expect(resolvePredictableActionPreview(autosave, { title: "자동 저장", korean: true }).id).toBe("save-local");

    const discoverLink = document.createElement("a");
    discoverLink.setAttribute("href", "/discover");
    expect(
      resolvePredictableActionPreview(discoverLink, {
        title: "검색·취향·추천에서 원하는 작품 발견",
        korean: true,
      }).id,
    ).toBe("explore-discover");
  });

  it("명시적 data-tooltip-description과 data-tooltip-outcome을 최우선 존중한다", () => {
    const withDesc = document.createElement("button");
    withDesc.setAttribute("data-tool", "pen");
    withDesc.setAttribute("data-tooltip-description", "현재 컷의 잉크 브러시로 바로 전환합니다.");
    const descResult = resolvePredictableActionPreview(withDesc, { title: "펜", korean: true });
    expect(descResult.description).toBe("현재 컷의 잉크 브러시로 바로 전환합니다.");
    expect(descResult.actionBadge).toBe("되돌리기 가능 (⌘Z)");

    const withOutcome = document.createElement("button");
    withOutcome.setAttribute("data-tool", "export");
    withOutcome.setAttribute("data-tooltip-outcome", "검수 통과본만 ZIP 파일로 묶어 저장합니다.");
    const outcomeResult = resolvePredictableActionPreview(withOutcome, { title: "출고", korean: true });
    expect(outcomeResult.description).toBe("검수 통과본만 ZIP 파일로 묶어 저장합니다.");
    expect(outcomeResult.actionBadge).toBe("이 기기 저장");

    const withBoth = document.createElement("button");
    withBoth.setAttribute("data-tooltip-description", "현재 레이어를 복제합니다.");
    withBoth.setAttribute("data-tooltip-outcome", "레이어 1개 추가");
    const bothResult = resolvePredictableActionPreview(withBoth, { title: "레이어 복제", korean: true });
    expect(bothResult.description).toBe("현재 레이어를 복제합니다.");
    expect(bothResult.actionBadge).toBe("레이어 1개 추가");
  });

  it("비활성 컨트롤에는 사유만 안내하고 오해를 부르는 실행 배지를 숨긴다", () => {
    const locked = document.createElement("button");
    locked.setAttribute("disabled", "");
    locked.setAttribute("data-tool", "pen");
    locked.setAttribute("data-studio-disabled-reason", "검수 잠금 상태에서는 캔버스 도구를 사용할 수 없습니다");

    const result = resolvePredictableActionPreview(locked, { title: "펜", korean: true });
    expect(result.description).toBe("검수 잠금 상태에서는 캔버스 도구를 사용할 수 없습니다");
    expect(result.actionBadge).toBeUndefined();
    expect(result.reversible).toBe(false);
  });
});

describe("AccessibleTooltipLayer 리치 액션 프리뷰 DOM 통합", () => {
  it("드로잉 툴 호버 시 예측 1줄 안내·시맨틱 배지·단축키를 렌더하고 Escape로 닫는다", () => {
    vi.useFakeTimers();
    renderWithTooltips(
      <div role="toolbar" aria-orientation="vertical">
        <button type="button" data-studio-rail-tool-id="pen" aria-pressed="false" title="펜">
          펜
        </button>
        <a href="/create" title="새 작품 시작">
          새 작품
        </a>
        <button type="button" data-action-preview="현재 컷의 말풍선 배치를 자동 정렬합니다">
          말풍선 정렬
        </button>
      </div>,
    );

    const pen = screen.getByRole("button", { name: "펜" });
    const penTooltip = revealByHover(pen);
    expect(penTooltip.textContent).toContain("필압과 손떨림 보정으로 캔버스에 선화·스케치를 그립니다.");
    expect(penTooltip.textContent).toContain("되돌리기 가능 (⌘Z)");
    expect(penTooltip.textContent).toContain("B");
    expect(penTooltip.getAttribute("data-action-scope")).toBe("undoable");
    expect(penTooltip.getAttribute("data-reversible")).toBe("true");
    expect(pen.getAttribute("aria-describedby")).toContain(penTooltip.id);

    const badge = penTooltip.querySelector('[data-app-tooltip-badge="true"]');
    expect(badge?.className).toContain("bg-accent-soft");
    expect(badge?.className).not.toMatch(/#[0-9a-f]{3,8}|rgb\(/iu);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    const startLink = screen.getByRole("link", { name: "새 작품" });
    const linkTooltip = revealByHover(startLink);
    expect(linkTooltip.textContent).toContain("화면 이동");
    expect(linkTooltip.getAttribute("data-action-scope")).toBe("navigate");

    fireEvent.keyDown(window, { key: "Escape" });
    const customBtn = screen.getByRole("button", { name: "말풍선 정렬" });
    const customTooltip = revealByHover(customBtn);
    expect(customTooltip.textContent).toContain("말풍선 정렬");
    expect(customTooltip.textContent).toContain("현재 컷의 말풍선 배치를 자동 정렬합니다");
  });

  it("영문 문서(lang=en)에서는 영문 설명과 영문 범위 배지를 표시한다", () => {
    vi.useFakeTimers();
    document.documentElement.lang = "en";
    renderWithTooltips(
      <div>
        <button type="button" data-tool="eraser" title="Eraser">
          Eraser
        </button>
        <button type="button" data-tool="save" title="Autosave">
          Save
        </button>
        <a href="/settings" title="Display settings">
          Settings
        </a>
        <button type="button" aria-label="Layer menu" aria-expanded="false">
          <svg aria-hidden="true" />
        </button>
      </div>,
    );

    const eraserTooltip = revealByHover(screen.getByRole("button", { name: "Eraser" }));
    expect(eraserTooltip.textContent).toContain("Erases strokes and paint on the active layer.");
    expect(eraserTooltip.textContent).toContain("Undoable (⌘Z)");

    fireEvent.keyDown(window, { key: "Escape" });
    const saveTooltip = revealByHover(screen.getByRole("button", { name: "Save" }));
    expect(saveTooltip.textContent).toContain("Saved locally");

    fireEvent.keyDown(window, { key: "Escape" });
    const settingsTooltip = revealByHover(screen.getByRole("link", { name: "Settings" }));
    expect(settingsTooltip.textContent).toContain("Opens page");

    fireEvent.keyDown(window, { key: "Escape" });
    const menuTooltip = revealByHover(screen.getByRole("button", { name: "Layer menu" }));
    expect(menuTooltip.textContent).toContain("Opens panel");
  });
});
