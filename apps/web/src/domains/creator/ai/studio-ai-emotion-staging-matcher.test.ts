import { describe, expect, it } from "vitest";

import {
  analyzeDialogueEmotionDetail,
  recommendStagingForEmotion,
  recommendStagingForText,
  speechEmotionKindFor,
  type DialogueEmotionKind,
} from "./studio-ai-emotion-staging-matcher";

/**
 * 정본 프리셋 id 집합 — main의 studio-pose-presets.ts에서 실측한 값.
 * 추천이 실재하지 않는 id를 내면 이 테스트가 실패한다 (지어낸 id 방지).
 */
const REAL_EXPRESSION_IDS = new Set([
  "xf_joy", "xf_grin", "xf_sad", "xf_tears", "xf_angry", "xf_grudge",
  "xf_surprised", "xf_blank", "xf_shy", "xf_wink", "xf_sleepy", "xf_neutral",
  "xf_determined", "xf_pout", "xf_smirk", "xf_awe", "xf_evil", "xf_cry_laugh",
  "xf_confused", "xf_love", "xf_scream", "xf_cool", "xf_focus", "xf_yawn",
  "xf_sassy", "xf_innocent", "xf_serious", "xf_excited",
]);

const REAL_POSE_IDS = new Set([
  "ni_weight_left", "ni_weight_right", "ni_calm_front", "ni_open_easy",
  "xp_wave_greeting", "xp_idle_relax", "xp_hands_on_hips", "xp_one_hand_hip",
  "xp_sprint", "xp_chair_sit", "xp_kneel", "xp_finger_heart", "xp_double_v",
  "xp_point_you", "xp_shock_hands", "xp_teary", "xp_banzai", "xp_guard_up",
  "xp_shrug", "xp_phone_look", "xp_chin_rest", "xp_polite_bow", "xp_jump_joy",
  "xp_look_back", "xp_lying_down", "xp_hands_behind", "xp_propose_kneel",
  "xp_kick", "xp_punch", "xp_sit_floor", "xp_dance", "xp_run", "xp_crouch",
  "xp_fist_up", "xp_bow_deep", "xp_lean_wall", "xp_hold_heart", "xp_spin",
  "xp_kneel_pray", "xp_jump_pose", "xp_side_lean", "xp_sword_ready",
  "xp_blush_cover", "xp_think_chin", "xp_superhero", "xp_sad_sit", "xp_laugh",
  "xp_meditate", "xp_point_forward", "xp_angel_wing", "xp_cry", "xp_fly_pose",
  "xp_thumbs_up", "xp_shock", "xp_sleep_stand", "xp_victory", "xp_cool_lean",
  "xp_phone_selfie", "xp_typing", "xp_cooking", "xp_reading", "xp_guard",
  "xp_archer", "xp_salutation", "xp_present", "xp_wait_line", "xp_stretch",
  "xp_fall_back", "xp_hug_self", "xp_cheer_both", "xp_sneak", "xp_balance",
]);

const ALL_KINDS: DialogueEmotionKind[] = [
  "joy", "love", "shame", "anger", "sorrow",
  "fear", "surprise", "determination", "confusion", "neutral",
];

describe("추천 무결성 — 실재 프리셋 id만 낸다", () => {
  it("전 감정의 표정·포즈 추천이 정본 id 집합 안에 있다", () => {
    for (const kind of ALL_KINDS) {
      const staging = recommendStagingForEmotion(kind, 0.5);
      expect(staging.expressionIds.length).toBeGreaterThanOrEqual(3);
      expect(staging.poseIds.length).toBeGreaterThanOrEqual(3);
      for (const id of staging.expressionIds) expect(REAL_EXPRESSION_IDS.has(id)).toBe(true);
      for (const id of staging.poseIds) expect(REAL_POSE_IDS.has(id)).toBe(true);
      expect(staging.rationale.length).toBeGreaterThan(0);
    }
  });

  it("전 감정이 말풍선 감정 종류로 브리지된다", () => {
    for (const kind of ALL_KINDS) {
      expect(speechEmotionKindFor(kind)).toBeTruthy();
    }
    expect(speechEmotionKindFor("anger")).toBe("rage-shout");
    expect(speechEmotionKindFor("surprise")).toBe("shock-gasp");
    expect(speechEmotionKindFor("love")).toBe("romance-blush");
  });
});

describe("대사 감정 판정", () => {
  it("대표 대사를 맞게 읽는다", () => {
    expect(analyzeDialogueEmotionDetail("드디어 해냈어! 정말 기뻐!").kind).toBe("joy");
    expect(analyzeDialogueEmotionDetail("너 때문에 다 망쳤어. 화나 죽겠어!").kind).toBe("anger");
    expect(analyzeDialogueEmotionDetail("미안해… 정말 미안해 ㅠㅠ").kind).toBe("sorrow");
    expect(analyzeDialogueEmotionDetail("헐, 진짜야? 말도 안 돼").kind).toBe("surprise");
    expect(analyzeDialogueEmotionDetail("반드시 지켜낼 거야. 포기하지 않아").kind).toBe("determination");
    expect(analyzeDialogueEmotionDetail("보고 싶었어. 너무 소중해").kind).toBe("love");
  });

  it("근거 없는 대사는 neutral + 낮은 신뢰도로 정직하게 판정한다", () => {
    const detail = analyzeDialogueEmotionDetail("내일 회의는 세 시에 시작합니다.");
    expect(detail.kind).toBe("neutral");
    expect(detail.confidence).toBeLessThan(0.5);
    expect(detail.matchedTerms).toHaveLength(0);
  });

  it("결정적이다 — 같은 입력은 같은 결과", () => {
    const text = "부끄러워서 숨고 싶어…";
    expect(analyzeDialogueEmotionDetail(text)).toEqual(analyzeDialogueEmotionDetail(text));
    expect(analyzeDialogueEmotionDetail(text).kind).toBe("shame");
  });
});

describe("강도 연동", () => {
  it("강한 분노에서는 비명 표정이 1순위로 올라온다", () => {
    const staging = recommendStagingForEmotion("anger", 0.9);
    expect(staging.expressionIds[0]).toBe("xf_scream");
    const mild = recommendStagingForEmotion("anger", 0.4);
    expect(mild.expressionIds[0]).toBe("xf_angry");
  });

  it("텍스트 한 번에 판정+추천+말풍선 종류를 함께 돌려준다", () => {
    const result = recommendStagingForText("꺼져! 시끄러워!");
    expect(result.detail.kind).toBe("anger");
    expect(result.bubbleKind).toBe("rage-shout");
    expect(result.staging.expressionIds.length).toBeGreaterThan(0);
  });
});
