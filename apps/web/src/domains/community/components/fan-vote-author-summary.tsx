import { BarChart3 } from "lucide-react";

import { tallyFanVote, type FanVotePoll } from "../fan-vote";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 다음 장면 투표 — 작가 전용 집계 요약 (작가 운영 표면에서만 렌더).
 *
 * 선택지별 득표·비율·동률은 이 컴포넌트에서만 보인다. 독자 표면(FanVoteCard)은
 * readerFanVoteView만 받으므로 같은 데이터를 공유해도 집계가 새지 않는다.
 */
export function FanVoteAuthorSummary({ poll }: { poll: FanVotePoll }) {
  const t = useBilingual("domains.community.FanVoteAuthorSummary");
  const tally = tallyFanVote(poll);

  return (
    <section
      aria-label={t("팬 투표 집계", "Fan vote results")}
      className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-black text-fg">
          <BarChart3 size={15} aria-hidden="true" />
          {t("투표 집계 (작가 전용)", "Vote results (author only)")}
        </span>
        <span className="text-xs font-semibold text-fg-3">
          {t(`총 ${tally.totalVoters}표`, `${tally.totalVoters} votes`)}
        </span>
        {tally.isTie ? (
          <span className="rounded-full border border-line px-2.5 py-0.5 text-xs font-bold text-fg-2">
            {t("동률", "Tied")}
          </span>
        ) : null}
      </div>

      <h3 className="mt-2 text-base font-bold leading-snug text-fg">{poll.question}</h3>

      {tally.totalVoters === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm font-semibold text-fg-2">
          {t("아직 들어온 표가 없어요.", "No votes yet.")}
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {tally.entries.map((entry) => (
            <li key={entry.optionId}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-bold text-fg">{entry.label}</span>
                <span className="font-semibold text-fg-2">
                  {t(`${entry.count}표 · ${entry.percent}%`, `${entry.count} votes · ${entry.percent}%`)}
                </span>
              </div>
              <div
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised"
                role="img"
                aria-label={t(
                  `${entry.label} ${entry.percent}%`,
                  `${entry.label} ${entry.percent}%`,
                )}
              >
                <div className="h-full rounded-full bg-accent" style={{ width: `${entry.percent}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
