import { describe, expect, it } from "vitest";

import { EXTRA_POSE_PRESETS, NATURAL_IDLE_POSES } from "../studio-pose-presets";

import {
  CUT_POSE_SCORE_CONFIG,
  poseCandidatesFromPresets,
  suggestCutPoses,
  type CutPoseCandidate,
  type CutPoseSuggestionInput,
} from "./webtoon-cut-pose-suggestion";
import {
  CUT_CAMERA_ANGLE_LABELS,
  CUT_CAMERA_ANGLE_ORDER,
  CUT_EMOTION_LABELS,
  CUT_EMOTION_ORDER,
  CUT_SHOT_SCALE_ORDER,
} from "./webtoon-cut-vocabulary";

const CATALOG: readonly CutPoseCandidate[] = poseCandidatesFromPresets(
  NATURAL_IDLE_POSES,
  EXTRA_POSE_PRESETS,
);

function idsOf(input: CutPoseSuggestionInput, limit?: number): string[] {
  return suggestCutPoses(input, CATALOG, { limit }).map((suggestion) => suggestion.presetId);
}

describe("CUT_POSE_SCORE_CONFIG", () => {
  it("keeps the score weights summing to 1 and every fit within 0..1", () => {
    const { weights, emotionRankFit, shotFit, angleFit, unknown } = CUT_POSE_SCORE_CONFIG;
    expect(weights.emotion + weights.shot + weights.angle).toBeCloseTo(1, 10);
    for (const value of [
      ...emotionRankFit,
      ...Object.values(shotFit.upper),
      ...Object.values(shotFit.full),
      ...Object.values(angleFit),
      ...Object.values(unknown),
    ]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(emotionRankFit[0]).toBeGreaterThan(emotionRankFit[1]);
    expect(emotionRankFit[1]).toBeGreaterThan(emotionRankFit[2]);
  });

  it("makes upper-body poses read in close shots and full-body poses read in wide shots", () => {
    const { shotFit } = CUT_POSE_SCORE_CONFIG;
    expect(shotFit.upper["close-up"]).toBeGreaterThan(shotFit.full["close-up"]);
    expect(shotFit.full["long-shot"]).toBeGreaterThan(shotFit.upper["long-shot"]);
  });
});

describe("suggestCutPoses — ranking", () => {
  it("recommends a fighting pose for a rage full-shot from a low angle, with exact scores", () => {
    const result = suggestCutPoses(
      { emotion: "rage", shotScale: "full-shot", cameraAngle: "low-angle" },
      CATALOG,
    );
    // 가드·킥은 감정 1순위 + 전신 포즈 + 로우 앵글 특성이라 만점이다. 동률은 id 순.
    expect(result.map((suggestion) => [suggestion.presetId, suggestion.score])).toEqual([
      ["xp_guard_up", 100],
      ["xp_kick", 100],
      ["xp_point_you", 93],
    ]);
    expect(result.map((suggestion) => suggestion.rank)).toEqual([1, 2, 3]);
  });

  it("prefers close-up friendly upper-body poses for a sorrow close-up, ahead of full-body ones", () => {
    const ids = idsOf({ emotion: "sorrow", shotScale: "close-up", cameraAngle: "high-angle" });
    // 눈물·울기는 상체로 읽히고 하이 앵글 특성이 있다(만점). 앉아 있는 전신 포즈는 클로즈업에서 밀린다.
    expect(ids.slice(0, 2)).toEqual(["xp_cry", "xp_teary"]);
    expect(ids).not.toContain("xp_sad_sit");
  });

  it("returns calm idle poses first for a calm medium shot at eye level", () => {
    expect(idsOf({ emotion: "calm", shotScale: "medium-shot", cameraAngle: "eye-level" })).toEqual([
      "ni_calm_front",
      "ni_weight_left",
      "ni_weight_right",
    ]);
  });

  it("breaks ties by specialisation before id: a single-emotion pose beats a multi-purpose one", () => {
    const catalog: CutPoseCandidate[] = [
      { id: "xp_shock_hands", label: "A", tone: "a" }, // [shock]
      { id: "xp_guard", label: "B", tone: "b" }, // [shock, rage]
      { id: "xp_look_back", label: "C", tone: "c" }, // [shock, calm]
    ];
    const ids = suggestCutPoses(
      { emotion: "shock", shotScale: "close-up", cameraAngle: "dutch-tilt" },
      catalog,
    ).map((suggestion) => suggestion.presetId);
    expect(ids).toEqual(["xp_shock_hands", "xp_guard", "xp_look_back"]);
  });

  it("scores a shot-mismatched pose below a matched one, all else equal", () => {
    const catalog: CutPoseCandidate[] = [
      { id: "xp_sprint", label: "전력 질주", tone: "x" }, // full
      { id: "xp_punch", label: "펀치", tone: "y" }, // upper
    ];
    const close = suggestCutPoses({ emotion: "determination", shotScale: "extreme-close-up" }, catalog);
    expect(close[0].presetId).toBe("xp_punch");
    const wide = suggestCutPoses({ emotion: "determination", shotScale: "long-shot" }, catalog);
    expect(wide[0].presetId).toBe("xp_sprint");
  });

  it("leaves out poses whose emotion row does not contain the cut's emotion", () => {
    const ids = idsOf({ emotion: "rage", shotScale: "full-shot", cameraAngle: "low-angle" }, 10);
    expect(ids).not.toContain("xp_finger_heart");
    expect(ids).not.toContain("xp_dance");
    expect(ids).toContain("xp_sword_ready");
  });
});

describe("suggestCutPoses — reasons", () => {
  const rage = suggestCutPoses(
    { emotion: "rage", shotScale: "full-shot", cameraAngle: "low-angle" },
    CATALOG,
  );

  it("explains every recommendation in Korean and English, naming the cut's own vocabulary", () => {
    const [first] = rage;
    expect(first.reasons.map((reason) => reason.code)).toEqual([
      "emotion-primary",
      "shot-readable",
      "angle-match",
    ]);
    expect(first.reasons.every((reason) => reason.tone === "match")).toBe(true);
    expect(first.reasons[0].text.ko).toContain(CUT_EMOTION_LABELS.rage.ko);
    expect(first.reasons[0].text.en).toContain(CUT_EMOTION_LABELS.rage.en);
    expect(first.reasons[2].text.ko).toContain(CUT_CAMERA_ANGLE_LABELS["low-angle"].ko);
    for (const suggestion of rage) {
      for (const reason of suggestion.reasons) {
        expect(reason.text.ko.trim()).not.toBe("");
        expect(reason.text.en.trim()).not.toBe("");
      }
    }
  });

  it("warns instead of recommending blindly when a full-body pose is cropped by a close shot", () => {
    const [kick] = suggestCutPoses(
      { emotion: "rage", shotScale: "extreme-close-up", cameraAngle: "low-angle" },
      [{ id: "xp_kick", label: "킥", tone: "발차기" }],
    );
    const cropped = kick.reasons.find((reason) => reason.code === "shot-cropped");
    expect(cropped?.tone).toBe("caution");
    expect(cropped?.text.ko).toContain("잘릴 수 있어요");
  });

  it("flags a pose that reads better from another angle", () => {
    const [teary] = suggestCutPoses(
      { emotion: "sorrow", shotScale: "close-up", cameraAngle: "low-angle" },
      [{ id: "xp_teary", label: "울먹임", tone: "x" }],
    );
    const mismatch = teary.reasons.find((reason) => reason.code === "angle-mismatch");
    expect(mismatch?.tone).toBe("caution");
    expect(mismatch?.text.ko).toContain(CUT_CAMERA_ANGLE_LABELS["high-angle"].ko);
  });

  it("labels second and third emotion matches as supporting moves, not signature ones", () => {
    const catalog: CutPoseCandidate[] = [
      { id: "xp_hands_on_hips", label: "양손 허리", tone: "x" }, // determination, rage, joy
      { id: "xp_present", label: "소개", tone: "y" }, // joy, calm
    ];
    const rageResult = suggestCutPoses({ emotion: "rage" }, catalog);
    expect(rageResult[0].reasons[0].code).toBe("emotion-secondary");
    const joyResult = suggestCutPoses({ emotion: "joy" }, catalog);
    const hips = joyResult.find((entry) => entry.presetId === "xp_hands_on_hips");
    expect(hips?.reasons[0].code).toBe("emotion-alternative");
  });

  it("uses no angle reason at eye level, and no shot or angle reason when they are unknown", () => {
    for (const suggestion of suggestCutPoses(
      { emotion: "rage", shotScale: "full-shot", cameraAngle: "eye-level" },
      CATALOG,
    )) {
      expect(suggestion.reasons.some((reason) => reason.code.startsWith("angle"))).toBe(false);
    }
    for (const suggestion of suggestCutPoses({ emotion: "rage" }, CATALOG)) {
      expect(suggestion.reasons.map((reason) => reason.code)).toEqual([
        suggestion.reasons[0].code,
      ]);
      expect(suggestion.fit.shot).toBeNull();
      expect(suggestion.fit.angle).toBeNull();
    }
  });
});

describe("suggestCutPoses — boundaries and determinism", () => {
  it("returns exactly three suggestions for every emotion × shot × angle with the real catalog", () => {
    for (const emotion of CUT_EMOTION_ORDER) {
      for (const shotScale of CUT_SHOT_SCALE_ORDER) {
        for (const cameraAngle of CUT_CAMERA_ANGLE_ORDER) {
          const result = suggestCutPoses({ emotion, shotScale, cameraAngle }, CATALOG);
          expect(result, `${emotion}/${shotScale}/${cameraAngle}`).toHaveLength(3);
          for (let index = 0; index < result.length; index += 1) {
            const { score, rank } = result[index];
            expect(Number.isInteger(score)).toBe(true);
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThanOrEqual(100);
            expect(rank).toBe(index + 1);
            if (index > 0) expect(score).toBeLessThanOrEqual(result[index - 1].score);
          }
        }
      }
    }
  });

  it("is deterministic and independent of the catalog's order", () => {
    const input: CutPoseSuggestionInput = {
      emotion: "joy",
      shotScale: "medium-shot",
      cameraAngle: "low-angle",
    };
    const forward = suggestCutPoses(input, CATALOG, { limit: 10 });
    expect(suggestCutPoses(input, CATALOG, { limit: 10 })).toEqual(forward);
    expect(suggestCutPoses(input, [...CATALOG].reverse(), { limit: 10 })).toEqual(forward);
  });

  it("clamps the limit to 1..10 and falls back to 3 for non-finite values", () => {
    const input: CutPoseSuggestionInput = { emotion: "calm", shotScale: "medium-shot" };
    expect(suggestCutPoses(input, CATALOG, { limit: 0 })).toHaveLength(1);
    expect(suggestCutPoses(input, CATALOG, { limit: -4 })).toHaveLength(1);
    expect(suggestCutPoses(input, CATALOG, { limit: 2.9 })).toHaveLength(2);
    expect(suggestCutPoses(input, CATALOG, { limit: 99 })).toHaveLength(CUT_POSE_SCORE_CONFIG.maxLimit);
    expect(suggestCutPoses(input, CATALOG, { limit: Number.NaN })).toHaveLength(3);
    expect(suggestCutPoses(input, CATALOG)).toHaveLength(3);
  });

  it("returns an empty list for an unknown emotion, an empty catalog, or a catalog it cannot rank", () => {
    expect(
      suggestCutPoses({ emotion: "furious" as unknown as CutPoseSuggestionInput["emotion"] }, CATALOG),
    ).toEqual([]);
    expect(suggestCutPoses({ emotion: "rage" }, [])).toEqual([]);
    expect(
      suggestCutPoses({ emotion: "rage" }, [{ id: "custom_pose", label: "x", tone: "y" }]),
    ).toEqual([]);
  });

  it("returns fewer than the limit instead of padding with off-emotion poses", () => {
    const result = suggestCutPoses(
      { emotion: "rage", shotScale: "full-shot" },
      [
        { id: "xp_kick", label: "킥", tone: "발차기" },
        { id: "xp_dance", label: "댄스", tone: "춤" },
      ],
    );
    expect(result.map((suggestion) => suggestion.presetId)).toEqual(["xp_kick"]);
  });

  it("counts a duplicated catalog id once", () => {
    const kick: CutPoseCandidate = { id: "xp_kick", label: "킥", tone: "발차기" };
    expect(suggestCutPoses({ emotion: "rage" }, [kick, kick, kick])).toHaveLength(1);
  });

  it("treats an unknown shot or angle as the same neutral value for every pose", () => {
    const withUnknowns = suggestCutPoses({ emotion: "rage" }, CATALOG, { limit: 10 });
    const sameRankScores = new Map<number, Set<number>>();
    const traitsById = new Map(withUnknowns.map((entry, index) => [entry.presetId, index]));
    expect(traitsById.size).toBe(withUnknowns.length);
    for (const entry of withUnknowns) {
      const rankKey = entry.fit.emotion;
      const scores = sameRankScores.get(rankKey) ?? new Set<number>();
      scores.add(entry.score);
      sameRankScores.set(rankKey, scores);
    }
    for (const scores of sameRankScores.values()) expect(scores.size).toBe(1);
  });

  it("never mutates the catalog it is given", () => {
    const snapshot = JSON.stringify(CATALOG);
    suggestCutPoses({ emotion: "shock", shotScale: "close-up", cameraAngle: "dutch-tilt" }, CATALOG);
    expect(JSON.stringify(CATALOG)).toBe(snapshot);
  });
});

describe("poseCandidatesFromPresets", () => {
  it("keeps only id, label and tone, so bone data never reaches the suggestion layer", () => {
    const [candidate] = poseCandidatesFromPresets([
      { id: "xp_kick", label: "킥", tone: "발차기", bones: { hips: {} } } as CutPoseCandidate,
    ]);
    expect(Object.keys(candidate).sort()).toEqual(["id", "label", "tone"]);
  });

  it("concatenates lists in order and covers every shipped pose preset", () => {
    expect(CATALOG).toHaveLength(NATURAL_IDLE_POSES.length + EXTRA_POSE_PRESETS.length);
    expect(CATALOG[0].id).toBe(NATURAL_IDLE_POSES[0].id);
    expect(CATALOG.at(-1)?.id).toBe(EXTRA_POSE_PRESETS.at(-1)?.id);
  });
});
