import { Activity, Camera, Link2Off, Share2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  buildProductionActivityEntries,
  filterProductionActivityEntries,
  shortenProductionActivityId,
  type ProductionActivityEntry,
  type ProductionActivityFilter,
} from "./production-activity-model";
import { productionActivityLabel } from "./production-labels";
import type {
  ProductionVersionActivityEntry,
  ProductionVersionActivityKind,
} from "./production-version-activity";
import type { VersionSharePermission } from "./one-click-version-share-model";
import { useProductionVersionActivity } from "./use-production-version-activity";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const PAGE_SIZE = 30;

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

type BilingualText = (ko: string, en: string) => string;

const VERSION_KIND_META: Readonly<Record<ProductionVersionActivityKind, {
  readonly label: { readonly ko: string; readonly en: string };
  readonly icon: typeof Camera;
}>> = {
  "snapshot-created": { label: { ko: "버전 스냅샷 생성", en: "Version snapshot created" }, icon: Camera },
  "share-created": { label: { ko: "버전 공유 링크 생성", en: "Version share link created" }, icon: Share2 },
  "share-revoked": { label: { ko: "버전 공유 회수", en: "Version share revoked" }, icon: Link2Off },
};

function sharePermissionLabel(bt: BilingualText, permission: VersionSharePermission): string {
  if (permission === "view") return bt("보기 전용", "View only");
  if (permission === "edit") return bt("보기·댓글·편집", "View · Comment · Edit");
  return bt("보기·댓글", "View · Comment");
}

type ActivityFeedItem =
  | { readonly type: "audit"; readonly occurredAt: string; readonly audit: ProductionActivityEntry }
  | { readonly type: "version"; readonly occurredAt: string; readonly version: ProductionVersionActivityEntry };

/**
 * 프로젝트 활동 전체 기록. 원천은 서버가 변경마다 강제 기록하는 auditEvents이며,
 * 여기서는 행위자·대상 이름을 해석해 "누가 언제 무엇을"으로 읽히게 한다.
 * 상태 전/후 값은 원천이 digest만 갖고 있어 표시하지 않는다.
 *
 * 원고 층에서 일어나는 버전 스냅샷 생성·공유 링크 생성/회수는 감사 이벤트에 남지 않아,
 * versionActivityEnabled일 때 서버 스냅샷·공유 기록을 따로 읽어 같은 피드에 합류시킨다.
 * 그 조회가 실패해도 감사 기록 본체는 그대로 보여 준다.
 */
export function ProductionActivityWorkspace({
  aggregate,
  viewerUserId,
  viewerAssignmentIds,
  versionActivityEnabled = false,
}: {
  readonly aggregate: ProductionProjectAggregate;
  readonly viewerUserId: string | null;
  readonly viewerAssignmentIds: readonly string[];
  readonly versionActivityEnabled?: boolean;
}) {
  const bt = useBilingual("ProductionActivityWorkspace");
  const [filter, setFilter] = useState<ProductionActivityFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const entries = useMemo(
    () => buildProductionActivityEntries(aggregate, { userId: viewerUserId, assignmentIds: viewerAssignmentIds }),
    [aggregate, viewerUserId, viewerAssignmentIds],
  );
  const versionActivity = useProductionVersionActivity({
    enabled: versionActivityEnabled,
    aggregate,
    viewerUserId,
  });
  const versionEntries = useMemo(
    () => (versionActivity.state.status === "ready" ? versionActivity.state.result.entries : []),
    [versionActivity.state],
  );
  const mineCount = useMemo(
    () => entries.filter((entry) => entry.relatedToViewer).length
      + versionEntries.filter((entry) => entry.relatedToViewer).length,
    [entries, versionEntries],
  );
  const feed = useMemo<readonly ActivityFeedItem[]>(() => {
    const auditItems: ActivityFeedItem[] = filterProductionActivityEntries(entries, filter)
      .map((entry) => ({ type: "audit", occurredAt: entry.event.occurredAt, audit: entry }));
    if (versionEntries.length === 0) return auditItems;
    const versionItems: ActivityFeedItem[] = versionEntries
      .filter((entry) => filter === "all" || entry.relatedToViewer)
      .map((entry) => ({ type: "version", occurredAt: entry.occurredAt, version: entry }));
    // 시각 내림차순 병합. 정렬이 안정적이므로 같은 시각이면 감사 항목이 먼저 온다.
    return [...auditItems, ...versionItems].toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [entries, filter, versionEntries]);
  const visible = feed.slice(0, visibleCount);
  const totalCount = entries.length + versionEntries.length;

  const filters: readonly { readonly id: ProductionActivityFilter; readonly label: string; readonly count: number }[] = [
    { id: "all", label: bt("전체", "All"), count: totalCount },
    { id: "mine", label: bt("내 관련", "Related to me"), count: mineCount },
  ];

  return (
    <section aria-label={bt("프로젝트 활동", "Project activity")} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={bt("활동 범위 선택", "Choose activity scope")}>
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              className={buttonClass({ variant: filter === item.id ? "solid" : "outline", className: "min-h-11" })}
              onClick={() => {
                setFilter(item.id);
                setVisibleCount(PAGE_SIZE);
              }}
            >
              {item.label}
              <span className={cn("ml-1.5 text-xs", filter === item.id ? "text-current/70" : "text-fg-3")}>{item.count}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-fg-3">
          {versionEntries.length > 0
            ? bt(
                `총 ${totalCount}건의 활동이 기록돼 있습니다.`,
                `${totalCount} activities recorded.`,
              )
            : bt(
                `총 ${entries.length}건의 변경이 기록돼 있습니다.`,
                `${entries.length} changes recorded.`,
              )}
        </p>
      </div>

      {versionActivity.state.status === "loading" ? (
        <p role="status" className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-3">
          {bt("버전·공유 활동을 불러오는 중…", "Loading version and share activity…")}
        </p>
      ) : null}
      {versionActivity.state.status === "error" ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/30 bg-bad/10 px-3 py-2">
          <p className="text-xs text-fg-2">
            {bt("버전·공유 활동을 불러오지 못했습니다. 프로젝트 변경 기록은 아래에서 볼 수 있습니다.", "Couldn't load version and share activity. Project changes are still shown below.")}
          </p>
          <button
            type="button"
            className={buttonClass({ variant: "outline", className: "min-h-11" })}
            onClick={versionActivity.retry}
          >
            {bt("다시 시도", "Retry")}
          </button>
        </div>
      ) : null}
      {versionActivity.state.status === "ready" && versionActivity.state.result.failedArtifactCount > 0 ? (
        <p role="status" className="rounded-xl border border-line bg-card px-3 py-2 text-xs text-fg-3">
          {bt(
            `원고 ${versionActivity.state.result.failedArtifactCount}건의 버전 활동을 불러오지 못해 일부만 표시합니다.`,
            `Version activity for ${versionActivity.state.result.failedArtifactCount} manuscript(s) couldn't be loaded, so this list is partial.`,
          )}
        </p>
      ) : null}

      {feed.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-card p-8 text-center">
          <Sparkles className="mx-auto size-6 text-fg-3" aria-hidden="true" />
          <p className="mt-2 text-sm font-bold text-fg">
            {filter === "mine"
              ? bt("나와 관련된 활동이 아직 없습니다", "No activity related to you yet")
              : bt("기록된 활동이 없습니다", "No recorded activity")}
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-fg-3">
            {filter === "mine"
              ? bt("내가 바꾸거나, 나에게 배정된 작업·회차에서 일어난 변경이 여기에 모입니다.", "Changes you made, or changes on tasks and episodes assigned to you, collect here.")
              : bt("프로젝트에서 일어나는 변경은 빠짐없이 여기에 쌓입니다.", "Every change in this project is recorded here.")}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {visible.map((item) => {
              if (item.type === "version") {
                const entry = item.version;
                const meta = VERSION_KIND_META[entry.kind];
                const KindIcon = meta.icon;
                return (
                  <li
                    key={entry.id}
                    className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-fg-3">
                      <KindIcon className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-5 text-fg">
                        {/* 회수 항목은 서버가 회수자를 기록하지 않아 행위자 대신 시스템으로 표시한다. */}
                        <span className="font-bold">{entry.actorName ?? bt("시스템", "System")}</span>
                        {entry.actorIsViewer ? (
                          <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.625rem] font-bold text-accent">
                            {bt("나", "You")}
                          </span>
                        ) : null}
                        <span className="text-fg-2"> · {bt(meta.label.ko, meta.label.en)}</span>
                      </p>
                      <p className="mt-0.5 truncate text-[0.6875rem] text-fg-3">
                        {bt("원고", "Manuscript")}
                        {" · "}
                        {entry.artifactTitle}
                        {" — "}
                        {entry.snapshotName}
                        {entry.permission ? ` · ${sharePermissionLabel(bt, entry.permission)}` : ""}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[0.625rem] text-fg-3">
                        <span>{formatDateTime(entry.occurredAt)}</span>
                        <Link
                          to={entry.href}
                          className="font-bold text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {bt("버전 보기", "View versions")}
                        </Link>
                      </p>
                    </div>
                  </li>
                );
              }
              const entry = item.audit;
              const { event } = entry;
              return (
                <li
                  key={event.id}
                  className="flex items-start gap-3 rounded-xl border border-line bg-panel p-3"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-raised text-fg-3">
                    <Activity className="size-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-5 text-fg">
                      <span className="font-bold">{entry.actorName ?? bt("시스템", "System")}</span>
                      {entry.actorIsViewer ? (
                        <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.625rem] font-bold text-accent">
                          {bt("나", "You")}
                        </span>
                      ) : null}
                      <span className="text-fg-2"> · {productionActivityLabel(event.action, bt)}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[0.6875rem] text-fg-3">
                      {bt(entry.targetKindLabel.ko, entry.targetKindLabel.en)}
                      {" · "}
                      {entry.targetTitle ?? shortenProductionActivityId(event.targetId)}
                    </p>
                    {event.reason ? (
                      <p className="mt-1 text-[0.6875rem] leading-4 text-fg-2">{event.reason}</p>
                    ) : null}
                    <p className="mt-1 text-[0.625rem] text-fg-3">
                      {bt(`${event.aggregateRevision}번째 변경`, `Change #${event.aggregateRevision}`)}
                      {" · "}
                      {formatDateTime(event.occurredAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fg-3">
              {bt(`${feed.length}건 중 ${visible.length}건 표시`, `Showing ${visible.length} of ${feed.length}`)}
            </p>
            {visibleCount < feed.length ? (
              <button
                type="button"
                className={buttonClass({ variant: "outline", className: "min-h-11" })}
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                {bt("더 보기", "Show more")}
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
