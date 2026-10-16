/**
 * 내 소재(라이브러리) 목록을 참 바가 쓸 수 있게 준비하는 훅.
 *
 * 편집기 호스트는 "내 에셋" 메뉴를 열 때에야 보관함 목록을 읽는다. 그 전에는 `assets` 가 비어 있고
 * `assetsLoaded` 도 false 라서 그대로 믿으면 고정해 둔 내 소재 참이 곧바로 "사용할 수 없는 참"으로 보이고
 * 선택기의 "내 소재"도 빈 것처럼 보인다. 그래서 목록이 실제로 필요한 때(내 소재 참이 고정돼 있거나 선택기가
 * 열려 있을 때)에만 다음 순서로 정한다.
 * - 호스트가 이미 읽었으면 그 목록을 그대로 쓴다(저장·삭제·이름 바꾸기가 즉시 맞는다).
 * - 호스트가 지금 읽는 중이면 끝날 때까지 기다린다(같은 보관함을 두 번 읽지 않는다).
 * - 아니면 같은 보관함에서 읽기 전용으로 한 번 읽는다. 읽기 전용 경로(`listAssetsReadOnly`)는 보관함을
 *   정리(sweep)하지 않으므로 호스트의 저장·삭제와 부딪히지 않는다. 실패하면 `error` 이며 `retry()` 로 다시 읽는다.
 */

import { useCallback, useEffect, useState } from "react";

import type { StudioCharmLibraryAsset } from "./studio-charm-descriptor";

export type StudioCharmLibraryStatus = "idle" | "loading" | "ready" | "error";

/** 호스트(편집기)가 들고 있는 내 소재 목록과 읽기 상태. */
export interface StudioCharmHostLibrary {
  readonly assets: readonly StudioCharmLibraryAsset[];
  /** 보관함 읽기를 끝냈는지(실패해 메모리 모드로 내려간 경우도 true). */
  readonly loaded: boolean;
  /** 지금 읽는 중인지. */
  readonly loading: boolean;
}

export interface UseStudioCharmLibraryOptions {
  readonly host: StudioCharmHostLibrary;
  /** 목록이 실제로 필요한지: 내 소재 참이 고정돼 있거나 선택기가 열려 있다. */
  readonly needed: boolean;
  /** 시험용으로 읽기 함수를 바꾼다. 기본은 보관함의 읽기 전용 목록이다. */
  readonly loadLibrary?: () => Promise<readonly StudioCharmLibraryAsset[]>;
}

export interface UseStudioCharmLibraryResult {
  readonly library: readonly StudioCharmLibraryAsset[];
  /** 내 소재 참을 해석해도 되는지. false 인 동안 내 소재 참은 자리표시로 남는다. */
  readonly ready: boolean;
  readonly status: StudioCharmLibraryStatus;
  readonly retry: () => void;
}

const EMPTY_LIBRARY: readonly StudioCharmLibraryAsset[] = Object.freeze([]);

async function readLibraryReadOnly(): Promise<readonly StudioCharmLibraryAsset[]> {
  const library = await import("../studio-asset-library");
  return library.listAssetsReadOnly();
}

export function useStudioCharmLibrary({
  host,
  needed,
  loadLibrary = readLibraryReadOnly,
}: UseStudioCharmLibraryOptions): UseStudioCharmLibraryResult {
  const [owned, setOwned] = useState<readonly StudioCharmLibraryAsset[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // 실패한 뒤에는 사용자가 다시 시도를 누를 때까지 자동으로 되풀이해 읽지 않는다.
  const wantsOwnRead = needed && !host.loaded && !host.loading && owned === null && !failed;

  useEffect(() => {
    if (!wantsOwnRead) return;
    let active = true;
    loadLibrary().then(
      (loaded) => {
        if (active) setOwned(loaded);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [wantsOwnRead, attempt, loadLibrary]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((value) => value + 1);
  }, []);

  if (host.loaded) return { library: host.assets, ready: true, status: "ready", retry };
  if (owned) return { library: owned, ready: true, status: "ready", retry };
  const status: StudioCharmLibraryStatus = failed ? "error" : needed || host.loading ? "loading" : "idle";
  return { library: EMPTY_LIBRARY, ready: false, status, retry };
}
