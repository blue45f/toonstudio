import { describe, expect, it } from "vitest";

import {
  EN_FLOW_BASELINE_2026_10_14,
  EN_FLOW_ROUTE_GROUPS,
  assignEnFlowGroup,
  evaluateEnFlowGroup,
  findEnFlowRegressions,
  summarizeEnFlow,
  verdictForCounts,
} from "../i18n-route-completeness";

describe("en-flow route registry", () => {
  it("has unique group ids and disjoint ownership intent (longest prefix wins)", () => {
    const ids = EN_FLOW_ROUTE_GROUPS.map((group) => group.id);
    expect(new Set(ids).size).toBe(ids.length);
    // production 접두사는 creator 접두사보다 길어 제작 허브 파일이 중복 계산되지 않는다.
    expect(
      assignEnFlowGroup("apps/web/src/domains/creator/production-hub/Hub.tsx"),
    ).toBe("production");
    expect(assignEnFlowGroup("apps/web/src/domains/creator/StudioEditor.tsx")).toBe(
      "creator-studio",
    );
    expect(assignEnFlowGroup("apps/web/src/shared/lib/i18n-core.ts")).toBe("global-shell");
    expect(assignEnFlowGroup("apps/web/src/domains/market/MarketPage.tsx")).toBe("market");
    expect(assignEnFlowGroup("apps/web/src/unknown/file.ts")).toBeNull();
  });

  it("baseline covers every group and sums to the 2026-10-14 full scan total", () => {
    for (const group of EN_FLOW_ROUTE_GROUPS) {
      expect(EN_FLOW_BASELINE_2026_10_14[group.id], group.id).toBeDefined();
    }
    const summary = summarizeEnFlow(EN_FLOW_BASELINE_2026_10_14);
    // 전수 스캔 총계 86,792건 / 로딩+에러 11,479건과 정확히 일치해야 한다.
    expect(summary.totalBreaks).toBe(86792);
    expect(summary.totalCritical).toBe(11479);
  });
});

describe("en-flow verdict (measurable)", () => {
  it("fixes the three verdicts by counts only", () => {
    expect(verdictForCounts({ loading: 0, error: 0, other: 0, filesWithBreaks: 0 })).toBe(
      "complete",
    );
    expect(verdictForCounts({ loading: 0, error: 0, other: 54, filesWithBreaks: 7 })).toBe(
      "critical-clear",
    );
    expect(verdictForCounts({ loading: 0, error: 1, other: 0, filesWithBreaks: 1 })).toBe(
      "broken",
    );
    expect(verdictForCounts({ loading: 1, error: 0, other: 0, filesWithBreaks: 1 })).toBe(
      "broken",
    );
  });

  it("baseline verdict: only cuts is critical-clear, core flow is not complete", () => {
    const summary = summarizeEnFlow(EN_FLOW_BASELINE_2026_10_14);
    const cuts = summary.results.find((result) => result.id === "cuts");
    expect(cuts?.verdict).toBe("critical-clear");
    expect(summary.completeGroups).toBe(0);
    expect(summary.coreFlowComplete).toBe(false);
    expect(summary.allRoutesComplete).toBe(false);
    // 상위 동선부터 소진: P0의 critical 합이 전체의 대부분을 차지함을 고정.
    const p0Critical = summary.results
      .filter((result) => result.tier === "P0")
      .reduce((sum, result) => sum + result.critical, 0);
    expect(p0Critical).toBe(492 + 62 + 9303 + 412);
  });

  it("core gate opens only when every P0 group is critical-clear or better", () => {
    const cleared = Object.fromEntries(
      EN_FLOW_ROUTE_GROUPS.map((group) => [
        group.id,
        { loading: 0, error: 0, other: 3, filesWithBreaks: 1 },
      ]),
    );
    expect(summarizeEnFlow(cleared).coreFlowComplete).toBe(true);
    expect(summarizeEnFlow(cleared).allRoutesComplete).toBe(false);
    const zeroed = Object.fromEntries(
      EN_FLOW_ROUTE_GROUPS.map((group) => [
        group.id,
        { loading: 0, error: 0, other: 0, filesWithBreaks: 0 },
      ]),
    );
    expect(summarizeEnFlow(zeroed).allRoutesComplete).toBe(true);
  });

  it("evaluateEnFlowGroup derives critical/total consistently", () => {
    const group = EN_FLOW_ROUTE_GROUPS.find((candidate) => candidate.id === "catalog")!;
    const result = evaluateEnFlowGroup(group, {
      loading: 23,
      error: 39,
      other: 363,
      filesWithBreaks: 24,
    });
    expect(result.critical).toBe(62);
    expect(result.total).toBe(425);
    expect(result.verdict).toBe("broken");
  });
});

describe("en-flow ratchet", () => {
  it("allows decreases, flags any increase in critical or label breaks", () => {
    expect(findEnFlowRegressions(EN_FLOW_BASELINE_2026_10_14)).toEqual([]);
    const worse = {
      ...EN_FLOW_BASELINE_2026_10_14,
      catalog: { loading: 24, error: 39, other: 363, filesWithBreaks: 24 },
    };
    expect(findEnFlowRegressions(worse)).toEqual(["catalog"]);
    const better = {
      ...EN_FLOW_BASELINE_2026_10_14,
      catalog: { loading: 0, error: 0, other: 0, filesWithBreaks: 0 },
    };
    expect(findEnFlowRegressions(better)).toEqual([]);
  });
});
