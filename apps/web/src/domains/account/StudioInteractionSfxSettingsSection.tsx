/**
 * StudioInteractionSfxSettingsSection.tsx — 효과음 볼륨 설정 섹션 (설정 페이지용).
 *
 * 기존 키(ts_fx_sfx_enabled·ts_fx_volume·ts_fx_bgm_*)는 core fx 엔진이
 * 소유하고, 신규 카테고리 키(ts_fx_interaction JSON, 기본 볼륨 0.25)는
 * 이 섹션이 읽고 쓴다. 카테고리 볼륨은 인터랙션 효과음 재생 계층이
 * playSfx 호출별 볼륨으로 적용한다. visual 토글은 소리가 아니라 시각
 * 효과 토글이라 별도로 표기한다.
 */

import { useState } from "react";

import {
  setMasterVolume,
  setSfxEnabled,
  useAudioState,
} from "@toonstudio/core/fx";

import {
  defaultInteractionSfxSettings,
  parseInteractionSfxSettings,
  serializeInteractionSfxSettings,
  STUDIO_INTERACTION_SFX_CATEGORY_KEY,
  type StudioInteractionSfxCategorySettings,
} from "@/domains/creator/public/studio-interaction-sfx-settings";

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

function readCategorySettings(): StudioInteractionSfxCategorySettings {
  let stored: string | null;
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

export function StudioInteractionSfxSettingsSection() {
  const audio = useAudioState();
  const [category, setCategory] = useState<StudioInteractionSfxCategorySettings>(
    readCategorySettings,
  );

  const updateCategory = (patch: Partial<StudioInteractionSfxCategorySettings>) => {
    const next = { ...category, ...patch };
    setCategory(next);
    try {
      if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.setItem(
          STUDIO_INTERACTION_SFX_CATEGORY_KEY,
          serializeInteractionSfxSettings(next),
        );
      }
    } catch {
      // 저장 실패는 설정 UI를 막지 않는다.
    }
  };

  const resetCategory = () => {
    const next = defaultInteractionSfxSettings(prefersReducedMotion());
    setCategory(next);
    try {
      if (typeof globalThis.localStorage !== "undefined") {
        globalThis.localStorage.setItem(
          STUDIO_INTERACTION_SFX_CATEGORY_KEY,
          serializeInteractionSfxSettings(next),
        );
      }
    } catch {
      // 무시한다.
    }
  };


  return (
    <section
      className="mb-6 rounded-2xl border border-line bg-panel/40 p-5"
      aria-labelledby="interaction-sfx-heading"
    >
      <h2 id="interaction-sfx-heading" className="mb-4 text-base font-semibold">
        효과음
      </h2>
      <p className="mb-4 text-sm leading-6 text-fg-2">
        클릭·드로잉·드래그 효과음의 켜짐과 크기를 조절해요. 명령 팔레트(⌥S)의
        전역 효과음 토글과 같은 설정을 씁니다.
      </p>
      <div className="space-y-4">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={audio.sfxEnabled}
            onChange={(event) => setSfxEnabled(event.target.checked)}
          />
          효과음 켜기 (마스터)
        </label>
        <label className="block space-y-1 text-sm">
          <span>
            마스터 볼륨 — {Math.round(audio.volume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audio.volume}
            onChange={(event) => setMasterVolume(Number(event.target.value))}
            className="w-full"
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>
            인터랙션 효과음 볼륨 — {Math.round(category.volume * 100)}% (기본
            25%)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={category.volume}
            onChange={(event) =>
              updateCategory({ volume: Number(event.target.value) })
            }
            className="w-full"
          />
        </label>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={category.click}
              onChange={(event) => updateCategory({ click: event.target.checked })}
            />
            클릭음
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={category.draw}
              onChange={(event) => updateCategory({ draw: event.target.checked })}
            />
            드로잉음
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={category.drag}
              onChange={(event) => updateCategory({ drag: event.target.checked })}
            />
            드래그음
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={category.visual}
              onChange={(event) => updateCategory({ visual: event.target.checked })}
            />
            시각 효과 (소리 아님)
          </label>
        </div>
        <button
          type="button"
          className="rounded-xl border border-line px-3 py-2 text-sm font-semibold text-fg hover:border-accent"
          onClick={resetCategory}
        >
          기본값으로 되돌리기
        </button>
      </div>
    </section>
  );
}
