import { z } from "zod";

import { acquireProductStudioAssetCasStore } from "../studio-asset-library-sqlite-opfs-repository";
import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";

import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";
import type { StudioBotRecording } from "./studio-virtual-space-bot-recording";

const recordingSchema = z.object({
  id: z.string().min(1), title: z.string(), zoneId: z.string(), zoneName: z.string(),
  quality: z.enum(["low", "medium", "high"]), startedAt: z.number().nonnegative(),
  durationMs: z.number().nonnegative(), participantCount: z.number().int().nonnegative(),
  createdAt: z.number().nonnegative(),
});

const videoSchema = z.object({
  recording: recordingSchema, legacyId: z.string().optional(), mime: z.string(), size: z.number().int().positive(),
  chunks: z.array(z.string().regex(/^sha256:[0-9a-f]{64}$/u)).min(1),
});
const manifestSchema = z.object({
  version: z.literal(1), videos: z.array(videoSchema), handledLegacy: z.array(z.string()),
});
export type WorkspaceStoredVideo = z.infer<typeof videoSchema>;
export type WorkspaceVideoManifest = z.infer<typeof manifestSchema>;

const NAMESPACE = "studio-workspace-videos-v1";
const CHUNK_SIZE = 4 * 1024 * 1024;

export async function openWorkspaceVideoManifest(scope: string) {
  const db = await acquireStudioLocalDatabase();
  const raw = await db.kvGet(NAMESPACE, scope);
  const manifest: WorkspaceVideoManifest = raw === null
    ? { version: 1, videos: [], handledLegacy: [] }
    : manifestSchema.parse(JSON.parse(raw));
  return { db, manifest };
}

// 비디오 한 편을 통째로 메모리에 복사하지 않고 OPFS에 저장하고 조각별 원본을 검증한다.
export async function storeWorkspaceVideo(scope: string, recording: StudioBotRecording, raw: Blob): Promise<WorkspaceStoredVideo> {
  recordingSchema.parse(recording);
  if (!raw.size) throw new Error("비어 있는 녹화 파일입니다.");
  const store = await acquireProductStudioAssetCasStore();
  const chunks: string[] = [];
  for (let offset = 0; offset < raw.size; offset += CHUNK_SIZE) {
    const bytes = new Uint8Array(await raw.slice(offset, offset + CHUNK_SIZE).arrayBuffer());
    const { ref } = await store.put(bytes, { mime: raw.type || "application/octet-stream", codec: "identity" });
    const check = await store.get(ref.hash, { verify: true });
    if (check?.byteLength !== bytes.byteLength) throw new Error("녹화 원본을 확인하지 못했습니다.");
    chunks.push(ref.hash);
    await store.setOwnerRefs(NAMESPACE + ":pending:" + scope, chunks);
  }
  return { recording, chunks, mime: raw.type, size: raw.size };
}

export async function loadStoredWorkspaceVideo(video: WorkspaceStoredVideo): Promise<Blob> {
  const store = await acquireProductStudioAssetCasStore();
  const parts: BlobPart[] = [];
  for (const hash of video.chunks) {
    const chunk = await store.get(hash, { verify: true });
    if (!chunk) throw new Error("저장된 녹화 원본을 찾지 못했습니다.");
    parts.push(new Uint8Array(chunk).buffer);
  }
  const raw = new Blob(parts, { type: video.mime });
  if (raw.size !== video.size) throw new Error("저장된 녹화 파일의 크기가 다릅니다.");
  return raw;
}

export async function commitWorkspaceVideoManifest(
  db: Pick<StudioLocalDatabase, "kvSet" | "kvGet">, scope: string, previous: WorkspaceVideoManifest, next: WorkspaceVideoManifest,
): Promise<void> {
  const store: StudioOpfsAssetStore = await acquireProductStudioAssetCasStore();
  const owner = NAMESPACE + ":" + scope;
  const nextRefs = next.videos.flatMap(video => video.chunks);
  const protectedRefs = new Set([...previous.videos.flatMap(video => video.chunks), ...nextRefs]);
  await store.setOwnerRefs(owner, [...protectedRefs]);
  const raw = JSON.stringify(next);
  try {
    await db.kvSet(NAMESPACE, scope, raw);
  } catch (cause) {
    // 워커 응답만 유실됐을 때 재확인한다. 판정 전에는 양쪽 원본 참조를 유지한다.
    if (await db.kvGet(NAMESPACE, scope) !== raw) throw cause;
  }
  // 반영 이후 회수 실패는 다음 커밋에서 복구된다. 이미 저장된 영상을 실패로 표시하지 않는다.
  await store.setOwnerRefs(owner, nextRefs).catch(() => undefined);
  await store.setOwnerRefs(NAMESPACE + ":pending:" + scope, []).catch(() => undefined);
}
