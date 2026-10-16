import { Eye, EyeOff } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { DistributionList, DropOffHeatStrip } from "./ReaderFeedbackCharts";
import { EMOTION_LABELS, FUN_LEVEL_LABELS, RF_BUTTON, UNDERSTANDING_LEVEL_LABELS } from "./reader-feedback-copy";
import { countText, cutRangeText, groupLabel, meanText, readingText, scrollRangeText, type Localize } from "./reader-feedback-format";
import { RATING_LEVELS } from "./reader-feedback-schema";
import { SAMPLE_LEVEL_THRESHOLDS, peakBins, showsPercent, type FeedbackComment, type RatingSummary, type ReaderFeedbackGroup } from "./reader-feedback-summary";

function Figure({ label, value, unit, note }: { readonly label: string; readonly value: string; readonly unit?: string; readonly note?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold text-fg-3">{label}</dt>
      <dd className="mt-0.5 text-2xl font-black tabular-nums text-fg">
        {value}{unit ? <span className="ml-0.5 text-sm font-bold text-fg-3">{unit}</span> : null}
      </dd>
      {note ? <dd className="text-xs text-fg-3">{note}</dd> : null}
    </div>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-t border-line pt-4">
      <h5 id={id} className="text-sm font-black text-fg">{title}</h5>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ratingRows(bt: Localize, summary: RatingSummary, labels: typeof FUN_LEVEL_LABELS) {
  return RATING_LEVELS.map((level) => ({ key: String(level), label: bt(labels[level].ko, labels[level].en), count: summary.counts[level - 1] }));
}

/** 의견 한 줄. 스포일러는 눌러서 펼치고, 숨김은 이 브라우저에만 표시한다. */
function CommentItem({ comment, onToggleHidden }: { readonly comment: FeedbackComment; readonly onToggleHidden: (id: string) => void }) {
  const bt = useBilingual("ReaderFeedback");
  const [revealed, setRevealed] = useState(false);
  const textId = useId();
  const covered = comment.spoiler && !revealed;
  const ratings = [
    comment.fun === null ? null : formatI18nTemplate(bt("재미: {label}", "Fun: {label}"), { label: bt(FUN_LEVEL_LABELS[comment.fun].ko, FUN_LEVEL_LABELS[comment.fun].en) }),
    comment.understanding === null ? null : formatI18nTemplate(bt("이해: {label}", "Clarity: {label}"), { label: bt(UNDERSTANDING_LEVEL_LABELS[comment.understanding].ko, UNDERSTANDING_LEVEL_LABELS[comment.understanding].en) }),
    readingText(bt, comment.reading),
  ].filter((part): part is string => part !== null);
  return (
    <li className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="text-xs leading-5 text-fg-3">
        <span className="font-bold text-fg-2">{comment.nickname ?? bt("익명", "Anonymous")}</span> · {ratings.join(" · ")}
      </p>
      {covered ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <p id={textId} className="text-sm text-fg-3">{bt("줄거리 스포일러가 있는 의견이에요.", "This comment contains story spoilers.")}</p>
          <button type="button" className={RF_BUTTON} aria-expanded={false} aria-controls={textId} onClick={() => setRevealed(true)}>
            <Eye size={15} aria-hidden /> {bt("스포일러 보기", "Show spoiler")}
          </button>
        </div>
      ) : (
        <p id={textId} className="mt-1 text-sm leading-6 text-fg [overflow-wrap:anywhere]">{comment.text}</p>
      )}
      <button
        type="button"
        className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-fg-3 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-describedby={covered ? undefined : textId}
        onClick={() => onToggleHidden(comment.id)}
      >
        {comment.hidden ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
        {comment.hidden ? bt("다시 보이기", "Show again") : bt("이 의견 숨기기", "Hide this comment")}
      </button>
    </li>
  );
}

/**
 * 한 회차의 요약: 핵심 수치 → 점수 분포 → 멈춘 곳 → 감정 → 의견. 표본이 작다는 안내를 맨 위에 둔다.
 * 비율(%)은 표시하는 비율마다 그 분모(그 질문에 답한 사람 수)가 충분할 때만 쓴다 — 응답이 많아도 한 명만 답한 질문에 "100%"를 만들지 않는다.
 */
export function ReaderFeedbackGroupView({ group, onToggleHidden }: {
  readonly group: ReaderFeedbackGroup;
  readonly onToggleHidden: (id: string) => void;
}) {
  const bt = useBilingual("ReaderFeedback");
  const headingId = useId();
  const count = (n: number) => countText(bt, n);
  const { cut, scroll } = group.dropOff;
  const left = cut.total + scroll.total;
  const finishedShare = group.reading.finishedShare;
  const marked = group.reading.finished + group.reading.left;
  const sampleNote = {
    tiny: formatI18nTemplate(bt("응답이 {n}개 미만이라 평균과 분포는 한두 명의 의견에 크게 좌우돼요. 개수만 참고하세요.", "Fewer than {n} responses: averages and distributions hinge on one or two readers. Treat the counts as hints only."), { n: SAMPLE_LEVEL_THRESHOLDS.tinyBelow }),
    small: formatI18nTemplate(bt("응답이 {n}개 미만이라 몇 명만 달라져도 결과가 크게 바뀔 수 있어요.", "Fewer than {n} responses: a few different answers could change the picture a lot."), { n: SAMPLE_LEVEL_THRESHOLDS.smallBelow }),
    moderate: bt("응답이 많아도 스스로 파일을 보내 준 독자의 의견이에요.", "Even with many responses, these are only readers who chose to send a file."),
  }[group.sample];
  const peakText = (bins: typeof cut.bins, label: (bin: (typeof cut.bins)[number]) => string) =>
    peakBins(bins).map((bin) => `${label(bin)} (${count(bin.count)})`).join(", ");
  const hiddenList = group.comments.filter((comment) => comment.hidden);
  const strips = [
    { total: cut.total, bins: cut.bins, label: (bin: (typeof cut.bins)[number]) => cutRangeText(bt, bin), title: bt("컷 번호로 알려 준 멈춘 곳", "Where readers stopped (cut number)"), start: bt("처음 컷", "First cut"), end: bt("마지막 컷", "Last cut"), range: bt("컷 구간", "Cut range") },
    { total: scroll.total, bins: scroll.bins, label: (bin: (typeof cut.bins)[number]) => scrollRangeText(bt, bin), title: bt("스크롤 위치로 알려 준 멈춘 곳", "Where readers stopped (scroll position)"), start: bt("맨 위", "Top"), end: bt("맨 아래", "Bottom"), range: bt("스크롤 구간", "Scroll range") },
  ].filter((strip) => strip.total > 0);

  return (
    <article aria-labelledby={headingId} className="space-y-4">
      <header>
        <h4 id={headingId} className="text-base font-black text-fg [overflow-wrap:anywhere]">{groupLabel(bt, group)}</h4>
        <p className="mt-1 text-sm leading-6 text-fg-2">{sampleNote}</p>
      </header>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Figure label={bt("받은 응답", "Responses")} value={formatI18nTemplate(bt("{n}개", "{n}"), { n: group.count })} />
        <Figure label={bt("재미 평균", "Average fun")} value={meanText(group.fun.mean)} unit="/3" note={formatI18nTemplate(bt("{n}명 답함", "{n} answered"), { n: group.fun.answered })} />
        <Figure label={bt("이해 평균", "Average clarity")} value={meanText(group.understanding.mean)} unit="/3" note={formatI18nTemplate(bt("{n}명 답함", "{n} answered"), { n: group.understanding.answered })} />
        <Figure
          label={bt("끝까지 읽음", "Finished")}
          value={finishedShare === null ? "—" : showsPercent(marked) ? `${Math.round(finishedShare * 100)}%` : `${group.reading.finished}/${marked}`}
          note={formatI18nTemplate(bt("읽은 정도를 밝힌 {n}명 기준", "Of {n} who said how far"), { n: marked })}
        />
      </dl>

      <Section title={bt("점수 분포", "Score distribution")}>
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold text-fg-3">{bt("재미", "Fun")}</p>
            <DistributionList rows={ratingRows(bt, group.fun, FUN_LEVEL_LABELS)} total={group.fun.answered} showShare={showsPercent(group.fun.answered)} countLabel={count} />
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-fg-3">{bt("이해", "Clarity")}</p>
            <DistributionList rows={ratingRows(bt, group.understanding, UNDERSTANDING_LEVEL_LABELS)} total={group.understanding.answered} showShare={showsPercent(group.understanding.answered)} countLabel={count} />
          </div>
        </div>
      </Section>

      <Section title={bt("멈춘 곳", "Where readers stopped")}>
        <p className="text-sm text-fg-2">
          {formatI18nTemplate(bt("끝까지 읽음 {finished}명 · 중간에 멈춤 {left}명 · 표시 안 함 {unmarked}명", "Finished {finished} · Stopped partway {left} · Didn't say {unmarked}"), { finished: group.reading.finished, left: group.reading.left, unmarked: group.reading.unmarked })}
        </p>
        {left === 0 ? (
          <p className="mt-2 text-sm text-fg-3">{bt("중간에 멈춘 곳을 알려 준 응답이 아직 없어요.", "No one has pointed to where they stopped yet.")}</p>
        ) : (
          <div className="mt-3 space-y-4">
            {strips.map((strip) => (
              <div key={strip.title}>
                <p className="mb-1 text-xs font-bold text-fg-3">{strip.title}</p>
                <DropOffHeatStrip
                  bins={strip.bins}
                  total={strip.total}
                  showShare={showsPercent(strip.total)}
                  rangeLabel={strip.label}
                  countLabel={count}
                  title={strip.title}
                  description={formatI18nTemplate(bt("가장 많이 멈춘 구간: {peak}. 이 방식으로 알려 준 응답은 모두 {total}개예요.", "Most common stopping point: {peak}. {total} responses used this method."), { peak: peakText(strip.bins, strip.label), total: strip.total })}
                  startLabel={strip.start}
                  endLabel={strip.end}
                  table={{
                    summary: bt("표로 보기", "View as table"),
                    caption: strip.title,
                    rangeHeader: strip.range,
                    countHeader: bt("멈춘 사람", "Readers"),
                    shareHeader: bt("비율", "Share"),
                  }}
                />
                <p className="mt-1 text-xs text-fg-2">{formatI18nTemplate(bt("가장 많이 멈춘 구간: {peak}", "Most common: {peak}"), { peak: peakText(strip.bins, strip.label) })}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={bt("느낀 감정", "How it felt")}>
        {group.emotions.length === 0 ? (
          <p className="text-sm text-fg-3">{bt("감정을 고른 응답이 아직 없어요.", "No one has picked an emotion yet.")}</p>
        ) : (
          <DistributionList
            rows={group.emotions.map((emotion) => ({ key: emotion.id, label: bt(EMOTION_LABELS[emotion.id].ko, EMOTION_LABELS[emotion.id].en), count: emotion.count }))}
            total={group.count}
            showShare={showsPercent(group.count)}
            countLabel={count}
          />
        )}
      </Section>

      <Section title={bt("대표 의견", "Representative comments")}>
        <p className="text-xs leading-5 text-fg-3">
          {bt("다수결이 아니라, 문제 신호 하나·긍정 신호 하나를 먼저 고르고 자세한 의견 순으로 채워요. 스포일러 의견은 자리가 남을 때만 들어가요. 숨김은 이 브라우저에만 표시되고 집계에는 영향이 없어요.",
            "Not a vote: one concern and one positive first, then the most detailed. Spoiler comments only fill leftover slots. Hiding is a mark in this browser only and doesn't change the counts.")}
        </p>
        {group.representative.length === 0 ? (
          <p className="mt-2 text-sm text-fg-3">{bt("보여 줄 의견이 없어요.", "No comments to show.")}</p>
        ) : (
          <ul className="mt-3 space-y-3">{group.representative.map((comment) => <CommentItem key={comment.id} comment={comment} onToggleHidden={onToggleHidden} />)}</ul>
        )}
        {group.comments.length > group.representative.length ? (
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {formatI18nTemplate(bt("의견 전체 보기 ({n}개)", "All comments ({n})"), { n: group.comments.length })}
            </summary>
            <ul className="mt-2 max-h-96 space-y-3 overflow-y-auto pr-1">
              {group.comments.filter((comment) => !comment.hidden).map((comment) => <CommentItem key={comment.id} comment={comment} onToggleHidden={onToggleHidden} />)}
            </ul>
          </details>
        ) : null}
        {hiddenList.length > 0 ? (
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-fg-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
              {formatI18nTemplate(bt("숨긴 의견 ({n}개)", "Hidden comments ({n})"), { n: hiddenList.length })}
            </summary>
            <ul className="mt-2 space-y-3">{hiddenList.map((comment) => <CommentItem key={comment.id} comment={comment} onToggleHidden={onToggleHidden} />)}</ul>
          </details>
        ) : null}
      </Section>
    </article>
  );
}
