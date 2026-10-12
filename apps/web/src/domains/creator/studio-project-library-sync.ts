// 작품 라이브러리 계정 동기화 (사용성 웨이브 2 — 이어가기 계정 연속성).
// 지금까지 라이브러리는 기기 로컬이 유일한 정본이라 기기를 바꾸면 이어가기가 끊겼다.
// 로그인 상태에서는 서버(/studio-project-library)와 항목 단위로 병합한다:
// 최신 updatedAt이 이기고, 삭제는 영구 삭제를 기록해 둔 명시 목록으로만 전파된다.
// 게스트는 이 모듈을 타지 않는다 — 게스트의 정본은 계속 기기 로컬이다.
import {
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
  readStudioProjectLibrary,
  writeStudioProjectLibrary,
  type StudioProjectLibraryEntry,
  type StudioProjectLibraryStorage,
} from "./studio-project-library-store";

import { api } from "@/platform/api";

export const STUDIO_PROJECT_LIBRARY_DELETED_KEY =
  "toonspectrum:studio-project-library-deleted:v1";

export interface StudioProjectLibraryTransport {
  fetchServer(): Promise<{ readonly projects: readonly StudioProjectLibraryEntry[] }>;
  pushServer(body: {
    readonly projects: readonly StudioProjectLibraryEntry[];
    readonly deletedIds: readonly string[];
  }): Promise<{ readonly projects: readonly StudioProjectLibraryEntry[] }>;
}

const defaultTransport: StudioProjectLibraryTransport = {
  fetchServer: () =>
    api.get<{ projects: readonly StudioProjectLibraryEntry[] }>("/studio-project-library"),
  pushServer: (body) =>
    api.put<{ projects: readonly StudioProjectLibraryEntry[] }>("/studio-project-library", body),
};

export function readPendingDeletedIds(storage: StudioProjectLibraryStorage): readonly string[] {
  try {
    const raw = storage.getItem(STUDIO_PROJECT_LIBRARY_DELETED_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
  } catch {
    return [];
  }
}

export function recordPendingDeletedId(storage: StudioProjectLibraryStorage, projectId: string): void {
  const current = readPendingDeletedIds(storage);
  if (current.includes(projectId)) return;
  try {
    storage.setItem(STUDIO_PROJECT_LIBRARY_DELETED_KEY, JSON.stringify([...current, projectId]));
  } catch {
    // 저장 실패는 삭제 자체를 막지 않는다 — 다음 동기화에서 부재로 남을 뿐이다.
  }
}

function clearPendingDeletedIds(storage: StudioProjectLibraryStorage, sentIds: readonly string[]): void {
  if (sentIds.length === 0) return;
  const sent = new Set(sentIds);
  const remaining = readPendingDeletedIds(storage).filter((id) => !sent.has(id));
  try {
    storage.setItem(STUDIO_PROJECT_LIBRARY_DELETED_KEY, JSON.stringify(remaining));
  } catch {
    // 다음 동기화가 같은 삭제를 다시 보내도 서버 병합은 멱등하다.
  }
}

/** 서버와 같은 병합 규칙: 삭제 명시분 제거, 항목별 최신 우선, 최근 연 순 정렬. */
export function mergeStudioProjectLibraryEntries(
  local: readonly StudioProjectLibraryEntry[],
  server: readonly StudioProjectLibraryEntry[],
  deletedIds: readonly string[],
): readonly StudioProjectLibraryEntry[] {
  const deleted = new Set(deletedIds);
  const byId = new Map<string, StudioProjectLibraryEntry>();
  for (const entry of local) {
    if (!deleted.has(entry.id)) byId.set(entry.id, entry);
  }
  for (const entry of server) {
    if (deleted.has(entry.id)) continue;
    const current = byId.get(entry.id);
    if (!current || Date.parse(entry.updatedAt) >= Date.parse(current.updatedAt)) {
      byId.set(entry.id, entry);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const byOpened = Date.parse(b.lastOpenedAt) - Date.parse(a.lastOpenedAt);
    return byOpened !== 0 ? byOpened : a.id.localeCompare(b.id);
  });
}

function librarySignature(projects: readonly StudioProjectLibraryEntry[]): string {
  return projects.map((project) => `${project.id}@${project.updatedAt}`).join("|");
}

export type StudioProjectLibrarySyncResult =
  | { readonly kind: "synced"; readonly projects: number }
  | { readonly kind: "failed" };

/**
 * 한 번의 동기화: 서버 조회 → 로컬과 병합 → 병합본 업로드 → 응답으로 로컬 수렴.
 * 실패하면 로컬은 건드리지 않는다 (다음 기회에 같은 상태에서 재시도하면 된다).
 */
export async function syncStudioProjectLibrary(options: {
  readonly storage: StudioProjectLibraryStorage;
  readonly target?: EventTarget;
  readonly transport?: StudioProjectLibraryTransport;
  readonly now?: () => string;
}): Promise<StudioProjectLibrarySyncResult> {
  const transport = options.transport ?? defaultTransport;
  const deletedIds = readPendingDeletedIds(options.storage);
  const local = readStudioProjectLibrary(options.storage);

  let serverProjects: readonly StudioProjectLibraryEntry[];
  try {
    serverProjects = (await transport.fetchServer()).projects;
  } catch {
    return { kind: "failed" };
  }
  const merged = mergeStudioProjectLibraryEntries(local.projects, serverProjects, deletedIds);

  let authoritative: readonly StudioProjectLibraryEntry[];
  try {
    const response = await transport.pushServer({ projects: merged, deletedIds });
    authoritative = mergeStudioProjectLibraryEntries(merged, response.projects, deletedIds);
  } catch {
    return { kind: "failed" };
  }

  if (librarySignature(readStudioProjectLibrary(options.storage).projects) !== librarySignature(authoritative)) {
    const latest = authoritative.reduce<string | null>(
      (max, entry) => (max === null || entry.updatedAt > max ? entry.updatedAt : max),
      null,
    );
    writeStudioProjectLibrary(
      options.storage,
      {
        schemaVersion: 1,
        projects: authoritative,
        updatedAt: latest ?? (options.now ? options.now() : new Date().toISOString()),
      },
      options.target,
    );
  }
  clearPendingDeletedIds(options.storage, deletedIds);
  return { kind: "synced", projects: authoritative.length };
}

// ── 세션 러너: 로그인한 사용자당 한 번 붙고, 로컬 변경을 디바운스로 따라간다 ──

let runnerUserId: string | null = null;
let runnerAttached = false;
let lastSyncedSignature = "";
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let inFlight = false;

async function runSyncOnce(): Promise<void> {
  if (inFlight || typeof window === "undefined") return;
  inFlight = true;
  try {
    const result = await syncStudioProjectLibrary({
      storage: window.localStorage,
      target: window,
    });
    if (result.kind === "synced") {
      lastSyncedSignature = librarySignature(readStudioProjectLibrary(window.localStorage).projects);
    }
  } finally {
    inFlight = false;
  }
}

/** 로그인 사용자에게 동기화를 건다. 게스트(null)면 아무것도 하지 않는다. */
export function startStudioProjectLibrarySync(userId: string | null): void {
  if (!userId || typeof window === "undefined") return;
  if (runnerUserId !== userId) {
    runnerUserId = userId;
    lastSyncedSignature = "";
  }
  if (!runnerAttached) {
    runnerAttached = true;
    window.addEventListener(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, () => {
      // 동기화 도중의 쓰기는 스스로 유발한 것이라 무시하고, 방금 동기화한 상태와
      // 서명이 같으면 다시 보내지 않는다 — 자가 유발 루프를 두 겹으로 끊는다.
      if (inFlight) return;
      const current = librarySignature(readStudioProjectLibrary(window.localStorage).projects);
      if (current === lastSyncedSignature) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => void runSyncOnce(), 1_500);
    });
  }
  void runSyncOnce();
}
