import { apiFetch } from "@/platform/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { EngagementNotification } from "./engagement-model";
import { localDateKey } from "./engagement-model";
import { useEngagement, useEngagementHydrated } from "./engagement-store";

import type { Title } from "@/shared/lib/types";
import type { CreatorMarketplaceCloudLibraryItem } from "@/shared/lib/creator-marketplace-cloud-library-contract";

import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getProductionPersonalInbox } from "@/domains/creator/public/production-projects";
import { useApp, useHydrated } from "@/shared/lib/store";
import { listCreatorMarketplaceCloudLibrary } from "@/platform/creator-marketplace-client";

const TITLE_CHUNK_SIZE = 80;

async function fetchTitles(ids: readonly string[], signal: AbortSignal): Promise<Title[]> {
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += TITLE_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + TITLE_CHUNK_SIZE));
  }
  const responses = await Promise.all(chunks.map(async (chunk) => {
    const response = await apiFetch(`/api/titles?ids=${encodeURIComponent(chunk.join(","))}`, {
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(`연재 예정 작품 조회 실패 (${response.status})`);
    const payload = await response.json() as { items?: Title[] };
    if (!Array.isArray(payload.items)) throw new Error("연재 예정 작품 응답 형식이 올바르지 않습니다.");
    return payload.items;
  }));
  return responses.flat();
}

function productionNotification(
  item: Awaited<ReturnType<typeof getProductionPersonalInbox>>["items"][number],
): EngagementNotification {
  const href = item.episodeId
    ? `/production/projects/${encodeURIComponent(item.projectId)}/episodes/${encodeURIComponent(item.episodeId)}`
    : `/production/projects/${encodeURIComponent(item.projectId)}/overview`;
  const due = item.dueAt && Number.isFinite(Date.parse(item.dueAt))
    ? new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      .format(new Date(item.dueAt))
    : "기한 미정";
  return {
    id: `production:${item.projectId}:${item.taskId}:${item.bucket}`,
    category: "production",
    title: item.taskTitle,
    body: `${item.projectTitle} · ${due} · ${item.status}`,
    href,
    createdAt: item.dueAt && Number.isFinite(Date.parse(item.dueAt))
      ? item.dueAt
      : new Date(new Date().setHours(0, 0, 0, 0)).toISOString(),
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `production-inbox:${item.projectId}:${item.taskId}:${item.bucket}`,
  };
}


async function listMarketUpdates(signal: AbortSignal): Promise<readonly CreatorMarketplaceCloudLibraryItem[]> {
  const updates: CreatorMarketplaceCloudLibraryItem[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  while (!signal.aborted) {
    const page = await listCreatorMarketplaceCloudLibrary({
      view: "active",
      limit: 50,
      cursor,
    }, signal);
    updates.push(...page.items.filter((item) => item.updateState === "account-confirmed-update-available"));
    if (!page.hasMore || !page.nextCursor || seen.has(page.nextCursor)) return updates;
    seen.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return updates;
}

function marketNotification(item: CreatorMarketplaceCloudLibraryItem): EngagementNotification | null {
  if (item.catalog.state !== "available" || item.updateState !== "account-confirmed-update-available") return null;
  const installed = item.confirmation.state === "confirmed"
    ? item.confirmation.resourceVersion
    : item.addedFrom.resourceVersion;
  const createdAt = item.confirmation.state === "confirmed"
    ? item.confirmation.lastConfirmedAt
    : item.addedAt;
  return {
    id: `market-update:${item.logicalPackId}:${item.catalog.head.id}`,
    category: "market",
    title: `${item.name} 업데이트 가능`,
    body: `설치 확인 v${installed} → 최신 v${item.catalog.head.resourceVersion}`,
    href: `/market/resource/${encodeURIComponent(item.catalog.head.id)}`,
    createdAt,
    readAt: null,
    archivedAt: null,
    snoozedUntil: null,
    sourceKey: `market-library-update:${item.logicalPackId}`,
  };
}

/** Synchronize durable reader signals and the authenticated production inbox into one presentation inbox. */
export function useEngagementNotificationSync(): void {
  const subscriptions = useApp((state) => state.subscriptions);
  const userId = useApp((state) => state.userId);
  const libraryOwnerId = useApp((state) => state.libraryOwnerId);
  const libraryMergeOwnerId = useApp((state) => state.libraryMergeOwnerId);
  const authGeneration = useApp((state) => state.authGeneration);
  const appHydrated = useHydrated();
  const engagementHydrated = useEngagementHydrated();
  const activeOwnerId = useEngagement((state) => state.activeOwnerId);
  const { ready, status, data: session } = useSession();
  const sessionOwnerId = session?.user.id ?? null;
  const sessionToken = session?.token ?? null;
  const [releaseRefresh, setReleaseRefresh] = useState(0);
  const syncReleaseNotifications = useEngagement((state) => state.syncReleaseNotifications);
  const replaceNotificationsBySourcePrefix = useEngagement(
    (state) => state.replaceNotificationsBySourcePrefix,
  );
  const setNotificationSyncStatus = useEngagement((state) => state.setNotificationSyncStatus);
  const notificationSyncNonce = useEngagement((state) => state.notificationSyncNonce);

  const pendingRef = useRef(0);
  const failedSourcesRef = useRef(new Set<string>());
  const generationRef = useRef(0);

  type FinishResult = "ok" | "failed" | "cancelled";

  const finishRequest = useCallback((generation: number, source: string, result: FinishResult) => {
    if (generation !== generationRef.current) return;
    if (result === "failed") failedSourcesRef.current.add(source);
    pendingRef.current = Math.max(0, pendingRef.current - 1);
    if (pendingRef.current === 0) {
      setNotificationSyncStatus(failedSourcesRef.current.size > 0 ? "error" : "idle");
    }
  }, [setNotificationSyncStatus]);

  const trackRequest = useCallback(
    <T,>(promise: Promise<T>, source: "release" | "production" | "market", signal?: AbortSignal): Promise<T | undefined> => {
      const generation = generationRef.current;
      failedSourcesRef.current.delete(source);
      pendingRef.current += 1;
      setNotificationSyncStatus("loading");
      return promise.then(
        (value) => {
          finishRequest(generation, source, "ok");
          return generation === generationRef.current && !signal?.aborted ? value : undefined;
        },
        (error: unknown) => {
          // 취소(abort)는 실패로 집계하지 않는다.
          finishRequest(
            generation,
            source,
            signal?.aborted || (error instanceof DOMException && error.name === "AbortError") ? "cancelled" : "failed",
          );
          return undefined;
        },
      );
    },
    [finishRequest, setNotificationSyncStatus],
  );

  // 재시도와 세션 변경마다 세대와 실패 목록을 초기화한다. 데이터 이펙트보다 먼저
  // 선언해 같은 배치의 첫 이펙트보다 먼저 실행되도록 한다.
  useEffect(() => {
    generationRef.current += 1;
    pendingRef.current = 0;
    failedSourcesRef.current.clear();
    setNotificationSyncStatus("idle");
    return () => { generationRef.current += 1; };
  }, [notificationSyncNonce, ready, status, sessionOwnerId, sessionToken, setNotificationSyncStatus]);

  // 브라우저의 로컬 날짜를 사용한다. 잠든 탭은 화면 복귀 시 현재 날짜로 다시 계산한다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      timer = setTimeout(refresh, midnight.getTime() - now.getTime() + 50);
    };
    const refresh = () => {
      clearTimeout(timer);
      setReleaseRefresh((value) => value + 1);
      scheduleMidnight();
    };
    const handleVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    scheduleMidnight();
    window.addEventListener("focus", handleVisible);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", handleVisible);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, []);

  const subscriptionIds = useMemo(
    () => Object.entries(subscriptions)
      .filter(([, enabled]) => enabled)
      .map(([titleId]) => titleId)
      .sort((left, right) => left.localeCompare(right)),
    [subscriptions],
  );
  useEffect(() => {
    if (!ready || !appHydrated || !engagementHydrated
      || userId !== sessionOwnerId || libraryOwnerId !== sessionOwnerId
      || (sessionOwnerId === null && libraryMergeOwnerId !== null)
      || activeOwnerId !== sessionOwnerId) return;

    const dateKey = localDateKey(new Date());
    const sourceKeys = new Set(subscriptionIds.map((id) => `catalog-release:${id}:${dateKey}`));
    // 구독 해제와 날짜 전환은 네트워크 성공을 기다리지 않고 즉시 반영한다.
    replaceNotificationsBySourcePrefix("catalog-release:", useEngagement.getState().notifications
      .filter((item) => sourceKeys.has(item.sourceKey)));
    if (subscriptionIds.length === 0) {
      failedSourcesRef.current.delete("release");
      if (pendingRef.current === 0) {
        setNotificationSyncStatus(failedSourcesRef.current.size > 0 ? "error" : "idle");
      }
      return;
    }

    const controller = new AbortController();
    void trackRequest(fetchTitles(subscriptionIds, controller.signal), "release", controller.signal)
      .then((titles) => {
        const current = useApp.getState();
        if (!titles || controller.signal.aborted
          || current.authGeneration !== authGeneration
          || current.subscriptions !== subscriptions
          || useEngagement.getState().activeOwnerId !== sessionOwnerId
          || localDateKey(new Date()) !== dateKey) return;
        const subscribed = new Set(subscriptionIds);
        syncReleaseNotifications(titles.filter((title) => subscribed.has(title.id)));
      });
    return () => controller.abort();
  }, [notificationSyncNonce, releaseRefresh, subscriptionIds, subscriptions, ready, appHydrated,
    engagementHydrated, userId, libraryOwnerId, libraryMergeOwnerId, activeOwnerId, sessionOwnerId,
    sessionToken, status, authGeneration,
    replaceNotificationsBySourcePrefix, syncReleaseNotifications, setNotificationSyncStatus, trackRequest]);

  useEffect(() => {
    if (!ready || status !== "authenticated") {
      replaceNotificationsBySourcePrefix("production-inbox:", []);
      return;
    }
    let active = true;
    void trackRequest(getProductionPersonalInbox(), "production")
      .then((response) => {
        if (!active || !response) return;
        replaceNotificationsBySourcePrefix(
          "production-inbox:",
          response.items.map(productionNotification),
        );
      });
    return () => {
      active = false;
    };
  }, [notificationSyncNonce, ready, replaceNotificationsBySourcePrefix, status, sessionOwnerId, sessionToken, trackRequest]);

  useEffect(() => {
    if (!ready || status !== "authenticated") {
      replaceNotificationsBySourcePrefix("market-library-update:", []);
      return;
    }
    const controller = new AbortController();
    void trackRequest(listMarketUpdates(controller.signal), "market", controller.signal)
      .then((items) => {
        if (!items || controller.signal.aborted) return;
        replaceNotificationsBySourcePrefix(
          "market-library-update:",
          items.flatMap((item) => {
            const notification = marketNotification(item);
            return notification ? [notification] : [];
          }),
        );
      });
    return () => controller.abort();
  }, [notificationSyncNonce, ready, replaceNotificationsBySourcePrefix, status, sessionOwnerId, sessionToken, trackRequest]);
}
