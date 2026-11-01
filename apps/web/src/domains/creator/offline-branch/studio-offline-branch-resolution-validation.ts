import {
  isStudioOfflineBranchIdentifier,
  type StudioOfflineBranchDocument,
  type StudioOfflineBranchOperation,
  type StudioOfflineBranchResolution,
} from "./studio-offline-branch-contract";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validStudioOfflineBranchResolution(
  value: unknown,
  operationId: string,
): value is StudioOfflineBranchResolution {
  if (!record(value) || value.operationId !== operationId) return false;
  return isStudioOfflineBranchIdentifier(value.actorId)
    && Number.isSafeInteger(value.resolvedAt)
    && Number(value.resolvedAt) >= 0
    && (
      (value.action === "keep-canonical" && value.replacementOperationId === null)
      || (value.action === "reapply-local"
        && isStudioOfflineBranchIdentifier(value.replacementOperationId)
        && value.replacementOperationId !== operationId)
    );
}

export function sameStudioOfflineBranchResolutionMeaning(
  left: StudioOfflineBranchResolution,
  right: StudioOfflineBranchResolution,
): boolean {
  return left.operationId === right.operationId
    && left.actorId === right.actorId
    && left.action === right.action
    && left.replacementOperationId === right.replacementOperationId;
}

export function validStudioOfflineBranchReplacement(
  original: StudioOfflineBranchOperation,
  replacement: StudioOfflineBranchOperation,
): boolean {
  return original.id !== replacement.id
    && original.dedupeKey !== replacement.dedupeKey
    && original.actorId === replacement.actorId
    && original.targetId === replacement.targetId
    && original.targetType === replacement.targetType
    && original.pageId === replacement.pageId
    && original.layerId === replacement.layerId
    && original.action === replacement.action
    && original.payloadHash === replacement.payloadHash
    && original.payloadBytes === replacement.payloadBytes
    && replacement.createdAt > original.createdAt;
}

export function assertStudioOfflineBranchResolutions(
  doc: StudioOfflineBranchDocument,
  assertNoConflicts: (object: object, keys: readonly string[], label: string) => void,
): void {
  if (doc.resolutions !== undefined) {
    if (!record(doc.resolutions)) throw new Error("오프라인 충돌 처리 기록이 올바르지 않습니다.");
    const resolutions = Object.entries(doc.resolutions);
    assertNoConflicts(doc.resolutions, resolutions.map(([id]) => id), "offline branch resolutions");
    const replacements = new Set<string>();
    for (const [operationId, resolution] of resolutions) {
      const original = doc.operations[operationId];
      if (!original || !validStudioOfflineBranchResolution(resolution, operationId)
        || resolution.actorId !== original.actorId
        || resolution.resolvedAt < original.createdAt
        || resolution.resolvedAt > doc.branch.updatedAt
        || doc.receipts[operationId] !== undefined) {
        throw new Error("오프라인 충돌 처리 기록의 사용자·시각·수신 확인 정보를 검증하지 못했습니다.");
      }
      if (resolution.replacementOperationId) {
        const replacement = doc.operations[resolution.replacementOperationId];
        if (!replacement || !validStudioOfflineBranchReplacement(original, replacement)
          || replacements.has(replacement.id)) {
          throw new Error("오프라인 재적용 작업의 원본 연결이 올바르지 않습니다.");
        }
        replacements.add(replacement.id);
      }
    }
  }
}
