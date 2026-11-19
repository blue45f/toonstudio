import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";

const namespace = "studio-space-device-records-v1";
function openChannel() {
  try { return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(namespace); }
  catch { return null; } // 저장 권위와 별개인 탭 간 알림은 지원되지 않을 수 있다.
}

const localChange = "studio-space-device-record-change";
const queues = new Map<string, Promise<unknown>>();
type Change = { value: string | null; preserveDamaged?: boolean };

function serialize<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(namespace + ":" + key, run);
  }
  const next = (queues.get(key) ?? Promise.resolve()).then(run, run);
  queues.set(key, next);
  const release = () => { if (queues.get(key) === next) queues.delete(key); };
  void next.then(release, release);
  return next;
}

export function observeStudioSpaceRecords(onChange: (key: string) => void): () => void {
  const receive = (event: Event) => onChange((event as CustomEvent<string>).detail);
  const channel = openChannel();
  if (channel) channel.onmessage = event => { if (typeof event.data === "string") onChange(event.data); };
  window.addEventListener(localChange, receive);
  return () => { window.removeEventListener(localChange, receive); channel?.close(); };
}

function announced(key: string) {
  window.dispatchEvent(new CustomEvent(localChange, { detail: key }));
  const channel = openChannel();
  if (!channel) return;
  try { channel.postMessage(key); }
  catch { /* 브라우저가 탭 간 알림을 거절해도 현재 탭에는 저장 결과가 전달됐다. */ }
  finally { channel.close(); }
}

/** 이전 기기 값은 처음 한 번 읽는다. SQLite의 null 표식은 삭제한 항목의 재이관을 막는다. */
export function accessStudioSpaceRecord(
  key: string,
  change?: (current: string | null) => Change,
  isCurrent: () => boolean = () => true,
): Promise<string | null> {
  return serialize(key, async () => {
    const db = await acquireStudioLocalDatabase();
    const stored = await db.kvGet(namespace, key);
    const current: unknown = stored === null ? window.localStorage.getItem(key) : JSON.parse(stored);
    if (current !== null && typeof current !== "string") throw new Error("저장된 작업실 항목의 형식이 올바르지 않습니다.");
    if (!isCurrent()) return current;
    const next = change?.(current);
    const value = next ? next.value : current;
    if ((stored === null && current !== null) || value !== current) {
      // 원본과 복구본은 같은 키의 직렬 구간에서 기록한다. 복사 실패 시 원본을 덮어쓰지 않는다.
      if (next?.preserveDamaged && current !== null) {
        await db.kvSet(namespace, key + ":recovery:" + crypto.randomUUID(), JSON.stringify(current));
      }
      if (!isCurrent()) return current;
      await db.kvSet(namespace, key, JSON.stringify(value));
      if (value !== current) announced(key);
    }
    return value;
  });
}
