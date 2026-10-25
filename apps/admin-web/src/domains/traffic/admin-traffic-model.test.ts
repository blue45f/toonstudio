import { describe, expect, it } from "vitest";

import {
  TRAFFIC_RANGE_DAYS,
  TRAFFIC_RANGE_LABEL_KEYS,
  formatTrafficDateTime,
  formatTrafficDuration,
  formatTrafficMilliseconds,
} from "./admin-traffic-model";

describe("admin traffic model", () => {
  it("formats duration and latency values consistently", () => {
    expect(formatTrafficDuration(42)).toBe("42s");
    expect(formatTrafficDuration(120)).toBe("2m");
    expect(formatTrafficDuration(135)).toBe("2m 15s");
    expect(formatTrafficMilliseconds(null)).toBe("—");
    expect(formatTrafficMilliseconds(320)).toBe("320ms");
    expect(formatTrafficMilliseconds(1500)).toBe("1.5s");
  });

  it("maps every supported traffic range to an explicit i18n key and guards invalid timestamps", () => {
    for (const range of TRAFFIC_RANGE_DAYS) {
      expect(TRAFFIC_RANGE_LABEL_KEYS[range]).toBe(`admin.traffic.range${range}`);
    }
    expect(formatTrafficDateTime("not-a-date", "ko-KR")).toBe("—");
  });
});
