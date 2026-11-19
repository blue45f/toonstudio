import { createDefaultStudioProjectMoodboard, deserializeMoodboard, serializeMoodboard, studioMoodboardStorageKey, type Moodboard } from "./studio-moodboard";
import { withPlanningDocument } from "./studio-planning-document-store";

export type DeviceBoard = { kind: "ready"; board: Moodboard; raw: string } | { kind: "broken"; reason: string; raw: string };
export class MoodboardChanged extends Error {}

function parseBoard(projectId: string, raw: string): DeviceBoard {
  const parsed = deserializeMoodboard(raw);
  if (!parsed.ok) return { kind: "broken", reason: parsed.reason, raw };
  if (parsed.board.projectId !== undefined && parsed.board.projectId !== projectId) {
    return { kind: "broken", reason: "다른 작품의 무드보드예요.", raw };
  }
  const board = parsed.board.projectId ? parsed.board : { ...parsed.board, projectId };
  return { kind: "ready", board, raw: serializeMoodboard(board) };
}

/** 대본이나 인물 시트에서 출처를 대조할 때 빈 보드를 새로 만들지 않는다. */
export function readDeviceMoodboard(projectId: string) {
  return withPlanningDocument("studio-project-moodboards", studioMoodboardStorageKey(projectId), async (_store, raw) =>
    raw === null ? null : parseBoard(projectId, raw));
}

export async function loadDeviceMoodboard(projectId: string): Promise<DeviceBoard> {
  const key = studioMoodboardStorageKey(projectId);
  return withPlanningDocument("studio-project-moodboards", key, async (store, raw) => {
    const state = parseBoard(projectId, raw ?? serializeMoodboard(createDefaultStudioProjectMoodboard(projectId)));
    if (state.kind === "ready" && state.raw !== raw) await store.set(key, state.raw);
    return state;
  });
}

export async function writeDeviceMoodboard(projectId: string, board: Moodboard, expected: string, preserveDamaged = false) {
  const key = studioMoodboardStorageKey(projectId);
  const raw = serializeMoodboard(board);
  const checked = deserializeMoodboard(raw);
  if (!checked.ok || checked.board.projectId !== projectId) throw Error("이 작품의 무드보드가 아닙니다.");
  return withPlanningDocument("studio-project-moodboards", key, async (store, current) => {
    if (current !== expected) throw new MoodboardChanged();
    if (preserveDamaged) await store.set(key + ":damaged:" + crypto.randomUUID(), current);
    await store.set(key, raw);
    return raw;
  });
}
