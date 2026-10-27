import { LibraryBig } from "lucide-react";
import { memo } from "react";

import { EngineeringDeckSlide } from "./EngineeringDeckSlide";
import {
  formatClock,
  type DeckSectionPlan,
  type DeckSlide,
  type DeckTrackModel,
} from "./engineering-deck-model";
import { CONTROL_BUTTON, deckPageBi as bi } from "./engineering-deck-ui";

import { cx } from "@/shared/lib/cx";
import {
  formatI18nTemplate,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/* ── 인쇄 영역 ─────────────────────────────────────────────── */

/**
 * 인쇄·PDF 용 슬라이드. 화면에서는 숨겨져 있고 인쇄할 때만 보인다.
 * 부록 트랙은 수백 장일 수 있어 현재 구간(카테고리)의 슬라이드만 담는다.
 */
export const PrintDeck = memo(function PrintDeck({
  slides,
  firstIndex,
  total,
  sections,
}: {
  readonly slides: readonly DeckSlide[];
  readonly firstIndex: number;
  readonly total: number;
  readonly sections: readonly DeckSectionPlan[];
}) {
  return (
    <div data-engineering-print-deck="true" aria-hidden="true">
      {slides.map((printSlide, offset) => (
        <EngineeringDeckSlide
          key={printSlide.id}
          slide={printSlide}
          index={firstIndex + offset}
          total={total}
          sections={sections}
          fixed
          decorative
        />
      ))}
    </div>
  );
});

/* ── 도감이 비어 있을 때 ───────────────────────────────────── */

export function EmptyAtlasState({ onShowTalk }: { readonly onShowTalk: () => void }) {
  useBilingualI18nRevision();
  return (
    <div role="status" className="grid place-items-center gap-3 rounded-3xl border border-dashed border-line-strong bg-card/50 p-8 text-center sm:p-12">
      <LibraryBig size={32} className="text-accent" aria-hidden="true" />
      <p className="text-lg font-black text-fg">{bi("도감 카드가 아직 없습니다", "No atlas cards yet")}</p>
      <p className="max-w-xl text-sm leading-7 text-fg-2">
        {bi(
          "기술 도감에 카드가 추가되면 이 부록 트랙에 자동으로 나타납니다. 카드마다 도식 → 코드 → 쓰인 곳 슬라이드가 만들어집니다.",
          "Cards added to the tech atlas appear in this appendix automatically, each with diagram, code and usage slides.",
        )}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link href="/about/technology/atlas" className={CONTROL_BUTTON}>{bi("기술 도감 보기", "Open the tech atlas")}</Link>
        <button type="button" className={CONTROL_BUTTON} onClick={onShowTalk}>{bi("세미나 발표로 가기", "Go to the seminar talk")}</button>
      </div>
    </div>
  );
}

/* ── 슬라이드 목차 ─────────────────────────────────────────── */

/**
 * 구간별 슬라이드 목차 — 개요(썸네일)가 발표 중의 일시 도구라면, 목차는
 * 발표 전에 전체 흐름과 구간별 시간을 읽고 원하는 슬라이드로 바로 가는
 * 상시 색인이다. 슬라이드·구간·시간은 전부 덱 모델에서 그대로 읽는다.
 */
export function DeckSlideIndex({
  model,
  index,
  onJump,
}: {
  readonly model: DeckTrackModel;
  readonly index: number;
  readonly onJump: (index: number) => void;
}) {
  useBilingualI18nRevision();
  return (
    <section aria-labelledby="deck-slide-index-title" className="ux-deferred-section mt-8 rounded-3xl border border-line/70 bg-panel/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="deck-slide-index-title" className="text-lg font-black text-fg">{bi("슬라이드 목차", "Slide index")}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {bi("구간별로 묶은 전체 슬라이드입니다. 누르면 그 슬라이드로 이동합니다.", "Every slide grouped by section. Select one to jump straight to it.")}
          </p>
        </div>
        <p className="font-display text-sm font-bold tabular-nums text-fg-3">
          {formatI18nTemplate(String(bi("{value0}개 구간 · {value1}장 · {value2}", "{value0} sections · {value1} slides · {value2}")), {
            value0: model.sections.length,
            value1: model.slides.length,
            value2: formatClock(model.totalSeconds),
          })}
        </p>
      </div>
      <div className="mt-5 grid gap-x-8 gap-y-5 lg:grid-cols-2">
        {model.sections.map((sectionPlan) => (
          <div key={sectionPlan.id}>
            <p className="flex items-baseline justify-between gap-3 text-sm font-black text-fg">
              <span>
                <span className="mr-2 font-display text-accent">{String(sectionPlan.order).padStart(2, "0")}</span>
                {sectionPlan.title}
              </span>
              <span className="shrink-0 font-display text-xs font-bold tabular-nums text-fg-3">
                {formatI18nTemplate(String(bi("{value0}장 · {value1}", "{value0} slides · {value1}")), {
                  value0: sectionPlan.slideCount,
                  value1: formatClock(sectionPlan.seconds),
                })}
              </span>
            </p>
            <ol className="mt-2 grid gap-1">
              {model.slides.slice(sectionPlan.firstSlideIndex, sectionPlan.firstSlideIndex + sectionPlan.slideCount).map((slide, offset) => {
                const slideIndex = sectionPlan.firstSlideIndex + offset;
                const current = slideIndex === index;
                return (
                  <li key={slide.id}>
                    <button
                      type="button"
                      aria-current={current || undefined}
                      onClick={() => onJump(slideIndex)}
                      className={cx(
                        "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        current ? "bg-accent-soft font-black text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                      )}
                    >
                      <span className="w-6 shrink-0 font-display tabular-nums">{slideIndex + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{slide.title}</span>
                      <span className="shrink-0 font-display text-xs tabular-nums text-fg-3">{formatClock(slide.plannedSeconds)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
