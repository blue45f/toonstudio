import { BookOpenText } from "lucide-react";

import { PRODUCTION_PROCESS_LABELS } from "./production-labels";
import { ProductionPill } from "./production-ui";
import {
  playbookCardsForProcess,
  type PlaybookRuleCard,
} from "./team-playbook-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 공정 참조 스트립 (REPORT T-2) — 에디터·공정 화면용.
 *
 * 관련 공정을 열면 그 공정에 붙은 플레이북 규칙이 "조용히 참조로"
 * 뜬다. 해당 규칙이 없으면 아무것도 렌더하지 않는다(null) — 규칙이
 * 없는 프로젝트의 작업 동선을 플레이북이 방해하지 않기 위해서다.
 * 기본은 접힌 한 줄 요약이고, 펼치면 카드 본문까지 보인다.
 * 표시 전용이다: 여기서 규칙을 고치거나 상태를 바꾸지 않는다.
 */
export function PlaybookProcessReference({
  cards,
  processKey,
  maxCards = 3,
  className,
}: {
  readonly cards: readonly PlaybookRuleCard[];
  /** 현재 화면의 공정 키. 레거시 키(story·thumbnail)도 canonical로 해석한다. */
  readonly processKey: string;
  readonly maxCards?: number;
  readonly className?: string;
}) {
  const bt = useBilingual("PlaybookProcessReference");
  const relevant = playbookCardsForProcess(cards, processKey);
  if (relevant.length === 0) return null;

  const shown = relevant.slice(0, Math.max(1, maxCards));
  const hiddenCount = relevant.length - shown.length;
  const processLabel = PRODUCTION_PROCESS_LABELS[processKey];

  return (
    <details
      className={cn(
        "rounded-xl border border-accent/30 bg-accent-soft px-3 py-2",
        className,
      )}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-1.5 text-xs font-semibold text-fg">
        <BookOpenText className="size-3.5 text-accent" aria-hidden="true" />
        {bt(
          `이 공정의 팀 규칙 ${relevant.length}장`,
          `${relevant.length} team rule(s) for this process`,
        )}
        {processLabel ? (
          <ProductionPill tone="accent">
            {bt(processLabel.ko, processLabel.en)}
          </ProductionPill>
        ) : null}
        <span className="font-normal text-fg-3">
          {bt("펼쳐서 확인", "Expand to read")}
        </span>
      </summary>
      <ul className="mt-2 space-y-2">
        {shown.map((card) => (
          <li key={card.id} className="rounded-lg border border-line bg-panel p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-xs font-semibold leading-5 text-fg">
                {bt(card.title.ko, card.title.en)}
              </p>
              {card.source === "pin-pattern" ? (
                <ProductionPill tone="accent">
                  {bt("검수 핀 승격", "From review pins")}
                </ProductionPill>
              ) : null}
              {card.processKeys.length === 0 ? (
                <ProductionPill>{bt("전 공정 공통", "All processes")}</ProductionPill>
              ) : null}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-fg-2">
              {bt(card.body.ko, card.body.en)}
            </p>
            {card.evidenceThreadIds.length > 0 ? (
              <p className="mt-1 text-[0.6875rem] leading-4 text-fg-3">
                {bt(
                  `근거 검수 핀 ${card.evidenceThreadIds.length}건`,
                  `${card.evidenceThreadIds.length} evidence pin(s)`,
                )}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="mt-2 text-[0.6875rem] leading-4 text-fg-3">
          {bt(
            `외 ${hiddenCount}장은 팀 플레이북에서 볼 수 있어요.`,
            `${hiddenCount} more in the team playbook.`,
          )}
        </p>
      ) : null}
    </details>
  );
}
