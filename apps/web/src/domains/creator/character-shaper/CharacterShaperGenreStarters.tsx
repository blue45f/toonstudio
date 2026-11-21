/**
 * Character Shaper — 초보자용 원클릭 "장르별 캐릭터 바로 시작" 카드 스트립.
 *
 * 복잡한 슬라이더를 건드리지 않아도 웹툰 장르 대표 프리셋(얼굴 비율·헤어·눈동자·음영 스타일)을
 * 한 번 눌러 즉시 세팅하고, 마음에 드는 부분만 이어서 다듬을 수 있다.
 */
import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { CHARACTER_GENRE_STARTERS, type CharacterGenreStarterPreset } from "./character-shaper-custom-quality";
import { useCharacterShaperMaterialSettings } from "./character-shaper-session-settings";

import type { CharacterShaperBinding } from "./character-shaper-ui-contract";

import { cn } from "@/shared/lib/utils";

export function CharacterShaperGenreStarters({
  binding,
  disabled,
  compact = false,
}: {
  readonly binding: CharacterShaperBinding;
  readonly disabled: boolean;
  readonly compact?: boolean;
}) {
  const [open, setOpen] = useState(!compact);
  const [activeId, setActiveId] = useState<string | null>(null);
  const { setShaperMaterial } = useCharacterShaperMaterialSettings();

  const applyStarter = (starter: CharacterGenreStarterPreset) => {
    if (disabled) return;
    setActiveId(starter.id);
    binding.commitFaceParams(starter.face, `빠른 시작: ${starter.labelKo} 얼굴`);
    binding.commitHairParams(starter.hair, `빠른 시작: ${starter.labelKo} 헤어`);
    binding.commitColor("skin", starter.skinHex);
    if (binding.profile.irisTintable) {
      binding.commitColor("iris", starter.irisHex);
    }
    setShaperMaterial((prev) => ({ ...prev, ...starter.material }));
  };

  return (
    <section
      data-testid="shaper-genre-starters"
      aria-label="장르별 캐릭터 바로 시작"
      className="mt-2 rounded-xl border border-line/80 bg-card/80 p-2"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label="장르별 캐릭터 바로 시작 펼치기"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-xs font-bold text-fg [word-break:keep-all]",
          "transition-[background-color,color] duration-150 hover:bg-raised motion-reduce:transition-none",
          STUDIO_FOCUS_RING,
        )}
      >
        <span className="inline-flex items-center gap-1.5">
          <Sparkles size={14} aria-hidden className="text-accent" />
          <span>장르별 바로 시작</span>
        </span>
        <ChevronDown
          size={14}
          aria-hidden
          className={cn("text-fg-3 transition-transform duration-150 motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div className="mt-1.5 space-y-1.5">
          <p className="px-1 text-[0.66rem] leading-relaxed text-fg-3 [word-break:keep-all]">
            하나를 누르면 얼굴·헤어·피부·음영이 한 번에 맞춰집니다.
          </p>
          <div role="group" aria-label="장르 프리셋 선택" className="grid grid-cols-2 gap-1.5">
            {CHARACTER_GENRE_STARTERS.map((starter) => {
              const selected = activeId === starter.id;
              return (
                <button
                  key={starter.id}
                  type="button"
                  data-testid={`shaper-genre-starter-${starter.id}`}
                  aria-pressed={selected}
                  aria-label={`${starter.labelKo} 스타일 바로 적용`}
                  disabled={disabled}
                  onClick={() => applyStarter(starter)}
                  className={cn(
                    "shaper-spectrum-card flex min-h-11 flex-col items-start justify-center rounded-xl border px-2.5 py-1.5 text-left [word-break:keep-all]",
                    "transition-[transform,border-color,background-color,box-shadow] duration-150 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transition-none motion-reduce:transform-none",
                    STUDIO_FOCUS_RING,
                    selected
                      ? "shaper-spectrum-active border-accent bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg",
                  )}
                >
                  <span className="text-xs font-bold leading-tight">{starter.labelKo}</span>
                  <span className="mt-0.5 line-clamp-1 text-[0.62rem] font-normal text-fg-3">{starter.summaryKo}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
