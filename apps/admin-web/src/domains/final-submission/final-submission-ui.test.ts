import { afterEach, describe, expect, it, vi } from "vitest";

import { submissionDate } from "./final-submission-ui";

afterEach(() => vi.unstubAllEnvs());

describe("최종 제출 시각의 표시 기준", () => {
  it("실행 환경 TZ와 무관하게 미확인 시간대는 원문으로 보존하고 명시적 시간대만 KST로 변환한다", () => {
    const results: string[][] = [];
    for (const zone of ["UTC", "Pacific/Honolulu", "Asia/Seoul"]) {
      vi.stubEnv("TZ", zone);
      const values = ["2026-11-24", "2026-11-24T13:00:00", "2026-11-24 13:00", "2026-11-24T04:00:00Z", "2026-11-24T13:00:00+09:00"].map(submissionDate);
      expect(values[0]).toBe("2026-11-24");
      expect(values[1]).toBe("2026-11-24T13:00:00 · 시간대 미확인");
      expect(values[2]).toBe("2026-11-24 13:00 · 시간대 미확인");
      expect(values[3]).toBe(values[4]); expect(values[3]).toContain("13:00"); expect(values[3]).toContain("KST");
      results.push(values);
    }
    expect(results[0]).toEqual(results[1]); expect(results[1]).toEqual(results[2]);
  });
});
