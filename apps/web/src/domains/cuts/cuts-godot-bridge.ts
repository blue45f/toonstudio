import type { CutsClip } from "./cuts-types";

/**
 * 컷츠 Godot 플레이어 브리지 계약 (셸 쪽).
 *
 * Godot는 iframe 창의 `__tsMotionSetClip(json)`으로 클립을 받고,
 * `window.parent.__tsMotionEvent(json)`으로 ready·shotChanged·ended·error를
 * 알린다. 이 모듈은 그중 클립 페이로드 직렬화를 담당한다 — 내레이션·메타는
 * 셸이 이미 알고 있어 싣지 않는다.
 */
export function buildGodotClipPayload(clip: CutsClip): string {
  return JSON.stringify({
    title: `${clip.title} ${clip.episodeNumber}화`,
    shots: clip.shots.map((shot) => ({
      imageUrl: shot.imageUrl,
      caption: shot.caption,
      startMs: shot.startMs,
      durationMs: shot.durationMs,
      kenBurns: { from: shot.kenBurns.from, to: shot.kenBurns.to },
    })),
  });
}
