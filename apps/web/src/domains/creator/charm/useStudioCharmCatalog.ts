/**
 * 참 카탈로그를 불러오고(지연 데이터) 만드는 훅.
 *
 * 효과·스티커·소품·효과음 SVG 는 참 바가 열릴 때 한 번 불러온다. 불러오는 동안은 `loading`,
 * 실패하면 `error` 이며 `retry()` 로 다시 시도한다. 로딩 중에도 이모지·요소·말풍선 같은 정적 항목은
 * 바로 해석된다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { buildStudioCharmCatalog, type StudioCharmCatalog } from "./studio-charm-catalog";
import { loadStudioCharmCatalogData } from "./studio-charm-catalog-data";

import type { StudioCharmCatalogData, StudioCharmLibraryAsset } from "./studio-charm-descriptor";

export type StudioCharmCatalogStatus = "loading" | "ready" | "error";

export interface UseStudioCharmCatalogOptions {
  readonly library: readonly StudioCharmLibraryAsset[];
  readonly libraryReady: boolean;
  /** 시험용으로 지연 데이터 로더를 바꾼다. */
  readonly loadData?: () => Promise<StudioCharmCatalogData>;
}

export interface UseStudioCharmCatalogResult {
  readonly catalog: StudioCharmCatalog;
  readonly status: StudioCharmCatalogStatus;
  readonly retry: () => void;
}

export function useStudioCharmCatalog({
  library,
  libraryReady,
  loadData = loadStudioCharmCatalogData,
}: UseStudioCharmCatalogOptions): UseStudioCharmCatalogResult {
  const [data, setData] = useState<StudioCharmCatalogData | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    loadData().then(
      (loaded) => {
        if (active) setData(loaded);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [loadData, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  const catalog = useMemo(
    () => buildStudioCharmCatalog({ data, library, libraryReady }),
    [data, library, libraryReady],
  );
  const status: StudioCharmCatalogStatus = data ? "ready" : failed ? "error" : "loading";
  return { catalog, status, retry };
}
