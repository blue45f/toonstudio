import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  prewarmStudioDryBrushLiveHost,
  releaseStudioDryBrushLiveHost,
  requestStudioDryBrushLiveHost,
  resetStudioDryBrushLiveHostForTests,
  studioDryBrushLiveHostStatsForTests,
} from "./studio-dry-brush-live-host";
import { compositeStudioWetPaperRaster } from "./studio-wet-paper-composite";
import {
  peekStudioWetPaperBakeResult,
  prewarmStudioDryBrushLiveBake,
  releaseStudioWetPaperBakeRequesters,
  requestStudioDryBrushLiveBake,
  requestStudioWetPaperBake,
  resetStudioWetPaperBakeHostForTests,
  studioWetPaperBakeHostStatsForTests,
} from "./studio-wet-paper-host";
import { normalizeStudioWetPaperBakeSettings } from "./studio-wet-paper-programs";
import { solveStudioWetPaperBakeUncached } from "./studio-wet-paper-solver";

import type { WetPaperInputDab } from "./studio-wet-paper-deposit";
import type { StudioWetPaperCanvasBake } from "./studio-wet-paper-host";

const DABS: readonly WetPaperInputDab[] = Array.from({ length: 24 }, (_, index) => ({
  x: 30 + index * 4, y: 50 + index * 0.03, radius: 8,
  opacity: 0.6, role: "core" as const,
}));
const REQUEST = { seed: 13, programId: "chu-tai-dry-brush" as const };
const COLOR = "#7653bf";

interface TestCanvas {
  width: number;
  height: number;
  pixels: Uint8ClampedArray | null;
  getContext(): unknown;
}

function installCanvasDocument(): TestCanvas[] {
  const canvases: TestCanvas[] = [];
  vi.stubGlobal("document", {
    createElement: (tag: string) => {
      expect(tag).toBe("canvas");
      const canvas: TestCanvas = {
        width: 0, height: 0, pixels: null,
        getContext: () => ({
          createImageData: (width: number, height: number) => ({
            width, height, data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: (image: { data: Uint8ClampedArray }) => { canvas.pixels = image.data; },
        }),
      };
      canvases.push(canvas);
      return canvas;
    },
  });
  return canvases;
}

function ready(register: (onReady: () => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("갈필 표면 완료 알림이 없습니다.")), 5_000);
    register(() => { clearTimeout(timeout); resolve(); });
  });
}

function liveCanvas(bake: StudioWetPaperCanvasBake | null, canvases: readonly TestCanvas[]): TestCanvas {
  if (!bake) throw new Error("갈필 표면이 준비되지 않았습니다.");
  const canvas = canvases.find((candidate) => Object.is(candidate, bake.image));
  if (!canvas?.pixels) throw new Error("실제로 합성한 갈필 픽셀이 없습니다.");
  return canvas;
}

beforeEach(() => {
  resetStudioWetPaperBakeHostForTests();
  resetStudioDryBrushLiveHostForTests();
});
afterEach(() => {
  resetStudioWetPaperBakeHostForTests();
  resetStudioDryBrushLiveHostForTests();
  vi.unstubAllGlobals();
});

describe("갈필 라이브 표면의 캐시·요청자 수명", () => {
  it("재열기의 조회 전용 요청은 cold miss에서 어떤 미리보기 작업도 만들지 않는다", () => {
    installCanvasDocument();
    const onReady = vi.fn();
    expect(requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, onReady, "readonly-cold#0", false)).toBeNull();
    expect(requestStudioDryBrushLiveHost(DABS, { ...REQUEST, seed: 14 }, COLOR, onReady, "readonly-cold#1", false)).toBeNull();
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 0, jobs: 0, owners: 0, pixels: 0 });
    expect(onReady).not.toHaveBeenCalled();
  });

  it("조회 전용 요청은 정확히 같은 기존 대기 작업·래스터만 공유한다", async () => {
    const canvases = installCanvasDocument(), activeReady = vi.fn(), commitReady = vi.fn();
    await ready((onReady) => {
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, activeReady, "readonly-active#0");
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => { commitReady(); onReady(); }, "readonly-commit#0", false);
      expect(requestStudioDryBrushLiveHost(DABS, { ...REQUEST, seed: 14 }, COLOR, () => {}, "readonly-miss#0", false)).toBeNull();
      expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 1, jobs: 1, owners: 2 });
    });
    expect(activeReady).toHaveBeenCalledTimes(1);
    expect(commitReady).toHaveBeenCalledTimes(1);
    const active = requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => {}, "readonly-active#0");
    const committed = requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => {}, "readonly-commit#0", false);
    expect(committed).toBe(active);
    expect(liveCanvas(committed, canvases).pixels?.some((channel) => channel > 0)).toBe(true);
    expect(requestStudioDryBrushLiveHost(DABS.slice(0, 3), REQUEST, COLOR, () => {}, "readonly-miss#0", false)).toBeNull();
    expect(requestStudioDryBrushLiveHost(DABS, { ...REQUEST, seed: 14 }, COLOR, () => {}, "readonly-miss#0", false)).toBeNull();
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 1, jobs: 0, owners: 2 });
  });

  it.each(["empty", "program", "seed", "coordinate"] as const)(
    "이미 대기 중인 prefix를 %s 입력으로 대체하면 facade도 옛 작업·알림을 취소한다", async (kind) => {
      installCanvasDocument();
      await prewarmStudioDryBrushLiveBake();
      const oldReady = vi.fn();
      requestStudioDryBrushLiveBake(DABS, REQUEST, COLOR, oldReady, "invalid-replace#0");
      expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ jobs: 1, owners: 1 });
      const dabs = kind === "empty" ? [] : kind === "coordinate"
        ? [{ x: Infinity, y: 50, radius: 8, opacity: 0.6, role: "core" as const }]
        : DABS;
      const request = kind === "program"
        ? { seed: 13, programId: "moxi-sumi-dispersion" as const }
        : kind === "seed" ? { ...REQUEST, seed: NaN } : REQUEST;
      expect(requestStudioDryBrushLiveBake(dabs, request, COLOR, () => {}, "invalid-replace#0")).toBeNull();
      expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ jobs: 0, owners: 0 });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      expect(oldReady).not.toHaveBeenCalled();
    },
  );

  it("침착 미리보기는 최종 캐시에 쓰지 않고 기존 최종 RGBA를 그대로 보존한다", async () => {
    const canvases = installCanvasDocument();
    await ready((onReady) => {
      expect(requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, onReady, "isolation#0")).toBeNull();
    });
    const live = requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => {}, "isolation#0");
    const previewCanvas = liveCanvas(live, canvases);
    const settings = normalizeStudioWetPaperBakeSettings({ ...REQUEST, phase: "settled" });
    if (!settings) throw new Error("갈필 설정이 없습니다.");
    expect(peekStudioWetPaperBakeResult(DABS, settings)).toBeUndefined();
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 0, pendingSolves: 0, pendingComposites: 0 });
    const solved = solveStudioWetPaperBakeUncached(DABS, settings);
    if (!solved) throw new Error("기존 최종 풀이가 없습니다.");
    const expected = compositeStudioWetPaperRaster(solved, COLOR);
    if (!expected) throw new Error("기존 최종 RGBA가 없습니다.");
    expect(Buffer.from(previewCanvas.pixels ?? [])).not.toEqual(Buffer.from(expected.rgba));
    await ready((onReady) => {
      expect(requestStudioWetPaperBake(DABS, REQUEST, COLOR, onReady, 0, "final-isolation#0")).toBeNull();
    });
    const final = requestStudioWetPaperBake(DABS, REQUEST, COLOR, () => {}, 1, "final-isolation#0");
    expect(Buffer.from(liveCanvas(final, canvases).pixels ?? [])).toEqual(Buffer.from(expected.rgba));
    expect(final).toMatchObject({ x: expected.originXPx, y: expected.originYPx, width: expected.width * expected.pixelPx, height: expected.height * expected.pixelPx });
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 1, pendingSolves: 0, pendingComposites: 0 });
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 1, jobs: 0, owners: 1 });
  });

  it("같은 라이브 작업의 한 요청자를 해제해도 다른 요청자는 완료되고 이전 알림은 버린다", async () => {
    installCanvasDocument();
    const removed = vi.fn(), retained = vi.fn();
    await ready((onReady) => {
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, removed, "owner#0");
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => { retained(); onReady(); }, "owner-other#0");
      expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 1, jobs: 1, owners: 2 });
      releaseStudioDryBrushLiveHost("owner");
    });
    expect(removed).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalledTimes(1);
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 1, jobs: 0, owners: 1 });
    releaseStudioDryBrushLiveHost("owner-other");
    expect(studioDryBrushLiveHostStatsForTests().owners).toBe(0);
  });

  it("cleanup 뒤 같은 요청자 키를 다시 써도 이전 라이브 세대의 알림은 돌아오지 않는다", async () => {
    installCanvasDocument();
    const previous = vi.fn(), next = vi.fn();
    requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, previous, "remount#0");
    releaseStudioDryBrushLiveHost("remount");
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ jobs: 0, owners: 0 });
    await ready((onReady) => {
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => { next(); onReady(); }, "remount#0");
    });
    expect(previous).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("최종 작업을 공유한 요청자도 cleanup·동일 키 재등록 뒤 옛 세대 알림을 받지 않는다", async () => {
    installCanvasDocument();
    const previous = vi.fn(), retained = vi.fn(), next = vi.fn();
    await ready((onReady) => {
      requestStudioWetPaperBake(DABS, REQUEST, COLOR, previous, 0, "final-remount#0");
      requestStudioWetPaperBake(DABS, REQUEST, COLOR, retained, 0, "final-peer#0");
      releaseStudioWetPaperBakeRequesters("final-remount");
      expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(1);
      requestStudioWetPaperBake(DABS, REQUEST, COLOR, () => { next(); onReady(); }, 0, "final-remount#0");
    });
    expect(previous).not.toHaveBeenCalled();
    expect(retained).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 1, pendingSolves: 0, pendingComposites: 0 });
  });

  it("입력 배열이 바뀌어도 이미 요청한 prefix의 수치 스냅숏은 변하지 않는다", async () => {
    const canvases = installCanvasDocument();
    const mutable = DABS.map((dab) => ({ ...dab }));
    await ready((onReady) => {
      requestStudioDryBrushLiveHost(mutable, REQUEST, COLOR, onReady, "snapshot#0");
      mutable[0] = { x: 2_000, y: 50, radius: 8, opacity: 0.1, role: "core" };
    });
    const original = requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => {}, "snapshot#0");
    const before = Buffer.from(liveCanvas(original, canvases).pixels ?? []);
    expect(before.some((channel) => channel > 0)).toBe(true);
    resetStudioDryBrushLiveHostForTests();
    await ready((onReady) => {
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, onReady, "snapshot#0");
    });
    const rebuilt = requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => {}, "snapshot#0");
    expect(Buffer.from(liveCanvas(rebuilt, canvases).pixels ?? [])).toEqual(before);
    expect(original && rebuilt && [original.x, original.y, original.width, original.height])
      .toEqual(rebuilt && [rebuilt.x, rebuilt.y, rebuilt.width, rebuilt.height]);
    expect(requestStudioDryBrushLiveHost(mutable, REQUEST, COLOR, () => {}, "snapshot#0")).toBeNull();
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 2, jobs: 1, owners: 1 });
    releaseStudioDryBrushLiveHost("snapshot");
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ jobs: 0, owners: 0 });
  });

  it("색·시드·역할이 바뀐 prefix는 이전 래스터를 재사용하지 않는다", async () => {
    installCanvasDocument();
    await ready((onReady) => {
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, onReady, "identity#0");
    });
    expect(requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => {}, "identity#0")).not.toBeNull();
    expect(requestStudioDryBrushLiveHost(DABS, { ...REQUEST, seed: 14 }, COLOR, () => {}, "identity#0")).toBeNull();
    expect(requestStudioDryBrushLiveHost(DABS, REQUEST, "#123456", () => {}, "identity#0")).toBeNull();
    expect(requestStudioDryBrushLiveHost(DABS.map((dab) => ({ ...dab, role: "diffuse" as const })), REQUEST, COLOR, () => {}, "identity#0")).toBeNull();
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 2, jobs: 1, owners: 1 });
    expect(studioWetPaperBakeHostStatsForTests()).toMatchObject({ entries: 0, pendingSolves: 0, pendingComposites: 0 });
  });

  it("32개 캐시 상한으로 제거돼도 이미 화면이 받은 canvas와 픽셀은 비우지 않는다", async () => {
    const canvases = installCanvasDocument();
    await prewarmStudioDryBrushLiveHost();
    await ready((onReady) => {
      requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, onReady, "visible#0");
    });
    const visible = requestStudioDryBrushLiveHost(DABS, REQUEST, COLOR, () => {}, "visible#0");
    const canvas = liveCanvas(visible, canvases);
    const before = { width: canvas.width, height: canvas.height, pixels: Buffer.from(canvas.pixels ?? []) };
    for (let index = 1; index <= 32; index++) {
      requestStudioDryBrushLiveHost(DABS, { ...REQUEST, seed: REQUEST.seed + index }, COLOR, () => {}, `evict#${index}`);
    }
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 32, jobs: 32, pixels: 0 });
    expect(canvas.width).toBe(before.width);
    expect(canvas.height).toBe(before.height);
    expect(Buffer.from(canvas.pixels ?? [])).toEqual(before.pixels);
    releaseStudioDryBrushLiveHost("evict");
    releaseStudioDryBrushLiveHost("visible");
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ jobs: 0, owners: 0 });
  });

  it("다른 프로그램·유한하지 않은 값·빈 입력은 라이브 작업을 만들지 않는다", () => {
    installCanvasDocument();
    const onReady = vi.fn();
    expect(requestStudioDryBrushLiveHost(DABS, { seed: 13, programId: "moxi-sumi-dispersion" }, COLOR, onReady, "other#0")).toBeNull();
    expect(requestStudioDryBrushLiveHost(DABS, { ...REQUEST, seed: NaN }, COLOR, onReady, "invalid#0")).toBeNull();
    expect(requestStudioDryBrushLiveHost([{ x: Infinity, y: 50, radius: 8, opacity: 0.6, role: "core" }], REQUEST, COLOR, onReady, "invalid#0")).toBeNull();
    expect(requestStudioDryBrushLiveHost([], REQUEST, COLOR, onReady, "empty#0")).toBeNull();
    expect(studioDryBrushLiveHostStatsForTests()).toMatchObject({ entries: 0, jobs: 0, owners: 0, pixels: 0 });
    expect(onReady).not.toHaveBeenCalled();
  });
});
