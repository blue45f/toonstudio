import { describe, expect, it } from "vitest";

import { GOLDEN_STORIES, type GoldenStory } from "./studio-story-plausibility-golden-fixtures";
import { buildPlausibilityReport } from "./studio-story-plausibility-report";

const NOW = "2026-10-15T00:00:00.000Z";

function run(story: GoldenStory) {
  return buildPlausibilityReport({
    project: story.project,
    generatedAtIso: NOW,
    ...(story.extras ? { extras: story.extras } : {}),
  });
}

const key = (module: string, code: string) => `${module}:${code}`;

describe("개연성 골든 세트: 합성 이야기", () => {
  const defects = GOLDEN_STORIES.filter((story) => story.kind === "defect");
  const cleans = GOLDEN_STORIES.filter((story) => story.kind === "clean");

  it("결함 이야기 12개 이상, 깨끗한 이야기 3개 이상으로 구성된다", () => {
    expect(GOLDEN_STORIES.length).toBeGreaterThanOrEqual(12);
    expect(defects.length).toBeGreaterThanOrEqual(12);
    expect(cleans.length).toBeGreaterThanOrEqual(3);
    expect(new Set(GOLDEN_STORIES.map((story) => story.id)).size).toBe(GOLDEN_STORIES.length);
  });

  it.each(defects.map((story) => [story.id, story] as const))("결함 이야기 %s: 심은 결함을 찾고 다른 발견은 만들지 않는다", (_id, story) => {
    const report = run(story);
    const actual = report.findings.map((finding) => key(finding.source.module, finding.source.code)).sort();
    const expected = story.expected.map((item) => key(item.module, item.code)).sort();
    expect(actual).toEqual(expected);
    for (const item of story.expected) {
      const found = report.findings.find((finding) => finding.source.module === item.module && finding.source.code === item.code);
      expect(found?.category).toBe(item.category);
      expect(found?.severity).toBe(item.severity);
    }
  });

  it.each(cleans.map((story) => [story.id, story] as const))("깨끗한 이야기 %s: 오탐 0", (_id, story) => {
    const report = run(story);
    expect(report.findings.map((finding) => key(finding.source.module, finding.source.code))).toEqual([]);
    expect(report.summary.counts.total).toBe(0);
    expect(report.summary.score.value).toBe(100);
  });

  it("재현율 100%, 정밀도 100%, 깨끗한 이야기의 오탐 0을 한 번에 고정한다", () => {
    let seeded = 0;
    let detected = 0;
    let reported = 0;
    for (const story of defects) {
      const report = run(story);
      seeded += story.expected.length;
      reported += report.findings.length;
      detected += story.expected.filter((item) => report.findings.some((finding) => finding.source.module === item.module && finding.source.code === item.code)).length;
    }
    const falsePositivesOnClean = cleans.reduce((sum, story) => sum + run(story).findings.length, 0);
    expect({ seeded, detected, reported, falsePositivesOnClean }).toEqual({
      seeded: defects.length,
      detected: defects.length,
      reported: defects.length,
      falsePositivesOnClean: 0,
    });
  });

  it("모든 발견이 형식 약속을 지킨다: 오류는 확정, id 유일, 근거 상한, 처리 열쇠", () => {
    for (const story of defects) {
      const report = run(story);
      const ids = new Set<string>();
      for (const finding of report.findings) {
        if (finding.severity === "error") expect(finding.confidence).toBe("certain");
        expect(ids.has(finding.id)).toBe(false);
        ids.add(finding.id);
        expect(finding.id.startsWith("pl:")).toBe(true);
        expect(finding.dispositionKey.length).toBeGreaterThan(0);
        expect(finding.title.length).toBeGreaterThan(0);
        expect(finding.question.length).toBeGreaterThan(0);
        expect(finding.evidence.length).toBeLessThanOrEqual(8);
        expect(`${finding.title}${finding.message}${finding.question}`).not.toMatch(/undefined|\[object|NaN/u);
      }
    }
  });

  it("같은 입력은 항상 같은 리포트를 낸다(발견 id·순서·점수)", () => {
    for (const story of GOLDEN_STORIES) {
      expect(run(story)).toEqual(run(story));
    }
  });

  it("의미 필드가 비어 있는 초안은 판정하지 않고 점검 가능 범위가 낮다", () => {
    const sparse = GOLDEN_STORIES.find((story) => story.id === "c-sparse");
    expect(sparse).toBeDefined();
    const report = sparse ? run(sparse) : null;
    expect(report?.summary.coverage.percent).toBeLessThan(25);
    expect(report?.summary.trust).toBe("low");
  });
});
