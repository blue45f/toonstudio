/**
 * 키트 GLB 바이트 캐시(계약 4.2). 같은 URL의 파일을 다시 받지 않는다 — 파츠 하나를 바꿀 때마다 8 MiB 베이스를 다시 내려받지 않고,
 * 지오메트리 슬롯 썸네일(임시 리그)이 같은 베이스·파츠를 반복해서 여는 비용도 줄인다. 순수 TS(Babylon·fetch 없음)다.
 *
 * - 합계 바이트 상한을 넘으면 가장 오래 쓰지 않은 항목부터 제거한다(최근 사용 우선 유지, Map 삽입 순서 이용).
 * - 상한보다 큰 항목 하나는 캐시하지 않는다(넣으면 전체를 비우게 되므로).
 * - 바이트를 검증하지 않는다. 호출자(키트 로더)가 `bytes`·SHA-256을 대조하고, 실패하면 `delete`로 해당 항목을 버린다.
 */

/** 키트 GLB 바이트 캐시 합계 상한(64 MiB, 계약 4.2) */
export const KIT_BYTES_CACHE_LIMIT = 64 * 1024 * 1024;

export interface KitBytesCache {
  /** 캐시된 바이트(없으면 undefined). 읽으면 최근 사용으로 갱신한다. */
  get(url: string): Uint8Array | undefined;
  /** 캐시에 넣는다. 합계 상한을 넘기면 오래된 항목부터 제거한다. 상한보다 큰 항목은 넣지 않고 false를 돌려준다. */
  set(url: string, bytes: Uint8Array): boolean;
  delete(url: string): void;
  clear(): void;
  /** 지금 캐시된 합계 바이트 */
  size(): number;
  /** 캐시된 URL(오래된 것부터, 점검·테스트용) */
  urls(): readonly string[];
}

export function createKitBytesCache(limitBytes: number = KIT_BYTES_CACHE_LIMIT): KitBytesCache {
  const entries = new Map<string, Uint8Array>();
  let total = 0;
  return {
    get(url) {
      const found = entries.get(url);
      if (found === undefined) return undefined;
      entries.delete(url);
      entries.set(url, found);
      return found;
    },
    set(url, bytes) {
      const previous = entries.get(url);
      if (previous !== undefined) {
        total -= previous.byteLength;
        entries.delete(url);
      }
      if (bytes.byteLength > limitBytes) return false;
      entries.set(url, bytes);
      total += bytes.byteLength;
      for (const [oldest, value] of entries) {
        if (total <= limitBytes) break;
        if (oldest === url) continue;
        entries.delete(oldest);
        total -= value.byteLength;
      }
      return true;
    },
    delete(url) {
      const previous = entries.get(url);
      if (previous === undefined) return;
      entries.delete(url);
      total -= previous.byteLength;
    },
    clear() {
      entries.clear();
      total = 0;
    },
    size: () => total,
    urls: () => [...entries.keys()],
  };
}
