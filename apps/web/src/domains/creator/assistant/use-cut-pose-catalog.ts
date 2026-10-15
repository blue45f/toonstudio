import { useCallback, useEffect, useRef, useState } from "react";

import { cutPoseCatalogLoader } from "./webtoon-cut-pose-catalog";

import type { CutPoseCandidate } from "./webtoon-cut-pose-suggestion";

export type CutPoseCatalogState =
  | { readonly status: "loading" }
  | { readonly status: "error" }
  | { readonly status: "ready"; readonly entries: readonly CutPoseCandidate[] };

export interface UseCutPoseCatalogResult {
  readonly state: CutPoseCatalogState;
  /** 다시 요청한다(오류 화면의 `다시 시도`). */
  readonly retry: () => void;
}

/**
 * 포즈 카탈로그를 지연 로드하고 loading → ready | error 로 알린다.
 * `load` 를 주입하면(시험·대체 카탈로그) 그 함수를 쓰고, 기본은 공유 지연 로더다 —
 * 실패하면 로더가 캐시를 비워서 `retry` 가 실제로 다시 요청한다.
 *
 * 요청은 마운트할 때와 `retry` 를 부를 때만 보낸다. `load` 를 렌더마다 새로 만들어 넘겨도
 * (최신 함수는 ref 로 읽는다) 다시 렌더·재요청의 고리가 생기지 않는다.
 */
export function useCutPoseCatalog(
  load: () => Promise<readonly CutPoseCandidate[]> = cutPoseCatalogLoader.load,
): UseCutPoseCatalogResult {
  const [state, setState] = useState<CutPoseCatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const latestLoad = useRef(load);

  useEffect(() => {
    latestLoad.current = load;
  }, [load]);

  useEffect(() => {
    let live = true;
    setState((current) => (current.status === "loading" ? current : { status: "loading" }));
    latestLoad.current().then(
      (entries) => {
        if (live) setState({ status: "ready", entries });
      },
      () => {
        if (live) setState({ status: "error" });
      },
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { state, retry };
}
