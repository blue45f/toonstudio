import { describe, expect, it } from "vitest";

import {
  buildWebVitalsPayload,
  createClsAccumulator,
  createInpAccumulator,
  isPublicVitalsPath,
  rateWebVital,
} from "./web-vitals";

describe("web vitals public-surface contract", () => {
  it("collects only on the public home and /discover (BLUEPRINT §6.4 scope)", () => {
    expect(isPublicVitalsPath("/")).toBe(true);
    expect(isPublicVitalsPath("/discover")).toBe(true);
    expect(isPublicVitalsPath("/studio/canvas")).toBe(false);
    expect(isPublicVitalsPath("/discover/extra")).toBe(false);
    expect(isPublicVitalsPath("/ranking")).toBe(false);
  });

  it("rates against the §6.4 budgets (LCP 2.5s, CLS 0.1, INP 200ms)", () => {
    expect(rateWebVital("LCP", 2_500)).toBe("good");
    expect(rateWebVital("LCP", 2_501)).toBe("needs-improvement");
    expect(rateWebVital("LCP", 4_001)).toBe("poor");
    expect(rateWebVital("CLS", 0.1)).toBe("good");
    expect(rateWebVital("CLS", 0.11)).toBe("needs-improvement");
    expect(rateWebVital("CLS", 0.26)).toBe("poor");
    expect(rateWebVital("INP", 200)).toBe("good");
    expect(rateWebVital("INP", 201)).toBe("needs-improvement");
    expect(rateWebVital("INP", 501)).toBe("poor");
  });
});

describe("CLS session windows", () => {
  it("sums shifts chained within 1s and ignores post-input shifts", () => {
    const cls = createClsAccumulator();
    cls.pushShift({ value: 0.05, startTime: 100, hadRecentInput: false });
    cls.pushShift({ value: 0.04, startTime: 600, hadRecentInput: false });
    cls.pushShift({ value: 0.5, startTime: 700, hadRecentInput: true });
    expect(cls.value()).toBeCloseTo(0.09);
  });

  it("starts a new window after a >1s gap and reports the largest window", () => {
    const cls = createClsAccumulator();
    cls.pushShift({ value: 0.2, startTime: 0, hadRecentInput: false });
    cls.pushShift({ value: 0.05, startTime: 2_000, hadRecentInput: false });
    cls.pushShift({ value: 0.05, startTime: 2_500, hadRecentInput: false });
    expect(cls.value()).toBeCloseTo(0.2);
  });

  it("caps a session window at 5s", () => {
    const cls = createClsAccumulator();
    for (let index = 0; index <= 5; index += 1) {
      cls.pushShift({ value: 0.05, startTime: index * 900, hadRecentInput: false });
    }
    // Shifts at 0..4500ms chain into one 0.30 window; the 5400ms shift would extend
    // the window past 5s, so it opens a new one and the maximum stays 0.30.
    cls.pushShift({ value: 0.05, startTime: 5_400, hadRecentInput: false });
    expect(cls.value()).toBeCloseTo(0.3);
  });

  it("stays null until a real shift is observed", () => {
    expect(createClsAccumulator().value()).toBeNull();
  });
});

describe("INP interaction selection", () => {
  it("keeps the worst event per interaction and reports the maximum when few", () => {
    const inp = createInpAccumulator();
    inp.pushEvent({ duration: 80, interactionId: 1 });
    inp.pushEvent({ duration: 120, interactionId: 1 });
    inp.pushEvent({ duration: 40, interactionId: 2 });
    inp.pushEvent({ duration: 999, interactionId: 0 });
    expect(inp.value()).toBe(120);
  });

  it("moves toward p98 once there are many interactions", () => {
    const inp = createInpAccumulator();
    for (let index = 1; index <= 100; index += 1) {
      inp.pushEvent({ duration: index * 10, interactionId: index });
    }
    // 100 interactions -> index floor(100/50) = 2 of the descending list (1000, 990, 980).
    expect(inp.value()).toBe(980);
  });

  it("stays null without interactions", () => {
    expect(createInpAccumulator().value()).toBeNull();
  });
});

describe("web vitals beacon payload", () => {
  it("rounds and bounds metric values and carries only the path", () => {
    expect(
      buildWebVitalsPayload({
        path: "/discover",
        snapshot: { lcpMs: 2_345.6, cls: 0.123_456, inpMs: 187.2 },
      }),
    ).toEqual({ path: "/discover", lcpMs: 2_346, cls: 0.1235, inpMs: 187 });
  });

  it("keeps unobserved metrics null instead of inventing zeros", () => {
    expect(
      buildWebVitalsPayload({
        path: "/",
        snapshot: { lcpMs: 900, cls: null, inpMs: null },
      }),
    ).toEqual({ path: "/", lcpMs: 900, cls: null, inpMs: null });
  });

  it("sends nothing when no metric was observed", () => {
    expect(
      buildWebVitalsPayload({
        path: "/",
        snapshot: { lcpMs: null, cls: null, inpMs: null },
      }),
    ).toBeNull();
  });

  it.each(["/discover?secret=1", "https://example.com/", "discover", 42])(
    "rejects a privacy-unsafe or malformed path: %s",
    (path) => {
      expect(
        buildWebVitalsPayload({
          path,
          snapshot: { lcpMs: 900, cls: 0.05, inpMs: 100 },
        }),
      ).toBeNull();
    },
  );
});
