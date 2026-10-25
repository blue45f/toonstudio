/**
 * motion-webtoon-sfx-auto.ts — 규칙 기반 효과음 자동 매핑 (순수 모듈, fetch 없음).
 *
 * 모션 모델(MotionCut)에는 SFX 필드가 없고, 자동 연출은 BGM·카메라·
 * 음성 프리셋까지만 일괄 적용했다. 이 모듈은 대사·분위기 단서에서
 * 효과음 종류를 규칙으로 고르는 부분만 담당한다. 돌려주는 것은 종류
 * 문자열이며, 실제 스팅어 프리셋 연결은 기존 studio-motion-fx 계열이
 * 호출부에서 맡는다. LLM 기반 배치는 별도 모듈(studio-ai-bgm-plan.ts)
 * 이 담당하고, 이 모듈은 비용 0 규칙 경로이다.
 */

export type StudioMotionSfxKind =
  | "soft"
  | "impact"
  | "heartbeat"
  | "bright"
  | "dark";

export interface StudioMotionSfxCue {
  readonly kind: StudioMotionSfxKind;
  readonly atSeconds: number;
}

const KEYWORD_TO_KIND: readonly (readonly [string, StudioMotionSfxKind])[] =
  Object.freeze([
    ["심장", "heartbeat"],
    ["두근", "heartbeat"],
    ["심장이", "heartbeat"],
    ["쾅", "impact"],
    ["쿵", "impact"],
    ["터져", "impact"],
    ["폭발", "impact"],
    ["반짝", "bright"],
    ["환하게", "bright"],
    ["웃음", "bright"],
    ["어둠", "dark"],
    ["불안", "dark"],
    ["무서", "dark"],
    ["포근", "soft"],
    ["살며시", "soft"],
    ["조용히", "soft"],
  ]);

/** 대사·분위기 단서에서 효과음 종류를 규칙으로 고른다. */
export function mapCutToSfxKinds(input: {
  readonly dialogues: readonly string[];
  readonly moodHint: string;
}): readonly StudioMotionSfxKind[] {
  const text = [...input.dialogues, input.moodHint].join(" ");
  const found: StudioMotionSfxKind[] = [];
  for (const [keyword, kind] of KEYWORD_TO_KIND) {
    if (text.includes(keyword) && !found.includes(kind)) {
      found.push(kind);
    }
  }
  return Object.freeze(found);
}

/** 컷 시작 시점에 효과음 큐를 만든다. */
export function buildCutSfxCues(input: {
  readonly dialogues: readonly string[];
  readonly moodHint: string;
}): readonly StudioMotionSfxCue[] {
  return Object.freeze(
    mapCutToSfxKinds(input).map((kind) => ({ kind, atSeconds: 0 })),
  );
}
