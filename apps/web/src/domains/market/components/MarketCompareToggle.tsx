import { GitCompareArrows } from "lucide-react";

import { useMarketCompare } from "../hooks/use-market-compare";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";
import type { MouseEvent as ReactMouseEvent } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface MarketCompareToggleProps {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly compact?: boolean;
  readonly className?: string;
}

export function MarketCompareToggle({
  record,
  compact = false,
  className,
}: MarketCompareToggleProps) {
  const { isCompared, isFull, toggleCompare } = useMarketCompare();
  const selected = isCompared(record.id);
  const blocked = isFull && !selected;
  const label = selected
    ? "비교 목록에서 제거"
    : blocked
      ? "비교 목록은 최대 4개까지 담을 수 있습니다"
      : "비교 목록에 추가";

  function handleClick(event: ReactMouseEvent<HTMLButtonElement>): void {
    event.preventDefault();
    event.stopPropagation();
    toggleCompare(record);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={blocked}
      aria-label={`${record.name} ${label}`}
      aria-pressed={selected}
      title={label}
      className={
        compact
          ? cn(
              "flex size-11 items-center justify-center rounded-[8px] border border-line/70 bg-canvas/85 text-fg-2 backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)] transition-colors duration-150 hover:border-line-strong hover:text-accent motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-40",
              selected && "border-accent/55 bg-accent/15 text-accent",
              className,
            )
          : buttonClass({
              variant: "outline",
              size: "sm",
              className: cn(
                "gap-1.5 rounded-[8px]",
                selected && "border-accent/45 bg-accent/10 text-accent",
                className,
              ),
            })
      }
    >
      <GitCompareArrows className="size-3.5" aria-hidden="true" />
      {compact ? null : <span>{selected ? "비교 중" : "비교하기"}</span>}
    </button>
  );
}
