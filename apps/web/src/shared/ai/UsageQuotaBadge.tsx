/**
 * 사용량 쿼터 배지 — 행동하기 전에 잔여 횟수를 보여주는 공통 표시.
 *
 * 배치 원칙: 전송·생성 버튼이 있는 입력 영역 바로 위/옆에 상시 노출한다.
 * 설정 화면 깊숙이 숨기지 않는다(투닝의 일일 횟수 표시가 요금표에만 있던
 * 방식과 달리, 쓰는 자리에서 보여주는 것이 이 항목의 완료 기준이다).
 *
 * - plenty: 작은 텍스트 + 얇은 진행바 (방해하지 않음)
 * - low/critical: 진행바에 경고색, 보조 문구 노출
 * - exhausted: role="alert" 안내 박스 — 초기화 시점 + 대안 행동 + (있으면) 키 등록 버튼
 * - unlimited: 한 줄 고지 (숫자를 지어내지 않음)
 * - unknown: 아무것도 그리지 않는다 (모르는 숫자를 보여주느니 안 보여준다)
 */

import { Gauge } from "lucide-react";

import { getLang } from "@/shared/lib/i18n-core";
import { cn } from "@/shared/lib/utils";

import type { UsageQuotaView } from "./usage-quota";

export function UsageQuotaBadge({
  view,
  onOpenAiSettings,
  className,
}: {
  readonly view: UsageQuotaView;
  /** exhausted 안내의 대안 행동 — AI 키 등록 화면으로 보내는 동선(있을 때만 버튼 표시). */
  readonly onOpenAiSettings?: () => void;
  readonly className?: string;
}) {
  if (view.state === "unknown") return null;

  const locale = getLang().startsWith("en") ? "en" : "ko";
  const copy = view.copy[locale];
  const percent = view.usedRatio === null ? null : Math.round(view.usedRatio * 100);

  if (view.state === "unlimited") {
    return (
      <p className={cn("flex items-center gap-1.5 text-xs text-fg-3", className)}>
        <Gauge size={13} aria-hidden className="shrink-0" />
        <span>{copy.headline}</span>
      </p>
    );
  }

  if (view.state === "exhausted") {
    return (
      <div
        role="alert"
        aria-label={copy.ariaLabel}
        className={cn("rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3", className)}
      >
        <p className="text-xs font-bold text-fg">{copy.headline}</p>
        <p className="mt-1 text-xs leading-relaxed text-fg-2">{copy.detail}</p>
        {onOpenAiSettings ? (
          <button
            type="button"
            onClick={onOpenAiSettings}
            className="mt-2 min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg hover:border-accent/50 hover:text-accent"
          >
            {locale === "ko" ? "내 AI 키 등록하러 가기" : "Register my AI key"}
          </button>
        ) : null}
      </div>
    );
  }

  const barTone =
    view.state === "critical"
      ? "bg-bad"
      : view.state === "low"
        ? "bg-warn"
        : "bg-accent";

  return (
    <div className={cn("flex flex-col gap-1", className)} aria-label={copy.ariaLabel}>
      <p className="flex items-center gap-1.5 text-xs text-fg-3">
        <Gauge size={13} aria-hidden className="shrink-0" />
        <span className={view.state === "critical" ? "font-bold text-bad" : undefined}>
          {copy.headline}
        </span>
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={view.limit ?? undefined}
        aria-valuenow={view.used}
        aria-label={copy.ariaLabel}
        className="h-1.5 overflow-hidden rounded-full bg-panel-2"
      >
        <div className={cn("h-full rounded-full", barTone)} style={{ width: `${percent ?? 0}%` }} />
      </div>
      {copy.detail ? <p className="text-[0.7rem] leading-relaxed text-fg-3">{copy.detail}</p> : null}
    </div>
  );
}
