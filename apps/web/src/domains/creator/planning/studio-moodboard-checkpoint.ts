import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import { acquireStudioLocalDatabase, resetFailedStudioLocalDatabaseOwnership } from "../studio-local-database-runtime";
import { deserializeMoodboard, serializeMoodboard, studioMoodboardStorageKey, type Moodboard } from "./studio-moodboard";

export interface MoodboardCheckpoint {
  savedAt: string;
  board: Moodboard;
}

const namespace = "studio-project-moodboard-checkpoints";
export async function getMoodboardCheckpointStore(retry = false) {
  if (retry) await resetFailedStudioLocalDatabaseOwnership();
  return (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(namespace);
}

export async function readMoodboardCheckpoint(store: StudioAsyncKeyValueStore, project: string): Promise<MoodboardCheckpoint | null> {
  const raw = await store.get(studioMoodboardStorageKey(project));
  if (raw === null) return null;
  const entry: unknown = JSON.parse(raw);
  if (!entry || typeof entry !== "object" || !("savedAt" in entry) || typeof entry.savedAt !== "string"
    || !Number.isFinite(Date.parse(entry.savedAt)) || !("board" in entry) || typeof entry.board !== "string") {
    throw new Error("무드보드 복구본 형식을 읽을 수 없어요.");
  }
  const parsed = deserializeMoodboard(entry.board);
  if (!parsed.ok || parsed.board.projectId !== project) throw new Error("이 작품의 복구본을 확인할 수 없어요.");
  return { savedAt: entry.savedAt, board: parsed.board };
}

/** 다른 창에서 교체한 복구본은 사용자가 다시 확인한 뒤에만 덮을 수 있다. */
export async function writeMoodboardCheckpoint(store: StudioAsyncKeyValueStore, project: string, board: Moodboard, previous: MoodboardCheckpoint | null) {
  const key = studioMoodboardStorageKey(project);
  const serialized = serializeMoodboard(board);
  const checked = deserializeMoodboard(serialized);
  if (!checked.ok || checked.board.projectId !== project) throw new Error("다른 작품의 보드는 여기에 저장할 수 없어요.");
  const write = async () => {
    const current = await readMoodboardCheckpoint(store, project);
    if (current?.savedAt !== previous?.savedAt || (current && previous && serializeMoodboard(current.board) !== serializeMoodboard(previous.board))) {
      throw new Error("다른 창에서 복구본을 바꿨어요. 다시 불러온 뒤 확인해 주세요.");
    }
    const savedAt = new Date().toISOString();
    await store.set(key, JSON.stringify({ savedAt, board: serialized }));
    return { savedAt, board: checked.board };
  };
  return globalThis.navigator?.locks ? navigator.locks.request(namespace + "/" + key, write) : write();
}
