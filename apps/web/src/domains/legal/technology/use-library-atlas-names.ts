import { useEffect, useState } from "react";

/**
 * 기술 도감 카드 id → 카드 이름. 도감 데이터(수백 KB)를 라이브러리 해설의 첫 화면 번들에 넣지 않으려고
 * 렌더 뒤에 한 번만 동적으로 불러온다. 불러오기 전·실패 시에는 `null` 이고, 호출한 쪽이 id 로 링크를 그대로 그린다.
 * (컴포넌트 파일에서 훅을 내보내면 Fast Refresh 규칙에 걸리므로 별도 파일에 둔다.)
 */
let namesCache: ReadonlyMap<string, string> | null = null;
let namesPromise: Promise<ReadonlyMap<string, string>> | null = null;

function loadAtlasNames(): Promise<ReadonlyMap<string, string>> {
  if (!namesPromise) {
    namesPromise = import("./engineering-atlas-content")
      .then(({ ENGINEERING_ATLAS_ENTRIES }) => {
        const names = new Map(ENGINEERING_ATLAS_ENTRIES.map((entry) => [entry.id, entry.name] as const));
        namesCache = names;
        return names;
      })
      .catch((error: unknown) => {
        namesPromise = null;
        throw error;
      });
  }
  return namesPromise;
}

export function useLibraryAtlasNames(enabled: boolean): ReadonlyMap<string, string> | null {
  const [names, setNames] = useState<ReadonlyMap<string, string> | null>(() => namesCache);
  useEffect(() => {
    if (!enabled || names) return undefined;
    let cancelled = false;
    loadAtlasNames()
      .then((loaded) => {
        if (!cancelled) setNames(loaded);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, names]);
  return names;
}
