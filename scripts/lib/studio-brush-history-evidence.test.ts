import { describe, expect, it } from "vitest";

import { matchesStudioBrushHistoryBaseline } from "./studio-brush-history-evidence";

const paper = Buffer.from([255, 255, 255, 255, 255, 255, 255, 255]);
const painted = { changedPixels: 29, maxChannelDelta: 58 };

describe("같은 원고 영역의 브러시 실행 취소", () => {
  it("획을 그렸을 때 잉크가 보였고 취소 뒤 원래 픽셀로 돌아왔을 때만 통과한다", () => {
    expect(matchesStudioBrushHistoryBaseline(paper, Buffer.from(paper), painted)).toBe(true);
    expect(matchesStudioBrushHistoryBaseline(paper, paper, { changedPixels: 3, maxChannelDelta: 90 })).toBe(false);
    expect(matchesStudioBrushHistoryBaseline(paper, paper, { changedPixels: 80, maxChannelDelta: 3 })).toBe(false);
  });

  it("유채색·무채색 잉크와 한 바이트만 남은 경우도 검출한다", () => {
    for (const rgba of [[228, 222, 255, 255], [226, 226, 226, 255], [255, 254, 255, 255]]) {
      const residual = Buffer.from(paper);
      residual.set(rgba, 4);
      expect(matchesStudioBrushHistoryBaseline(paper, residual, painted)).toBe(false);
    }
  });
});
