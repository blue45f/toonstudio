import { Check, Vote } from "lucide-react";

import {
  FAN_VOTE_TOPIC_LABELS,
  readerFanVoteView,
  type FanVotePoll,
} from "../fan-vote";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 다음 장면 투표 — 독자용 카드 (작품 페이지·커뮤니티 표면).
 *
 * 독자 뷰(readerFanVoteView)만 소비하므로 선택지별 득표·비율은 이 컴포넌트에 도달하지 않는다.
 * 결과 집계는 작가 전용 요약(FanVoteAuthorSummary)에서만 보인다.
 * 상단에 '본편 전개와 무관한 투표' 고지를 고정해 참여 범위를 독자에게도 분명히 한다.
 */
export function FanVoteCard({
  poll,
  readerId,
  onVote,
}: {
  poll: FanVotePoll;
  readerId: string;
  onVote: (optionId: string) => void;
}) {
  const t = useBilingual("domains.community.FanVoteCard");
  const view = readerFanVoteView(poll, readerId);
  const topicLabel = FAN_VOTE_TOPIC_LABELS[view.topic];
  const isOpen = view.status === "open";

  return (
    <section
      aria-label={t("팬 투표", "Fan vote")}
      className="rounded-3xl border border-line bg-panel p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-black text-on-accent">
          <Vote size={13} aria-hidden="true" />
          {t(topicLabel.ko, topicLabel.en)}
        </span>
        <span className="text-xs font-semibold text-fg-3">
          {view.totalVoters > 0
            ? t(`${view.totalVoters}명 참여 중`, `${view.totalVoters} readers joined`)
            : t("첫 참여를 기다리고 있어요", "Be the first to join")}
        </span>
      </div>

      <h3 className="mt-3 text-lg font-black leading-snug text-fg">{view.question}</h3>
      <p className="mt-1.5 text-xs leading-5 text-fg-3">
        {t(
          "이 투표는 본편 이야기 전개와 무관해요. 결과는 작가에게만 집계로 전달됩니다.",
          "This vote does not affect the main story. Results are shared with the author as totals only.",
        )}
      </p>

      <div className="mt-4 grid gap-2" role="group" aria-label={t("선택지", "Options")}>
        {view.options.map((option) => {
          const mine = view.myOptionId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              disabled={!isOpen}
              aria-pressed={mine}
              onClick={() => onVote(option.id)}
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-left text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                mine
                  ? "border-accent bg-accent/10 text-fg"
                  : "border-line bg-raised text-fg-2 hover:border-line-strong hover:text-fg",
                !isOpen && "cursor-not-allowed opacity-60 hover:border-line hover:text-fg-2",
              )}
            >
              <span>{option.label}</span>
              {mine ? (
                <span className="inline-flex items-center gap-1 text-xs font-black text-accent">
                  <Check size={14} aria-hidden="true" />
                  {t("내 선택", "My pick")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs font-semibold text-fg-3" aria-live="polite">
        {view.status === "closed"
          ? t("마감된 투표예요. 참여해 주셔서 감사합니다!", "This vote is closed. Thanks for joining!")
          : view.status === "expired"
            ? t("참여 기간이 끝난 투표예요.", "The voting period has ended.")
            : view.myOptionId
              ? t("투표했어요. 마감 전까지 선택을 바꿀 수 있어요.", "You voted. You can change your pick until it closes.")
              : t("선택지를 누르면 바로 투표돼요.", "Tap an option to vote.")}
      </p>
    </section>
  );
}
