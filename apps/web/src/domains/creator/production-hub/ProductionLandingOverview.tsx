import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardList, Kanban, MousePointerClick } from "lucide-react";
import { Link } from "react-router-dom";

import type { ProductionPersonalInboxItem, ProductionProjectSummary } from "./production-dashboard-api";
import { formatProductionDay } from "./production-format";
import { ProductionPill, type ProductionTone } from "./production-ui";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

interface Copy {
  readonly ko: string;
  readonly en: string;
}

/** 작업함 버킷 이름·색 — 랜딩의 내 통합 작업함과 같은 말을 쓴다. */
const BUCKET_COPY: Readonly<Record<ProductionPersonalInboxItem["bucket"], { readonly label: Copy; readonly tone: ProductionTone }>> = {
  dueToday: { label: { ko: "오늘 제출", en: "Due today" }, tone: "danger" },
  inProgress: { label: { ko: "진행 중", en: "In progress" }, tone: "accent" },
  review: { label: { ko: "내 검수", en: "To review" }, tone: "warning" },
  ready: { label: { ko: "시작 가능", en: "Ready" }, tone: "success" },
  waitingInput: { label: { ko: "입력 대기", en: "Waiting for input" }, tone: "warning" },
  blockingOthers: { label: { ko: "다른 작업 차단", en: "Blocking others" }, tone: "danger" },
};

function sum(projects: readonly ProductionProjectSummary[], pick: (project: ProductionProjectSummary) => number): number {
  return projects.reduce((total, project) => total + pick(project), 0);
}

/**
 * 제작 랜딩 첫 화면의 3종 개요: 진행 현황(단계별), 다음 행동 한 가지, 막힌 지점.
 * 전부 포트폴리오 목록·개인 작업함이라는 기존 데이터에서만 계산한다.
 */
export function ProductionLandingOverview({
  projects,
  inboxItems,
}: {
  readonly projects: readonly ProductionProjectSummary[];
  readonly inboxItems: readonly ProductionPersonalInboxItem[];
}) {
  const bt = useBilingual("ProductionLandingOverview");
  const activeEpisodes = sum(projects, (project) => project.activeEpisodeCount);
  const reviewWaiting = sum(projects, (project) => project.reviewTaskCount);
  const readyBuffer = sum(projects, (project) => project.readyBufferCount);
  const blocked = sum(projects, (project) => project.blockedTaskCount);
  const overdue = sum(projects, (project) => project.overdueTaskCount);
  const critical = sum(projects, (project) => project.criticalRiskCount);
  const blockedTotal = blocked + overdue + critical;

  const nextRelease = projects
    .filter((project) => project.nextReleaseAt)
    .slice()
    .sort((left, right) => String(left.nextReleaseAt).localeCompare(String(right.nextReleaseAt)))[0];
  const nextAction = inboxItems[0];
  const nextBucket = nextAction ? BUCKET_COPY[nextAction.bucket] : null;
  const worstBlocked = blocked + overdue > 0
    ? projects.slice().sort((left, right) => (right.blockedTaskCount + right.overdueTaskCount) - (left.blockedTaskCount + left.overdueTaskCount))[0]
    : undefined;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-black text-fg">{bt("오늘의 제작 한눈에", "Production at a glance")}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <p className="flex items-center gap-2 text-xs font-black text-fg-2">
            <Kanban className="size-4 text-accent" aria-hidden="true" />
            {bt("진행 현황", "Progress")}
          </p>
          <p className="mt-2 text-sm font-black text-fg">
            {bt(`작품 ${projects.length}개`, `${projects.length} projects`)}
          </p>
          <p className="mt-1 text-xs leading-5 text-fg-2">
            {bt(`만드는 중 ${activeEpisodes}개`, `${activeEpisodes} in progress`)}
            <span aria-hidden="true"> → </span>
            {bt(`검수 대기 ${reviewWaiting}건`, `${reviewWaiting} waiting review`)}
            <span aria-hidden="true"> → </span>
            {bt(`게시 준비 ${readyBuffer}회`, `${readyBuffer} ready to publish`)}
          </p>
          <p className="mt-2 text-[0.6875rem] text-fg-3">
            {nextRelease
              ? bt(`다음 공개 ${nextRelease.title} · ${formatProductionDay(nextRelease.nextReleaseAt, "미정")}`, `Next release ${nextRelease.title} · ${formatProductionDay(nextRelease.nextReleaseAt, "TBD")}`)
              : bt("다음 공개 일정이 없어요", "No release scheduled")}
          </p>
        </div>

        {nextAction && nextBucket ? (
          <Link
            to={`/production/projects/${encodeURIComponent(nextAction.projectId)}/production?task=${encodeURIComponent(nextAction.taskId)}`}
            className="group rounded-2xl border border-accent/35 bg-panel p-4 outline-none transition-colors hover:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none"
          >
            <p className="flex items-center gap-2 text-xs font-black text-fg-2">
              <MousePointerClick className="size-4 text-accent" aria-hidden="true" />
              {bt("다음 행동", "Next action")}
            </p>
            <p className="mt-2">
              <ProductionPill tone={nextBucket.tone}>{bt(nextBucket.label.ko, nextBucket.label.en)}</ProductionPill>
            </p>
            <p className="mt-2 line-clamp-2 text-sm font-black leading-5 text-fg group-hover:text-accent">{nextAction.taskTitle}</p>
            <p className="mt-1 flex items-center justify-between gap-2 text-[0.6875rem] text-fg-3">
              <span className="truncate">{nextAction.projectTitle} · {bt("마감", "Due")} {formatProductionDay(nextAction.dueAt, bt("미정", "No date"))}</span>
              <ArrowRight className="size-3.5 shrink-0 text-accent transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </p>
          </Link>
        ) : (
          <div className="rounded-2xl border border-line bg-panel p-4">
            <p className="flex items-center gap-2 text-xs font-black text-fg-2">
              <MousePointerClick className="size-4 text-accent" aria-hidden="true" />
              {bt("다음 행동", "Next action")}
            </p>
            <p className="mt-2 text-sm font-black text-fg">{bt("지금 급한 일은 없어요", "Nothing urgent right now")}</p>
            <p className="mt-1 text-xs leading-5 text-fg-2">{bt("새 작업이 배정되면 가장 급한 것부터 여기에 보여요.", "When new work is assigned, the most urgent item shows here first.")}</p>
          </div>
        )}

        <div className={cn("rounded-2xl border p-4", blockedTotal > 0 ? "border-bad/30 bg-panel" : "border-line bg-panel")}>
          <p className="flex items-center gap-2 text-xs font-black text-fg-2">
            {blockedTotal > 0
              ? <AlertTriangle className="size-4 text-bad" aria-hidden="true" />
              : <CheckCircle2 className="size-4 text-good" aria-hidden="true" />}
            {bt("막힌 지점", "Blocked")}
          </p>
          {blockedTotal > 0 ? (
            <>
              <p className="mt-2 text-sm font-black text-fg">
                {bt(`막힌 작업 ${blocked}건 · 기한 초과 ${overdue}건`, `${blocked} blocked · ${overdue} overdue`)}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-2">
                {critical > 0 ? bt(`위험 신호 ${critical}건이 함께 있어요.`, `${critical} critical risks alongside.`) : bt("위험 신호는 없어요.", "No critical risks.")}
                {worstBlocked ? bt(` ${worstBlocked.title}에 가장 많아요.`, ` Most are in ${worstBlocked.title}.`) : null}
              </p>
              {worstBlocked ? (
                <Link
                  className="mt-2 inline-flex min-h-8 items-center gap-1 text-xs font-bold text-accent"
                  to={`/production/projects/${encodeURIComponent(worstBlocked.projectId)}/production?boardFocus=blocked`}
                >
                  {bt("막힌 작업 보기", "See blocked work")}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </>
          ) : (
            <>
              <p className="mt-2 flex items-center gap-2 text-sm font-black text-fg">
                <ClipboardList className="size-4 text-fg-3" aria-hidden="true" />
                {bt("막힌 작업이 없어요", "Nothing is blocked")}
              </p>
              <p className="mt-1 text-xs leading-5 text-fg-2">{bt("모든 작품이 막힘 없이 진행 중이에요.", "Every project is moving without blockers.")}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
