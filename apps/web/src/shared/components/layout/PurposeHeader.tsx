import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

import { LAYOUT_TOKENS } from "./layout-tokens";

export interface PurposeHeaderProps {
  /** 현재 위치/단계 (eyebrow). */
  eyebrow?: ReactNode;
  /** 페이지 목적 한 문장 — 이 페이지의 유일한 h1로 렌더된다. */
  title: ReactNode;
  /** 설명 1줄. */
  description?: ReactNode;
  /** 주 행동 — 최대 1개만 받는 단일 슬롯이다(BLUEPRINT §3.1). */
  primaryAction?: ReactNode;
  /** 부 행동 — 최대 2개를 한 노드로 묶어 전달한다. 3개 이상 늘리지 않는다. */
  secondaryActions?: ReactNode;
  className?: string;
}

/**
 * 목적 헤더 (BLUEPRINT §3.1 템플릿 계약의 첫 슬롯).
 * eyebrow + H1(목적 한 문장) + 설명 1줄 + 주 행동 최대 1개·부 행동 최대 2개.
 * 주 행동을 배열이 아닌 단일 슬롯으로 받는 것이 "행동은 하나만 앞세운다"는
 * 계약을 타입 수준에서 강제하는 장치다.
 */
export function PurposeHeader({
  eyebrow,
  title,
  description,
  primaryAction,
  secondaryActions,
  className,
}: PurposeHeaderProps) {
  const hasActions = primaryAction != null || secondaryActions != null;
  return (
    <header className={cx("mb-6 sm:mb-8", className)}>
      {eyebrow != null && <p className={LAYOUT_TOKENS.type.eyebrow}>{eyebrow}</p>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1
            className={cx(
              "font-display text-3xl leading-tight font-black tracking-tight text-fg break-keep text-balance sm:text-4xl",
              eyebrow != null && "mt-2",
            )}
          >
            {title}
          </h1>
          {description != null && (
            <p className="mt-2 max-w-3xl text-base leading-7 text-fg-2 break-keep text-pretty">
              {description}
            </p>
          )}
        </div>
        {hasActions && (
          <div className="flex flex-wrap items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
    </header>
  );
}
