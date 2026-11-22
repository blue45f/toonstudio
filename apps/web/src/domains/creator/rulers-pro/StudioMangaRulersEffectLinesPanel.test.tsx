// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioMangaRulersEffectLinesPanel } from "./StudioMangaRulersEffectLinesPanel";
import { StudioAdvancedRulerPanel } from "../StudioAdvancedRulerPanel";
import { StudioComicEffectV2Drawer } from "../comic/StudioComicEffectV2Drawer";

import type { StudioAdvancedRulerDocument } from "../studio-advanced-ruler-document";
import type { FocusLinesEl } from "../studio-element-model";

afterEach(cleanup);

const sampleFocusElement: FocusLinesEl = {
  id: "focus-1",
  type: "focusLines",
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  lineCount: 32,
  innerRadius: 48,
  outerRadius: 220,
  stroke: "#111111",
  strokeWidth: 2,
  noise: 0.25,
  rotation: 0,
  opacity: 1,
};

const sampleRulerDocument: StudioAdvancedRulerDocument = {
  version: 1,
  activeSnapRulerId: null,
  selectedRulerId: null,
  rulers: [],
};

describe("StudioMangaRulersEffectLinesPanel & 비충돌 진입점 통합", () => {
  it("절차적 효과선 4종 전환·프리셋·시드 재생성 및 선택 요소 반영 콜백이 동작한다", () => {
    const onApplyElementPatch = vi.fn();
    render(
      <StudioMangaRulersEffectLinesPanel
        defaultTab="effect-lines"
        selectedElement={sampleFocusElement}
        onApplyElementPatch={onApplyElementPatch}
      />,
    );

    const preview = screen.getByRole("img", { name: "절차적 효과선 벡터 미리보기" });
    expect(preview.querySelector("path")?.getAttribute("d")?.length).toBeGreaterThan(20);

    fireEvent.click(screen.getByRole("button", { name: "스피드선" }));
    fireEvent.click(screen.getByRole("button", { name: /^파선 / }));
    fireEvent.click(screen.getByRole("button", { name: "유선" }));
    fireEvent.click(screen.getByRole("button", { name: "폭발선" }));
    fireEvent.click(screen.getByRole("button", { name: "클라이맥스 타원 집중선" }));

    fireEvent.click(screen.getByRole("button", { name: "선택 효과선에 설정 반영" }));
    expect(onApplyElementPatch).toHaveBeenCalledTimes(1);
    expect(onApplyElementPatch).toHaveBeenCalledWith(
      expect.objectContaining({ lineCount: 54 }),
    );
  });

  it("투시·대칭·분할 스냅 탭에서 5점 어안 + 만화경 대칭 + 황금비 분할 샘플 획 스냅을 렌더한다", () => {
    render(<StudioMangaRulersEffectLinesPanel defaultTab="rulers-snap" />);

    fireEvent.click(screen.getByRole("button", { name: "5점 어안" }));
    fireEvent.click(screen.getByRole("button", { name: "만화경" }));
    fireEvent.click(screen.getByRole("button", { name: "황금비" }));
    fireEvent.click(screen.getByRole("button", { name: "샘플 획 스냅 테스트" }));

    const svg = screen.getByRole("img", { name: "투시 대칭 분할 0ms 자석 스냅 미리보기" });
    // 6축 만화경(D_6) -> 12개 대칭 미러 분기 경로가 렌더된다
    const branches = svg.querySelectorAll("path[data-mirror-branch]");
    expect(branches).toHaveLength(12);
    expect(screen.getByText(/분기 12개/)).toBeTruthy();
  });

  it("StudioAdvancedRulerPanel 및 StudioComicEffectV2Drawer의 디스클로저를 열면 Pro 패널이 지연 마운트된다", async () => {
    const onPatch = vi.fn();
    render(
      <StudioAdvancedRulerPanel
        document={sampleRulerDocument}
        groups={[]}
        canvasWidth={800}
        canvasHeight={1200}
        onAdd={vi.fn()}
        onPatch={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        onSetActiveSnap={vi.fn()}
      />,
    );

    const rulerSummary = screen.getByText("다점 투시·대칭·분할 스냅 · 효과선");
    const rulerDetails = rulerSummary.closest("details")!;
    rulerDetails.open = true;
    fireEvent(rulerDetails, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "투시·대칭·분할 스냅" })).toBeTruthy();
    });

    cleanup();

    render(
      <StudioComicEffectV2Drawer
        selected={sampleFocusElement}
        panelGutter={12}
        panelSplitRatio={50}
        onPatch={onPatch}
      />,
    );

    const drawerSummary = screen.getByText("절차적 효과선 벡터 생성기");
    const drawerDetails = drawerSummary.closest("details")!;
    drawerDetails.open = true;
    fireEvent(drawerDetails, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "선택 효과선에 설정 반영" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "선택 효과선에 설정 반영" }));
    expect(onPatch).toHaveBeenCalledTimes(1);
  });
});
