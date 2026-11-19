import { z } from "zod";

import { sha256HexPortable } from "../studio-sha256";
import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsNativeFileSystem, type StudioOpfsStorageManagerLike } from "../studio-opfs-filesystem";
import type { StudioRecordingTake } from "./studio-virtual-space-recording-booth";

const namespace = "studio-recording-booth-drafts-v1";
const id = z.string().min(1).max(160);
const entrySchema = z.object({
  take: z.object({ id, sessionId: id, boothId: id, durationSec: z.number().int().positive(),
    recordedAtMs: z.number().int().nonnegative(), mimeType: z.literal("audio/webm"), estimatedBytes: z.number().int().positive() }),
  hash: z.string().regex(/^sha256:[0-9a-f]{64}$/u),
  mime: z.string().max(120).regex(/^audio\/webm(?:;|$)/iu),
});
export type StudioBoothDraft = z.infer<typeof entrySchema>;

async function storage<T>(scope: string, operation: (
  entries: StudioBoothDraft[], files: ReturnType<typeof createStudioOpfsAssetStore>, commit: (rows: StudioBoothDraft[]) => Promise<void>,
) => Promise<T>) {
  if (!navigator.locks || !navigator.storage?.getDirectory) throw new Error("기기 녹음 보관함을 열 수 없어요.");
  const key = sha256HexPortable(new TextEncoder().encode(scope));
  return navigator.locks.request(`${namespace}:${key}`, async () => {
    const db = await acquireStudioLocalDatabase();
    const files = createStudioOpfsAssetStore({
      fs: createStudioOpfsNativeFileSystem(navigator.storage as unknown as StudioOpfsStorageManagerLike, `${namespace}-${key}`),
    });
    const raw = await db.kvGet(namespace, key);
    const entries = raw === null ? [] : z.array(entrySchema).parse(JSON.parse(raw));
    return operation(entries, files, rows => db.kvSet(namespace, key, JSON.stringify(rows)));
  });
}

export function listStudioBoothDrafts(scope: string) {
  return storage(scope, async (entries, files) => {
    // 메타데이터 커밋 직후 창을 닫았거나 쓰기가 실패한 경우에도 녹음 파일을 다시 정리한다.
    await files.setOwnerRefs(namespace, entries.map(row => row.hash));
    await files.sweep({ graceMs: 0 });
    return entries;
  });
}

export function saveStudioBoothDraft(scope: string, take: StudioRecordingTake, blob: Blob) {
  return storage(scope, async (entries, files, commit) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { ref } = await files.put(bytes, { mime: blob.type, codec: "identity" });
    const entry = entrySchema.parse({ take, mime: blob.type, hash: ref.hash });
    if (ref.bytes !== take.estimatedBytes) throw new Error("테이크의 파일 크기가 달라요.");
    const existing = entries.find(row => row.take.id === take.id);
    if (existing) {
      if (existing.hash !== entry.hash || existing.take.recordedAtMs !== take.recordedAtMs) throw new Error("다른 테이크가 같은 이름을 사용하고 있어요.");
      return existing;
    }
    const next = [...entries, entry];
    await files.setOwnerRefs(namespace, next.map(row => row.hash));
    await commit(next);
    return entry;
  });
}

export function readStudioBoothDraft(scope: string, id: string) {
  return storage(scope, async (entries, files) => {
    const entry = entries.find(row => row.take.id === id);
    if (!entry) throw new Error("이 보관함에 해당 테이크가 없어요.");
    const bytes = await files.get(entry.hash, { verify: true });
    if (!bytes || bytes.length !== entry.take.estimatedBytes) throw new Error("보관한 테이크 파일을 복구하지 못했어요.");
    return new Blob([new Uint8Array(bytes)], { type: entry.mime });
  });
}

export function removeStudioBoothDraft(scope: string, id: string) {
  return storage(scope, async (entries, files, commit) => {
    const entry = entries.find(row => row.take.id === id);
    if (!entry) return;
    const remaining = entries.filter(row => row.take.id !== id);
    await commit(remaining);
    await files.setOwnerRefs(namespace, remaining.map(row => row.hash));
    if (!remaining.some(row => row.hash === entry.hash)) await files.delete(entry.hash);
  });
}
