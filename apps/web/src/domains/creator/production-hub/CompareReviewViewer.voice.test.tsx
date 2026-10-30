// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyStudioCommentsDocument } from "../studio-comments";
import { CompareReviewViewer } from "./CompareReviewViewer";
import { createEmptyCompareSession, poolItemFromExternal, type CompareSession } from "./compare-review-model";
import { captureVoiceCompareView, type VoiceCompareController } from "./voice-compare-view";

const items = ["원본", "선화", "채색", "식자"].map((label, index) => poolItemFromExternal({ assetId: `asset-${index}`, label,
  imageUrl: "data:image/gif;base64,R0lGODlhAQABAAAAACw=", addedBy: "actor-1", addedAt: "2026-10-30T00:00:00Z" }));
const session: CompareSession = { ...createEmptyCompareSession("ep-1"), pool: items,
  panes: [items[2].source, items[0].source], syncView: false };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount() {
  let registered: VoiceCompareController | null = null;
  const onControllerChange = (controller: VoiceCompareController | null) => { registered = controller; };
  function Wrapper() {
    const [current, setCurrent] = useState(session);
    return <CompareReviewViewer session={current} onSessionChange={setCurrent}
      comments={createEmptyStudioCommentsDocument()} onCommentsChange={vi.fn()}
      currentActor={{ id: "actor-1", displayName: "검수자" }} pinMode={false} onPinModeChange={vi.fn()}
      onVoiceCompareControllerChange={onControllerChange} />;
  }
  const view = render(<Wrapper />);
  const controller = () => {
    if (!registered) throw new Error("비교 뷰어가 등록되지 않았습니다.");
    return registered;
  };
  return { ...view, controller };
}

describe("실제 비교 뷰어의 음성 화면 캡처·복원", () => {
  it("실제 선택 소스와 각 페인에서 조작한 배율을 캡처한다", () => {
    const { controller } = mount();
    expect(controller().capture()?.view.poolItemId).toBe(items[2].id);
    fireEvent.click(screen.getByRole("button", { name: /^(확대|Zoom in)$/u }));
    const selects = screen.getAllByRole("combobox", { name: /이 페인에 표시할 소스|Source for this pane/u });
    fireEvent.focusIn(selects[1]);
    fireEvent.click(screen.getByRole("button", { name: /^(확대|Zoom in)$/u }));
    fireEvent.click(screen.getByRole("button", { name: /^(확대|Zoom in)$/u }));
    const captured = controller().capture();
    expect(captured?.view.compare?.locals.map((entry) => entry.scale)).toEqual([1.25, 1.5625]);
    expect(captured?.view.compare?.focusedPane).toBe(1);
  });

  it("네 페인의 순서·독립 이동과 잠금·반전·슬라이더·깜빡 상태를 실제 setter로 복원한다", () => {
    const { controller } = mount();
    const nextSession: CompareSession = { ...session, panes: items.map((item) => item.source), mode: "slider",
      flipBoth: true, flipVertical: true, overlayOpacity: 0.2 };
    const snapshot = captureVoiceCompareView(nextSession, { shared: { scale: 8, tx: -0.75, ty: 1 },
      locals: [{ scale: 2, tx: -0.5, ty: 0.5 }, { scale: 3, tx: 0.5, ty: -0.5 }, { scale: 4, tx: 1, ty: 1 }, { scale: 5, tx: -1, ty: -1 }],
      sliderPosition: 73, blink: { enabled: false, intervalMs: 1250, phase: true }, focusedPane: 3 });
    if (!snapshot) throw new Error("복원할 화면이 없습니다.");
    let applied = false;
    act(() => { applied = controller().apply(snapshot, []); });
    expect(applied).toBe(true);
    expect(controller().capture()?.view.compare).toEqual(snapshot.compare);
    expect(screen.getByRole("slider", { name: /이전·이후 비교 슬라이더|Before-after compare slider/u }).getAttribute("aria-valuenow")).toBe("73");
    expect(screen.getByTestId("crv-zoomval").textContent).toBe("500%");
  });

  it("찾을 수 없는 소스는 현재 화면을 바꾸지 않고 복구 안내를 제공한다", () => {
    const { controller } = mount();
    const before = controller().capture();
    let applied = true;
    act(() => { applied = controller().apply({ surface: "compare", poolItemId: "unavailable", pageId: null,
      mode: "overlay", scale: 8, tx: -1, ty: 1 }, []); });
    expect(applied).toBe(false);
    expect(controller().capture()).toEqual(before);
    expect(screen.getByRole("alert").textContent).toMatch(/불러온 뒤 다시 재생|Load that version and play again/u);
  });
  it("뷰어 해제 뒤 남은 controller는 이전 회차의 표시 상태를 다시 적용하지 않는다", () => {
    const { controller, unmount } = mount();
    const stale = controller(), captured = stale.capture();
    if (!captured) throw new Error("캡처가 없습니다.");
    unmount();
    expect(stale.capture()).toBeNull();
    expect(stale.apply(captured.view, [])).toBe(false);
  });
});
