import { Sparkles } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioProjectFormat, StudioProjectStartPoint } from "../studio-project-definition";

export interface StudioCreateQuickPreset {
  readonly id: string;
  readonly formatId: StudioProjectFormat;
  readonly startPoint: StudioProjectStartPoint;
  readonly templateId?: string;
  readonly imageUrl: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly sampleTitleKo: string;
  readonly sampleTitleEn: string;
  readonly subtitleKo: string;
  readonly subtitleEn: string;
}

const STUDIO_CREATE_QUICK_PRESETS: readonly StudioCreateQuickPreset[] = [
  {
    id: "romance-scroll",
    formatId: "vertical-webtoon",
    startPoint: "idea",
    imageUrl: "/brand/studio-canvas-previews/romance.webp",
    badgeKo: "세로 웹툰 · 줄거리부터",
    badgeEn: "Vertical · Story first",
    titleKo: "감성 로맨스·드라마",
    titleEn: "Romance & Drama",
    sampleTitleKo: "비 오는 정류장의 첫 만남",
    sampleTitleEn: "Rainy Bus Stop Encounter",
    subtitleKo: "모바일 스크롤 호흡과 대사 연출에 맞춘 표준 세로 원고",
    subtitleEn: "Standard vertical scroll layout tuned for emotional dialogue",
  },
  {
    id: "action-fantasy",
    formatId: "vertical-webtoon",
    startPoint: "storyboard",
    imageUrl: "/brand/studio-canvas-previews/action.webp",
    badgeKo: "세로 웹툰 · 콘티부터",
    badgeEn: "Vertical · Boards first",
    titleKo: "판타지·액션 연재",
    titleEn: "Action & Fantasy",
    sampleTitleKo: "각성의 순간 1화",
    sampleTitleEn: "Awakening Episode 1",
    subtitleKo: "박진감 있는 긴 컷과 연출 흐름을 바로 잡는 콘티 중심 시작",
    subtitleEn: "Dynamic tall panels starting directly from storyboard beats",
  },
  {
    id: "daily-cuttoon",
    formatId: "cuttoon",
    startPoint: "storyboard",
    templateId: "cuttoon-square-4",
    imageUrl: "/brand/studio-canvas-previews/daily.webp",
    badgeKo: "인스타 4컷 · 카드형",
    badgeEn: "4-Panel · Social cards",
    titleKo: "일상·공감 4컷툰",
    titleEn: "4-Panel Daily Toon",
    sampleTitleKo: "오늘 하루 네 컷 일기",
    sampleTitleEn: "Today in Four Panels",
    subtitleKo: "SNS에서 넘겨 보기 편한 4장 카드 구성으로 가볍게 시작",
    subtitleEn: "Swipe-friendly 4-card square preset for social feeds",
  },
  {
    id: "world-comic",
    formatId: "page-comic",
    startPoint: "idea",
    imageUrl: "/brand/studio-canvas-previews/fantasy.webp",
    badgeKo: "단행본·페이지 만화",
    badgeEn: "Page Comic · Spread",
    titleKo: "미스터리·단편 만화",
    titleEn: "Mystery & Short Comic",
    sampleTitleKo: "자정의 도서관 제1장",
    sampleTitleEn: "Midnight Library Ch.1",
    subtitleKo: "출판·단편 공모전 규격의 페이지 단위 컷 분할 시작",
    subtitleEn: "Print-ready page layout for short stories and contests",
  },
] as const;

export function StudioCreateQuickPresetStrip({
  activePresetId,
  onSelectPreset,
}: {
  readonly activePresetId: string | null;
  readonly onSelectPreset: (preset: StudioCreateQuickPreset) => void;
}) {
  const bt = useBilingual("StudioCreateQuickPresetStrip");

  return (
    <section
      aria-label={bt("1초 장르 스타터", "1-second genre starters")}
      data-testid="studio-create-quick-presets"
      className="mt-4 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent-soft to-panel p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="inline-flex items-center gap-1.5 text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            <Sparkles size={13} aria-hidden="true" />
            {bt("초보자 맞춤 추천 · 1초 장르 스타터", "BEGINNER QUICK STARTERS")}
          </p>
          <h2 className="mt-1 text-base font-black text-fg sm:text-lg">
            {bt(
              "복잡한 설정 없이 원하는 분위기 카드를 누르면 형식·시작점·가제가 한 번에 채워져요",
              "Pick a mood card to prefill format, starting step, and working title in one tap",
            )}
          </h2>
        </div>
        <span className="rounded-full border border-line bg-card px-3 py-1 text-[0.68rem] font-bold text-accent">
          {bt("언제든 아래에서 직접 바꿀 수 있어요", "Editable anytime below")}
        </span>
      </div>

      <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {STUDIO_CREATE_QUICK_PRESETS.map((preset) => {
          const active = activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              data-testid={`studio-quick-preset-${preset.id}`}
              onClick={() => onSelectPreset(preset)}
              className={cn(
                "group flex min-h-11 flex-col overflow-hidden rounded-2xl border text-left transition-all motion-reduce:transform-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                active
                  ? "border-accent bg-accent-soft/45 shadow-sm"
                  : "border-line bg-card hover:-translate-y-0.5 hover:border-accent/50 hover:bg-raised",
              )}
            >
              <span className="relative block h-24 w-full overflow-hidden bg-canvas">
                <img
                  src={preset.imageUrl}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent"
                />
                <span className="absolute bottom-2 left-2.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[10px] font-bold text-fg">
                  {bt(preset.badgeKo, preset.badgeEn)}
                </span>
              </span>
              <span className="flex flex-1 flex-col justify-between p-3">
                <span>
                  <strong className="block text-sm font-black text-fg">
                    {bt(preset.titleKo, preset.titleEn)}
                  </strong>
                  <span className="mt-1 block text-xs leading-5 text-fg-2">
                    {bt(preset.subtitleKo, preset.subtitleEn)}
                  </span>
                </span>
                <span className="mt-2.5 inline-flex items-center justify-between text-[0.68rem] font-extrabold text-accent">
                  <span>
                    {active
                      ? bt("✓ 이 구성으로 준비됨", "✓ Preset applied")
                      : bt("원클릭으로 채우기 →", "Apply in 1 tap →")}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
