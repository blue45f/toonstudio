import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import { withPlanningDocument } from "../planning/studio-planning-document-store";
import { hydrateStudioAiComicDirectorSession, studioAiComicDirectorStorageKey, updateStudioAiComicDirectorSession, type StudioAiComicDirectorSessionDocument } from "./studio-ai-comic-director-session";

type Session = StudioAiComicDirectorSessionDocument;
export class DirectorDeviceOpenFailure extends Error {}

export async function readDirectorDeviceDraft(id: string) {
  return withPlanningDocument("studio-director-drafts", studioAiComicDirectorStorageKey(id), async (_store, raw) => {
    if (raw === null) return { raw, session: null };
    const session = hydrateStudioAiComicDirectorSession(JSON.parse(raw));
    if (!session || session.id !== id) throw Error("저장한 대본을 확인할 수 없어요.");
    return { raw, session };
  }).catch(async cause => {
    // 손상된 본문이나 실패한 이전을 새 대본으로 처리하지 않는다.
    try { await acquireStudioLocalDatabase(); }
    catch { throw new DirectorDeviceOpenFailure("대본 저장소가 열리지 않았습니다.", { cause }); }
    throw cause;
  });
}

export async function writeDirectorDeviceDraft(id: string, expected: string | null, value: string) {
  const key = studioAiComicDirectorStorageKey(id);
  await withPlanningDocument("studio-director-drafts", key, async (store, current) => {
    if (current === value) return;
    if (current !== expected) throw Error("다른 창에서 대본을 수정했습니다.");
    await store.set(key, value);
  });
}

const reviewFields = ["scenes", "storyText", "jobs", "stage", "status", "baseDocumentRevision"] as const;
const equal = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** 패널이 고친 필드만 반영한다. 열린 뒤 다른 창이 같은 필드를 수정했으면 그 저장본을 보존한다. */
export async function saveReviewedDirectorSession(previous: Session, next: Session): Promise<void> {
  if (previous.id !== next.id || previous.workId !== next.workId || previous.remixSourceWorkId !== next.remixSourceWorkId)
    throw Error("다른 작품의 검수입니다.");
  const changed = reviewFields.filter(key => !equal(previous[key], next[key]));
  if (!changed.length) return;
  const key = studioAiComicDirectorStorageKey(next.id);
  await withPlanningDocument("studio-director-drafts", key, async (store, raw) => {
    const prior = raw === null ? null : JSON.parse(raw);
    const saved = raw === null ? null : hydrateStudioAiComicDirectorSession(prior);
    if (raw !== null && (!saved || saved.id !== next.id || saved.workId !== next.workId ||
      saved.remixSourceWorkId !== next.remixSourceWorkId)) throw Error("검수할 대본의 작품을 확인해 주세요.");
    if (saved && changed.some(field => !equal(saved[field], previous[field]) && !equal(saved[field], next[field])))
      throw Error("다른 창에서 같은 검수 항목을 바꿨습니다.");
    if (saved && changed.every(field => equal(saved[field], next[field]))) return;
    const patch = Object.fromEntries(changed.map(field => [field, next[field]]));
    const changesContent = changed.includes("scenes") || changed.includes("storyText");
    const updated = !saved ? next : changesContent ? updateStudioAiComicDirectorSession(saved, patch)
      : { ...saved, ...patch, updatedAt: next.updatedAt };
    await store.set(key, JSON.stringify({ ...updated, localCheckpoint: {
      dirty: true, remoteRevision: prior?.localCheckpoint?.remoteRevision ?? null,
    } }));
  });
}
