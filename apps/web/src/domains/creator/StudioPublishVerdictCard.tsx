import { CalendarClock, CheckCircle2, Flag, FolderOpen, ListChecks, RotateCcw } from "lucide-react";
import { useMemo } from "react";

import {
  resolvePublishVerdictView,
  type PublishVerdictInput,
  type PublishVerdictStatus,
} from "./studio-publish-verdict";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

export interface StudioPublishVerdictCardProps {
  readonly verdict: PublishVerdictInput;
}

function VerdictStatusIcon({ status }: { status: PublishVerdictStatus }) {
  if (status === "passed") return <CheckCircle2 size={14} aria-hidden />;
  if (status === "needs-revision") return <RotateCcw size={14} aria-hidden />;
  if (status === "closed") return <Flag size={14} aria-hidden />;
  return <CalendarClock size={14} aria-hidden />;
}

const STATUS_CHIP_CLASS: Record<PublishVerdictStatus, string> = {
  "in-review": "border-accent/40 bg-accent/10 text-accent",
  passed: "border-good/45 bg-good/10 text-good",
  "needs-revision": "border-warn/40 bg-warn/10 text-warn",
  closed: "border-line bg-card text-fg-2",
};

/**
 * 게시·투고·챌린지 제출 직후의 판정 가시화 카드.
 *
 * 판정 자체가 아니라 "피드백이 끊기는 구간"에서 이탈이 생기므로, 이 카드는
 * 상태·다음 시점·클로징 중 어느 것도 빈칸으로 두지 않는다(모델 계약:
 * studio-publish-verdict). 검토 중이면 다음 피드백·판단 시점을, 판정이
 * 끝나면 클로징 메시지를 반드시 보여주고, 학습·챌린지는 상한과 포트폴리오
 * 보존 안내를 처음부터 함께 표시한다.
 */
export function StudioPublishVerdictCard({ verdict }: StudioPublishVerdictCardProps) {
  const view = useMemo(() => resolvePublishVerdictView(verdict), [verdict]);

  return (
    <div
      data-studio-publish-verdict={view.status}
      className="mt-4 rounded-xl border border-line bg-card/65 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold",
            STATUS_CHIP_CLASS[view.status],
          )}
        >
          <VerdictStatusIcon status={view.status} />
          현재 상태: {view.statusLabel}
        </span>
        <p className="min-w-0 text-sm font-semibold text-fg">{view.headline}</p>
      </div>

      {view.nextFeedbackLabel ? (
        <p className="mt-2.5 flex items-start gap-1.5 text-sm leading-relaxed text-fg-2">
          <CalendarClock size={14} aria-hidden className="mt-0.5 shrink-0 text-accent" />
          <span>{view.nextFeedbackLabel}</span>
        </p>
      ) : null}

      {view.capsLabel ? (
        <p className="mt-2 flex items-start gap-1.5 text-sm leading-relaxed text-fg-2">
          <ListChecks size={14} aria-hidden className="mt-0.5 shrink-0 text-fg-3" />
          <span>
            <span className="font-semibold text-fg">상한</span> · {view.capsLabel}
          </span>
        </p>
      ) : null}

      {view.closingMessage ? (
        <p className="mt-2.5 rounded-lg border border-line bg-panel/60 px-3 py-2 text-sm leading-relaxed text-fg-2">
          {view.closingMessage}
        </p>
      ) : null}

      {view.portfolioNote ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <p className="flex min-w-0 flex-1 items-start gap-1.5 text-sm leading-relaxed text-fg-2">
            <FolderOpen size={14} aria-hidden className="mt-0.5 shrink-0 text-fg-3" />
            <span>{view.portfolioNote}</span>
          </p>
          {view.portfolioHref ? (
            <Link
              href={view.portfolioHref}
              className={buttonClass({ size: "sm", variant: "outline", className: "min-h-11 gap-1.5" })}
            >
              <FolderOpen size={14} aria-hidden />
              포트폴리오에서 보기
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
