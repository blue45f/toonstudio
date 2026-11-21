import {
  ArrowRight,
  Box,
  Brush,
  CheckCircle2,
  Clock3,
  FileText,
  GitBranch,
  Kanban,
  Palette,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import {
  KANBAN_STAGE_STATUSES,
  handoffKanbanStage,
  loadProjectKanbanState,
  nextKanbanStageId,
  saveProjectKanbanState,
  summarizeKanbanBoard,
  updateKanbanStageAssignee,
  updateKanbanStageStatus,
  type KanbanStageId,
  type KanbanStageStatus,
  type ProjectKanbanBoardState,
} from "./studio-project-team-kanban-store";

interface KanbanStageDefinition {
  readonly id: KanbanStageId;
  readonly stepCode: string;
  readonly accentBarClass: string;
  readonly badgeClass: string;
  readonly icon: typeof FileText;
  readonly ko: string;
  readonly en: string;
  readonly roleKo: string;
  readonly roleEn: string;
  readonly resolveHref: (encodedId: string) => string;
}

const KANBAN_STAGE_STEPS: readonly KanbanStageDefinition[] = [
  {
    id: "storyboard",
    stepCode: "STAGE 01",
    accentBarClass: "bg-accent",
    badgeClass: "bg-accent/15 text-accent",
    icon: FileText,
    ko: "1. 콘티",
    en: "1. Storyboard",
    roleKo: "컷 분할·대사 흐름",
    roleEn: "Cuts & pacing",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/story`,
  },
  {
    id: "bg3d",
    stepCode: "STAGE 02",
    accentBarClass: "bg-cool",
    badgeClass: "bg-cool/15 text-cool",
    icon: Box,
    ko: "2. 3D 배경",
    en: "2. 3D background",
    roleKo: "구도·배경 선 정리",
    roleEn: "Scene framing and lines",
    resolveHref: (encodedId: string) => `/studio/bg3d?project=${encodedId}`,
  },
  {
    id: "lineart",
    stepCode: "STAGE 03",
    accentBarClass: "bg-accent-2",
    badgeClass: "bg-accent-2/15 text-accent-2",
    icon: Brush,
    ko: "3. 선화",
    en: "3. Lineart",
    roleKo: "벡터·필압 펜선",
    roleEn: "Vector & ink strokes",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/production`,
  },
  {
    id: "coloring",
    stepCode: "STAGE 04",
    accentBarClass: "bg-warn",
    badgeClass: "bg-warn/15 text-warn",
    icon: Palette,
    ko: "4. 채색",
    en: "4. Coloring",
    roleKo: "색과 조명 정리",
    roleEn: "Color and lighting",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/assets`,
  },
  {
    id: "lettering",
    stepCode: "STAGE 05",
    accentBarClass: "bg-good",
    badgeClass: "bg-good/15 text-good",
    icon: CheckCircle2,
    ko: "5. 글자·최종 확인",
    en: "5. Lettering & final review",
    roleKo: "읽기·출력 상태 확인",
    roleEn: "Check reading and output",
    resolveHref: (encodedId: string) => `/studio/p/${encodedId}/export`,
  },
] as const;

const STAGE_LABEL_BY_ID = new Map(KANBAN_STAGE_STEPS.map((step) => [step.id, step] as const));

const STATUS_META: Readonly<
  Record<
    KanbanStageStatus,
    {
      readonly ko: string;
      readonly en: string;
      readonly pillClass: string;
      readonly ringClass: string;
    }
  >
> = {
  todo: {
    ko: "대기",
    en: "Waiting",
    pillClass: "border-line-strong/80 bg-panel text-fg-2",
    ringClass: "border-line-strong/70",
  },
  in_progress: {
    ko: "진행 중",
    en: "In progress",
    pillClass: "border-cool/45 bg-cool/15 text-cool",
    ringClass: "border-cool/50",
  },
  review_requested: {
    ko: "검수 요청",
    en: "Review requested",
    pillClass: "border-warn/45 bg-warn/15 text-warn",
    ringClass: "border-warn/55",
  },
  approved: {
    ko: "승인 완료",
    en: "Approved",
    pillClass: "border-good/45 bg-good/15 text-good",
    ringClass: "border-good/55",
  },
};

const ASSIGNEE_SUGGESTIONS = ["메인 작가", "배경 담당", "선화 어시", "채색 어시", "식자·검수"] as const;

function getBrowserStorage() {
  return typeof window !== "undefined" ? window.localStorage : null;
}

function formatHandoffTime(iso: string): string {
  try {
    const parsed = new Date(iso);
    if (!Number.isFinite(parsed.getTime())) return iso;
    return new Intl.DateTimeFormat("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(parsed);
  } catch {
    return iso;
  }
}

export function StudioProjectTeamKanbanBridge({
  projectId,
}: {
  readonly projectId: string;
}) {
  const bt = useBilingual("StudioProjectTeamKanbanBridge");
  const encodedId = encodeURIComponent(projectId);
  const assigneeListId = useId();

  const [board, setBoard] = useState<ProjectKanbanBoardState>(() =>
    loadProjectKanbanState(getBrowserStorage(), projectId),
  );
  const [memoDrafts, setMemoDrafts] = useState<Partial<Record<KanbanStageId, string>>>({});
  const [lastAnnouncement, setLastAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    setBoard(loadProjectKanbanState(getBrowserStorage(), projectId));
    setMemoDrafts({});
    setLastAnnouncement(null);
  }, [projectId]);

  const commitBoard = useCallback((updater: (prev: ProjectKanbanBoardState) => ProjectKanbanBoardState) => {
    setBoard((prev) => {
      const next = updater(prev);
      saveProjectKanbanState(getBrowserStorage(), next);
      return next;
    });
  }, []);

  const handleStatusChange = useCallback(
    (stageId: KanbanStageId, status: KanbanStageStatus) => {
      commitBoard((prev) => updateKanbanStageStatus(prev, stageId, status));
      const stageMeta = STAGE_LABEL_BY_ID.get(stageId);
      const statusMeta = STATUS_META[status];
      if (stageMeta) {
        setLastAnnouncement(
          bt(
            `${stageMeta.ko} 상태를 '${statusMeta.ko}'(으)로 저장했어요.`,
            `Updated ${stageMeta.en} to ${statusMeta.en}.`,
          ),
        );
      }
    },
    [bt, commitBoard],
  );

  const handleAssigneeChange = useCallback(
    (stageId: KanbanStageId, assignee: string) => {
      commitBoard((prev) => updateKanbanStageAssignee(prev, stageId, assignee));
    },
    [commitBoard],
  );

  const handleHandoff = useCallback(
    (stageId: KanbanStageId) => {
      const memo = memoDrafts[stageId] ?? "";
      const nextId = nextKanbanStageId(stageId);
      commitBoard((prev) => handoffKanbanStage(prev, stageId, memo));
      setMemoDrafts((prev) => ({ ...prev, [stageId]: "" }));

      const fromMeta = STAGE_LABEL_BY_ID.get(stageId);
      const toMeta = nextId === "publish" ? null : STAGE_LABEL_BY_ID.get(nextId);
      if (fromMeta) {
        setLastAnnouncement(
          toMeta
            ? bt(
                `${fromMeta.ko} 승인 완료 → ${toMeta.ko} 공정으로 인계했어요.`,
                `${fromMeta.en} approved and handed off to ${toMeta.en}.`,
              )
            : bt(
                `${fromMeta.ko} 최종 승인을 기록했어요.`,
                `Recorded final sign-off for ${fromMeta.en}.`,
              ),
        );
      }
    },
    [bt, commitBoard, memoDrafts],
  );

  const summary = useMemo(() => summarizeKanbanBoard(board), [board]);

  return (
    <section
      aria-label={bt("팀 제작 진행 단계", "Team production stages")}
      data-testid="studio-project-team-kanban-bridge"
      className="relative mt-4 overflow-hidden rounded-2xl border border-line bg-panel/70"
    >
      {/* 상단 5색 OKLCH 스펙트럼 진행 리본 */}
      <div className="h-1 w-full bg-raised/70" aria-hidden="true">
        <div
          data-testid="studio-kanban-progress-ribbon"
          className="h-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-cool),var(--color-accent-2),var(--color-warn),var(--color-good))] transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ width: `${Math.max(6, summary.progressPercent)}%` }}
        />
      </div>

      <datalist id={assigneeListId}>
        {ASSIGNEE_SUGGESTIONS.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="space-y-3.5 p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 font-display text-[11px] font-bold tracking-wide text-accent">
                <Kanban size={12} aria-hidden="true" />
                {bt("회차 제작 진행", "Episode progress")}
              </span>
              <span
                data-testid="studio-kanban-summary-counts"
                className="inline-flex flex-wrap items-center gap-2 text-xs font-semibold tabular-nums text-fg-2"
              >
                <span className="text-good">
                  {bt(`승인 완료 ${summary.approvedCount}/5`, `Approved ${summary.approvedCount}/5`)}
                </span>
                <span aria-hidden="true" className="text-fg-3">·</span>
                <span className="text-cool">
                  {bt(`진행 중 ${summary.inProgressCount}`, `In progress ${summary.inProgressCount}`)}
                </span>
                <span aria-hidden="true" className="text-fg-3">·</span>
                <span className="text-warn">
                  {bt(`검수 요청 ${summary.reviewRequestedCount}`, `Review ${summary.reviewRequestedCount}`)}
                </span>
              </span>
            </div>
            <p className="break-keep text-xs leading-relaxed text-fg-2">
              {bt(
                "각 공정의 상태와 담당자를 지정하고 원클릭으로 다음 공정에 인계하세요. 변경 내용은 이 기기에 자동 저장됩니다.",
                "Update each stage's status and assignee, then hand off to the next step with one click. Changes are saved automatically.",
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/production/projects/${encodedId}/production`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-accent/45 bg-accent px-3.5 text-xs font-bold text-on-accent transition-colors duration-150 hover:bg-accent/90 active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
            >
              <Kanban size={14} aria-hidden="true" />
              {bt("회차 진행 보기", "View episode progress")}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <Link
              href={`/production/projects/${encodedId}/handoff`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-accent/55 hover:text-fg active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
            >
              <GitBranch size={14} aria-hidden="true" />
              {bt("작업 전달 기록", "Handoff history")}
            </Link>
            <Link
              href={`/production/projects/${encodedId}/rights`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong/75 bg-card/90 px-3.5 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-accent/55 hover:text-fg active:scale-[0.97] motion-reduce:transform-none motion-reduce:transition-none"
            >
              <ShieldCheck size={14} aria-hidden="true" />
              {bt("소재 이용 조건", "Asset usage terms")}
            </Link>
          </div>
        </div>

        {lastAnnouncement ? (
          <p
            role="status"
            data-testid="studio-kanban-live-status"
            className="flex items-center gap-2 rounded-xl border border-good/35 bg-good/10 px-3 py-2 text-xs font-semibold text-good break-keep"
          >
            <CheckCircle2 size={14} className="shrink-0" aria-hidden="true" />
            <span>{lastAnnouncement}</span>
          </p>
        ) : null}

        <ol
          aria-label={bt("5열 제작 공정", "5 production stages")}
          className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0"
        >
          {KANBAN_STAGE_STEPS.map((step) => {
            const Icon = step.icon;
            const record = board.stages[step.id];
            const statusMeta = STATUS_META[record.status];
            const nextId = nextKanbanStageId(step.id);
            const nextMeta = nextId === "publish" ? null : STAGE_LABEL_BY_ID.get(nextId);
            const stageLabel = bt(step.ko, step.en);

            return (
              <li
                key={step.id}
                data-kanban-stage={step.id}
                data-kanban-status={record.status}
                data-testid={`studio-kanban-stage-card-${step.id}`}
                className={cn(
                  "relative flex min-w-[216px] shrink-0 snap-start flex-col justify-between gap-2.5 overflow-hidden rounded-2xl border bg-card/90 p-3 text-left transition-[transform,border-color,background-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 hover:bg-raised/70 motion-reduce:transform-none motion-reduce:transition-none lg:min-w-0",
                  statusMeta.ringClass,
                )}
              >
                <span
                  aria-hidden="true"
                  data-kanban-stage-accent="true"
                  className={`pointer-events-none absolute inset-x-0 top-0 h-0.5 ${step.accentBarClass}`}
                />

                {/* 상단 단계 링크 + 현재 상태 배지 */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="font-mono text-[10px] font-bold tracking-wider text-fg-3">
                      {step.stepCode}
                    </span>
                    <span
                      data-testid={`studio-kanban-stage-status-badge-${step.id}`}
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold",
                        statusMeta.pillClass,
                      )}
                    >
                      {bt(statusMeta.ko, statusMeta.en)}
                    </span>
                  </div>

                  <Link
                    href={step.resolveHref(encodedId)}
                    className="group flex min-h-11 items-center gap-2 rounded-xl px-1.5 py-1 transition-colors duration-150 hover:bg-panel/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none"
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-lg transition-colors duration-150 group-hover:bg-accent group-hover:text-on-accent motion-reduce:transition-none",
                        step.badgeClass,
                      )}
                    >
                      <Icon size={14} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-extrabold text-fg group-hover:text-accent">
                        {stageLabel}
                      </span>
                      <span className="block truncate text-[11px] leading-4 text-fg-2">
                        {bt(step.roleKo, step.roleEn)}
                      </span>
                    </span>
                  </Link>
                </div>

                {/* 상태 전환 & 담당자 지정 컨트롤 */}
                <div className="space-y-2 border-t border-line/60 pt-2.5">
                  <label className="block text-[11px] font-semibold text-fg-3">
                    <span className="sr-only">{bt(`${step.ko} 진행 상태`, `${step.en} status`)}</span>
                    <select
                      aria-label={bt(`${step.ko} 진행 상태`, `${step.en} status`)}
                      data-testid={`studio-kanban-status-select-${step.id}`}
                      value={record.status}
                      onChange={(event) =>
                        handleStatusChange(step.id, event.target.value as KanbanStageStatus)
                      }
                      className="min-h-11 w-full rounded-xl border border-line bg-panel px-2.5 text-xs font-semibold text-fg outline-none transition-colors duration-150 focus:border-accent"
                    >
                      {KANBAN_STAGE_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {bt(STATUS_META[statusOption].ko, STATUS_META[statusOption].en)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="relative flex items-center">
                    <span className="sr-only">{bt(`${step.ko} 담당자`, `${step.en} assignee`)}</span>
                    <UserRound
                      size={13}
                      aria-hidden="true"
                      className="pointer-events-none absolute left-2.5 text-fg-3"
                    />
                    <input
                      type="text"
                      list={assigneeListId}
                      aria-label={bt(`${step.ko} 담당자`, `${step.en} assignee`)}
                      data-testid={`studio-kanban-assignee-input-${step.id}`}
                      value={record.assignee}
                      onChange={(event) => handleAssigneeChange(step.id, event.target.value)}
                      placeholder={bt("담당자 지정", "Assign owner")}
                      className="min-h-11 w-full rounded-xl border border-line bg-panel pl-7 pr-2.5 text-xs text-fg placeholder:text-fg-3 outline-none transition-colors duration-150 focus:border-accent"
                    />
                  </label>
                </div>

                {/* 다음 공정 원클릭 인계 */}
                <div className="space-y-1.5 border-t border-line/60 pt-2">
                  <input
                    type="text"
                    aria-label={bt(`${step.ko} 인계 메모`, `${step.en} handoff note`)}
                    data-testid={`studio-kanban-memo-input-${step.id}`}
                    value={memoDrafts[step.id] ?? ""}
                    onChange={(event) =>
                      setMemoDrafts((prev) => ({
                        ...prev,
                        [step.id]: event.target.value.slice(0, 240),
                      }))
                    }
                    placeholder={bt("인계 메모 (선택)", "Handoff note (optional)")}
                    className="min-h-11 w-full rounded-xl border border-line bg-panel px-2.5 text-xs text-fg placeholder:text-fg-3 outline-none transition-colors duration-150 focus:border-accent"
                  />
                  <button
                    type="button"
                    data-testid={`studio-kanban-handoff-btn-${step.id}`}
                    onClick={() => handleHandoff(step.id)}
                    className={cn(
                      "inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-colors duration-150 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none motion-reduce:transition-none",
                      record.status === "approved"
                        ? "border-good/40 bg-good/12 text-good hover:bg-good/20"
                        : "border-accent/45 bg-accent-soft text-accent hover:bg-accent hover:text-on-accent",
                    )}
                  >
                    <Send size={12} aria-hidden="true" />
                    <span className="truncate">
                      {nextMeta
                        ? bt(`${nextMeta.ko.replace(/^\d+\.\s*/u, "")}으로 인계`, `Hand off to ${nextMeta.en}`)
                        : bt("최종 승인 기록", "Record final approval")}
                    </span>
                  </button>
                </div>
              </li>
            );
          })}
        </ol>

        {/* 최근 인계 기록 타임라인 (중첩 카드 없이 헤어라인 구분) */}
        {board.handoffs.length > 0 ? (
          <div
            data-testid="studio-kanban-handoff-log"
            className="border-t border-line/70 pt-3"
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <GitBranch size={13} className="text-accent" aria-hidden="true" />
                {bt("최근 공정 인계 기록", "Recent stage handoffs")}
              </span>
              <span className="text-[11px] tabular-nums text-fg-3">
                {bt(`총 ${board.handoffs.length}건`, `${board.handoffs.length} total`)}
              </span>
            </div>
            <ol className="divide-y divide-line/50 text-xs">
              {board.handoffs.slice(0, 4).map((entry) => {
                const fromStep = STAGE_LABEL_BY_ID.get(entry.fromStageId);
                const toStep = entry.toStageId === "publish" ? null : STAGE_LABEL_BY_ID.get(entry.toStageId);
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <p className="font-semibold text-fg break-keep">
                        <span>{fromStep ? bt(fromStep.ko, fromStep.en) : entry.fromStageId}</span>
                        <span className="mx-1.5 text-accent" aria-hidden="true">→</span>
                        <span>
                          {toStep
                            ? bt(toStep.ko, toStep.en)
                            : bt("출고 승인 완료", "Ready for export")}
                        </span>
                        {entry.fromAssignee ? (
                          <span className="ml-2 font-normal text-fg-3">
                            ({entry.fromAssignee}
                            {entry.toAssignee ? ` → ${entry.toAssignee}` : ""})
                          </span>
                        ) : null}
                      </p>
                      {entry.memo ? (
                        <p className="text-[11px] text-fg-2 break-keep">{entry.memo}</p>
                      ) : null}
                    </div>
                    <time
                      dateTime={entry.handedOffAt}
                      className="inline-flex shrink-0 items-center gap-1 font-mono text-[11px] tabular-nums text-fg-3"
                    >
                      <Clock3 size={11} aria-hidden="true" />
                      {formatHandoffTime(entry.handedOffAt)}
                    </time>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
