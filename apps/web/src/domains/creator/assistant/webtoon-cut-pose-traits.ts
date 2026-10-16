/**
 * webtoon-cut-pose-traits.ts
 *
 * 포즈 프리셋(`studio-pose-presets.ts` 의 NATURAL_IDLE_POSES + EXTRA_POSE_PRESETS, 72종)이
 * 콘티 컷의 어떤 감정·샷·앵글에 어울리는지 사람이 손으로 정리한 특성 표.
 *
 * 프리셋에는 감정·샷 메타데이터가 없어서(`label` 과 짧은 `tone` 뿐) 점수화에 쓸 근거를
 * 여기서 따로 둔다. 이 표는 작가의 눈에 맞춘 휴리스틱 분류이며 검증된 연구 결과가 아니다.
 * 프리셋을 추가하면 이 표에도 한 줄을 더해야 하고, 빠지거나 낡은 id 는
 * `webtoon-cut-pose-traits.test.ts` 가 실제 카탈로그와 대조해 실패로 알려 준다.
 *
 * 읽는 법
 *  - emotions: 어울리는 감정. 앞쪽일수록 강한 적합(최대 3개).
 *  - body: "upper" = 얼굴·손·상체 동작만으로 읽힌다(클로즈업·미디엄에서도 살아남는다),
 *          "full" = 다리·자세 전체가 보여야 읽힌다(풀 샷·롱 샷에서 살아난다).
 *  - angles: 특히 살아나는 카메라 앵글. 비어 있으면 앵글에 중립이다.
 */

import type {
  CharacterEmotionalTone,
  StoryboardCameraAngle,
} from "../ai/studio-ai-storyboard-director";

export type CutPoseBody = "upper" | "full";

export interface CutPoseTraits {
  readonly emotions: readonly CharacterEmotionalTone[];
  readonly body: CutPoseBody;
  readonly angles: readonly StoryboardCameraAngle[];
}

function traits(
  body: CutPoseBody,
  emotions: readonly CharacterEmotionalTone[],
  angles: readonly StoryboardCameraAngle[] = [],
): CutPoseTraits {
  return Object.freeze({
    body,
    emotions: Object.freeze([...emotions]),
    angles: Object.freeze([...angles]),
  });
}

export const CUT_POSE_TRAITS: Readonly<Record<string, CutPoseTraits>> = Object.freeze({
  // 자연 대기 — 스폰 기본 포즈. 담담한 컷에 쓴다.
  ni_weight_left: traits("upper", ["calm"]),
  ni_weight_right: traits("upper", ["calm"]),
  ni_calm_front: traits("upper", ["calm"]),
  ni_open_easy: traits("upper", ["calm", "joy"]),

  // 인사·일상·감정 표현
  xp_wave_greeting: traits("upper", ["joy", "calm"]),
  xp_idle_relax: traits("upper", ["calm"]),
  xp_hands_on_hips: traits("upper", ["determination", "rage", "joy"], ["low-angle"]),
  xp_one_hand_hip: traits("upper", ["calm", "joy"]),
  xp_sprint: traits("full", ["determination", "shock"], ["low-angle", "dutch-tilt"]),
  xp_chair_sit: traits("full", ["calm"], ["high-angle"]),
  xp_kneel: traits("full", ["sorrow", "calm"], ["high-angle"]),
  xp_finger_heart: traits("upper", ["joy"]),
  xp_double_v: traits("upper", ["joy"]),
  xp_point_you: traits("upper", ["rage", "determination"], ["low-angle"]),
  xp_shock_hands: traits("upper", ["shock"], ["dutch-tilt"]),
  xp_teary: traits("upper", ["sorrow"], ["high-angle"]),
  xp_banzai: traits("full", ["joy", "determination"], ["low-angle"]),
  xp_guard_up: traits("full", ["rage", "determination"], ["low-angle"]),
  xp_shrug: traits("upper", ["calm", "joy"]),
  xp_phone_look: traits("upper", ["calm"], ["high-angle"]),
  xp_chin_rest: traits("upper", ["calm", "sorrow"]),
  xp_polite_bow: traits("upper", ["calm", "sorrow"], ["high-angle"]),
  xp_jump_joy: traits("full", ["joy"], ["low-angle"]),
  xp_look_back: traits("upper", ["shock", "calm"], ["dutch-tilt"]),
  xp_lying_down: traits("full", ["calm", "sorrow"], ["high-angle"]),
  xp_hands_behind: traits("full", ["calm"]),
  xp_propose_kneel: traits("full", ["determination", "joy"], ["low-angle"]),

  // 확장 팩 — 액션·표정·장르
  xp_kick: traits("full", ["rage", "determination"], ["low-angle", "dutch-tilt"]),
  xp_punch: traits("upper", ["rage", "determination"], ["low-angle", "dutch-tilt"]),
  xp_sit_floor: traits("full", ["calm", "sorrow"], ["high-angle"]),
  xp_dance: traits("full", ["joy"]),
  xp_run: traits("full", ["determination", "shock"], ["dutch-tilt", "low-angle"]),
  xp_crouch: traits("full", ["shock", "sorrow"], ["high-angle"]),
  xp_fist_up: traits("upper", ["determination", "rage"], ["low-angle"]),
  xp_bow_deep: traits("upper", ["sorrow", "calm"], ["high-angle"]),
  xp_lean_wall: traits("full", ["calm"]),
  xp_hold_heart: traits("upper", ["sorrow", "joy", "calm"]),
  xp_spin: traits("full", ["joy", "shock"], ["dutch-tilt"]),
  xp_kneel_pray: traits("full", ["sorrow", "calm"], ["high-angle"]),
  xp_jump_pose: traits("full", ["joy", "determination"], ["low-angle"]),
  xp_side_lean: traits("upper", ["calm"]),
  xp_sword_ready: traits("full", ["determination", "rage"], ["low-angle"]),
  xp_blush_cover: traits("upper", ["joy", "calm"]),
  xp_think_chin: traits("upper", ["calm", "sorrow"]),
  xp_superhero: traits("full", ["determination", "joy"], ["low-angle"]),
  xp_sad_sit: traits("full", ["sorrow"], ["high-angle"]),
  xp_laugh: traits("upper", ["joy"]),
  xp_meditate: traits("upper", ["calm"]),
  xp_point_forward: traits("upper", ["determination", "rage"], ["low-angle"]),
  xp_angel_wing: traits("full", ["joy", "sorrow"], ["low-angle"]),
  xp_cry: traits("upper", ["sorrow"], ["high-angle"]),
  xp_fly_pose: traits("full", ["joy", "determination"], ["low-angle"]),
  xp_thumbs_up: traits("upper", ["joy", "determination"]),
  xp_shock: traits("upper", ["shock"], ["dutch-tilt"]),
  xp_sleep_stand: traits("upper", ["calm"]),
  xp_victory: traits("upper", ["joy", "determination"], ["low-angle"]),
  xp_cool_lean: traits("full", ["calm", "determination"]),
  xp_phone_selfie: traits("upper", ["joy"], ["high-angle"]),
  xp_typing: traits("upper", ["calm", "determination"], ["high-angle"]),
  xp_cooking: traits("upper", ["calm", "joy"]),
  xp_reading: traits("upper", ["calm"], ["high-angle"]),
  xp_guard: traits("upper", ["shock", "rage"], ["dutch-tilt"]),
  xp_archer: traits("full", ["determination"], ["low-angle"]),
  xp_salutation: traits("upper", ["determination", "calm"], ["low-angle"]),
  xp_present: traits("upper", ["joy", "calm"]),
  xp_wait_line: traits("full", ["calm"]),
  xp_stretch: traits("full", ["calm", "joy"], ["low-angle"]),
  xp_fall_back: traits("full", ["shock", "sorrow"], ["dutch-tilt", "high-angle"]),
  xp_hug_self: traits("upper", ["sorrow", "shock"], ["high-angle"]),
  xp_cheer_both: traits("upper", ["joy"], ["low-angle"]),
  xp_sneak: traits("full", ["shock", "determination"], ["high-angle", "dutch-tilt"]),
  xp_balance: traits("full", ["determination", "calm"]),
});
