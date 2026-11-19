import { listLegacyWorkspaceVideos, readLegacyWorkspaceVideo, removeLegacyWorkspaceVideo } from "./studio-workspace-video-legacy";
import {
  commitWorkspaceVideoManifest, loadStoredWorkspaceVideo, openWorkspaceVideoManifest, storeWorkspaceVideo,
  type WorkspaceStoredVideo, type WorkspaceVideoManifest,
} from "./studio-workspace-video-storage";

import type { StudioBotRecording } from "./studio-virtual-space-bot-recording";

export interface WorkspaceVideoEntry {
  readonly scope: string;
  readonly recording: StudioBotRecording;
}

function locked<T>(scope: string, task: () => Promise<T>): Promise<T> {
  return navigator.locks.request("toonstudio:workspace-videos:" + scope, task);
}

function availableId(id: string, taken: Set<string>, tag: string): string {
  if (!taken.has(id)) return id;
  let candidate = id + "-" + tag;
  let sequence = 2;
  while (taken.has(candidate)) candidate = id + "-" + tag + "-" + sequence++;
  return candidate;
}

async function remainingLegacy(scope: string, manifest: WorkspaceVideoManifest) {
  const handled = new Set(manifest.handledLegacy);
  const rows = (await listLegacyWorkspaceVideos(scope)).filter(row =>
    row.scope === scope && !handled.has(row.recording.id));
  const taken = new Set([...manifest.videos.map(video => video.recording.id), ...rows.map(row => row.recording.id)]);
  const used = new Set(manifest.videos.map(video => video.recording.id));
  return rows.map(row => {
    const sourceId = row.recording.id;
    const id = used.has(sourceId) ? availableId(sourceId, taken, "legacy") : sourceId;
    taken.add(id);
    return { sourceId, recording: { ...row.recording, id } };
  });
}

type ManifestContext = Awaited<ReturnType<typeof openWorkspaceVideoManifest>>;
type Candidate = Awaited<ReturnType<typeof remainingLegacy>>[number];

async function importLegacy(scope: string, ctx: ManifestContext, candidate: Candidate, blob: Blob) {
  const stored = await storeWorkspaceVideo(scope, candidate.recording, blob);
  const next = {
    ...ctx.manifest, videos: [...ctx.manifest.videos, { ...stored, legacyId: candidate.sourceId }],
    handledLegacy: [...ctx.manifest.handledLegacy, candidate.sourceId],
  };
  await commitWorkspaceVideoManifest(ctx.db, scope, ctx.manifest, next);
  return next;
}

export function listWorkspaceVideos(scope: string, onLegacyUnavailable?: () => void): Promise<WorkspaceVideoEntry[]> {
  return locked(scope, async () => {
    const { manifest } = await openWorkspaceVideoManifest(scope);
    const legacy = await remainingLegacy(scope, manifest).catch(cause => {
      if (!onLegacyUnavailable) throw cause;
      onLegacyUnavailable();
      return [];
    });
    // 목록 조회에는 녹화 본문이 필요 없다. 예전 파일은 처음 열 때 한 편씩 이전한다.
    return [...manifest.videos, ...legacy].map(({ recording }) => ({ scope, recording }))
      .sort((a, b) => b.recording.createdAt - a.recording.createdAt);
  });
}

function sameContent(a: WorkspaceStoredVideo, b: WorkspaceStoredVideo): boolean {
  return a.mime === b.mime && a.size === b.size && a.chunks.length === b.chunks.length
    && a.chunks.every((hash, index) => hash === b.chunks[index]);
}

export function saveWorkspaceVideo(entry: WorkspaceVideoEntry, blob: Blob): Promise<WorkspaceVideoEntry> {
  return locked(entry.scope, async () => {
    const { scope } = entry;
    const { db, manifest } = await openWorkspaceVideoManifest(scope);
    const stored = await storeWorkspaceVideo(scope, entry.recording, blob);
    // 구 DB 접근이 막혀도 별도 정본에 새로 저장할 수 있다. 나중에 겹치는 구 ID는 별도로 나타난다.
    const rows = await remainingLegacy(scope, manifest).catch(() => []);
    const taken = new Set([...manifest.videos, ...rows].map(video => video.recording.id));
    const firstHash = stored.chunks.at(0);
    if (!firstHash) throw new Error("녹화 원본 식별자가 없습니다.");
    const tag = firstHash.slice(7, 19);
    const originalId = entry.recording.id;
    // 같은 ID로 다시 보낸 원본은 하나만 남기고, 다른 원본에는 새 ID를 돌려준다.
    const existing = manifest.videos.find(video =>
      (video.recording.id === originalId || video.recording.id.startsWith(originalId + "-" + tag)) &&
      sameContent(stored, video));
    const id = existing?.recording.id ?? availableId(originalId, taken, tag);
    const recording = { ...entry.recording, id };
    const videos = existing ? manifest.videos : [...manifest.videos, { ...stored, recording }];
    await commitWorkspaceVideoManifest(db, scope, manifest, { ...manifest, videos });
    return { scope, recording: existing?.recording ?? recording };
  });
}

export function readWorkspaceVideo(scope: string, id: string): Promise<Blob | undefined> {
  return locked(scope, async () => {
    const ctx = await openWorkspaceVideoManifest(scope);
    const stored = ctx.manifest.videos.find(video => video.recording.id === id);
    if (stored) return loadStoredWorkspaceVideo(stored);
    const candidate = (await remainingLegacy(scope, ctx.manifest)).find(item => item.recording.id === id);
    if (!candidate) return undefined;
    const raw = await readLegacyWorkspaceVideo(scope, candidate.sourceId);
    if (!raw?.size) throw new Error("이전 녹화 원본을 찾지 못했습니다.");
    try {
      await importLegacy(scope, ctx, candidate, raw);
    } catch {
      // 저장 공간이 부족해도 기존 DB에서 읽은 원본은 다운로드할 수 있고 다음 열기에서 다시 이전한다.
      return raw;
    }
    return raw;
  });
}

export function removeWorkspaceVideo(scope: string, id: string): Promise<void> {
  return locked(scope, async () => {
    const ctx = await openWorkspaceVideoManifest(scope);
    let manifest = ctx.manifest;
    const candidates = await remainingLegacy(scope, manifest);
    // 옛 버전이 나중에 같은 ID를 썼더라도 한쪽 삭제로 다른 파일의 공개 ID가 바뀌지 않는다.
    for (const candidate of candidates.filter(item => item.recording.id === id || item.sourceId === id)) {
      const raw = await readLegacyWorkspaceVideo(scope, candidate.sourceId);
      if (!raw?.size) throw new Error("삭제 전 이전 녹화 원본을 확인하지 못했습니다.");
      manifest = await importLegacy(scope, { ...ctx, manifest }, candidate, raw);
    }
    const stored = manifest.videos.find(video => video.recording.id === id);
    if (!stored) return;
    if (stored.legacyId) await removeLegacyWorkspaceVideo(scope, stored.legacyId);
    const next = { ...manifest, videos: manifest.videos.filter(video => video.recording.id !== id) };
    await commitWorkspaceVideoManifest(ctx.db, scope, manifest, next);
  });
}
