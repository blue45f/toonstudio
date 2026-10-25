/**
 * studio-interaction-sfx-play.ts — 인터랙션 효과음 재생 계층 (캔버스·호스트 전용).
 *
 * 매핑 모듈(studio-interaction-sfx.ts)은 "어떤 소리인지"만 정하고, 이 계층이
 * 실제 재생을 맡는다. 일반 DOM 클릭은 useClickSfx 전역 위임이 맡으므로
 * 이 계층은 DOM 클릭에 쓰지 않는다 (중복 재생 방지).
 *
 * 볼륨: 마스터 키(ts_fx_volume)는 core playSfx 버스가 이미 적용하고,
 * 카테고리 볼륨(ts_fx_interaction JSON의 volume, 기본 0.25)은 playSfx의
 * 호출별 볼륨으로 곱해진다. 카테고리 볼륨이 0이면 재생하지 않는다.
 */

import { getAudioState, playSfx } from "@toonstudio/core/fx";

import {
  parseInteractionSfxSettings,
  STUDIO_INTERACTION_SFX_CATEGORY_KEY,
  type StudioInteractionSfxCategorySettings,
} from "./studio-interaction-sfx-settings";
import {
  resolveInteractionSfx,
  shouldPlayInteractionSfx,
  type StudioInteractionSfxEvent,
} from "./studio-interaction-sfx";

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** 저장된 카테고리 설정을 읽는다 (없거나 손상 시 기본값). */
export function readInteractionSfxCategorySettings(): StudioInteractionSfxCategorySettings {
  let stored: string | null = null;
  try {
    stored =
      typeof globalThis.localStorage !== "undefined"
        ? globalThis.localStorage.getItem(STUDIO_INTERACTION_SFX_CATEGORY_KEY)
        : null;
  } catch {
    stored = null;
  }
  return parseInteractionSfxSettings(stored, prefersReducedMotion());
}

export interface StudioInteractionSfxPlayer {
  readonly play: (event: StudioInteractionSfxEvent) => boolean;
}

/** 이벤트별 스로틀을 유지하는 재생기를 만든다. */
export function createInteractionSfxPlayer(): StudioInteractionSfxPlayer {
  const lastPlayed = new Map<StudioInteractionSfxEvent, number | null>();
  return {
    play(event: StudioInteractionSfxEvent): boolean {
      const category = readInteractionSfxCategorySettings();
      if (!category.enabled || category.volume <= 0) return false;
      const audio = getAudioState();
      const name = resolveInteractionSfx(event, {
        sfxEnabled: audio.sfxEnabled,
        muted: audio.muted,
        reducedMotion: prefersReducedMotion(),
        click: category.click,
        draw: category.draw,
        drag: category.drag,
      });
      if (!name) return false;
      const now = Date.now();
      if (!shouldPlayInteractionSfx(event, lastPlayed.get(event) ?? null, now)) {
        return false;
      }
      lastPlayed.set(event, now);
      playSfx(name, category.volume);
      return true;
    },
  };
}
