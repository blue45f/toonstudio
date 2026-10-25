import { describe, expect, it } from "vitest";

import {
  formatWebVitalValue,
  webVitalRatingLabel,
  webVitalRatingTone,
} from "./web-vitals-format";

describe("web vitals dashboard formatting", () => {
  it("formats durations as seconds past a second and CLS as a ratio", () => {
    expect(formatWebVitalValue("LCP", 2_500)).toBe("2.50초");
    expect(formatWebVitalValue("INP", 180)).toBe("180ms");
    expect(formatWebVitalValue("CLS", 0.05)).toBe("0.05");
    expect(formatWebVitalValue("LCP", null)).toBe("—");
  });

  it("labels ratings in Korean and keeps missing data neutral", () => {
    expect(webVitalRatingLabel("good")).toBe("좋음");
    expect(webVitalRatingLabel("needs-improvement")).toBe("개선 필요");
    expect(webVitalRatingLabel("poor")).toBe("나쁨");
    expect(webVitalRatingLabel(null)).toBe("표본 부족");
    expect(webVitalRatingTone(null)).toBe("muted");
    expect(webVitalRatingTone("poor")).toBe("bad");
  });
});
