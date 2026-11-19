import { vi } from "vitest";

/** 실제 비동기 KV 계약을 사용하고 읽기·쓰기 실패를 독립적으로 주입한다. */
export function createSpaceDeviceRecordFixture() {
  const records = new Map<string, string>();
  const kvGet = vi.fn(async (_namespace: string, key: string) => records.get(key) ?? null);
  const kvSet = vi.fn(async (_namespace: string, key: string, value: string) => { records.set(key, value); });
  return { records, kvGet, kvSet };
}
