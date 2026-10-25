/**
 * motion-webtoon-sfx-player.ts — 모션 컷 효과음 재생 (스팅어 계열 전용).
 *
 * 규칙 자동 배치(motion-webtoon-sfx-auto.ts)가 만든 종류 큐를
 * 종류→스팅어 매핑(studio-sfx-kind-mapping.ts)으로 프리셋 큐로 바꾸고,
 * studio-bgm의 scheduleSfxStinger로 Web Audio에 예약한다.
 * UI 효과음 playSfx(10종) 계열과는 섞지 않는다.
 */

import { findSfxStingerPreset } from "../studio-motion-fx";
import { scheduleSfxStinger } from "../studio-bgm";
import { mapSfxCuesToStingerCues } from "../studio-sfx-kind-mapping";

export interface MotionWebtoonSfxCueInput {
  readonly kind: string;
  readonly atSeconds: number;
}

let sharedContext: AudioContext | null = null;

function getSharedContext(): AudioContext | null {
  if (sharedContext) return sharedContext;
  try {
    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    sharedContext = new Ctor();
    return sharedContext;
  } catch {
    return null;
  }
}

/** 컷 진입 효과음 큐를 재생한다. 재생기가 없으면 조용히 무시한다. */
export function playMotionSfxCues(
  cues: readonly MotionWebtoonSfxCueInput[],
  volume = 0.5,
): void {
  const ctx = getSharedContext();
  if (!ctx || cues.length === 0) return;
  try {
    if (ctx.state === "suspended") void ctx.resume();
    const base = ctx.currentTime;
    for (const cue of mapSfxCuesToStingerCues(cues)) {
      const preset = findSfxStingerPreset(cue.presetId);
      if (!preset) continue;
      scheduleSfxStinger(
        ctx as never,
        ctx.destination as never,
        preset as never,
        volume,
        base + cue.atSeconds,
      );
    }
  } catch {
    // 효과음 실패는 재생 흐름을 막지 않는다.
  }
}
