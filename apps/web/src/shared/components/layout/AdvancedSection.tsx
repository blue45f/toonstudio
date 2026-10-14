import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cx } from "@/shared/lib/cx";

export interface AdvancedSectionProps {
  /** 접힌 상태에서도 보이는 제목. */
  title: ReactNode;
  /** 제목 아래 한 줄 설명 (선택). */
  description?: ReactNode;
  /** 제목 왼쪽 아이콘 노드 (선택) — 아이콘 컴포넌트 자체가 아니라 렌더된 노드를 받는다. */
  icon?: ReactNode;
  /** 펼쳤을 때만 렌더되는 본문. 접혀 있는 동안은 마운트되지 않는다(지연 계산 보존). */
  children: ReactNode;
  /** 처음부터 펼친 상태로 시작할지. 기본은 접힘(BLUEPRINT §3.1 고급 구역). */
  defaultOpen?: boolean;
  /** 펼침 상태가 바뀔 때 통지 (선택). */
  onToggle?: (open: boolean) => void;
  className?: string;
  /** 본문 래퍼 클래스 — 기본값은 개요 파일럿의 운영 상세와 같은 리듬이다. */
  contentClassName?: string;
  /**
   * 표면 프리셋. card(기본)는 개요 운영 상세의 카드 리듬, panel은 설정 화면처럼
   * 옅은 패널 배경 위에 얹는 변형이다(S3-3 설정 파일럿).
   */
  preset?: "card" | "panel";
  /**
   * 접힌 상태에서도 본문을 DOM에 유지한다. 링크·검색 동선이 접힌 구역 안의
   * 대상을 그대로 가리켜야 할 때(관련 설정 나열 등)만 켠다. 브라우저는 닫힌
   * details의 본문을 화면·접근성 트리에서 숨기므로 시각 동작은 같다.
   */
  keepMounted?: boolean;
  /** 루트 <details>로 그대로 전달되는 data-* 속성(예: data-related-settings). */
  [dataAttribute: `data-${string}`]: string | undefined;
}

/**
 * 고급 구역 (BLUEPRINT §3.1) — 기본 접힘, `<details>` 패턴 공용 부품.
 * 접혀 있는 동안 children을 마운트하지 않으므로, 펼칠 때만 계산하는
 * 비싼 상세를 그대로 안에 넣어도 된다(프로젝트 개요 운영 상세가 원형).
 */
export function AdvancedSection({
  title,
  description,
  icon,
  children,
  defaultOpen = false,
  onToggle,
  className,
  contentClassName,
  preset = "card",
  keepMounted = false,
  ...dataAttributes
}: AdvancedSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      {...dataAttributes}
      className={cx(
        "group rounded-2xl border border-line",
        preset === "panel" ? "bg-panel/40" : "bg-card",
        className,
      )}
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        setOpen(next);
        onToggle?.(next);
      }}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-3">
          {icon != null && (
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">{icon}</span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-black text-fg">{title}</span>
            {description != null && <span className="block truncate text-xs text-fg-3">{description}</span>}
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </summary>
      {open || keepMounted ? (
        <div className={cx("space-y-4 border-t border-line p-4", contentClassName)}>{children}</div>
      ) : null}
    </details>
  );
}
