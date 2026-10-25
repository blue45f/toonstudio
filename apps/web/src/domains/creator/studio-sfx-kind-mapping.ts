/**
 * studio-sfx-kind-mapping.ts — 모션 효과음 종류→스팅어 프리셋 매핑 (순수 모듈, fetch 없음).
 *
 * motion-webtoon-sfx-auto.ts는 종류 문자열(soft·impact·heartbeat·bright·dark)
 * 까지만 돌려주고, studio-motion-fx.ts의 스팅어 프리셋 8종과 연결하는 층이
 * 없어 재생 배선이 끊겨 있었다. 이 모듈이 그 매핑층이다. 모르는 종류는
 * 조용히 다른 소리로 대체하지 않고 null로 fail-closed한다.
 * 스팅어 프리셋 id는 studio-motion-fx.ts의 SFX_STINGER_PRESETS 실측 기준이다.
 */

export type StudioMotionSfxKind = "soft" | "impact" | "heartbeat" | "bright" | "dark";

export type StudioSfxStingerPresetId =
  | "heartbeat"
  | "thud"
  | "whoosh"
  | "sparkle"
  | "tension"
  | "hit"
  | "droplet"
  | "fanfare";

export interface StudioSfxCue {
  readonly kind: StudioMotionSfxKind;
  readonly atSeconds: number;
}

export interface StudioStingerCue {
  readonly presetId: StudioSfxStingerPresetId;
  readonly atSeconds: number;
}

/** 효과음 종류를 스팅어 프리셋 id로 바꾼다. 모르는 종류는 null이다. */
export function mapSfxKindToStingerPreset(
  kind: string,
): StudioSfxStingerPresetId | null {
  switch (kind) {
    case "heartbeat":
      return "heartbeat";
    case "impact":
      return "hit";
    case "bright":
      return "sparkle";
    case "dark":
      return "tension";
    case "soft":
      return "droplet";
    default:
      return null;
  }
}

/** 자동 배치 큐를 재생용 스팅어 큐로 바꾼다. 매핑 불가 큐는 제외한다. */
export function mapSfxCuesToStingerCues(
  cues: readonly StudioSfxCue[],
): readonly StudioStingerCue[] {
  const mapped: StudioStingerCue[] = [];
  for (const cue of cues) {
    const presetId = mapSfxKindToStingerPreset(cue.kind);
    if (presetId !== null && Number.isFinite(cue.atSeconds) && cue.atSeconds >= 0) {
      mapped.push(Object.freeze({ presetId, atSeconds: cue.atSeconds }));
    }
  }
  return Object.freeze(mapped);
}
