import { useEffect, useMemo, useState } from "react";

import { subscribeStudioBg3dAssetRightsChanged } from "./studio-bg3d-asset-rights-refresh";
import { loadStudioBg3dAssetRightsSources } from "./studio-bg3d-asset-rights-source";
import { buildStudioBg3dAssetRightsViews } from "./studio-bg3d-asset-rights-view";

import type { Bg3dModelLibraryEntry } from "./bg3d-model-library";
import type {
  StudioBg3dAssetRightsSourceOptions,
  StudioBg3dAssetRightsSourceResult,
} from "./studio-bg3d-asset-rights-source";
import type {
  StudioBg3dAssetRightsSources,
  StudioBg3dAssetRightsView,
} from "./studio-bg3d-asset-rights-view";

/**
 * loading: 가져온 소재의 권리 기록을 읽는 중 / ready: 모두 읽음(또는 읽을 것이 없음) /
 * partial: 한쪽 원천을 읽지 못함 / error: 두 원천을 모두 읽지 못함. partial·error 에서도 목록은 그대로 보이고
 * 읽지 못한 값은 "미확인"이다.
 */
export type StudioBg3dAssetRightsLoadState = "loading" | "ready" | "partial" | "error";

const ALL_SOURCES_FAILED: StudioBg3dAssetRightsSourceResult = Object.freeze({
  libraryRightsById: new Map(),
  metadataByHash: new Map(),
  failed: Object.freeze({ library: true, metadata: true }),
});

type EntryLike = Pick<
  Bg3dModelLibraryEntry,
  "id" | "name" | "format" | "source" | "createdAt" | "updatedAt" | "contentHash" | "byteSize"
>;

export interface StudioBg3dAssetRightsHookResult {
  readonly views: ReadonlyMap<string, StudioBg3dAssetRightsView>;
  readonly state: StudioBg3dAssetRightsLoadState;
}

/**
 * 라이브러리 항목의 권리 보기를 만든다. 가져온 소재가 있을 때만 저장소를 읽고, 항목 목록이 바뀌거나(가져오기·삭제)
 * 권리 기록이 새로 저장되면(가져오기 직후의 AI 사용 표기 저장은 목록이 그려진 뒤에 끝난다) 다시 읽는다.
 * 다시 읽는 동안에는 직전 결과를 계속 쓴다.
 */
export function useStudioBg3dAssetRights(
  entries: readonly EntryLike[],
  provenanceOf: StudioBg3dAssetRightsSources["provenanceOf"],
  load: (options?: StudioBg3dAssetRightsSourceOptions) => Promise<StudioBg3dAssetRightsSourceResult> = loadStudioBg3dAssetRightsSources,
): StudioBg3dAssetRightsHookResult {
  const importedKey = useMemo(
    () => entries
      .filter((entry) => entry.source !== "sample")
      .map((entry) => `${entry.id}|${entry.contentHash ?? ""}|${entry.updatedAt}`)
      .join("\n"),
    [entries],
  );
  const [loaded, setLoaded] = useState<{ readonly key: string; readonly result: StudioBg3dAssetRightsSourceResult } | null>(null);
  // 권리 기록이 새로 저장될 때마다 올라가는 번호. 목록은 그대로여도 다시 읽게 한다.
  const [revision, setRevision] = useState(0);
  useEffect(() => subscribeStudioBg3dAssetRightsChanged(() => setRevision((value) => value + 1)), []);

  useEffect(() => {
    if (importedKey === "") return undefined;
    const controller = new AbortController();
    const settle = (result: StudioBg3dAssetRightsSourceResult) => {
      if (!controller.signal.aborted) setLoaded({ key: importedKey, result });
    };
    // 읽기 함수가 던져도 목록은 그대로 두고 두 원천을 모두 읽지 못한 것으로 알린다.
    load({ signal: controller.signal }).then(settle, () => settle(ALL_SOURCES_FAILED));
    return () => controller.abort();
  }, [importedKey, revision, load]);

  const result = loaded?.result ?? null;
  // 다시 읽는 동안에는 직전 값을 계속 쓰지만, 직전 읽기의 실패 사실은 지금 목록에 대한 것이 아니라 소재 카드에 알리지 않는다.
  const failed = loaded?.key === importedKey ? loaded.result.failed : undefined;
  const views = useMemo(
    () => buildStudioBg3dAssetRightsViews(entries, {
      libraryRightsById: result?.libraryRightsById,
      metadataByHash: result?.metadataByHash,
      failed,
      provenanceOf,
    }),
    [entries, result, failed, provenanceOf],
  );

  let state: StudioBg3dAssetRightsLoadState = "ready";
  if (importedKey !== "") {
    if (loaded?.key !== importedKey) state = "loading";
    else if (loaded.result.failed.library && loaded.result.failed.metadata) state = "error";
    else if (loaded.result.failed.library || loaded.result.failed.metadata) state = "partial";
  }
  return { views, state };
}
