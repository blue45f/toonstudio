import * as Y from "yjs";

function materializeExistingMapRoot(doc: Y.Doc, name: string): Y.Map<unknown> | null | undefined {
  if (!doc.share.has(name)) return undefined;
  try { return doc.getMap<unknown>(name); } catch { return null; }
}
export interface StudioCrdtDeletionRootSnapshot {
  operations: ReadonlyMap<string, unknown>;
  acknowledgements: ReadonlyMap<string, unknown>;
}

export function snapshotStudioCrdtDeletionRoots(doc: Y.Doc): StudioCrdtDeletionRootSnapshot | null {
  const operations = materializeExistingMapRoot(doc, "studio-deletion-ops");
  const acknowledgements = materializeExistingMapRoot(doc, "studio-deletion-acks");
  if (operations === null || acknowledgements === null) return null;
  return {
    operations: new Map(operations ?? []),
    acknowledgements: new Map(acknowledgements ?? []),
  };
}

export function preservesStudioCrdtDeletionRoots(
  snapshot: StudioCrdtDeletionRootSnapshot | null,
  doc: Y.Doc
): boolean {
  if (!snapshot) return false;
  const operations = materializeExistingMapRoot(doc, "studio-deletion-ops");
  const acknowledgements = materializeExistingMapRoot(doc, "studio-deletion-acks");
  if (operations === null || acknowledgements === null) return false;
  for (const [operationId, target] of snapshot.operations) {
    if (!operations || operations.get(operationId) !== target) return false;
  }
  for (const [operationId, target] of snapshot.acknowledgements) {
    if (!acknowledgements || acknowledgements.get(operationId) !== target) return false;
  }
  return true;
}


/** 같은 operation의 target과 ack가 일치할 때만 복원된다. 관측하지 못한 동시 삭제는 남긴다. */
export function activeStudioCrdtDeletionTargets(doc: Y.Doc): ReadonlySet<string> | null {
  const roots = snapshotStudioCrdtDeletionRoots(doc);
  if (!roots) return null;
  const active = new Set<string>();
  for (const [operationId, target] of roots.operations)
    if (typeof target === "string" && roots.acknowledgements.get(operationId) !== target) active.add(target);
  return active;
}
