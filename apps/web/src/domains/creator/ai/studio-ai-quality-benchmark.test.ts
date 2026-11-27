import { describe, expect, it } from "vitest";

import {
  compareStudioAiQualityEvaluations,
  evaluateStudioAiQualityRun,
  formatStudioAiQualityEvaluationMarkdown,
  type StudioAiQualityRun,
  type StudioAiQualityScores,
} from "./studio-ai-quality-benchmark";

const goodScores: StudioAiQualityScores = {
  characterIdentity: 92,
  styleConsistency: 88,
  anatomyAndFaces: 86,
  compositionReadability: 90,
  letteringAccuracy: 84,
  backgroundContinuity: 87,
  editability: 86,
  workflowEfficiency: 85,
  rightsAndProvenance: 96,
  reliability: 91,
};

function runWith(scores: StudioAiQualityScores): StudioAiQualityRun {
  return {
    schemaVersion: 1,
    runId: "run-1",
    createdAt: "2026-09-05T00:00:00.000Z",
    candidateLabel: "candidate",
    cases: [
      {
        id: "romance-dialogue",
        title: "로맨스 대화 장면",
        completed: true,
        latencyMs: 12_000,
        scores,
      },
      {
        id: "action-continuity",
        title: "액션 연속 컷",
        completed: true,
        latencyMs: 16_000,
        scores,
      },
    ],
  };
}

describe("Studio AI quality benchmark", () => {
  it("passes a balanced production-ready run", () => {
    const evaluation = evaluateStudioAiQualityRun(runWith(goodScores));

    expect(evaluation.passed).toBe(true);
    expect(evaluation.overallScore).toBeGreaterThanOrEqual(82);
    expect(evaluation.p95LatencyMs).toBe(16_000);
    expect(
      formatStudioAiQualityEvaluationMarkdown(runWith(goodScores), evaluation)
    ).toContain("PASS");
  });

  it("blocks identity, provenance and hard failures even when averages look acceptable", () => {
    const base = runWith({
      ...goodScores,
      characterIdentity: 70,
      rightsAndProvenance: 60,
    });
    const weak: StudioAiQualityRun = {
      ...base,
      cases: base.cases.map((qualityCase, index) =>
        index === 0
          ? { ...qualityCase, hardFailures: ["speech bubble text corrupted"] }
          : qualityCase
      ),
    };

    const evaluation = evaluateStudioAiQualityRun(weak);

    expect(evaluation.passed).toBe(false);
    expect(evaluation.findings.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "dimension:characterIdentity",
        "dimension:rightsAndProvenance",
        "hard-failure",
      ])
    );
  });

  it("중복 ID의 뒤쪽 결과가 앞선 실패를 가리거나 종합 판정을 통과하지 못한다", () => {
    const perfect = { ...goodScores };
    for (const key of Object.keys(perfect) as (keyof StudioAiQualityScores)[]) perfect[key] = 100;
    const base = runWith(perfect);
    const [item] = base.cases;
    const failed = { ...item, scores: { ...perfect, characterIdentity: 0, styleConsistency: 0, anatomyAndFaces: 0 } };
    const cases = [failed, item, ...Array.from({ length: 8 }, (_, i) => ({ ...item, id: `case-${i}` }))];
    const evaluation = evaluateStudioAiQualityRun({ ...base, cases });

    expect(evaluation.findings.map((finding) => finding.id)).toEqual(["duplicate-case", "worst-case"]);
    expect(evaluation.passed).toBe(false);
    expect(evaluation.worstCaseScore).toBe(58);
    expect(evaluation.overallScore).toBe(95.8);
  });

  it("reports per-dimension regressions instead of hiding them in the overall average", () => {
    const baseline = evaluateStudioAiQualityRun(runWith(goodScores));
    const candidate = evaluateStudioAiQualityRun(
      runWith({ ...goodScores, editability: 75, styleConsistency: 84 })
    );

    const comparison = compareStudioAiQualityEvaluations(
      baseline,
      candidate,
      2
    );

    expect(comparison.regressions).toContain("editability");
    expect(comparison.regressions).toContain("styleConsistency");
  });
});
