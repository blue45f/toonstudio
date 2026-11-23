import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export function StudioPressureHudMeter({
  ratio,
  className,
}: {
  /** 펜 입력이 없을 때는 null, 필압이 있으면 0~1. */
  ratio: number | null;
  className?: string;
}): ReactElement | null {
  if (ratio === null) return null;
  const pct = Math.round(ratio * 100);
  return (
    <span
      data-studio-pressure-meter="true"
      role="meter"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap [word-break:keep-all] rounded-full border border-line/70 bg-card/80 px-1.5 py-0.5",
        className
      )}
      aria-label="실시간 필압"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <span className="relative h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-raised ring-1 ring-line/50">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-75"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="min-w-[2.25rem] shrink-0 text-right tabular-nums text-[0.58rem] font-bold text-fg-2">{pct}%</span>
    </span>
  );
}
