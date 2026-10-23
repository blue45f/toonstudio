/**
 * 미리보기용 객체 URL 관리 — Blob 목록에 맞춰 URL 을 만들고, 빠진 항목과 화면을 떠날 때 해제한다.
 *
 * 객체 URL 은 브라우저 바깥에 잡히는 자원이라 effect 로 맞춘다. 만들 수 없는 환경(비트맵 URL 미지원 등)에서는 해당 항목의
 * URL 이 없고, 화면은 미리보기 없이 이름과 상태만 보여 준다.
 */
import { useEffect, useRef, useState } from "react";

export interface ObjectUrlEntry {
  readonly id: string;
  readonly blob: Blob;
}

function createUrl(blob: Blob): string | null {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

function revokeUrl(url: string): void {
  try {
    if (typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
  } catch {
    // 이미 해제됐거나 지원하지 않는 환경이면 더 할 일이 없다.
  }
}

/** `entries` 는 호출자가 useMemo 로 안정시켜 넘긴다. 같은 id 는 URL 을 다시 만들지 않는다. */
export function useObjectUrls(entries: readonly ObjectUrlEntry[]): ReadonlyMap<string, string> {
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const createdRef = useRef(new Map<string, string>());

  useEffect(() => {
    const created = createdRef.current;
    const wanted = new Map(entries.map((entry) => [entry.id, entry.blob] as const));
    let changed = false;
    for (const [id, url] of [...created]) {
      if (wanted.has(id)) continue;
      revokeUrl(url);
      created.delete(id);
      changed = true;
    }
    for (const [id, blob] of wanted) {
      if (created.has(id)) continue;
      const url = createUrl(blob);
      if (url === null) continue;
      created.set(id, url);
      changed = true;
    }
    if (changed) setUrls(new Map(created));
  }, [entries]);

  useEffect(() => {
    const created = createdRef.current;
    return () => {
      for (const url of created.values()) revokeUrl(url);
      created.clear();
    };
  }, []);

  return urls;
}
