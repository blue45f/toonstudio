import { describe, expect, it } from "vitest";

import { ANCHOR_ANGLE_IDS, type AnchorAngleId } from "./anchor-capture-spec";
import { anchorScoreBand } from "./anchor-consistency-compare";
import {
  comparisonForAnchor,
  displayedAnchorScore,
  scoreCandidateAgainstAnchors,
  sortAnchorCandidates,
  type AnchorCandidateScore,
  type AnchorReferenceFeatures,
  type RankableAnchorCandidate,
} from "./anchor-consistency-score";
import { extractAnchorFeatures, type AnchorImageFeatures } from "./anchor-image-features";
import { FIGURE_STYLE_A, FIGURE_STYLE_B, figureRaster, noiseRaster, type FigureImageOptions } from "./anchor-synthetic-raster";

// 합성 그림으로 점수·정렬 규칙을 확인한다. 실제 작품의 일관성을 재는 시험이 아니다.

function featuresOf(options: FigureImageOptions = {}): AnchorImageFeatures {
  return extractAnchorFeatures(figureRaster(options));
}

function anchorAt(angleId: AnchorAngleId, features: AnchorImageFeatures): AnchorReferenceFeatures {
  return { angleId, features };
}

const FRONT = featuresOf();
const SIDE = featuresOf({ pose: "side" });
const OTHER_PALETTE = featuresOf({ style: FIGURE_STYLE_B });

function scoreOf(anchors: readonly AnchorReferenceFeatures[], candidate: AnchorImageFeatures): AnchorCandidateScore {
  const score = scoreCandidateAgainstAnchors(anchors, candidate);
  if (!score) throw new Error("점수가 있어야 해요");
  return score;
}

describe("후보 한 장의 앵커 세트 점수", () => {
  it("앵커가 하나도 없으면 점수를 만들지 않는다", () => {
    expect(scoreCandidateAgainstAnchors([], FRONT)).toBeNull();
  });

  it("가장 비슷한 앵커 각도를 고르고 그 비교 점수를 낸다", () => {
    const anchors = [anchorAt("front", FRONT), anchorAt("left", SIDE), anchorAt("back", OTHER_PALETTE)];
    const sideCandidate = featuresOf({ pose: "side", dx: 0.03 });
    const score = scoreOf(anchors, sideCandidate);
    expect(score.bestAngleId).toBe("left");
    expect(score.score).toBe(comparisonForAnchor(score, "left")?.score);
    expect(score.band).toBe(anchorScoreBand(score.score));
    const frontCandidate = scoreOf(anchors, featuresOf({ dx: 0.03 }));
    expect(frontCandidate.bestAngleId).toBe("front");
  });

  it("각도별 비교 결과는 입력 순서와 상관없이 정본 각도 순서로 모두 남긴다", () => {
    const anchors = [anchorAt("right", SIDE), anchorAt("back", OTHER_PALETTE), anchorAt("front", FRONT)];
    const score = scoreOf(anchors, FRONT);
    expect(score.perAnchor.map((entry) => entry.angleId)).toEqual(["front", "back", "right"]);
  });

  it("점수가 같으면 정본 순서가 앞선 각도를 고른다", () => {
    const score = scoreOf([anchorAt("back", FRONT), anchorAt("front", FRONT)], FRONT);
    expect(score.bestAngleId).toBe("front");
  });

  it("같은 각도가 둘이면 먼저 나온 것만 쓴다", () => {
    const score = scoreOf([anchorAt("front", FRONT), anchorAt("front", OTHER_PALETTE)], FRONT);
    expect(score.perAnchor).toHaveLength(1);
    expect(score.score).toBeCloseTo(1, 10);
  });

  it("고른 앵커 각도의 비교 결과를 돌려주고, 없는 각도는 null 이다", () => {
    const score = scoreOf([anchorAt("front", FRONT)], FRONT);
    expect(comparisonForAnchor(score, "front")?.score).toBeCloseTo(1, 10);
    expect(comparisonForAnchor(score, "back")).toBeNull();
  });

  it("제약이 없으면 reliability 는 ok, 제약이 있으면 limited 와 사정을 함께 낸다", () => {
    expect(scoreOf([anchorAt("front", FRONT)], FRONT).reliability).toBe("ok");
    const limited = scoreOf([anchorAt("front", FRONT)], extractAnchorFeatures(noiseRaster(96, 96, 8)));
    expect(limited.reliability).toBe("limited");
    expect(limited.limits).toContain("candidate-not-separated");
  });

  it("결과는 얼려 있다", () => {
    const score = scoreOf([anchorAt("front", FRONT)], FRONT);
    expect(Object.isFrozen(score)).toBe(true);
    expect(Object.isFrozen(score.perAnchor)).toBe(true);
  });
});

describe("후보 정렬", () => {
  const anchors = [anchorAt("front", FRONT), anchorAt("left", SIDE)];
  const candidates: Array<RankableAnchorCandidate & { readonly label: string }> = [
    { id: "c1", name: "컷 10", order: 0, label: "palette", score: scoreOf(anchors, OTHER_PALETTE) },
    { id: "c2", name: "컷 2", order: 1, label: "same", score: scoreOf(anchors, featuresOf({ dx: 0.02 })) },
    { id: "c3", name: "컷 1", order: 2, label: "pending", score: null },
    { id: "c4", name: "컷 3", order: 3, label: "side", score: scoreOf(anchors, featuresOf({ pose: "side" })) },
    { id: "c5", name: "컷 4", order: 4, label: "failed", score: null },
  ];

  it("점수 높은 순: 점수가 없는 후보는 들어온 순서대로 맨 뒤에 둔다", () => {
    const ids = sortAnchorCandidates(candidates, "score-desc").map((candidate) => candidate.id);
    expect(ids.slice(-2)).toEqual(["c3", "c5"]);
    const scored = ids.slice(0, 3);
    expect(scored[scored.length - 1]).toBe("c1");
    expect(new Set(scored)).toEqual(new Set(["c1", "c2", "c4"]));
  });

  it("점수 낮은 순: 점수가 없는 후보는 여전히 맨 뒤다", () => {
    const ids = sortAnchorCandidates(candidates, "score-asc").map((candidate) => candidate.id);
    expect(ids[0]).toBe("c1");
    expect(ids.slice(-2)).toEqual(["c3", "c5"]);
  });

  it("이름순은 숫자를 값으로 비교한다(컷 2 가 컷 10 보다 앞)", () => {
    expect(sortAnchorCandidates(candidates, "name").map((candidate) => candidate.name)).toEqual(["컷 1", "컷 2", "컷 3", "컷 4", "컷 10"]);
  });

  it("들어온 순서로 되돌릴 수 있다", () => {
    const shuffled = sortAnchorCandidates(candidates, "score-desc");
    expect(sortAnchorCandidates(shuffled, "input-order").map((candidate) => candidate.id)).toEqual(["c1", "c2", "c3", "c4", "c5"]);
  });

  it("특징별 정렬은 그 특징의 유사도가 높은 순이다", () => {
    const ids = sortAnchorCandidates(candidates, "color").map((candidate) => candidate.id);
    const colorOf = (id: string): number => {
      const score = candidates.find((candidate) => candidate.id === id)?.score;
      return score ? (comparisonForAnchor(score, score.bestAngleId)?.similarities.color ?? -1) : -1;
    };
    const scoredIds = ids.filter((id) => candidates.find((candidate) => candidate.id === id)?.score);
    for (let index = 1; index < scoredIds.length; index += 1) {
      expect(colorOf(scoredIds[index - 1] ?? "")).toBeGreaterThanOrEqual(colorOf(scoredIds[index] ?? ""));
    }
    expect(ids.slice(-2)).toEqual(["c3", "c5"]);
  });

  it("앵커 각도를 고르면 그 앵커와의 비교 점수로 정렬한다", () => {
    const byFront = sortAnchorCandidates(candidates, "score-desc", "front").map((candidate) => candidate.id);
    const bySide = sortAnchorCandidates(candidates, "score-desc", "left").map((candidate) => candidate.id);
    const frontScore = (id: string): number => {
      const score = candidates.find((candidate) => candidate.id === id)?.score;
      return score ? (comparisonForAnchor(score, "front")?.score ?? -1) : -1;
    };
    expect(frontScore(byFront[0] ?? "")).toBeGreaterThanOrEqual(frontScore(byFront[1] ?? ""));
    expect(bySide[0]).not.toBe(byFront[0]);
  });

  it("점수가 같으면 들어온 순서를 지키고, 입력 배열은 바꾸지 않는다", () => {
    const sameScore = scoreOf(anchors, FRONT);
    const ties: RankableAnchorCandidate[] = [
      { id: "t2", name: "b", order: 1, score: sameScore },
      { id: "t1", name: "a", order: 0, score: sameScore },
      { id: "t3", name: "c", order: 2, score: sameScore },
    ];
    const snapshot = ties.map((candidate) => candidate.id);
    expect(sortAnchorCandidates(ties, "score-desc").map((candidate) => candidate.id)).toEqual(["t1", "t2", "t3"]);
    expect(ties.map((candidate) => candidate.id)).toEqual(snapshot);
  });
});

describe("화면에 보여 줄 점수와 정렬 키", () => {
  // 앵커 여섯 장은 스타일 A 를 넓은 포즈와 선 포즈로 번갈아 놓는다. 넓은 후보는 윗옷 색만 조금 다르고, 선 후보는 같은 스타일이다.
  const sixAnchors = ANCHOR_ANGLE_IDS.map((angleId, index) =>
    anchorAt(angleId, featuresOf({ style: FIGURE_STYLE_A, pose: (index + 1) % 2 === 0 ? "stand" : "wide" })),
  );
  const wideShifted = scoreOf(sixAnchors, featuresOf({ style: { ...FIGURE_STYLE_A, top: [196, 44, 54] }, pose: "wide" }));
  const standing = scoreOf(sixAnchors, featuresOf({ style: FIGURE_STYLE_A, pose: "stand" }));
  const candidates: RankableAnchorCandidate[] = [
    { id: "wide", name: "wide", order: 0, score: wideShifted },
    { id: "stand", name: "stand", order: 1, score: standing },
  ];
  const idsBy = (mode: "score-desc" | "score-asc", angleId: AnchorAngleId | null): string[] =>
    sortAnchorCandidates(candidates, mode, angleId).map((candidate) => candidate.id);

  it("각도를 비우면 가장 비슷한 앵커, 고르면 그 앵커, 세트에 없는 각도면 다시 가장 비슷한 앵커를 돌려준다", () => {
    expect(displayedAnchorScore(standing, null)).toBe(standing.best);
    expect(displayedAnchorScore(standing, null).angleId).toBe(standing.bestAngleId);
    const front = displayedAnchorScore(standing, "front");
    expect(front.angleId).toBe("front");
    expect(front.comparison).toBe(comparisonForAnchor(standing, "front"));
    const partial = scoreOf([anchorAt("front", FRONT), anchorAt("left", SIDE)], FRONT);
    expect(displayedAnchorScore(partial, "back")).toBe(partial.best);
  });

  it("시험 장면: 자동이면 선 후보가 위지만 정면을 고르면 순서가 뒤집힌다(견줄 앵커에 따라 순위가 달라진다)", () => {
    expect(idsBy("score-desc", null)).toEqual(["stand", "wide"]);
    expect(idsBy("score-desc", "front")).toEqual(["wide", "stand"]);
    expect(displayedAnchorScore(standing, "front").comparison.score).toBeLessThan(standing.score);
  });

  it("정렬 키는 화면이 보여 줄 점수와 같다 — 어떤 앵커를 골라도 보여 주는 점수가 정렬 방향대로 단조롭다", () => {
    for (const angleId of [null, ...ANCHOR_ANGLE_IDS]) {
      const shown = (id: string): number => {
        const score = candidates.find((candidate) => candidate.id === id)?.score;
        return score ? displayedAnchorScore(score, angleId).comparison.score : Number.NaN;
      };
      const desc = idsBy("score-desc", angleId).map(shown);
      const asc = idsBy("score-asc", angleId).map(shown);
      for (let index = 1; index < desc.length; index += 1) {
        expect(desc[index - 1] ?? Number.NaN).toBeGreaterThanOrEqual(desc[index] ?? Number.NaN);
        expect(asc[index - 1] ?? Number.NaN).toBeLessThanOrEqual(asc[index] ?? Number.NaN);
      }
    }
  });
});
