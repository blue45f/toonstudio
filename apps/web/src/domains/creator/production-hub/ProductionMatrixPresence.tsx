import { Eye, MapPin, PenLine, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  leavePagePresence,
  mergePagePresence,
  PAGE_PRESENCE_CHANNEL_NAME,
  PAGE_PRESENCE_HEARTBEAT_MS,
  summarizePagePresence,
  type PagePresenceEntry,
} from "./page-edit-lock-model";
import {
  buildPresenceLocationHref,
  derivePresenceLocation,
  formatPresenceLocation,
} from "./presence-location-model";
import { ProductionAvatar } from "./production-ui";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** 회차 룸이 채널에 싣는 프레즌스 메시지 형태(ProductionEpisodeReviewRoom과 계약). */
interface PagePresenceBroadcast {
  readonly pageId?: unknown;
  readonly entries?: unknown;
  readonly leavingActorId?: unknown;
}

function isPagePresenceEntry(value: unknown): value is PagePresenceEntry {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.pageId === "string"
    && typeof candidate.actorId === "string"
    && typeof candidate.displayName === "string"
    && (candidate.mode === "editing" || candidate.mode === "viewing")
    && typeof candidate.heartbeatAt === "string"
    && (candidate.stageId === undefined || candidate.stageId === null || typeof candidate.stageId === "string");
}

export interface ProductionMatrixPresenceProps {
  /**
   * 이동 경로를 만들 프로젝트. 없으면 위치 라벨만 보이고 이동 링크는
   * 붙이지 않는다 (갈 곳을 모르는 이동 액션은 만들지 않는다).
   */
  readonly projectId?: string | null;
}

/**
 * 공정 매트릭스 프레즌스 스트립: 회차 룸(페이지 편집 표면)이 같은 브라우저의
 * 다른 탭에서 열고 있는 페이지를 매트릭스 위에서도 보여 준다.
 * "누가 어느 페이지를 편집/열람 중인지"만 알리고, 잠금을 잡거나 풀지 않는다 —
 * 잠금 강제는 페이지를 연 표면(회차 룸)이 맡는다. 프레즌스가 없으면 아무것도
 * 그리지 않아 기존 매트릭스 흐름에 단계가 늘지 않는다.
 * 칩의 위치는 원시 페이지 ID가 아니라 회차·페이지·공정 라벨로 읽히게 하고
 * (presence-location-model), 프로젝트를 알면 그 회차 룸으로 바로 이동하는
 * 링크가 된다 — 매트릭스는 회차·공정이 여럿 섞이는 표면이라 위치 맥락이
 * 곧 동선이다.
 */
export function ProductionMatrixPresence({ projectId = null }: ProductionMatrixPresenceProps) {
  const bt = useBilingual("ProductionMatrixPresence");
  const [entries, setEntries] = useState<readonly PagePresenceEntry[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(PAGE_PRESENCE_CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent<PagePresenceBroadcast>) => {
      const data = event.data;
      if (!data || typeof data.pageId !== "string") return;
      if (typeof data.leavingActorId === "string") {
        setEntries((previous) => leavePagePresence(previous, data.pageId as string, data.leavingActorId as string));
        return;
      }
      if (!Array.isArray(data.entries)) return;
      const incoming = data.entries.filter(isPagePresenceEntry);
      if (!incoming.length) return;
      setEntries((previous) => mergePagePresence(previous, incoming, new Date()));
    };
    return () => channel.close();
  }, []);

  // 하트비트가 끊긴 항목은 TTL이 지나면 요약에서 빠진다. 채널 메시지가 없어도
  // 화면이 스스로 정리되도록 하트비트 간격마다 다시 계산한다.
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), PAGE_PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, []);

  const summary = summarizePagePresence(entries, new Date());
  if (!summary.length) return null;

  const editingCount = summary.filter((entry) => entry.mode === "editing").length;

  return (
    <div
      data-matrix-presence="true"
      className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <UsersRound className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <p className="min-w-0 text-xs font-semibold leading-5 text-fg" role="status">
          {bt(
            `지금 ${summary.length}명이 페이지를 열고 있습니다${editingCount ? ` · ${editingCount}명 편집 중` : ""}. 편집 중인 페이지는 회차 룸에서 잠금이 걸립니다.`,
            `${summary.length} ${summary.length === 1 ? "person has" : "people have"} a page open right now${editingCount ? ` · ${editingCount} editing` : ""}. Pages being edited are locked in the episode room.`,
          )}
        </p>
      </div>
      <ul className="flex flex-wrap items-center gap-1.5" aria-label={bt("페이지를 열고 있는 사람", "People with a page open")}>
        {summary.map((entry) => {
          const editing = entry.mode === "editing";
          const location = derivePresenceLocation({ pageId: entry.pageId, stageId: entry.stageId ?? null });
          const locationLabel = formatPresenceLocation(location);
          const locationHref = buildPresenceLocationHref(location, projectId);
          const locationText = locationLabel ? bt(locationLabel.ko, locationLabel.en) : entry.pageId;
          return (
            <li key={`${entry.pageId}::${entry.actorId}`}>
              <span
                className="inline-flex min-h-7 items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pl-0.5 pr-2 text-[0.6875rem] font-semibold text-fg-2"
                title={bt(
                  `${entry.displayName} · ${locationText} · ${editing ? "편집 중" : "보는 중"}`,
                  `${entry.displayName} · ${locationText} · ${editing ? "editing" : "viewing"}`,
                )}
              >
                <ProductionAvatar name={entry.displayName} size="sm" />
                <span className="max-w-28 truncate">{entry.displayName}</span>
                {locationHref ? (
                  <Link
                    to={locationHref}
                    className="inline-flex max-w-44 items-center gap-0.5 truncate text-accent underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                    aria-label={bt(
                      `${entry.displayName}님이 있는 ${locationText}로 이동`,
                      `Go to ${locationText}, where ${entry.displayName} is`,
                    )}
                  >
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{locationText}</span>
                  </Link>
                ) : (
                  <span className="inline-flex max-w-44 items-center gap-0.5 truncate text-fg-3">
                    <MapPin className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{locationText}</span>
                  </span>
                )}
                {editing ? (
                  <span className="inline-flex items-center gap-0.5 text-warn">
                    <PenLine className="size-3" aria-hidden="true" />
                    {bt("편집 중", "Editing")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-fg-3">
                    <Eye className="size-3" aria-hidden="true" />
                    {bt("보는 중", "Viewing")}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
