import { Check, CircleHelp, Minus } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { Badge } from "./chip";

/**
 * 정직 표기 배지 — "확인한 것"과 "짐작한 것"과 "확인하지 못한 것"을 색이 아니라 **글자와 모양**으로 가른다.
 *
 * 저장소 곳곳에 같은 약속이 따로따로 있다(출처 안내 쪽의 사용/부분/준비, 접근성 안내의 3상태, 추정 지표의 ≈).
 * 이 배지는 그 약속을 한 모양으로 모은 것이다: 확인됨은 근거를 직접 대조했을 때만, 추정은 단서가 일부만 겹칠 때,
 * 확인 못 함은 근거가 없을 때. 상태를 올려 말하지 않는 것이 이 컴포넌트의 계약이다 — 호출부가 `level` 을 정한다.
 */
export type HonestyLevel = "confirmed" | "estimated" | "unverified";

const TONE = { confirmed: "good", estimated: "warn", unverified: "neutral" } as const;

const ICON = { confirmed: Check, estimated: CircleHelp, unverified: Minus } as const;

const COPY: Record<HonestyLevel, readonly [string, string]> = {
  confirmed: ["확인된 일치", "Confirmed match"],
  estimated: ["추정 일치", "Estimated match"],
  unverified: ["확인 못 함", "Not verified"],
};

export interface HonestyBadgeProps {
  readonly level: HonestyLevel;
  /** 기본 문구 대신 쓸 문구(예: "확인된 정보"). 상태 의미는 `level` 이 정한다. */
  readonly label?: string;
  readonly className?: string;
}

export function HonestyBadge({ level, label, className }: HonestyBadgeProps) {
  const bt = useBilingual("HonestyBadge");
  const Icon = ICON[level];
  return (
    <Badge tone={TONE[level]} className={cn("whitespace-nowrap", className)}>
      <span data-honesty-level={level} className="inline-flex items-center gap-1">
        <Icon size={12} aria-hidden="true" />
        {label ?? bt(...COPY[level])}
      </span>
    </Badge>
  );
}
