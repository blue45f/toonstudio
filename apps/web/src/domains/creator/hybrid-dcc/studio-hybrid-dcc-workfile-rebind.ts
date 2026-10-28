/** 검증된 작업파일의 이력을 유지한 채 문서 권위와 파생 런타임만 새 작업 범위에 연결한다. */
import { createStudioSharedSet } from "../live/studio-live-2d3d-bridge";
import { sha256HexPortable } from "../studio-sha256";

import {
  restoreStudioHybridDccStateFromSnapshot,
  snapshotStudioHybridDccState,
  type StudioHybridDccPersistedSnapshot,
  type StudioHybridDccSession,
} from "./studio-hybrid-dcc-document";
import { createStudioDccCollabRoom } from "./studio-dcc-collab-shell";
import {
  synchronizeWorkspaceGeometryAuthority,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

/** 저널 검증만으로는 발견되지 않는 문서 undo/redo 그룹·Lamport 불일치를 막는다. */
export function validateStudioHybridDccWorkfileHistory(session: StudioHybridDccSession): void {
  const undo: string[] = [];
  const redo: string[] = [];
  const plan = session.journal.replayPlan();
  if (session.journal.activeTransactionCount !== 0) throw new Error("완료되지 않은 편집 명령이 있습니다.");
  for (const batch of plan.batches) {
    if (batch.actorId !== "local") continue;
    if (batch.mode === "apply") {
      undo.push(batch.groupId);
      redo.length = 0;
    } else if (batch.mode === "undo") {
      if (undo.pop() !== batch.groupId) throw new Error("되돌리기 명령 그룹이 맞지 않습니다.");
      redo.push(batch.groupId);
    } else {
      if (redo.pop() !== batch.groupId) throw new Error("다시 실행 명령 그룹이 맞지 않습니다.");
      undo.push(batch.groupId);
    }
  }
  if (undo.length !== session.undoStack.length || redo.length !== session.redoStack.length
    || JSON.stringify(undo) !== JSON.stringify(session.undoGroupStack)
    || JSON.stringify(redo) !== JSON.stringify(session.redoGroupStack)
    || session.lastGroupId !== (undo.at(-1) ?? null)) {
    throw new Error("작업파일의 문서 이력과 명령 저널이 일치하지 않습니다.");
  }
  const recordClock = session.journal.records.reduce((maximum, record) => (
    record.actorId === "local" ? Math.max(maximum, record.lamport) : maximum
  ), 0);
  const checkpointClock = session.journal.checkpoint?.actorLamports.find(({ actorId }) => actorId === "local")?.lamport ?? 0;
  if (session.lamport < Math.max(recordClock, checkpointClock)) {
    throw new Error("작업파일의 편집 시계가 명령 이력보다 오래되었습니다.");
  }
}

function rebindSnapshot(
  snapshot: StudioHybridDccPersistedSnapshot,
  documentId: string,
): StudioHybridDccPersistedSnapshot {
  return snapshotStudioHybridDccState(restoreStudioHybridDccStateFromSnapshot({ ...snapshot, documentId }));
}

/**
 * persistence decoder를 통과한 독립 복사본만 받는다. 저널에는 문서 ID 권위 필드가 없으므로
 * 검증된 명령·그룹·체크섬은 그대로 유지하고, 문서에 결합된 각 snapshot 해시만 재계산한다.
 */
export function rebindStudioHybridDccWorkfileWorkspace(
  workspace: StudioHybridDccWorkspace,
  documentId: string,
): StudioHybridDccWorkspace {
  const current = rebindSnapshot(snapshotStudioHybridDccState(workspace.session.state), documentId);
  const session: StudioHybridDccSession = {
    ...workspace.session,
    state: restoreStudioHybridDccStateFromSnapshot(current),
    undoStack: workspace.session.undoStack.map((snapshot) => rebindSnapshot(snapshot, documentId)),
    redoStack: workspace.session.redoStack.map((snapshot) => rebindSnapshot(snapshot, documentId)),
  };
  const scopeHash = sha256HexPortable(new TextEncoder().encode(documentId));
  const scoped: StudioHybridDccWorkspace = {
    ...workspace,
    session,
    bom: { ...workspace.bom, documentId },
    // 파일 편집 이력은 문서 저널에 있다. 외부 파일의 실시간 참여자·잠금은 새 범위로 옮기지 않는다.
    collab: createStudioDccCollabRoom(`workfile-collab:${scopeHash}`),
    clothRuntimeCache: null,
    bridge: {
      ...workspace.bridge,
      set: createStudioSharedSet(`workfile-set:${scopeHash}`, workspace.bridge.set.objects),
      shots: workspace.bridge.shots.map((shot) => ({ ...shot, passHashes: {} })),
    },
  };
  return synchronizeWorkspaceGeometryAuthority(scoped, session);
}
