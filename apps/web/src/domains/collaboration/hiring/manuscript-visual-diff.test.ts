import { describe, expect, it } from "vitest";

import {
  buildTimelapseEndcardSpec,
  computeRgbaDiffSummary,
} from "./manuscript-visual-diff";

describe("manuscript-visual-diff", () => {
  it("detects exact changed pixel bounding box and ignores noise below threshold", () => {
    const w = 10;
    const h = 8;
    const before = new Uint8Array(w * h * 4).fill(255);
    const after = new Uint8Array(before);

    // Subtle compression noise (+4) at (0, 0) -> ignored under default threshold 12
    after[0] = 251;

    // Real artist stroke edits at (3, 2) and (6, 5)
    const p1 = (2 * w + 3) * 4;
    after[p1] = 20;
    after[p1 + 1] = 30;
    after[p1 + 2] = 40;

    const p2 = (5 * w + 6) * 4;
    after[p2] = 10;

    const summary = computeRgbaDiffSummary({
      width: w,
      height: h,
      beforeRgba: before,
      afterRgba: after,
    });

    expect(summary.hasChanges).toBe(true);
    expect(summary.changedPixelCount).toBe(2);
    expect(summary.boundingBox).toEqual({
      minX: 3,
      minY: 2,
      maxX: 6,
      maxY: 5,
      width: 4,
      height: 4,
    });
  });

  it("builds opt-in 1.5s timelapse endcard metadata with portfolio URL and rights code", () => {
    const spec = buildTimelapseEndcardSpec({
      workTitle: "게이트 브레이커 48화",
      creatorHandle: "@LunaPen",
      certificateShortCode: "844F7317",
    });

    expect(spec.durationSec).toBe(1.5);
    expect(spec.portfolioUrl).toBe("https://www.toonstudio.cloud/u/lunapen");
    expect(spec.captionKo).toContain("권리 확인 #844F7317");
  });
});
