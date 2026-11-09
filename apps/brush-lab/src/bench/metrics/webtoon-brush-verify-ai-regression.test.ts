import { describe, expect, it } from "vitest";

import { evaluateLazySimplexAndFlatnessBezier } from "../../engine/brush-engine/competitor-quality-kernels";
import { InvalidStateError } from "../../engine/core/errors";
import { resolveStrokeColor } from "../../lanes/lane";

import {
  evaluateWebtoonBrushVerifyAiGate,
  expandWebtoonBrushFreshLensDraft,
  getWebtoonBrushGenreRecommendation,
} from "./webtoon-brush-verify-ai-remix";

import type { WebtoonBrushGenreId } from "./webtoon-brush-verify-ai-remix";

describe("webtoon-brush-verify-ai-regression (입력 경계·실패 상태·5-Lens Mode A/B 회귀 검증)", () => {
  it("resolveStrokeColor: 유한한 0..1 RGBA 4원소만 통과시키고 범위 밖·NaN·길이 불일치는 InvalidStateError로 거부한다", () => {
    expect(resolveStrokeColor()).toBeUndefined();
    expect(resolveStrokeColor({})).toBeUndefined();
    expect(resolveStrokeColor({ color: [0, 0.5, 1, 0] })).toEqual([0, 0.5, 1, 0]);

    const invalidColors: readonly unknown[] = [
      [-0.001, 0.5, 0.5, 1],
      [0.2, 1.001, 0.5, 1],
      [Number.NaN, 0.5, 0.5, 1],
      [0.2, 0.5, Number.POSITIVE_INFINITY, 1],
      [0.2, 0.5, 0.5],
    ];
    for (const color of invalidColors) {
      expect(() =>
        resolveStrokeColor({ color: color as readonly [number, number, number, number] }),
      ).toThrow(InvalidStateError);
    }
  });

  it("evaluateLazySimplexAndFlatnessBezier: 데드존 반경 내부(distance - radius <= 0.04)에서는 브러시 좌표를 이동시키지 않는다", () => {
    const inside = evaluateLazySimplexAndFlatnessBezier({
      brushPoint: { x: 10, y: 10 },
      pointerPoint: { x: 30.04, y: 10 },
      lazyRadiusPx: 20,
      friction01: 0.35,
      sampleCoord: { x: 1.0, y: 1.0 },
      curveControlPoints: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 30, y: 0 },
      ],
      flatnessTolerance: 0.5,
    });

    expect(inside.hasMovedOutsideDeadZone).toBe(false);
    expect(inside.updatedBrushPoint).toEqual({ x: 10, y: 10 });
    expect(inside.subdividedCurvePoints).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
    ]);
  });

  it("evaluateWebtoonBrushVerifyAiGate: 비음수 저품질 벤치마크·드리프트 과다 및 NaN 입력에서 HOLD(passed: false)로 전환된다", () => {
    const fallback = getWebtoonBrushGenreRecommendation("unknown-genre" as WebtoonBrushGenreId);
    expect(fallback.genreId).toBe("action-gpen-slash");

    const degradedNonNegative = evaluateWebtoonBrushVerifyAiGate({
      genreId: "romance-watercolor-glow",
      compositeBenchScore100: 55.0,
      chromaPreservationGain01: 0,
      mudEliminationGain01: 0,
      eightHourFrameDriftPct: 20.0,
    });
    expect(degradedNonNegative.pressureVelocityLinearity100).toBe(56.2);
    expect(degradedNonNegative.marathonSoakStability100).toBe(70);
    expect(degradedNonNegative.overallScore100).toBeLessThan(90);
    expect(degradedNonNegative.passed).toBe(false);
    expect(degradedNonNegative.summaryBadgeKo).toContain("Brush Verify AI HOLD");

    const nanInput = evaluateWebtoonBrushVerifyAiGate({
      genreId: "noir-heavy-halftone",
      compositeBenchScore100: Number.NaN,
      chromaPreservationGain01: Number.NaN,
      mudEliminationGain01: -10,
      eightHourFrameDriftPct: Number.NaN,
    });
    expect(nanInput.pressureVelocityLinearity100).toBe(1.2);
    expect(nanInput.wetPigmentChromaRetention100).toBe(0);
    expect(nanInput.marathonSoakStability100).toBe(0);
    expect(nanInput.passed).toBe(false);
    expect(nanInput.remixes[0]?.angleKo).not.toContain("NaN");
  });

  it("5-Lens Mode A(remixHeaderKo·3-Beat 스토리·4단계 Playbook) 및 Mode B(expandWebtoonBrushFreshLensDraft)를 검증한다", () => {
    const report = evaluateWebtoonBrushVerifyAiGate({
      genreId: "fantasy-arcane-fx",
      compositeBenchScore100: 96.4,
      chromaPreservationGain01: 0.34,
      mudEliminationGain01: 0.41,
      eightHourFrameDriftPct: 1.2,
    });

    expect(report.remixHeaderKo).toContain("💡 Remix: Brush Labs");
    expect(report.remixHeaderKo).toContain("Sources used:");
    const storyLens = report.remixes.find((r) => r.id === "personal-story-angle");
    expect(storyLens?.angleKo).toContain("(1) Setup:");
    expect(storyLens?.angleKo).toContain("(2) Friction:");
    expect(storyLens?.angleKo).toContain("(3) Lesson:");

    const playbookLens = report.remixes.find((r) => r.id === "practical-playbook");
    expect(playbookLens?.actionableStepsKo).toHaveLength(4);

    for (const remix of report.remixes) {
      const draft = expandWebtoonBrushFreshLensDraft(report, remix.id);
      expect(draft.id).toBe(remix.id);
      expect(draft.headlineKo).toBe(remix.titleKo);
      expect(draft.bodyParagraphsKo.length).toBeGreaterThanOrEqual(3);
      expect(draft.keyTakeawayKo).toContain("Brush Verify AI");
    }
  });
});
