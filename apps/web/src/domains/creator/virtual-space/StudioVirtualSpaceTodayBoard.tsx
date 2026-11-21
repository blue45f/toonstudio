import { CalendarClock, CheckCircle2, ClipboardList, Pin, RefreshCw, Route, TriangleAlert } from "lucide-react";
import { useState } from "react";

import Link from "@/shared/navigation/router-link";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { SpaceBulletinItem, SpaceDeadlineWidget } from "./crdt/studio-virtual-space-yjs-doc";
import { SpaceDeadlineCountdownWidget } from "./hud/SpaceDeadlineCountdownWidget";
import { spaceKoParticle } from "./hud/space-korean";
import type { StudioVirtualOperationsSnapshot } from "./use-studio-virtual-space-operations";
import {
  STUDIO_VIRTUAL_PRODUCTION_DESTINATIONS,
  STUDIO_VIRTUAL_TASK_STATUS_LABELS,
  studioVirtualProductionDestination,
  type StudioVirtualProductionDestination,
} from "./studio-virtual-space-production-route";

const ACTIVE_REVIEW = new Set(["internal-review", "external-review", "changes-requested", "conditionally-approved"]);
const BLOCKED_OR_WAITING = new Set(["blocked", "needs-input", "changes-requested"]);
const CLOSED = new Set(["approved", "done", "cancelled", "out-of-scope"]);

type TodayTaskFilter = "all" | "review" | "blocked";

function when(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date) : "—";
}

export function StudioVirtualSpaceTodayBoard({
  snapshot,
  workId,
  onRefresh,
  onGuide,
  deadlines = [],
  bulletins = [],
  canEditBoard = false,
  onUpsertDeadline,
  onAddBulletin,
}: {
  readonly snapshot: StudioVirtualOperationsSnapshot;
  readonly workId: string;
  readonly onRefresh: () => void;
  readonly onGuide?: (destination: StudioVirtualProductionDestination) => void;
  readonly deadlines?: readonly SpaceDeadlineWidget[];
  readonly bulletins?: readonly SpaceBulletinItem[];
  readonly canEditBoard?: boolean;
  readonly onUpsertDeadline?: (input: { readonly episodeLabel: string; readonly title: string; readonly targetIso: string }) => void;
  readonly onAddBulletin?: (title: string, body: string) => void;
}) {
  const bt = useBilingual("StudioVirtualSpaceTodayBoard");
  const locale = bt("ko-KR", "en-US");
  const [taskFilter, setTaskFilter] = useState<TodayTaskFilter>("all");
  const [bulletinTitle, setBulletinTitle] = useState("");
  const [bulletinBody, setBulletinBody] = useState("");
  const aggregate = snapshot.project?.aggregate;
  const totalTasks = aggregate?.tasks.length ?? 0;
  const openTasks = (aggregate?.tasks ?? []).filter((task) => !CLOSED.has(task.status));
  const completionRatePercent = totalTasks > 0 ? Math.round(((totalTasks - openTasks.length) / totalTasks) * 100) : 100;
  const reviews = openTasks.filter((task) => ACTIVE_REVIEW.has(task.status));
  const blockedTasks = openTasks.filter((task) => BLOCKED_OR_WAITING.has(task.status));
  const filteredOpenTasks = openTasks.filter((task) => {
    if (taskFilter === "review") return ACTIVE_REVIEW.has(task.status);
    if (taskFilter === "blocked") return BLOCKED_OR_WAITING.has(task.status);
    return true;
  });
  const nextTasks = [...filteredOpenTasks].sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity)).slice(0, 4);
  const topTask = nextTasks[0] ?? null;
  const calendar = [...snapshot.calendar].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()).slice(0, 3);
  return <section className="vs2-panel studio-vspace-today-board" aria-label={bt("오늘의 스튜디오 보드", "Studio today board")} data-space-interactive="true">
    <header><div><p><CalendarClock size={15} aria-hidden /> TODAY BOARD</p><h2>{aggregate?.title ?? bt("오늘의 제작 동선", "Today's production flow")}</h2></div>
      <button type="button" onClick={onRefresh} aria-label={bt("새로고침", "Refresh")}><RefreshCw size={16} aria-hidden /></button></header>
    {snapshot.phase === "loading" ? <p role="status">{bt("일정과 작업을 불러오는 중…", "Loading schedule and work…")}</p> : null}
    <SpaceDeadlineCountdownWidget
      deadlines={deadlines}
      fallbackTargetIso={topTask?.dueAt ?? null}
      fallbackTitle={aggregate?.title ?? null}
      canEdit={canEditBoard}
      onUpsertDeadline={onUpsertDeadline}
    />
    <section className="space-y-2 rounded-xl border border-line bg-panel p-3 text-xs" aria-label={bt("팀 공지 게시판", "Team bulletin board")}>
      <div className="flex items-center justify-between gap-2">
        <strong className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
          <Pin size={13} aria-hidden />
          {bt("팀 공지 게시판", "Team bulletin")}
        </strong>
        <span className="text-[11px] text-fg-2">{bulletins.length}</span>
      </div>
      {bulletins.length > 0 ? (
        <ul className="space-y-1.5">
          {bulletins.slice(0, 4).map((item) => (
            <li key={item.id} className="rounded-lg border border-line bg-card p-2">
              <strong className="block text-xs text-fg">{item.title}</strong>
              {item.body ? <p className="mt-0.5 text-[11px] text-fg-2">{item.body}</p> : null}
              <small className="text-[11px] text-fg-3">{item.authorName}</small>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-fg-2">{bt("고정된 팀 공지가 없어요. 마감 공지나 검수 요청을 남겨 보세요.", "No team notices yet. Post a deadline reminder or review note.")}</p>
      )}
      {canEditBoard && onAddBulletin ? (
        <form
          className="flex flex-col gap-1.5 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!bulletinTitle.trim()) return;
            onAddBulletin(bulletinTitle, bulletinBody);
            setBulletinTitle("");
            setBulletinBody("");
          }}
        >
          <input
            type="text"
            value={bulletinTitle}
            onChange={(e) => setBulletinTitle(e.target.value)}
            placeholder={bt("공지 제목 입력…", "Notice title…")}
            className="min-h-10 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
          />
          <div className="flex gap-1.5">
            <input
              type="text"
              value={bulletinBody}
              onChange={(e) => setBulletinBody(e.target.value)}
              placeholder={bt("세부 내용(선택)", "Details (optional)")}
              className="min-h-10 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg"
            />
            <button type="submit" className="min-h-10 rounded-lg bg-accent px-3 text-xs font-semibold text-on-accent">
              {bt("게시", "Post")}
            </button>
          </div>
        </form>
      ) : null}
    </section>
    {snapshot.phase === "unavailable" ? <div className="studio-vspace-empty-state"><TriangleAlert size={18} aria-hidden /><p>{bt("프로덕션 일정은 아직 연결되지 않았지만, 위 마감 카운트다운과 팀 게시판은 지금 바로 사용할 수 있어요.", "Production schedule is not linked yet, while the deadline countdown and team bulletin above are live right away.")}</p></div> : null}
    {aggregate ? <>
      <div className="studio-vspace-today-metrics" data-completion-rate={completionRatePercent} data-blocked-count={blockedTasks.length}>
        <span><ClipboardList size={15} aria-hidden /><b>{openTasks.length}</b>{bt("진행 작업", "open tasks")}</span>
        <span><CheckCircle2 size={15} aria-hidden /><b>{reviews.length}</b>{bt("검수 대기", "reviews")}</span>
        <span><TriangleAlert size={15} aria-hidden /><b>{blockedTasks.length}</b>{bt("차단·보완", "blocked")}</span>
        <span><CalendarClock size={15} aria-hidden /><b>{calendar.length}</b>{bt("예정 일정", "events")}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <h3>{bt("다음 작업", "Next work")}</h3>
        <div role="group" aria-label={bt("작업 상태 필터", "Task status filter")} style={{ display: "flex", gap: 4 }}>
          {([
            ["all", bt("전체", "All")],
            ["review", bt("검수·피드백", "Review")],
            ["blocked", bt("차단·긴급", "Blocked")],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="vs2-focus-chip"
              aria-pressed={taskFilter === id}
              onClick={() => setTaskFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {topTask && onGuide ? (
          <button
            type="button"
            className="vs2-focus-chip"
            onClick={() => onGuide(studioVirtualProductionDestination(topTask))}
            aria-label={bt("최우선 공정 바로 안내", "Guide to top-priority task")}
          >
            <Route size={13} aria-hidden />
            {bt("최우선 공정 안내", "Top task route")}
          </button>
        ) : null}
      </div>
      <div className="studio-vspace-today-list">{nextTasks.length ? nextTasks.map((task) => {
        const destination = studioVirtualProductionDestination(task);
        const destinationLabel = bt(...STUDIO_VIRTUAL_PRODUCTION_DESTINATIONS[destination]);
        return <article key={task.id}>
          <div><strong>{task.title}</strong><small>{bt(...STUDIO_VIRTUAL_TASK_STATUS_LABELS[task.status])} · {when(task.dueAt, locale)}</small></div>
          <button type="button" disabled={!onGuide} onClick={() => onGuide?.(destination)}
            aria-label={bt(`${task.title}: ${spaceKoParticle(destinationLabel, "으로")} 안내`, `${task.title}: guide to ${destinationLabel}`)}>
            <Route size={14} aria-hidden />{destinationLabel}
          </button>
        </article>;
      }) : <p>{bt("열린 작업이 없습니다.", "No open tasks.")}</p>}</div>
      {calendar.length ? <><h3>{bt("다가오는 일정", "Upcoming")}</h3><div className="studio-vspace-today-list">{calendar.map((event) => <article key={event.key}><div><strong>{event.title}</strong><small>{when(event.startsAt, locale)}–{when(event.endsAt, locale)}</small></div><a href={event.url}>{bt("열기", "Open")}</a></article>)}</div></> : null}
      <footer>
        <Link href={`/production/projects/${encodeURIComponent(aggregate.projectId)}/schedule`}>{bt("전체 일정", "Full schedule")}</Link>
        <Link href={`/production/projects/${encodeURIComponent(aggregate.projectId)}/review`}>{bt("검수 관제", "Review control")}</Link>
        <Link href={`/studio/p/${encodeURIComponent(workId)}/production`}>{bt("프로젝트 제작", "Project production")}</Link>
      </footer>
    </> : null}
  </section>;
}
