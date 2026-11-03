export interface StudioAutosaveSnapshotFrontier {
  readonly generation: number;
  readonly pendingFingerprint: string;
  readonly session: unknown;
}

/** A debounce or async preparation may outlive the snapshot it captured. Never publish that
 * snapshot over a newer pointer-up checkpoint, or acknowledge it in a different document. */
export function createStudioAutosaveSnapshotFence(
  scheduled: StudioAutosaveSnapshotFrontier,
  readCurrent: () => StudioAutosaveSnapshotFrontier,
): () => boolean {
  return () => {
    const current = readCurrent();
    return scheduled.generation === current.generation
      && scheduled.pendingFingerprint === current.pendingFingerprint
      && scheduled.session === current.session;
  };
}

/** 첫 체크포인트의 세대가 0이거나 영수증이 늦어도, 편집으로 비운 원고는 내구 tombstone이 필요하다. */
export function studioEmptyAutosaveNeedsTombstone(
  durable: Pick<StudioAutosaveSnapshotFrontier, "generation" | "pendingFingerprint">,
  editGeneration: number,
): boolean {
  return durable.generation > 0
    || durable.pendingFingerprint !== ""
    || editGeneration > durable.generation;
}
