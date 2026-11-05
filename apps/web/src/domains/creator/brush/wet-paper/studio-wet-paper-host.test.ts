import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyStudioBrushAliasWatercolorMaterial } from "../studio-brush-alias-profile";

import { resolveStudioWatercolorSettledSurface } from "./studio-watercolor-settled-surface";
import {
  drawStudioWetPaperBake,
  peekStudioWetPaperBakeResult,
  rememberStudioWetPaperBakeResult,
  requestStudioWetPaperBake,
  prewarmStudioDryBrushLiveBake,
  resetStudioWetPaperBakeHostForTests,
  studioWetPaperBakeHostStatsForTests,
  type StudioWetPaperCanvasBake,
} from "./studio-wet-paper-host";
import { compositeStudioWetPaperRaster } from "./studio-wet-paper-composite";
import { normalizeStudioWetPaperBakeSettings } from "./studio-wet-paper-programs";
import { solveStudioWetPaperBakeUncached } from "./studio-wet-paper-solver";
import { studioDryBrushLiveHostStatsForTests } from "./studio-dry-brush-live-host";

import type { WetPaperInputDab } from "./studio-wet-paper-deposit";

const DABS: readonly WetPaperInputDab[] = Array.from({ length: 30 }, (_, index) => ({
  x: 30 + index * 3,
  y: 50,
  radius: 8,
  opacity: 0.6,
  role: "core" as const,
}));

interface FakeCanvas {
  width: number;
  height: number;
  pixels: Uint8ClampedArray | null;
  getContext(kind: string): unknown;
}

/** 문서가 없는 Node 환경에 최소 캔버스를 꽂는다(래스터가 실제로 putImageData 되는지 본다). */
function installFakeDocument(): FakeCanvas[] {
  const canvases: FakeCanvas[] = [];
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      expect(tag).toBe("canvas");
      const canvas: FakeCanvas = {
        width: 0,
        height: 0,
        pixels: null,
        getContext: () => ({
          createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: (image: { data: Uint8ClampedArray }) => {
            canvas.pixels = image.data;
          },
        }),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  return canvases;
}

function waitFor(register: (onReady: () => void) => unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("bake did not land")), 20_000);
    register(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe("wet-paper settled bake host (time-sliced, cached)", () => {
  beforeEach(() => resetStudioWetPaperBakeHostForTests());
  afterEach(() => {
    resetStudioWetPaperBakeHostForTests();
    vi.unstubAllGlobals();
  });

  it("returns null first, bakes in slices, then serves bytes identical to the synchronous bake", async () => {
    const canvases = installFakeDocument();
    const request = { seed: 11, programId: "curtis-watercolor-backrun" as const };
    let first: StudioWetPaperCanvasBake | null = null;
    await waitFor((onReady) => {
      first = requestStudioWetPaperBake(DABS, request, "#1f6feb", onReady, 0);
    });
    expect(first).toBeNull();
    const settings = normalizeStudioWetPaperBakeSettings({ ...request, phase: "settled" });
    if (!settings) throw new Error("settings");
    const sync = solveStudioWetPaperBakeUncached(DABS, settings);
    const cached = peekStudioWetPaperBakeResult(DABS, settings);
    expect(cached && sync).toBeTruthy();
    if (!cached || !sync) return;
    expect(Buffer.from(cached.density.buffer)).toEqual(Buffer.from(sync.density.buffer));
    expect(Buffer.from(cached.coverage)).toEqual(Buffer.from(sync.coverage));

    const bake = requestStudioWetPaperBake(DABS, request, "#1f6feb", () => {}, 1);
    expect(bake).not.toBeNull();
    if (!bake) return;
    const raster = compositeStudioWetPaperRaster(sync, "#1f6feb");
    expect(raster).not.toBeNull();
    if (!raster) return;
    // 시분할 합성 = 동기 합성(같은 바이트), 목적지 사각형은 문서 좌표.
    expect(canvases).toHaveLength(1);
    expect(Buffer.from(canvases[0]?.pixels ?? [])).toEqual(Buffer.from(raster.rgba));
    expect(bake.x).toBe(raster.originXPx);
    expect(bake.y).toBe(raster.originYPx);
    expect(bake.width).toBeCloseTo(raster.width * raster.pixelPx, 9);
    expect(bake.height).toBeCloseTo(raster.height * raster.pixelPx, 9);
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 1, pendingSolves: 0, pendingComposites: 0 });

    const calls: unknown[][] = [];
    const context = {
      globalAlpha: 0.3,
      drawImage: (...args: unknown[]) => {
        calls.push([context.globalAlpha, ...args]);
      },
    };
    drawStudioWetPaperBake(context, bake, 0.8);
    expect(calls).toEqual([[0.8, bake.image, bake.x, bake.y, bake.width, bake.height]]);
    expect(context.globalAlpha).toBe(0.3);
  });

  it("recomposites a new colour without solving again and shares one job per input", async () => {
    installFakeDocument();
    const request = { seed: 5, programId: "moxi-sumi-dispersion" as const };
    const listeners: number[] = [];
    await waitFor((onReady) => {
      expect(requestStudioWetPaperBake(DABS, request, "#111111", () => listeners.push(1), 0)).toBeNull();
      expect(requestStudioWetPaperBake(DABS, request, "#111111", () => {
        listeners.push(2);
        onReady();
      }, 0)).toBeNull();
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
    });
    expect(listeners.sort()).toEqual([1, 2]);
    const cellsAfterSolve = studioWetPaperBakeHostStatsForTests().cells;
    await waitFor((onReady) => {
      expect(requestStudioWetPaperBake(DABS, request, "#aa3300", onReady, 2)).toBeNull();
      expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ pendingSolves: 0, pendingComposites: 1 });
    });
    expect(requestStudioWetPaperBake(DABS, request, "#aa3300", () => {}, 3)).not.toBeNull();
    expect(requestStudioWetPaperBake(DABS, request, "#111111", () => {}, 3)).not.toBeNull();
    expect(studioWetPaperBakeHostStatsForTests().cells).toBe(cellsAfterSolve);
  });

  it("기존 갈필 원고를 재열면 최종 작업만 요청하고 새 침착 작업은 추가하지 않는다", () => {
    for (let seed = 0; seed < 10; seed += 1) resolveStudioWatercolorSettledSurface({
      brush: "ink-wash--dry-brush", seed, color: "#7653bf", enginePrograms: null,
      activeDraft: false, durableDocumentRender: true, plannedDabs: DABS,
      onBakeReady: () => {}, bakeGeneration: 0, requester: `reopen-${seed}`,
    });
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(10);
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 0, jobs: 0, owners: 0 });
  });

  it("갈필의 오래된 prefix를 버리고 침착 표면을 유지하다 기존 최종 바이트로 교체한다", async () => {
    const canvases = installFakeDocument(), abandonedReady = vi.fn();
    await prewarmStudioDryBrushLiveBake();
    const base = {
      brush: "ink-wash--dry-brush", seed: 13, enginePrograms: null, color: "#7653bf",
      activeDraft: true, durableDocumentRender: false, bakeGeneration: 0, requester: "dry-live-prefix",
    };
    const abandoned = resolveStudioWatercolorSettledSurface({ ...base, plannedDabs: DABS.slice(0, 5), onBakeReady: abandonedReady });
    expect(abandoned.wetPaperBake).toBeNull();
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(0);
    await waitFor((onReady) => {
      const poll = () => {
        const live = resolveStudioWatercolorSettledSurface({ ...base, plannedDabs: DABS, onBakeReady: poll });
        if (live.wetPaperBake) onReady();
      };
      poll();
    });
    expect(abandonedReady).not.toHaveBeenCalled();
    const live = resolveStudioWatercolorSettledSurface({ ...base, plannedDabs: DABS, onBakeReady: () => {}, bakeGeneration: 1 });
    expect(live.wetPaperBake).not.toBeNull();
    const pending = resolveStudioWatercolorSettledSurface({ ...base, plannedDabs: DABS, activeDraft: false, durableDocumentRender: true, onBakeReady: () => {} });
    expect(pending.wetPaperBake).toBe(live.wetPaperBake);
    expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
    await waitFor((onReady) => resolveStudioWatercolorSettledSurface({ ...base, plannedDabs: DABS, activeDraft: false, durableDocumentRender: true, onBakeReady: onReady }));
    const committed = resolveStudioWatercolorSettledSurface({ ...base, plannedDabs: DABS, activeDraft: false, durableDocumentRender: true, onBakeReady: () => {}, bakeGeneration: 2 });
    expect(committed.wetPaperBake).not.toBe(live.wetPaperBake);
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 1, pendingSolves: 0, pendingComposites: 0 });
    const dabs = applyStudioBrushAliasWatercolorMaterial(base.brush, DABS, base.seed, "settled", null);
    expect(live.dabs).toEqual(dabs);
    const settings = normalizeStudioWetPaperBakeSettings({ seed: base.seed, phase: "settled", programId: "chu-tai-dry-brush" });
    if (!settings) throw new Error("갈필 프로그램을 해석할 수 없습니다.");
    const expected = solveStudioWetPaperBakeUncached(dabs, settings);
    if (!expected) throw new Error("기존 갈필 최종 베이크가 없습니다.");
    const raster = compositeStudioWetPaperRaster(expected, base.color);
    if (!raster) throw new Error("기존 갈필 최종 래스터가 없습니다.");
    expect(canvases).toHaveLength(2);
    expect(Buffer.from(canvases.at(-1)?.pixels ?? [])).toEqual(Buffer.from(raster.rgba));
    expect(committed.wetPaperBake).toMatchObject({ x: raster.originXPx, y: raster.originYPx, width: raster.width * raster.pixelPx, height: raster.height * raster.pixelPx });
  });

  it("fails closed for unknown programs, empty plans and documents without a canvas", async () => {
    expect(requestStudioWetPaperBake(DABS, { seed: 1, programId: "nope" as never }, "#000", () => {}, 0)).toBeNull();
    expect(requestStudioWetPaperBake([], { seed: 1, programId: "chu-tai-dry-brush" }, "#000", () => {}, 0)).toBeNull();
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ pendingSolves: 0, pendingComposites: 0 });
    // 캔버스를 만들 수 없는 환경(Node): 결과는 캐시되지만 래스터는 null로 남아 베이스 워시를 계속 그린다.
    const request = { seed: 2, programId: "chu-tai-dry-brush" as const };
    await waitFor((onReady) => requestStudioWetPaperBake(DABS, request, "#000000", onReady, 0));
    // 풀이 뒤 같은 조각 흐름에서 합성까지 끝났고(캔버스 null), 다시 물어도 작업을 새로 걸지 않는다.
    expect(requestStudioWetPaperBake(DABS, request, "#000000", () => {}, 1)).toBeNull();
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 1, pendingSolves: 0, pendingComposites: 0 });
  });

  it("lets the synchronous export path seed the cache the canvas path reads", () => {
    const settings = normalizeStudioWetPaperBakeSettings({
      seed: 9,
      phase: "settled",
      programId: "curtis-granulating-wash",
    });
    if (!settings) throw new Error("settings");
    expect(peekStudioWetPaperBakeResult(DABS, settings)).toBeUndefined();
    const result = solveStudioWetPaperBakeUncached(DABS, settings);
    rememberStudioWetPaperBakeResult(DABS, settings, result);
    expect(peekStudioWetPaperBakeResult(DABS, settings)).toBe(result);
    // 다른 시드는 다른 키다.
    expect(peekStudioWetPaperBakeResult(DABS, { ...settings, seed: 10 })).toBeUndefined();
  });
});
