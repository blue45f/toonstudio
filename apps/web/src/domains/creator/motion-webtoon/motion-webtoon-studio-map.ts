/**
 * motion-webtoon-studio-map.ts — 스튜디오 컷 → 모션 회차 매핑 (순수 모듈, fetch 없음).
 *
 * 모션 웹툰 에디터는 빈 회차·샘플·이미지 URL 수동 입력 출발이었고,
 * 주 스튜디오의 실제 웹툰 컷을 MotionEpisode로 바꾸는 변환 코드가
 * 없었다. 이 모듈은 그 매핑만 담당한다. 컷 이미지·대사·순서를 받아
 * 기본 연출(줌인·컷 전환·daily BGM)을 입힌 회차를 만든다. 대사
 * 음성·전환 합성은 내보내기 단계의 몫이며, 이 모듈은 변환까지만 한다.
 */

import type {
  DialogueLine,
  MotionCut,
  MotionEpisode,
} from "./motion-webtoon-model";
import {
  defaultCutBgmCue,
  defaultCutDirection,
} from "./motion-webtoon-model";

export interface StudioCutForMotion {
  readonly id: string;
  readonly imageUrl: string;
  readonly altKo: string;
  readonly dialogues: readonly DialogueLine[];
}

export type StudioMotionMapResult =
  | { readonly ok: true; readonly episode: MotionEpisode }
  | { readonly ok: false; readonly reason: "empty_cuts" | "empty_image" };

/** 스튜디오 컷 목록을 모션 회차로 바꾼다. */
export function mapStudioCutsToMotionEpisode(input: {
  readonly episodeId: string;
  readonly titleKo: string;
  readonly cuts: readonly StudioCutForMotion[];
}): StudioMotionMapResult {
  if (input.cuts.length === 0) return { ok: false, reason: "empty_cuts" };
  const cuts: MotionCut[] = [];
  for (const cut of input.cuts) {
    if (!cut.imageUrl) return { ok: false, reason: "empty_image" };
    cuts.push({
      id: cut.id,
      imageUrl: cut.imageUrl,
      altKo: cut.altKo,
      altEn: cut.altKo,
      direction: defaultCutDirection(),
      transitionIn: "cut",
      bgm: defaultCutBgmCue(),
      dialogues: Object.freeze([...cut.dialogues]),
    });
  }
  return {
    ok: true,
    episode: {
      id: input.episodeId,
      titleKo: input.titleKo,
      titleEn: input.titleKo,
      characters: Object.freeze([]),
      cuts: Object.freeze(cuts),
    },
  };
}
