import { studioAiComicDirectorStorageKey, updateStudioAiComicDirectorSession } from "./studio-ai-comic-director-session";

import type { StudioAiComicDirectorSessionDocument, StudioAiComicDirectorStorage } from "./studio-ai-comic-director-session";

type Session = StudioAiComicDirectorSessionDocument;
export type DirectorDraftPatch = Parameters<typeof updateStudioAiComicDirectorSession>[1];

interface DraftCheckpoint {
  dirty: boolean;
  remoteRevision: number | null;
}

function checkpoint(storage: StudioAiComicDirectorStorage | null, id: string): DraftCheckpoint {
  try {
    const raw = storage?.getItem(studioAiComicDirectorStorageKey(id));
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

  constructor(initial: Session, private readonly storage: StudioAiComicDirectorStorage | null) {
    this.current = initial;
    this.state = checkpoint(storage, initial.id);
  }

  persist() {
    try {
      if (!this.storage) throw new Error("storage unavailable");
      this.storage.setItem(studioAiComicDirectorStorageKey(this.current.id), JSON.stringify({
        ...this.current, localCheckpoint: this.state,
      }));
      this.storageFailed = false;
    } catch {
      this.storageFailed = true;
    }
  }

  edit(patch: DirectorDraftPatch) {
    this.current = updateStudioAiComicDirectorSession(this.current, patch);
    this.state = { ...this.state, dirty: true };
    this.persist();
  }

  receive(kind: "read" | "save" | "reload", issued: Session, remote: Session): "saved" | "local" | "conflict" {
    if (issued.id !== this.current.id || remote.id !== issued.id) throw new Error("다른 콘티의 저장 응답입니다.");
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
