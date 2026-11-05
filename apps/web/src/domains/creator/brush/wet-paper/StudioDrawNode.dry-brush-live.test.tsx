// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as material from "../studio-brush-alias-profile";
import * as carrier from "../studio-wet-ribbon-carrier";
import * as surface from "./studio-watercolor-settled-surface";

import { STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION } from "../studio-brush-engine-program-set";
import { resetStudioWetWashLivePipelineCacheForTests } from "../studio-wet-wash-live-pipeline";
import { StudioDrawNode } from "../StudioDrawNode";

import { prewarmStudioDryBrushLiveBake, resetStudioWetPaperBakeHostForTests, studioWetPaperBakeHostStatsForTests } from "./studio-wet-paper-host";
import { studioDryBrushLiveHostStatsForTests } from "./studio-dry-brush-live-host";

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
  vi.restoreAllMocks();
  resetStudioWetPaperBakeHostForTests();
  resetStudioWetWashLivePipelineCacheForTests();
});

describe("실제 causal 획 렌더의 갈필 베이크 배선", () => {
  it("갈필 초안은 최종 물리 없이 침착 작업만 요청하고 언마운트하면 해제한다", async () => {
    await prewarmStudioDryBrushLiveBake();
    const mounted = render(<StudioDrawNode activeDraft el={dryEl()} />);
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(0);
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ owners: 1, jobs: 1 });
    mounted.unmount();
    await Promise.resolve();
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ owners: 0, jobs: 0 });
  });

  it("갈필 초안은 증분 재질을 한 번만 적용하며 배치 fallback을 다시 계획하지 않는다", async () => {
    await prewarmStudioDryBrushLiveBake();
    const materialSpy = vi.spyOn(material, "applyStudioBrushAliasWatercolorMaterial");
    const carrierSpy = vi.spyOn(carrier, "planStudioWetRibbonCarrier");
    const surfaceSpy = vi.spyOn(surface, "resolveStudioWatercolorSettledSurface");
    render(<StudioDrawNode activeDraft el={dryEl()} />);
    expect(surfaceSpy).toHaveBeenCalledTimes(1);
    expect(surfaceSpy.mock.calls[0]?.[0].liveMaterialDabs).toBeDefined();
    expect(materialSpy).not.toHaveBeenCalled();
    expect(carrierSpy).not.toHaveBeenCalled();
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ owners: 1, jobs: 1 });
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

  it("진행 중 갈필을 커스텀 프로그램으로 바꾸면 이전 침착 작업을 해제한다", async () => {
    await prewarmStudioDryBrushLiveBake();
    const mounted = render(<StudioDrawNode activeDraft el={dryEl()} />);
    expect(studioDryBrushLiveHostStatsForTests().jobs).toBe(1);
    mounted.rerender(<StudioDrawNode activeDraft el={dryEl({
      brushEnginePrograms: { version: STUDIO_BRUSH_ENGINE_PROGRAM_SET_VERSION, watercolor: { wetEdgeBloomProgramId: "edge-bloom" } },
    })} />);
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ owners: 0, jobs: 0 });
  });

  it.each([true, false])("StrictMode active=%s 재설정 뒤 props 변경 없이 작업이 진행되고 실제 언마운트는 취소한다", async (activeDraft) => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await prewarmStudioDryBrushLiveBake();
    const mounted = render(<StrictMode><StudioDrawNode activeDraft={activeDraft} el={dryEl()} /></StrictMode>);
    await Promise.resolve();
    expect(studioDryBrushLiveHostStatsForTests().owners).toBe(activeDraft ? 1 : 0);
    if (activeDraft) await waitFor(() => expect(studioDryBrushLiveHostStatsForTests().jobs).toBe(0));
    else {
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
      await waitFor(() => expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 1, pendingSolves: 0 }));
    }
    mounted.unmount();
    await Promise.resolve();
    expect(studioDryBrushLiveHostStatsForTests().owners).toBe(0);
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(0);
  });
});
