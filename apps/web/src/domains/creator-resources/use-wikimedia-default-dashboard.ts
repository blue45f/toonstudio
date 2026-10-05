/**
 * use-wikimedia-default-dashboard.ts
 *
 * 검색 전 기본 주제(설정의 첫 예시)를 실제 검색 API로 한 번 확인해 그 문서의
 * 일별 시계열을 가져온다. API 미설정·실패·시계열 없음이면 대시보드를 위장하지
 * 않고 "unavailable"로 떨어진다 (큐레이션 타일과 같은 위장 방지 계약).
 */
import { useEffect, useState } from "react";

import { RESOURCE_SEARCH_CONFIG } from "./resource-search-config";

import type { CreatorResource } from "@/shared/lib/creator-resources";

import { parseSearchResult } from "@/shared/lib/creator-resources";
import { apiFetch, apiPath } from "@/platform/api";

export type WikimediaDefaultDashboardState =
  | { phase: "loading" }
  | { phase: "ready"; item: CreatorResource }
  | { phase: "unavailable" };

export function useWikimediaDefaultDashboard(): WikimediaDefaultDashboardState {
  const topic = RESOURCE_SEARCH_CONFIG.wikimedia.examples[0];
  const [state, setState] = useState<WikimediaDefaultDashboardState>({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    let disposed = false;
    setState({ phase: "loading" });
    const search = new URLSearchParams({ provider: "wikimedia", q: topic, page: "1" });
    void apiFetch(apiPath(`/api/creator-resources/search?${search}`), { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("wikimedia_default_unavailable");
        const parsed = parseSearchResult(await response.json());
        if (!parsed || parsed.provider !== "wikimedia" || (parsed.status !== "ready" && parsed.status !== "partial")) throw new Error("wikimedia_default_unavailable");
        const item = parsed.items.find((candidate) => (candidate.dailyViews?.length ?? 0) >= 2);
        if (!disposed) setState(item ? { phase: "ready", item } : { phase: "unavailable" });
      })
      .catch(() => { if (!disposed) setState({ phase: "unavailable" }); })
      .finally(() => { window.clearTimeout(timeout); });
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [topic]);
  return state;
}
