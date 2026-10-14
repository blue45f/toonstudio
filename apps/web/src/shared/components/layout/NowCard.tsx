import { useState, type ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

/** 지금 할 일 카드의 강조 톤 — 도출 규칙의 긴급도를 색으로 옮긴다. */
export type NowCardTone = "default" | "danger" | "warning" | "success";

/**
 * "지금 할 일" 데이터 계약 (BLUEPRINT §3.2).
 * 표면은 이 형태로 다음 행동 하나만 도출해 넘긴다 — 카드가 여러 개 쌓이는
 * "알림 벽"이 되지 않도록, 표면당 NowCard는 1개가 원칙이다.
 * `action`은 대상 표면으로 가는 노드(Link/버튼)를 호출자가 렌더해 넘긴다
 * (라우팅·i18n은 호출자 소유, PurposeHeader의 행동 슬롯과 같은 규약).
 */
export interface NowCardData {
  /** 다음 행동 한 문장. */
  title: ReactNode;
  /** 왜 지금인지 한 줄. */
  reason: ReactNode;
  /** 대상 표면으로 가는 행동 노드 — 최대 1개. */
  action: ReactNode;
  /** 진척 한 줄 (선택). */
  progress?: ReactNode;
}

export interface NowCardProps extends NowCardData {
  /** eyebrow 라벨 — 호출자가 지역화해 넘긴다 (예: "지금 할 일"). */
  eyebrow: ReactNode;
  tone?: NowCardTone;
  /** 닫기 가능 여부. true면 onDismiss와 함께 쓴다. */
  dismissible?: boolean;
  onDismiss?: () => void;
  /** 닫기 버튼의 접근성 이름 — 호출자가 지역화해 넘긴다. */
  dismissLabel?: string;
  className?: string;
}

const TONE_CLASS: Readonly<Record<NowCardTone, string>> = {
  default: "border-accent/40 bg-card",
  danger: "border-bad/40 bg-bad/10",
  warning: "border-warn/40 bg-warn/10",
  success: "border-good/40 bg-good/10",
};

/**
 * 지금 할 일 카드 (BLUEPRINT §3.1 "지금 할 일" 슬롯 · §3.2 계약).
 * 목적 헤더 바로 아래 전용 슬롯에만 둔다. dismiss 상태는 내부에서만 들고,
 * 닫힘 자체를 영속화하지 않는다(표면이 필요하면 onDismiss에서 처리).
 */
export function NowCard({
  eyebrow,
  title,
  reason,
  action,
  progress,
  tone = "default",
  dismissible = false,
  onDismiss,
  dismissLabel,
  className,
}: NowCardProps) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div data-now-card={tone} className={cx("relative rounded-2xl border p-4", TONE_CLASS[tone], className)}>
      <p className="text-[0.6875rem] font-black uppercase tracking-[0.12em] text-fg-3">{eyebrow}</p>
      <p className="mt-1 text-base font-black text-fg">{title}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-fg-2">{reason}</p>
      {progress != null && <p className="mt-1 text-xs font-bold text-fg-2">{progress}</p>}
      <div className="mt-3">{action}</div>
      {dismissible && (
        <button
          type="button"
          aria-label={dismissLabel}
          onClick={() => {
            setDismissed(true);
            onDismiss?.();
          }}
          className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg text-fg-3 outline-none transition-colors hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
        >
          {/* 닫기 글리프는 인라인 SVG로 그린다 — lucide `X`를 새로 끌어오면
              이 카드를 쓰는 표면의 진입 청크가 아이콘 1개분 늘어나
              §7.3 "진입 청크 증가 0" 판정을 깬다. 경로는 lucide x와 동일. */}
          <svg
            className="size-4"
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
