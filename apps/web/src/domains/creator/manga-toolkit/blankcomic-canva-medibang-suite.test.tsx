// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  BLANKCOMIC_12_PANEL_SHAPES,
  BLANKCOMIC_30_PANEL_TEMPLATES,
  BLANKCOMIC_6_BUBBLE_TYPES,
  BLANKCOMIC_PAGE_PRESETS,
  buildBlankComicPanelShapeSvgPath,
  calculateBlankComicPrintGuides,
  calculateCspWebtoonSmartphoneViewportAndSlices,
  CANVA_COMIC_STRIP_TEMPLATES,
  convertLayerToHalftoneScreentone,
  CSP_V5_NATIVE_DOCUMENT_FORMATS,
  evaluateMediBangCloudTeamPageLock,
  MEDIBANG_PALETTA_GESTURE_SHORTCUTS,
  parseBlankComicProject,
  serializeBlankComicProject,
} from "./blankcomic-canva-medibang-suite";
import { StudioBlankComicProDrawingSubPanel } from "./StudioBlankComicProDrawingSubPanel";

afterEach(() => {
  cleanup();
});

describe("blankcomic-canva-medibang-suite (BlankComic · CSP v5.1.5 · MediBang · Canva)", () => {
  it("BlankComic 30종 템플릿, 12종 패널 도형, 6종 말풍선, 6종 페이지 규격을 제공한다", () => {
    expect(BLANKCOMIC_30_PANEL_TEMPLATES).toHaveLength(30);
    expect(BLANKCOMIC_12_PANEL_SHAPES).toHaveLength(12);
    expect(BLANKCOMIC_6_BUBBLE_TYPES).toHaveLength(6);
    expect(BLANKCOMIC_PAGE_PRESETS).toHaveLength(6);

    for (const shape of BLANKCOMIC_12_PANEL_SHAPES) {
      const d = buildBlankComicPanelShapeSvgPath(shape.id, { x: 10, y: 10, w: 120, h: 80 });
      expect(d.startsWith("M ")).toBe(true);
      expect(d.endsWith("Z")).toBe(true);
    }
  });

  it("BlankComic 인쇄 재단선(Trim)·여백(Bleed)·안전 영역(Safe Area) 및 .blank 코덱이 왕복 직렬화된다", () => {
    const guides = calculateBlankComicPrintGuides("us-comic");
    expect(guides.bleedCanvasRect.w).toBe(1988);
    expect(guides.trimLineRect.w).toBe(1988 - 38 * 2);
    expect(guides.safeAreaRect.w).toBe(1988 - 75 * 2);

    const raw = serializeBlankComicProject({
      format: "blankcomic-project",
      extension: ".blank",
      version: "1.0.0",
      pagePresetId: "manga-b4",
      templateId: "blankcomic-tpl-04",
      panels: [{ id: "p1", shape: "diamond", rect: { x: 0, y: 0, w: 200, h: 200 } }],
      bubbles: [{ id: "b1", type: "shout", text: "크아악!" }],
    });
    const parsed = parseBlankComicProject(raw);
    expect(parsed?.pagePresetId).toBe("manga-b4");
    expect(parsed?.panels[0]?.shape).toBe("diamond");
    expect(parseBlankComicProject("invalid-json")).toBeNull();
  });

  it("클립스튜디오 v5.1.5 15대 네이티브 포맷, 스마트폰 뷰포트 슬라이서, 망점 스크린톤 변환기가 정확히 동작한다", () => {
    expect(CSP_V5_NATIVE_DOCUMENT_FORMATS).toHaveLength(15);
    expect(CSP_V5_NATIVE_DOCUMENT_FORMATS.some((f) => f.extension === ".clip")).toBe(true);
    expect(CSP_V5_NATIVE_DOCUMENT_FORMATS.some((f) => f.extension === ".cs3o")).toBe(true);
    expect(CSP_V5_NATIVE_DOCUMENT_FORMATS.some((f) => f.extension === ".cmc")).toBe(true);

    const slicePlan = calculateCspWebtoonSmartphoneViewportAndSlices({
      canvasWidthPx: 800,
      canvasHeightPx: 6400,
      smartphoneAspectRatio: "9:19.5",
      sliceMaxHeightPx: 1280,
    });
    expect(slicePlan.slices).toHaveLength(5);
    expect(slicePlan.slices[0]?.fileName).toBe("episode_01_slice_001.png");
    expect(slicePlan.smartphoneViewportHeightPx).toBe(Math.round((800 * 19.5) / 9));

    const tone = convertLayerToHalftoneScreentone({
      lpi: 60,
      densityPercent: 40,
      angleDeg: 45,
      dotShape: "circle",
    });
    expect(tone.dotPitchPxAt300Dpi).toBe(5);
    expect(tone.dotRadiusPxAt300Dpi).toBeGreaterThan(1.5);
  });

  it("메디방 클라우드 팀 페이지 잠금 검증기와 팔레타 제스처, 캔바 4컷 스트립 템플릿이 동작한다", () => {
    expect(MEDIBANG_PALETTA_GESTURE_SHORTCUTS).toHaveLength(4);
    expect(CANVA_COMIC_STRIP_TEMPLATES).toHaveLength(3);

    const locked = evaluateMediBangCloudTeamPageLock({
      pageNumber: 2,
      currentUserId: "user-a",
      lockedByUserId: "user-b",
      localRevision: 3,
      cloudRevision: 3,
    });
    expect(locked.canEdit).toBe(false);

    const editable = evaluateMediBangCloudTeamPageLock({
      pageNumber: 2,
      currentUserId: "user-a",
      lockedByUserId: null,
      localRevision: 3,
      cloudRevision: 3,
    });
    expect(editable.canEdit).toBe(true);
  });

  it("StudioBlankComicProDrawingSubPanel에서 4대 도구 탭 전환이 정상 동작한다", () => {
    render(<StudioBlankComicProDrawingSubPanel />);
    expect(screen.getByTestId("blankcomic-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pro-drawing-tab-csp-v5"));
    expect(screen.getByTestId("csp-v5-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pro-drawing-tab-medibang-paletta"));
    expect(screen.getByTestId("medibang-paletta-section")).toBeTruthy();

    fireEvent.click(screen.getByTestId("pro-drawing-tab-canva-strip"));
    expect(screen.getByTestId("canva-strip-section")).toBeTruthy();
  });
});
