import { ArrowRight, Clapperboard, Eye, Sparkles } from "lucide-react";
import { useState } from "react";

import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  buildReaderCutsStudioHref,
  READER_CUTS_MOODS,
  resolveReaderMood,
  type ReaderMoodId,
} from "./title-reader-rhythm";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleReaderFocusRhythmBar", ko, en);

export interface TitleReaderFocusRhythmBarProps {
  readonly slug: string;
  readonly episode: number;
  readonly focusCalm: boolean;
  readonly onToggleFocusCalm: () => void;
}

/**
 * 독자 뷰어 집중 읽기 + 원클릭 컷츠 리믹스 브리지 바.
 *
 * 마운트·스크롤 중 저장소 쓰기나 가짜 진도율을 만들지 않고,
 * 사용자가 직접 누를 때만 집중 보기 전환과 컷츠 스튜디오 연결을 수행한다.
 */
export function TitleReaderFocusRhythmBar({
  slug,
  episode,
  focusCalm,
  onToggleFocusCalm,
}: TitleReaderFocusRhythmBarProps) {
  useBilingualI18nRevision();
  const [selectedMood, setSelectedMood] = useState<ReaderMoodId>("heart");
  const activeMood = resolveReaderMood(selectedMood);
  const cutsHref = buildReaderCutsStudioHref({
    slug,
    episode,
    mood: selectedMood,
  });

  return (
    <section
      aria-label={bi("집중 읽기 및 컷츠 만들기", "Focus reading and Cuts remix")}
      data-testid="reader-focus-rhythm-bar"
      data-focus-calm={focusCalm ? "true" : "false"}
      className="reader-rhythm-bar mb-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-pressed={focusCalm}
          onClick={onToggleFocusCalm}
          className="reader-chip inline-flex min-h-12 items-center gap-2 rounded-full border px-3.5 text-xs font-semibold [word-break:keep-all]"
          data-active={focusCalm ? "true" : "false"}
        >
          <Eye size={15} aria-hidden="true" />
          <span>
            {focusCalm
              ? bi("집중 읽기 켜짐", "Calm focus on")
              : bi("집중 읽기 켜기", "Calm focus")}
          </span>
        </button>

        <span className="reader-ink-subtle text-xs [word-break:keep-all]">
          {focusCalm
            ? bi("주변 안내를 부드럽게 낮췄어요", "Peripheral cards softly dimmed")
            : bi("장면 분위기를 골라 바로 컷츠로 이어가요", "Pick a mood to jump straight into Cuts")}
        </span>
      </div>

      <details
        data-testid="reader-cuts-remix-disclosure"
        className="mt-2.5 border-t reader-divider pt-2"
      >
        <summary className="reader-bridge-summary flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 text-xs font-semibold [word-break:keep-all] [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-1.5">
            <Clapperboard size={15} aria-hidden="true" />
            <span>
              {formatI18nTemplate(
                bi("{v0}화로 컷츠 바로 만들기", "Make a Cut from Episode {v0}"),
                { v0: String(episode) },
              )}
            </span>
          </span>
          <span className="reader-ink-subtle inline-flex items-center gap-1 font-medium">
            <Sparkles size={13} aria-hidden="true" />
            <span>{bi("분위기 선택", "Pick mood")}</span>
          </span>
        </summary>

        <div className="mt-2.5 space-y-3 px-1 pb-1">
          <div
            role="group"
            aria-label={bi("컷츠 분위기 선택", "Choose Cuts mood")}
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {READER_CUTS_MOODS.map((mood) => {
              const pressed = mood.id === selectedMood;
              return (
                <button
                  key={mood.id}
                  type="button"
                  aria-pressed={pressed}
                  data-tone={mood.toneToken}
                  onClick={() => setSelectedMood(mood.id)}
                  className="reader-rhythm-chip inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold [word-break:keep-all]"
                >
                  <span aria-hidden="true" className="reader-rhythm-dot" />
                  <span>{bi(mood.labelKo, mood.labelEn)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <p className="reader-ink-muted text-xs leading-5 [word-break:keep-all]" aria-live="polite">
              {bi(activeMood.hintKo, activeMood.hintEn)}
            </p>
            <Link
              href={cutsHref}
              className="reader-cta-btn inline-flex min-h-12 items-center justify-center gap-1.5 rounded-full px-4 text-xs font-semibold [word-break:keep-all]"
            >
              <span>
                {formatI18nTemplate(
                  bi("{v0} 분위기로 컷츠 열기", "Open Cuts with {v0} mood"),
                  { v0: bi(activeMood.labelKo, activeMood.labelEn) },
                )}
              </span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </details>
    </section>
  );
}
