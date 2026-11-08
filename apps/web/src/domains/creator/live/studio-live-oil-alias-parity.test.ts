import { afterEach, describe, expect, it, vi } from "vitest";

import { studioBrushAliasEffectiveDiameter } from "../brush/studio-brush-alias-profile";
import * as fxBrush from "../studio-fx-brush";

import { StudioLiveRetainedMediaOverlayRenderer } from "./studio-live-retained-media-overlay";

import type { DrawEl } from "../studio-element-model";

function canvas() {
  const context = {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    save() {}, restore() {}, setTransform() {}, clearRect() {}, drawImage() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {},
  };
  return { width: 800, height: 180, getContext: () => context } as unknown as HTMLCanvasElement;
}

afterEach(() => vi.restoreAllMocks());

describe("리테인드 유화와 문서 렌더의 별칭 폭 계약", () => {
  it.each(["oil", "acrylic", "oil--flat-ribbon", "oil--filbert-ribbon", "acrylic--stiff-ribbon"])(
    "%s의 라이브·정착 리플레이가 문서와 같은 폭을 사용한다", (brush) => {
      const incremental = vi.spyOn(fxBrush.FxOilDabPlanner.prototype, "plan");
      const replay = vi.spyOn(fxBrush, "planOilBrushDabs");
      const renderer = new StudioLiveRetainedMediaOverlayRenderer();
      renderer.attach({ activeCanvas: canvas(), settledCanvas: canvas() });
      renderer.setSurface({ left: 0, top: 0, width: 800, height: 180, documentScale: 1, documentWidth: 800, flipX: false });
      const element: DrawEl = {
        id: `oil-parity-${brush}`, type: "draw", kind: "freehand", mode: "pen", brush,
        points: [20, 60, 60, 75, 120, 60], pressures: [0.4, 0.8, 0.5],
        strokeWidth: 24, stroke: "#563cc7", opacity: 0.7, sampleSpacing: 1,
      };
      const canonicalWidth = studioBrushAliasEffectiveDiameter(brush, Math.max(1, element.strokeWidth));
      expect(renderer.begin(element)).toEqual({ status: "started", kind: "oil" });
      expect(incremental).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: canonicalWidth }));
      expect(renderer.end(element)).toEqual({ status: "settled" });
      // 픽셀 snapshot이 없는 환경의 리플레이도 같은 입력을 사용해야 한다.
      expect(renderer.hideSettledPixels([element.id])).toBe(true);
      expect(renderer.showSettledPixels([element.id])).toBe(true);
      expect(replay).toHaveBeenCalledWith(expect.objectContaining({ baseWidth: canonicalWidth }));
    },
  );
});
