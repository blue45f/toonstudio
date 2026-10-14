import { describe, expect, it } from "vitest";

import { createSyntheticReferenceRgba } from "./studio-color-match-presets";
import {
  applyStudioReferenceToneToEpisodePages,
  createReferenceToneMatchOptions,
} from "./studio-color-match-episode";

describe("studio-color-match-episode", () => {
  const reference = createSyntheticReferenceRgba(
    [
      [249, 115, 22],
      [219, 39, 119],
    ],
    16,
  );
  const options = createReferenceToneMatchOptions(80, 2.5);

  it("maps panel percent controls to kernel options", () => {
    expect(options).toEqual({
      strength: 0.8,
      clipSigma: 2.5,
      minimumStandardDeviation: 1.0,
    });
    expect(createReferenceToneMatchOptions(150, 2.5).strength).toBe(1);
    expect(createReferenceToneMatchOptions(-10, 2.5).strength).toBe(0);
  });

  it("applies the same reference tone to every episode page in one call", () => {
    const pageA = createSyntheticReferenceRgba(
      [
        [100, 100, 100],
        [200, 200, 200],
      ],
      16,
    );
    const pageB = createSyntheticReferenceRgba(
      [
        [40, 60, 80],
        [90, 110, 130],
      ],
      16,
    );

    const summary = applyStudioReferenceToneToEpisodePages({
      pages: [
        { pageId: "cut-1", image: pageA },
        { pageId: "cut-2", image: pageB },
      ],
      reference,
      options,
    });

    expect(summary.totalCount).toBe(2);
    expect(summary.appliedCount).toBe(2);
    expect(summary.refusedCount).toBe(0);
    expect(summary.results.map((r) => r.pageId)).toEqual(["cut-1", "cut-2"]);
    for (const result of summary.results) {
      expect(result.status).toBe("applied");
      if (result.status === "applied") {
        expect(result.image.width).toBe(16);
        expect(result.image.height).toBe(16);
        expect(result.image.data).toBeInstanceOf(Uint8ClampedArray);
      }
    }
    // Inputs are not mutated by the batch apply.
    expect(pageA.data[0]).toBe(100);
    expect(pageB.data[0]).toBe(40);
  });

  it("reports an invalid page as refused without aborting the rest", () => {
    const good = createSyntheticReferenceRgba(
      [
        [100, 100, 100],
        [200, 200, 200],
      ],
      16,
    );
    const broken = { width: 0, height: 0, data: new Uint8ClampedArray(0) };

    const summary = applyStudioReferenceToneToEpisodePages({
      pages: [
        { pageId: "cut-bad", image: broken },
        { pageId: "cut-good", image: good },
      ],
      reference,
      options,
    });

    expect(summary.totalCount).toBe(2);
    expect(summary.appliedCount).toBe(1);
    expect(summary.refusedCount).toBe(1);
    expect(summary.results[0]?.status).toBe("refused");
    expect(summary.results[1]?.status).toBe("applied");
  });

  it("handles an empty episode without throwing", () => {
    const summary = applyStudioReferenceToneToEpisodePages({
      pages: [],
      reference,
      options,
    });
    expect(summary).toMatchObject({
      totalCount: 0,
      appliedCount: 0,
      refusedCount: 0,
    });
  });
});
