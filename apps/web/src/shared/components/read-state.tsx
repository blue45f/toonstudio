import { Bookmark, BookOpen, CheckCircle2, Clock3, PauseCircle, XCircle } from "lucide-react";

import type { ReadState } from "@/shared/lib/types";

import { useApp, useHydrated } from "@/shared/lib/store";
import { toast } from "@/shared/lib/toast-store";
import { cn } from "@/shared/lib/utils";

const OPTS: {
  state: ReadState;
  label: string;
  icon: typeof Bookmark;
  activeClass: string;
}[] = [
  { state: "want", label: "관심", icon: Bookmark, activeClass: "border-accent/55 bg-accent-soft text-accent" },
  { state: "reading", label: "보는 중", icon: BookOpen, activeClass: "border-cool/55 bg-cool/15 text-cool" },
  { state: "paused", label: "보류", icon: PauseCircle, activeClass: "border-warn/55 bg-warn/15 text-warn" },
  { state: "hiatus", label: "휴재 대기", icon: Clock3, activeClass: "border-accent-2/55 bg-accent-2/15 text-accent-2" },
  { state: "done", label: "완독", icon: CheckCircle2, activeClass: "border-good/55 bg-good/15 text-good" },
  { state: "dropped", label: "하차", icon: XCircle, activeClass: "border-bad/50 bg-bad/12 text-bad" },
];

export function ReadStateSelector({ titleId, className }: { titleId: string; className?: string }) {
  const hydrated = useHydrated();
  const current = useApp((s) => s.reads[titleId]);
  const setRead = useApp((s) => s.setRead);

  return (
    <div
      role="group"
      aria-label="읽기 상태 선택"
      className={cn("grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6", className)}
    >
      {OPTS.map((o) => {
        const active = hydrated && current === o.state;
        return (
          <button
            key={o.state}
            type="button"
            data-testid={`read-state-btn-${o.state}`}
            onClick={() => {
              const next = active ? null : o.state;
              setRead(titleId, next);
              toast(next ? `'${o.label}'(으)로 표시했어요` : `'${o.label}' 표시를 해제했어요`, {
                tone: next ? "success" : "default",
              });
            }}
            aria-pressed={active}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition-[transform,border-color,background-color,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none",
              active
                ? o.activeClass
                : "border-line bg-card text-fg-3 hover:border-line-strong hover:text-fg-2",
            )}
          >
            <o.icon size={16} aria-hidden="true" />
            <span className="break-keep">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
