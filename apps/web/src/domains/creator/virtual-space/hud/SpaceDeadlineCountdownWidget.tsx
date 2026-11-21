import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { SpaceDeadlineWidget } from "../crdt/studio-virtual-space-yjs-doc";
import { defaultEpisodeDeadlineIso, formatDeadlineCountdown } from "./space-deadline-countdown-model";

export function SpaceDeadlineCountdownWidget({
  deadlines,
  fallbackTargetIso,
  fallbackTitle,
  canEdit = false,
  compact = false,
  onUpsertDeadline,
}: {
  readonly deadlines: readonly SpaceDeadlineWidget[];
  readonly fallbackTargetIso?: string | null;
  readonly fallbackTitle?: string | null;
  readonly canEdit?: boolean;
  readonly compact?: boolean;
  readonly onUpsertDeadline?: (input: { readonly episodeLabel: string; readonly title: string; readonly targetIso: string }) => void;
}) {
  const bt = useBilingual("SpaceDeadlineCountdownWidget");
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftEpisode, setDraftEpisode] = useState("EP.01");
  const [draftDays, setDraftDays] = useState("3");

  useEffect(() => {
    const id = globalThis.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => globalThis.clearInterval(id);
  }, []);

  const primary = deadlines[0] ?? {
    id: "default-deadline",
    episodeLabel: "EP",
    title: fallbackTitle || bt("이번 주 원고 마감", "Weekly episode deadline"),
    targetIso: fallbackTargetIso || defaultEpisodeDeadlineIso(nowMs),
    updatedAt: nowMs,
  };
  const countdown = formatDeadlineCountdown(primary.targetIso, nowMs);

  if (compact) {
    return (
      <div
        data-testid="space-deadline-countdown"
        data-space-interactive="true"
        data-overdue={countdown.overdue || undefined}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line bg-panel/95 px-3 text-xs text-fg shadow-sm backdrop-blur-md"
        aria-label={bt(`${primary.title} 마감 카운트다운`, `${primary.title} deadline countdown`)}
      >
        <CalendarClock size={14} className={`shrink-0 ${countdown.overdue ? "text-bad" : "text-accent"}`} aria-hidden />
        <strong className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{countdown.dDayLabel}</strong>
        <span className="shrink-0 whitespace-nowrap font-mono text-[11px] tabular-nums text-fg-2">{countdown.clockLabel}</span>
        <span className="max-w-36 truncate whitespace-nowrap text-fg-2">{primary.title}</span>
      </div>
    );
  }

  return (
    <section
      data-testid="space-deadline-countdown"
      className="space-y-2 rounded-xl border border-line bg-panel p-3 text-xs text-fg"
      aria-label={bt("에피소드 마감 카운트다운", "Episode deadline countdown")}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarClock size={15} className={countdown.overdue ? "text-bad" : "text-accent"} aria-hidden />
          <div>
            <p className="text-[11px] font-medium text-fg-2">{primary.episodeLabel}</p>
            <strong className="text-xs font-semibold text-fg">{primary.title}</strong>
          </div>
        </div>
        <div className="text-right tabular-nums">
          <strong className={`block text-sm font-bold ${countdown.overdue ? "text-bad" : "text-accent"}`}>
            {countdown.dDayLabel}
          </strong>
          <span className="font-mono text-[11px] text-fg-2">{countdown.clockLabel}</span>
        </div>
      </div>

      {canEdit && onUpsertDeadline ? (
        adding ? (
          <form
            className="space-y-2 border-t border-line pt-2"
            onSubmit={(event) => {
              event.preventDefault();
              const days = Math.max(0.1, Number(draftDays) || 3);
              onUpsertDeadline({
                episodeLabel: draftEpisode || "EP",
                title: draftTitle || bt("에피소드 마감", "Episode deadline"),
                targetIso: new Date(Date.now() + days * 86_400_000).toISOString(),
              });
              setAdding(false);
              setDraftTitle("");
            }}
          >
            <div className="flex gap-1.5">
              <input
                type="text"
                value={draftEpisode}
                onChange={(e) => setDraftEpisode(e.target.value)}
                aria-label={bt("회차", "Episode")}
                className="min-h-11 w-20 rounded-lg border border-line bg-card px-2 text-xs"
              />
              <input
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder={bt("마감 제목", "Deadline title")}
                className="min-h-11 flex-1 rounded-lg border border-line bg-card px-2 text-xs"
              />
              <input
                type="number"
                min={1}
                max={90}
                value={draftDays}
                onChange={(e) => setDraftDays(e.target.value)}
                aria-label={bt("남은 일수", "Days left")}
                className="min-h-11 w-16 rounded-lg border border-line bg-card px-2 text-xs"
              />
            </div>
            <div className="flex justify-end gap-1.5">
              <button type="button" onClick={() => setAdding(false)} className="min-h-11 rounded-lg border border-line px-3 text-xs">
                {bt("취소", "Cancel")}
              </button>
              <button type="submit" className="min-h-11 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent">
                {bt("마감 설정", "Set deadline")}
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-line bg-card px-2.5 text-[11px] font-medium text-fg-2 hover:border-accent hover:text-fg"
          >
            <Plus size={13} aria-hidden />
            {bt("마감 일정 수정", "Edit deadline")}
          </button>
        )
      ) : null}
    </section>
  );
}
