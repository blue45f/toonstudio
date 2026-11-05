// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION } from "../studio-brush-engine-program-set";
import { resetStudioWetWashLivePipelineCacheForTests } from "../studio-wet-wash-live-pipeline";
import { StudioDrawNode } from "../StudioDrawNode";

import { resetStudioWetPaperBakeHostForTests, studioWetPaperBakeHostStatsForTests } from "./studio-wet-paper-host";

import type { DrawEl } from "../../studio-element-model";
import type { ReactNode } from "react";

// 화면 노드만 대체하고 실제 causal 플래너·파이프라인·정착 리졸버·호스트를 통과시킨다.
vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { Fragment, createElement } = await import("react");
  const shape = () => null;
  return {
    Arrow: shape, Circle: shape, Ellipse: shape, Line: shape, Path: shape, Rect: shape, Shape: shape, Star: shape,
    Group: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  };
});

function dryEl(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "causal-dry-live", type: "draw", kind: "freehand", mode: "pen",
    brush: "ink-wash--dry-brush", brushCatalogId: "ink-wash--dry-brush",
    watercolorPipeline: "causal-walker-v2", points: [40, 50, 540, 54], pressures: [0.5, 0.5],
    stroke: "#7653bf", strokeWidth: 24, ...overrides,
  };
}

afterEach(() => {
  cleanup();
  resetStudioWetPaperBakeHostForTests();
  resetStudioWetWashLivePipelineCacheForTests();
});

describe("실제 causal 획 렌더의 갈필 베이크 배선", () => {
  it("신규 causal 갈필 초안이 증분 리본을 우회해 정착 리졸버의 베이크를 요청한다", () => {
    render(<StudioDrawNode activeDraft el={dryEl()} />);
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
  });

  it.each(["ink-wash--moxi-bake", "watercolor--curtis-bake", "watercolor--granulating-bake"])(
    "%s 초안의 기존 증분 워시 경로는 유지한다", (brush) => {
      render(<StudioDrawNode activeDraft el={dryEl({ brush, brushCatalogId: brush })} />);
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(0);
    },
  );

  it.each([{ wetEdgeBloomProgramId: "edge-bloom" }, { livingInkBakeProgramId: "sumi-flow-bake" }])(
    "커스텀 프로그램 %j가 갈필 레인 핀보다 우선한다", (watercolor) => {
      render(<StudioDrawNode activeDraft el={dryEl({
        brushEnginePrograms: { version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION, watercolor },
      })} />);
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(0);
    },
  );

  it("동일 causal 갈필의 커밋 렌더도 기존 최종 베이크를 요청한다", () => {
    render(<StudioDrawNode el={dryEl()} />);
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
  });
});
