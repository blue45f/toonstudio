import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/shared/lib/utils";

export interface UnderlineTabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly count?: number;
}

/**
 * 발견 표면 공용 탭 바 — 활성 탭 아래에 layoutId 언더라인이 이동한다.
 * 커뮤니티 홈 활동 미리보기와 이벤트 보드가 같은 탭 문법을 쓴다.
 * reduced-motion 환경에서는 언더라인 이동 애니메이션을 끄고 정적으로 표시한다.
 */
export function CommunityUnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  layoutId,
  ariaLabel,
}: {
  items: readonly UnderlineTabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  layoutId: string;
  ariaLabel: string;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="scrollbar-none -mb-px flex gap-1 overflow-x-auto border-b border-line"
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative min-h-11 shrink-0 px-3.5 pb-2.5 pt-2 text-sm font-bold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active ? "text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span className={cn("ml-1.5 text-xs font-black", active ? "text-accent" : "text-fg-3")}>
                {item.count}
              </span>
            ) : null}
            {active ? (
              reduceMotion ? (
                <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
              ) : (
                <motion.span
                  aria-hidden="true"
                  layoutId={layoutId}
                  className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 480, damping: 38 }}
                />
              )
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
