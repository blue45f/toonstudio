import { ArrowLeft, Undo2, X } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  describeReturnContext,
  parseReturnContext,
  type ReturnContext,
} from "@/shared/navigation/return-context";
import Link from "@/shared/navigation/router-link";
import { useI18n } from "@/shared/lib/i18n";

const buttonClass =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 lg:min-h-9";

/**
 * 복귀 맥락 배너의 표시 전용 뷰 (BLUEPRINT §2.4 도착 표면 규칙).
 *
 * (a) 맥락 한 줄 — 왜 이 표면에 왔는지(`describeReturnContext`의 문형만 쓴다),
 * (b) 복귀 행동 하나 — 끝나면 떠난 표면으로 돌아가는 링크.
 * 학습 미션 바와 같은 자리·문형을 쓰며, 맥락이 없으면 아무것도 렌더하지 않는다.
 */
export function ReturnContextBannerView({
  context,
  lang,
  onDismiss,
}: {
  readonly context: ReturnContext;
  readonly lang: "ko" | "en";
  readonly onDismiss: () => void;
}) {
  const { title, returnLabel } = describeReturnContext(context, lang);
  const hasWorkContext = Boolean(context.projectId || context.episodeId);
  return (
    <section
      aria-label={lang === "ko" ? "복귀 맥락" : "Return context"}
      data-return-context-banner={context.intent}
      {...(context.stageId ? { "data-return-context-stage": context.stageId } : {})}
      className="pointer-events-auto absolute inset-x-2 bottom-[calc(var(--studio-canvas-bottom-inset,7rem)+0.5rem)] z-40 mx-auto flex w-auto max-w-[680px] flex-col gap-2 rounded-xl border border-line bg-panel/95 px-3 py-2.5 shadow-xl backdrop-blur lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-3 lg:w-[min(92vw,680px)] lg:-translate-x-1/2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[0.7rem] font-bold text-accent">
            <Undo2 size={14} aria-hidden /> {title}
          </p>
          {hasWorkContext ? (
            <p className="mt-0.5 text-[0.7rem] leading-relaxed text-fg-3">
              {lang === "ko"
                ? "떠난 표면의 프로젝트·회차 맥락이 이어져 있어요."
                : "The project and episode context from the surface you left carries over."}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className={buttonClass}
          aria-label={lang === "ko" ? "복귀 맥락 안내 닫기" : "Dismiss return context"}
          onClick={onDismiss}
        >
          <X size={14} aria-hidden /> {lang === "ko" ? "닫기" : "Dismiss"}
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={context.returnTo} className={buttonClass}>
          <ArrowLeft size={14} aria-hidden /> {returnLabel}
        </Link>
      </div>
    </section>
  );
}

/**
 * 주소의 복귀 맥락 계약을 읽어 배너를 띄우는 셸 장착용 래퍼.
 *
 * 학습 실습 진입(`practice=lesson`)에서는 미션 바가 같은 자리를 맡으므로 양보한다.
 * 레거시 마켓 복귀(`marketReturn`만 있는 진입)는 기존 `StudioMarketplaceReturnNotice`가
 * 맡고, 이 배너는 명시 계약이 실린 진입부터 담당한다 — 복귀 행동이 둘이 되지 않게 한다.
 */
export function ReturnContextBanner() {
  const [params] = useSearchParams();
  const lang = useI18n((state) => (state.lang.startsWith("ko") ? "ko" : "en"));
  const [dismissed, setDismissed] = useState(false);

  if (params.get("practice") === "lesson") return null;
  const context = parseReturnContext(params);
  if (!context || dismissed) return null;

  return <ReturnContextBannerView context={context} lang={lang} onDismiss={() => setDismissed(true)} />;
}
