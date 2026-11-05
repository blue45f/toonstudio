import { afterEach, expect, it, vi } from "vitest";

import { materializeStudioBrushCatalogSelection } from "../studio-brush-selection";

import { resolveStudioWatercolorSettledSurface } from "./studio-watercolor-settled-surface";
import {
  prewarmStudioDryBrushLiveBake, releaseStudioWetPaperBakeRequesters,
  resetStudioWetPaperBakeHostForTests, studioWetPaperBakeHostStatsForTests,
} from "./studio-wet-paper-host";

vi.mock("./studio-dry-brush-live-host", () => { throw new Error("검증용 지연 청크 수신 실패"); });
afterEach(() => resetStudioWetPaperBakeHostForTests());

const input = {
  brush: "ink-wash--dry-brush", seed: 13, color: "#7653bf", enginePrograms: null,
  activeDraft: true, durableDocumentRender: false, bakeGeneration: 0,
  plannedDabs: [{ x: 20, y: 40, radius: 7, opacity: 0.5, role: "core" as const }],
};

it("지연 준비가 실패해도 기존 dab과 fallback을 유지하고 최종 작업을 만들지 않는다", async () => {
  expect(await prewarmStudioDryBrushLiveBake()).toBe(false);
  const ready = vi.fn();
  const surface = resolveStudioWatercolorSettledSurface({ ...input, onBakeReady: ready, requester: "failed" });
  expect(surface.dabs).toHaveLength(1);
  expect(surface.wetPaperBake).toBeNull();
  expect(studioWetPaperBakeHostStatsForTests().pendingSolves).toBe(0);
  expect(ready).not.toHaveBeenCalled();
});

it("청크가 준비되기 전에 해제한 요청자는 뒤늦게 다시 게시하지 않는다", async () => {
  const ready = vi.fn();
  resolveStudioWatercolorSettledSurface({ ...input, onBakeReady: ready, requester: "removed#0" });
  releaseStudioWetPaperBakeRequesters("removed");
  expect(await prewarmStudioDryBrushLiveBake()).toBe(false);
  await Promise.resolve();
  expect(ready).not.toHaveBeenCalled();
});

it("준비 실패와 독립적으로 갈필 도구 선택은 완료된다", async () => {
  expect((await materializeStudioBrushCatalogSelection(input.brush))?.runtimeBrushId).toBe(input.brush);
  await Promise.resolve();
});
