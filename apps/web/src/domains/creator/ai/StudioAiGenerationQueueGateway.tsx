import { ChevronDown, Sparkles } from "lucide-react";
import { Suspense, useState } from "react";

import type { StudioAiGenerationQueuePanelProps } from "./StudioAiGenerationQueuePanel";

import { lazyRetry } from "@/shared/lib/lazy-retry";
import { cn } from "@/shared/lib/utils";

const LazyStudioAiGenerationQueuePanel = lazyRetry(
  () =>
    import("./StudioAiGenerationQueuePanel").then((mod) => ({
      default: mod.StudioAiGenerationQueuePanel,
    })),
  "StudioAiGenerationQueuePanel",
);

export interface StudioAiGenerationQueueGatewayProps
  extends Omit<StudioAiGenerationQueuePanelProps, "className"> {
  readonly defaultOpen?: boolean;
  readonly className?: string;
}

/**
 * 에디터 초기 청크에서 AI 생성 큐 구현을 분리하는 지연 마운트 게이트웨이.
 * 사용자가 생성 큐 섹션을 열 때만 `StudioAiGenerationQueuePanel`과 영속 스토어를 동적 로드한다.
 */
export function StudioAiGenerationQueueGateway({
  defaultOpen = false,
  className,
  ...panelProps
}: StudioAiGenerationQueueGatewayProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      data-studio-ai-generation-queue-gateway="true"
      className={cn("rounded-xl border border-line bg-card/55", className)}
    >
      <button
        type="button"
        aria-expanded={open}
        data-studio-ai-generation-queue-toggle="true"
        onClick={() => setOpen((prev) => !prev)}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-bold text-fg transition-colors hover:bg-raised/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Sparkles size={14} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="truncate">AI 생성 검토 큐</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] font-semibold text-accent">
            비파괴 초안
          </span>
        </span>
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-fg-3 transition-transform duration-150 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-line/70 p-2">
          <Suspense
            fallback={
              <div
                aria-busy="true"
                aria-label="AI 생성 큐 불러오는 중"
                className="space-y-2 p-2"
              >
                <div className="h-4 w-36 rounded bg-raised motion-safe:animate-pulse" />
                <div className="h-14 w-full rounded-xl bg-raised/75 motion-safe:animate-pulse" />
              </div>
            }
          >
            <LazyStudioAiGenerationQueuePanel {...panelProps} />
          </Suspense>
        </div>
      ) : null}
    </div>
  );
}
