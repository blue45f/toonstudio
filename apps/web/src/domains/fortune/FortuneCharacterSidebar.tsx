import { Pause, Play, RotateCcw } from "lucide-react";

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";

import type { Character } from "./fortune-page-data";
import type { useFortunePlayback } from "./useFortunePlayback";

/**
 * 운세 본문 좌측 사이드바 — 선택된 캐릭터 에이전트 프로필, 연속 출석 스트릭,
 * 인사말(AGENT'S VOICE) 및 웹툰 음성 재생 상태 표시.
 * FortunePage에서 표현 계층을 분리한 순수 프레젠테이션 컴포넌트(동작·마크업 변경 없음).
 */
export interface FortuneCharacterSidebarProps {
  selectedChar: Character;
  streak: number;
  hasPanels: boolean;
  playback: Pick<ReturnType<typeof useFortunePlayback>, "supported" | "status" | "activeStep" | "steps">;
  onTogglePlay: () => void;
  onResetCharacter: () => void;
  tx: (source: string) => string;
}

export function FortuneCharacterSidebar({
  selectedChar,
  streak,
  hasPanels,
  playback,
  onTogglePlay,
  onResetCharacter,
  tx,
}: FortuneCharacterSidebarProps) {
  return (
    <aside className="lg:col-span-4 flex flex-col gap-4">
      <div className="rounded-2xl border border-line bg-panel/35 p-5 flex flex-col items-center text-center">
        <div className="relative aspect-square w-24 overflow-hidden rounded-full bg-gradient-to-br from-accent/20 to-panel border-2 flex items-center justify-center shadow-lg" style={{ borderColor: "var(--char-accent)" }}>
          {selectedChar.avatarUrl ? (
            <img
              src={resolveAssetUrl(selectedChar.avatarUrl)}
              alt={selectedChar.name}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <span className="font-display text-3xl font-extrabold text-accent">{selectedChar.name[0]}</span>
          )}
        </div>
        <h2 className="mt-3 text-lg font-bold text-fg">{selectedChar.name}</h2>
        <span className="text-xs text-fg-3">《{selectedChar.origin}》</span>

        {/* 연속 출석 스트릭 */}
        {streak > 0 && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent">
            🔥 {streak}일 연속 출석
          </span>
        )}

        <button
          onClick={onResetCharacter}
          className="mt-4 flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs text-fg-2 hover:bg-card transition-colors"
        >
          <RotateCcw className="h-3 w-3" /> {tx("다른 캐릭터 선택")}
        </button>
      </div>

      {/* 에이전트 인사말 + 음성 안내 패널 */}
      <div className="flex-1 rounded-2xl border border-line bg-card/40 p-5 flex flex-col gap-4">
        <div>
          <span className="text-[10px] tracking-wider text-accent uppercase font-bold mb-2 block">AGENT'S VOICE</span>
          <p className="font-serif text-sm leading-relaxed text-fg-2 whitespace-pre-wrap">
            {`"${selectedChar.greeting}"`}
          </p>
        </div>

        {/* {tx("웹툰 재생")} 상태 — 결과가 있을 때만 노출 */}
        {hasPanels ? (
          <div className="mt-auto rounded-xl border border-line/70 bg-panel/40 p-3 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-3">{tx("웹툰 음성 재생")}</span>
            {playback.supported ? (
              <button
                type="button"
                onClick={onTogglePlay}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent py-2 text-xs font-bold text-on-accent transition-colors hover:bg-accent-2"
              >
                {playback.status === "playing" ? (
                  <><Pause className="h-3.5 w-3.5" /> {tx("일시정지")}</>
                ) : playback.status === "paused" ? (
                  <><Play className="h-3.5 w-3.5" /> {tx("이어 보기")}</>
                ) : (
                  <><Play className="h-3.5 w-3.5" /> {tx("웹툰 재생")}</>
                )}
              </button>
            ) : (
              <p className="text-center text-xs leading-relaxed text-fg-3">
                이 브라우저는 음성을 지원하지 않아요. (Chrome·Safari 권장)
              </p>
            )}
            {playback.status === "playing" && (
              <p className="flex items-center justify-center gap-1.5 text-center text-xs text-accent">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping motion-reduce:animate-none rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
                </span>
                {playback.activeStep + 1} / {playback.steps.length} 컷 상영 중…
              </p>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
