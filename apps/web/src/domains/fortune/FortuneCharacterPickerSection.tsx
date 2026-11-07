import { ArrowRight, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";

import { FORTUNE_TAB_META, type Character } from "./fortune-page-data";
import { FortuneQuickToday } from "./FortuneQuickToday";

import type { SavedFortune } from "./fortune-store";

/**
 * 운세 1단계·2단계 진입 섹션 — 캐릭터 없이 바로 보는 오늘의 운세(FortuneQuickToday),
 * 최근 본 운세 보관함 레일, 캐릭터 에이전트 선택 그리드.
 * FortunePage에서 표현 계층을 분리한 순수 프레젠테이션 컴포넌트(동작·마크업 변경 없음).
 */
export interface FortuneCharacterPickerSectionProps {
  characters: Character[];
  charLoadFailed: boolean;
  history: SavedFortune[];
  onContinueQuickToday: () => void;
  onRestoreFortune: (saved: SavedFortune) => void;
  onClearHistory: () => void;
  onRemoveFromHistory: (id: string) => void;
  onRetryLoadCharacters: () => void;
  onSelectCharacter: (char: Character) => void;
  tx: (source: string) => string;
}

export function FortuneCharacterPickerSection({
  characters,
  charLoadFailed,
  history,
  onContinueQuickToday,
  onRestoreFortune,
  onClearHistory,
  onRemoveFromHistory,
  onRetryLoadCharacters,
  onSelectCharacter,
  tx,
}: FortuneCharacterPickerSectionProps) {
  return (
    <section className="mt-8">
      {/* 1단계: 캐릭터 없이 바로 보는 오늘의 운세 — 입력 없이 첫 결과 도달 (D-11).
          날짜만으로 산출되는 공통 결과를 앞단에 두고, 캐릭터 기반 상세 운세는
          아래 2단계 피커로 이어진다. */}
      <FortuneQuickToday onContinue={onContinueQuickToday} />

      {/* {tx("최근 본 운세")} 보관함 — 클릭 시 그 결과로 복원 */}
      {history.length > 0 && (
        <div className="mx-auto mb-8 max-w-3xl rounded-2xl border border-line bg-panel/30 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-fg-3">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> {tx("최근 본 운세")}
            </h2>
            <button onClick={onClearHistory} className="text-[11px] text-fg-3 hover:text-fg">{tx("전체 지우기")}</button>
          </div>
          <div className="rail flex gap-2.5 overflow-x-auto pb-1">
            {history.map((h) => (
              <div key={h.id} className="group relative shrink-0">
                <button
                  type="button"
                  onClick={() => onRestoreFortune(h)}
                  className="flex min-w-[150px] items-center gap-2.5 rounded-xl border border-line bg-card/50 p-2.5 pr-7 text-left transition-colors hover:border-line-strong hover:bg-raised"
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-line/50">
                    {h.characterAvatar ? (
                      <img src={resolveAssetUrl(h.characterAvatar)} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-fg">{h.summary}</div>
                    <div className="text-xs text-fg-3">{FORTUNE_TAB_META[h.tab].labelKo} · {h.dateLabel}</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveFromHistory(h.id)}
                  aria-label={tx("이 운세 기록 삭제")}
                  className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-fg-3 opacity-0 transition-opacity hover:bg-raised hover:text-fg focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-accent">
        {tx("2단계 · 캐릭터로 더 자세히 보기")}
      </p>
      <h2 id="fortune-character-picker" className="mb-6 scroll-mt-6 text-center text-lg font-bold text-fg-2">
        당신의 운세를 해석해줄 캐릭터 에이전트를 고르세요.
      </h2>
      {charLoadFailed && characters.length === 0 && (
        <div role="alert" className="mx-auto mb-6 max-w-md rounded-xl border border-bad/30 bg-bad/10 p-4 text-center">
          <p className="text-sm text-fg-2">{tx("캐릭터를 불러오지 못했어요.")}</p>
          <button
            type="button"
            onClick={onRetryLoadCharacters}
            className="mt-3 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-on-accent hover:bg-accent-2"
          >
            다시 시도
          </button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {characters.map((char, idx) => (
          <motion.button
            key={char.id}
            type="button"
            onClick={() => onSelectCharacter(char)}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, delay: idx * 0.09, ease: "easeOut" }}
            whileHover={{ y: -6, boxShadow: "0 18px 44px -14px oklch(0.72 0.185 42 / 0.5)" }}
            whileTap={{ scale: 0.97 }}
            className="group relative text-left w-full block cursor-pointer overflow-hidden rounded-2xl border border-line bg-card/65 p-4 hover:border-line-strong hover:bg-raised"
          >
            {/* 캐릭터 아바타 이미지 (없을 경우 텍스트 fallback) */}
            <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-gradient-to-br from-accent-soft to-panel/80 flex items-center justify-center border border-line/40">
              {char.avatarUrl ? (
                <img
                  src={resolveAssetUrl(char.avatarUrl)}
                  alt={char.name}
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="font-display text-4xl font-extrabold text-accent/60 group-hover:scale-105 transition-transform duration-300">
                  {char.name[0]}
                </span>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.13_0.012_70/0.85)] via-transparent to-transparent opacity-80" />
              <div className="absolute bottom-3 left-3 text-left z-10">
                <span className="text-[10px] uppercase tracking-wider text-accent font-semibold block">
                  {char.origin}
                </span>
                <span className="text-base font-bold text-fg">
                  {char.name}
                </span>
              </div>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-fg-3 line-clamp-2">
              "{char.greeting}"
            </p>
            <div className="mt-3 flex items-center justify-end text-xs font-bold text-accent group-hover:translate-x-1 transition-transform">
              선택하기 <ArrowRight className="ml-1 h-3 w-3" />
            </div>
          </motion.button>
        ))}
      </div>
    </section>
  );
}
