/**
 * MembershipTierCard.tsx
 *
 * 독자 문법의 티어 카드 — 가입 화면(MembershipJoinDialog)이 독자에게
 * 보여주는 구성(티어 이름·월 가격·소개·혜택 이름+설명)을 그대로 카드로 옮겼다.
 * 창작자 페이지의 티어 목록과 독자 뷰 미리보기가 이 카드를 공유하므로
 * 작가가 보는 카드와 독자가 보는 카드가 어긋날 수 없다.
 */
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import {
  MEMBERSHIP_PERK_IDS,
  formatMembershipKrw,
  type MembershipTier,
} from "../models/membership-model";

export function MembershipTierCard({
  tier,
  index,
  footer,
  highlighted = false,
  className,
}: {
  readonly tier: MembershipTier;
  /** 표시 순서 (0부터). "티어 N" eyebrow에 쓴다. */
  readonly index: number;
  /** 카드 하단 조작 영역 (창작자 모드에서만 전달). */
  readonly footer?: ReactNode;
  /** 지금 편집 중인 티어면 강조 테두리. */
  readonly highlighted?: boolean;
  readonly className?: string;
}) {
  const t = useT();
  const perks = MEMBERSHIP_PERK_IDS.filter((perk) => tier.perks.includes(perk));

  return (
    <article
      className={cn(
        "flex h-full flex-col rounded-2xl border bg-panel/50 p-5",
        highlighted ? "border-accent/60" : "border-line",
        className,
      )}
    >
      <p className="text-[0.68rem] font-bold uppercase tracking-widest text-accent">
        {t("membership.tierCard.tierLabel", { index: index + 1 })}
      </p>
      <h3 className="mt-1.5 text-lg font-bold text-fg">{tier.name}</h3>
      <p className="mt-1">
        <span className="text-3xl font-bold tracking-tight tabular-nums text-fg">
          {formatMembershipKrw(tier.monthlyPriceKrw)}
        </span>
        <span className="text-sm text-muted">{t("membership.tierCard.perMonth")}</span>
      </p>
      {tier.description ? (
        <p className="mt-2 text-sm leading-relaxed text-muted">{tier.description}</p>
      ) : null}
      <ul className="mt-3 space-y-1.5">
        {perks.map((perk) => (
          <li key={perk} className="flex items-start gap-2 text-sm text-fg">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
            <span>
              <strong className="font-semibold">{t(`membership.perk.${perk}`)}</strong>
              <span className="text-muted"> — {t(`membership.perk.${perk}Description`)}</span>
            </span>
          </li>
        ))}
      </ul>
      {footer ? <div className="mt-auto pt-4">{footer}</div> : null}
    </article>
  );
}
