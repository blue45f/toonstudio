import { updateStudioAiComicDirectorSession } from "./studio-ai-comic-director-session";

import type { StudioAiComicDirectorSessionDocument } from "./studio-ai-comic-director-session";

type Session = StudioAiComicDirectorSessionDocument;
export type DirectorDraftPatch = Parameters<typeof updateStudioAiComicDirectorSession>[1];

interface DraftCheckpoint {
  dirty: boolean;
  remoteRevision: number | null;
}

function checkpoint(raw: string | null): DraftCheckpoint {
  try {
    const saved = raw && JSON.parse(raw).localCheckpoint;
    if (saved?.dirty === true || saved?.dirty === false) {
      return { dirty: saved.dirty, remoteRevision: Number.isSafeInteger(saved.remoteRevision) ? saved.remoteRevision : null };
    }
  } catch { /* 이전 형식이거나 저장소를 읽을 수 없으면 서버 버전을 다시 확인한다. */ }
  return { dirty: false, remoteRevision: null };
}

/** 로컬 입력과 서버에서 확인한 revision을 독립적으로 추적한다. */
export class StudioDirectorDraftSync {
  current: Session;
  conflicted = false;
  storageFailed = false;
  private state: DraftCheckpoint;

  private pending: Promise<boolean> = Promise.resolve(true);
  private generation = 0;
  private saving = false;
  private listeners = new Set<() => void>();

  constructor(initial: Session, private stored: string | null, private readonly write: (expected: string | null, raw: string) => Promise<void>, private openingFailed = false) {
    this.current = initial;
    this.state = checkpoint(stored);
    this.storageFailed = openingFailed;
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  snapshot() {
    return { session: this.current, storageFailed: this.storageFailed, saving: this.saving };
  }

  persist(retryOpening = false) {
    if (this.openingFailed && !retryOpening) return Promise.resolve(false);
    const value = JSON.stringify({ ...this.current, localCheckpoint: this.state });
    const generation = ++this.generation;
    this.saving = true;
    this.pending = this.pending.then(async () => {
      if (generation !== this.generation) return false;
      let ok = false;
      try {
        await this.write(this.stored, value);
        this.stored = value;
        this.openingFailed = false;
        ok = true;
      } catch { /* 실패한 입력은 화면에 보존하고 다음 저장에서 다시 쓴다. */ }
      if (generation === this.generation) {
        this.storageFailed = !ok;
        this.saving = false;
        for (const listener of this.listeners) listener();
      }
      return ok;
    });
    return this.pending;
  }

  edit(patch: DirectorDraftPatch) {
    this.current = updateStudioAiComicDirectorSession(this.current, patch);
    this.state = { ...this.state, dirty: true };
    this.persist();
  }

  receive(kind: "read" | "save" | "reload", issued: Session, remote: Session): "saved" | "local" | "conflict" {
    if (issued.id !== this.current.id || remote.id !== issued.id ||
      remote.workId !== this.current.workId || remote.remixSourceWorkId !== this.current.remixSourceWorkId)
      throw new Error("다른 작품의 대본 응답입니다.");
    const editedSinceRequest = this.current !== issued;
    const preserve = editedSinceRequest || (kind === "read" && this.state.dirty);
    if (preserve && kind !== "save" && this.state.remoteRevision !== remote.revision) {
      this.conflicted = true;
      this.persist();
      return "conflict";
    }
    this.conflicted = false;
    this.state = { dirty: preserve, remoteRevision: remote.revision };
    if (!preserve) this.current = remote;
    this.persist();
    return preserve ? "local" : "saved";
  }
}
