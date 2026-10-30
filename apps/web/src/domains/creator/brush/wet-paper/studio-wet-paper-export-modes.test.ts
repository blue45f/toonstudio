/**
 * 젖은 종이 굽기의 SVG 내보내기 방식 시험(적대적 리뷰 확정 결함 회귀).
 *
 * - 렌더 경로에서 동기로 부르는 래스터 집계·목록 미리보기는 굽지 않는다(예전에는 캐시에 없는 획마다 수백 ms 를
 *   메인 스레드에서 풀어, 획 40개 페이지에서 집계 한 번이 약 8초 걸렸다).
 * - 내보내기 한 번의 굽기 작업량은 결정적 한도 안이고, 넘는 획은 베이스 워시로 내보내며 근사로 알린다(내보내기
 *   Worker 는 캐시가 비어 매번 모든 획을 풀어 30초 시간 한도를 넘었다).
 * - 반투명·투명·거의 흰 안료는 굽지 않는다('transparent' 가 검정으로 구워지고, 흰 획이 굽고 나면 사라졌다).
 */
import { afterEach, describe, expect, it } from "vitest";

import { exportPageToSvg } from "../../export/studio-svg-export";
import { STUDIO_SVG_WET_PAPER_BAKE_CELL_STEP_BUDGET } from "../../export/studio-svg-export-watercolor";
import { summarizeStudioRasterPreparationSources } from "../../render/studio-raster-edit-preparation";

import { parseStudioWetPaperPigmentColor } from "./studio-wet-paper-composite";
import { resetStudioWetPaperBakeHostForTests, studioWetPaperBakeHostStatsForTests } from "./studio-wet-paper-host";

import type { SvgDrawElLike, SvgExportWetPaperBake } from "../../export/studio-svg-export-types";
import type { El } from "../../studio-element-model";

/** 젖은 종이 레인(커티스 백런) 획 하나. y 로 줄을 바꿔 서로 다른 획을 만든다. */
function wetStroke(index: number, stroke = "#1f6feb"): SvgDrawElLike {
  const y = 40 + (index % 12) * 60;
  const x0 = 40 + Math.floor(index / 12) * 520;
  return {
    id: `wet-${index}`,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush: "watercolor--curtis-bake",
    brushCatalogId: "watercolor--curtis-bake",
    points: [x0, y, x0 + 120, y - 18, x0 + 240, y + 14, x0 + 360, y - 10, x0 + 480, y + 6],
    pressures: [0.4, 0.7, 0.85, 0.7, 0.5],
    stroke,
    strokeWidth: 24,
    opacity: 0.8,
    sampleSpacing: 1,
    watercolorPipeline: "causal-walker-v2",
  };
}

function exportPage(elements: readonly SvgDrawElLike[], wetPaperBake?: SvgExportWetPaperBake) {
  return exportPageToSvg({
    width: 1_600,
    height: 800,
    bg: "#ffffff",
    transparentBg: true,
    elements,
    ...(wetPaperBake ? { wetPaperBake } : {}),
  });
}

const bakedCount = (svg: string): number => svg.split('data-brush-engine="wet-paper-bake-v1"').length - 1;

afterEach(() => resetStudioWetPaperBakeHostForTests());

describe("젖은 종이 굽기 · 굽지 않는 내보내기", () => {
  it("base-wash 내보내기와 래스터 집계는 획을 풀지 않고 캐시도 건드리지 않는다", () => {
    resetStudioWetPaperBakeHostForTests();
    const elements = [wetStroke(0), wetStroke(1)];
    const svg = exportPage(elements, "base-wash").svg;
    expect(bakedCount(svg)).toBe(0);
    expect(svg).toContain("wet-ribbon-carrier-v2");
    expect(studioWetPaperBakeHostStatsForTests().entries).toBe(0);
    const summary = summarizeStudioRasterPreparationSources({
      width: 1_600,
      height: 800,
      elements: elements as unknown as readonly El[],
    });
    expect(summary.unsupportedVisibleCount).toBe(0);
    expect(studioWetPaperBakeHostStatsForTests().entries).toBe(0);
    // 기본 내보내기는 그대로 굽는다.
    expect(bakedCount(exportPage(elements).svg)).toBe(2);
    expect(studioWetPaperBakeHostStatsForTests().entries).toBe(2);
  });
});

describe("젖은 종이 굽기 · 내보내기 작업량 한도", () => {
  it("한도 안의 획만 굽고 나머지는 베이스 워시로 내보내며 근사로 알린다(같은 문서는 같은 SVG)", () => {
    const elements = Array.from({ length: 24 }, (_, index) => wetStroke(index));
    resetStudioWetPaperBakeHostForTests();
    const first = exportPage(elements);
    resetStudioWetPaperBakeHostForTests();
    const second = exportPage(elements);
    expect(second.svg).toBe(first.svg);
    const baked = bakedCount(first.svg);
    const limited = first.skipped.filter((skip) => typeof skip.label !== "string" && skip.label.code === "wetPaperBakeBudget");
    expect(baked).toBeGreaterThan(0);
    expect(limited.length).toBeGreaterThan(0);
    expect(baked + limited.length).toBe(elements.length);
    expect(limited.every((skip) => skip.mode === "approximated")).toBe(true);
    // 한도를 넘은 획은 순서대로 뒤쪽이다(앞에서부터 한도까지 굽는다).
    expect(limited.map((skip) => skip.id)).toEqual(elements.slice(baked).map((element) => element.id));
    expect(STUDIO_SVG_WET_PAPER_BAKE_CELL_STEP_BUDGET).toBe(10_000_000);
  }, 120_000);
});

describe("젖은 종이 굽기 · 굽지 않는 색", () => {
  it("반투명·투명·거의 흰 안료는 굽지 않고 불투명 유채색만 굽는다", () => {
    for (const color of ["transparent", "rgba(255, 0, 0, 0)", "#ff000020", "rgba(31, 111, 235, 0.5)", "#ffffff", "#fefefe", "#ffe0e0"]) {
      expect(parseStudioWetPaperPigmentColor(color), color).toBeNull();
    }
    for (const color of ["#1f6feb", "#000000", "#ff0000", "rgba(31, 111, 235, 1)", "#c0c0ff"]) {
      expect(parseStudioWetPaperPigmentColor(color), color).not.toBeNull();
    }
    resetStudioWetPaperBakeHostForTests();
    const svg = exportPage([wetStroke(0, "transparent"), wetStroke(1, "#ffffff")]).svg;
    expect(bakedCount(svg)).toBe(0);
    // 걸러진 색은 풀기 전에 빠져 작업량·캐시를 쓰지 않는다.
    expect(studioWetPaperBakeHostStatsForTests().entries).toBe(0);
  });
});
