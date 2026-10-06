import { ArrowRight, Clock3 } from "lucide-react";

import { BLUEPRINT_GRID_STYLE } from "./engineering-blueprint";
import {
  type EngineeringChapter,
  type LocalizedText,
} from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import { ENGINEERING_STORY_GROUPS } from "./engineering-story-groups";
import {
  estimateReadingMinutes,
  findEngineeringPage,
  koreanTexts,
} from "./engineering-tech-pages";
import { EngineeringStatusBadge } from "./EngineeringStoryUi";

import Link from "@/shared/navigation/router-link";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("EngineeringChapterLibrary", ko, en);

/** 챕터 본문(스토리 페이지가 실제로 보여주는 문장)만으로 읽기 시간을 계산한다. 페이지 합계와 같은 추정식을 쓴다. */
function chapterMinutes(chapter: EngineeringChapter, locale: "ko" | "en"): number {
  if (locale === "ko") {
    return estimateReadingMinutes(
      koreanTexts([chapter.title, chapter.thesis, chapter.problem, chapter.decision, chapter.userValue, chapter.tradeoff, chapter.reuseSteps]),
      "ko",
    );
  }
  const pick = (text: LocalizedText) => text.en;
  return estimateReadingMinutes(
    [
      pick(chapter.title),
      pick(chapter.thesis),
      pick(chapter.problem),
      pick(chapter.decision),
      pick(chapter.userValue),
      pick(chapter.tradeoff),
      ...chapter.reuseSteps.map(pick),
    ],
    "en",
  );
}

function stripOrder(eyebrow: string): string {
  return eyebrow.replace(/^\d+\s·\s/u, "");
}

const chapterById = new Map<string, EngineeringChapter>(
  PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
);

/** 스토리 페이지와 같은 읽기 순서(그룹 순, 01부터 번호)로 정렬한 도서관 목록. */
const LIBRARY_SECTIONS = (() => {
  let position = 0;
  return ENGINEERING_STORY_GROUPS.map((group) => ({
    group,
    chapters: group.chapterIds.flatMap((id) => {
      const chapter = chapterById.get(id);
      if (!chapter) return [];
      position += 1;
      return [{ chapter, position, minutes: { ko: chapterMinutes(chapter, "ko"), en: chapterMinutes(chapter, "en") } }];
    }),
  }));
})();

const STORY_READING_MINUTES = findEngineeringPage("story").readingMinutes ?? 0;

function ChapterCard({
  chapter,
  position,
  minutes,
}: {
  readonly chapter: EngineeringChapter;
  readonly position: number;
  readonly minutes: { readonly ko: number; readonly en: number };
}) {
  const marker = String(position).padStart(2, "0");
  const readingMinutes = bi(minutes.ko, minutes.en);
  return (
    <li className="flex">
      <Link
        href={`/about/technology/story#${chapter.id}`}
        className="group flex w-full flex-col overflow-hidden rounded-3xl border border-line/70 bg-panel/55 shadow-sm transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span aria-hidden="true" className="relative block h-24 shrink-0 border-b border-line/60 bg-panel" style={BLUEPRINT_GRID_STYLE}>
          <span className="absolute bottom-1.5 left-4 font-display text-4xl font-black tracking-tight text-accent/40">{marker}</span>
          <span className="absolute bottom-3 right-4 max-w-[55%] text-right font-display text-[0.62rem] font-black uppercase leading-4 tracking-[0.16em] text-accent-2">
            {stripOrder(chapter.eyebrow)}
          </span>
        </span>
        <span className="flex flex-1 flex-col p-5">
          <span className="flex flex-wrap items-center justify-between gap-2">
            <EngineeringStatusBadge status={chapter.status} />
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg-3">
              <Clock3 size={13} aria-hidden="true" />
              {formatI18nTemplate(String(bi("읽기 약 {value0}분", "About {value0} min read")), { value0: readingMinutes })}
            </span>
          </span>
          <span className="mt-3.5 text-balance break-keep text-lg font-black leading-snug tracking-tight text-fg group-hover:text-accent">
            {bi(chapter.title.ko, chapter.title.en)}
          </span>
          <span className="mt-2 line-clamp-3 flex-1 text-sm leading-7 text-fg-2">{bi(chapter.thesis.ko, chapter.thesis.en)}</span>
          <span className="mt-4 flex flex-wrap gap-1.5">
            {chapter.technologies.slice(0, 3).map((technology) => (
              <span key={technology} className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold text-fg-3">
                {technology}
              </span>
            ))}
            {chapter.technologies.length > 3 ? (
              <span className="rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] font-semibold text-fg-3">
                {`+${chapter.technologies.length - 3}`}
              </span>
            ) : null}
          </span>
          <span className="mt-4 inline-flex items-center gap-1 border-t border-line/60 pt-3 text-xs font-bold text-accent">
            {bi("챕터 읽기", "Read chapter")}
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" aria-hidden="true" />
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * 기술 소개 착지의 문서 도서관. 마흔 개 챕터를 주제 묶음별 카드 그리드로 한눈에 보여주고,
 * 카드를 열면 제작 스토리의 해당 챕터 본문(문제·선택·가치·대가와 근거)으로 이어진다.
 */
export function EngineeringChapterLibrary() {
  useBilingualI18nRevision();

  return (
    <section className="pt-12 sm:pt-14" aria-labelledby="engineering-library-title">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="eyebrow text-accent">
            {formatI18nTemplate("CHAPTER LIBRARY · {value0} CHAPTERS", { value0: PUBLISHED_ENGINEERING_CHAPTERS.length })}
          </p>
          <h2 id="engineering-library-title" className="mt-3 text-balance text-2xl font-black tracking-tight text-fg sm:text-3xl">
            {bi("기술 문서 도서관", "The engineering library")}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-fg-2">
            {bi(
              "챕터마다 왜 만들었는지(문제), 무엇을 골랐는지(선택), 사용자에게 무엇이 달라지는지(가치), 무엇을 포기했는지(대가)를 근거와 함께 기록했습니다. 카드를 열면 제작 스토리의 해당 챕터 본문으로 이어집니다.",
              "Every chapter records the problem, the decision, the user value and the trade-off with inspectable evidence. Opening a card continues into that chapter in the engineering story.",
            )}
          </p>
        </div>
        <p className="text-sm font-bold text-fg-3">
          {formatI18nTemplate(String(bi("전체 {value0}개 챕터 · 읽기 약 {value1}분", "{value0} chapters · about {value1} min in total")), {
            value0: PUBLISHED_ENGINEERING_CHAPTERS.length,
            value1: STORY_READING_MINUTES,
          })}
        </p>
      </div>

      {LIBRARY_SECTIONS.map(({ group, chapters }) => (
        <div key={group.id} className="mt-11">
          <header className="flex flex-wrap items-end justify-between gap-2 border-b border-line/70 pb-3">
            <h3 className="text-xl font-black tracking-tight text-fg">{bi(group.title.ko, group.title.en)}</h3>
            <p className="text-sm text-fg-3">
              {bi(group.intro.ko, group.intro.en)}
              <span aria-hidden="true"> · </span>
              {formatI18nTemplate(String(bi("{value0}개 챕터", "{value0} chapters")), { value0: chapters.length })}
            </p>
          </header>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {chapters.map(({ chapter, position, minutes }) => (
              <ChapterCard key={chapter.id} chapter={chapter} position={position} minutes={minutes} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
