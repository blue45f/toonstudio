import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/shared/lib/utils";

export interface UnderlineTabItem<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly count?: number;
}

const INK_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };

/**
 * 커뮤니티 공용 잉크 언더라인 바 — 활성 항목 아래로 2px 잉크 선이 미끄러지며 이동한다.
 * `mode="tabs"`는 단일 탭패널과 짝을 이루는 `tablist`/`tab` 패턴에 쓰고,
 * `mode="group"`은 `전체 보기`처럼 복수 구역을 여는 토글 버튼 묶음(`group` + `aria-pressed`)에 쓴다.
 */
export function CommunityUnderlineTabs<T extends string>({
  items,
  value,
  onChange,
  layoutId,
  ariaLabel,
  mode = "tabs",
  className,
}: {
  items: readonly UnderlineTabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  layoutId: string;
  ariaLabel: string;
  mode?: "tabs" | "group";
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const isTabs = mode === "tabs";
  return (
    <div
      role={isTabs ? "tablist" : "group"}
      aria-label={ariaLabel}
      className={cn("scrollbar-none flex gap-1 overflow-x-auto border-b border-line", className)}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role={isTabs ? "tab" : undefined}
            aria-selected={isTabs ? active : undefined}
            aria-pressed={isTabs ? undefined : active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative min-h-11 shrink-0 whitespace-nowrap px-3.5 pb-2.5 pt-2 text-sm transition-colors duration-150 motion-reduce:transition-none",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              active ? "font-semibold text-fg" : "font-medium text-fg-3 hover:text-fg-2",
            )}
          >
            {item.label}
            {typeof item.count === "number" ? (
              <span className={cn("ml-1.5 text-xs font-medium tabular-nums", active ? "text-accent" : "text-fg-3")}>
                {item.count}
              </span>
            ) : null}
            {active ? (
              reduceMotion ? (
                <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-0.5 bg-accent" />
              ) : (
                <motion.span
                  aria-hidden="true"
                  layoutId={layoutId}
                  className="absolute inset-x-2 bottom-0 h-0.5 bg-accent"
                  transition={INK_TRANSITION}
                />
              )
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
