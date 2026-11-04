import { admitStudioScopedWriteEffects, projectStudioScopedAuthoringDocument, scopedEntityKey } from "@toonstudio/contracts/studio-scoped-write-effects";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import type { DrawEl } from "../studio-element-model";
import { studioScopedWriteAuthority, type StudioScopedWriteAuthority } from "./studio-scoped-write-authority";

type Owner = { readonly current: { readonly locked: boolean } };
const failure = () => new Error("직군 배정 또는 인계·승인 잠금으로 이 원고를 변경할 수 없습니다. 담당 범위와 현재 정책을 확인하세요.");

/** 전체 편집 ACL은 유지하고 서버와 같은 실제 객체·렌더 효과 검사로 명시 매핑만 보호한다. */
export function admitStudioMappedPagesCommit(input: { readonly owner: Owner; readonly previous: readonly unknown[];
  readonly next: readonly unknown[]; readonly reportError: (message: string) => void; readonly previewOnly?: boolean; readonly pageOnly?: string }): boolean {
  const authority = studioScopedWriteAuthority(input.owner);
  if (!authority?.mappedFullEdit) return true;
  try {
    if (!authority.mappedPolicyVerified) throw failure();
    const before = projectStudioScopedAuthoringDocument({ pagesList: input.previous }), after = projectStudioScopedAuthoringDocument({ pagesList: input.next });
    const ownership = new Map<string, string>();
    const policy = authority.snapshot;
    for (const target of policy?.targets ?? []) for (const entity of target.definition.entities) ownership.set(scopedEntityKey(entity.kind, entity.id, target.definition.pageId), target.definition.id);
    for (const entity of policy?.ownedEntities ?? []) {
      const target = policy?.targets.find((entry) => entry.definition.id === entity.targetId);
      if (target) ownership.set(scopedEntityKey(entity.kind, entity.id, target.definition.pageId), entity.targetId);
    }
    for (const [key, entity] of before.entities) {
      if (entity.pageId !== authority.currentTarget?.definition.pageId) continue;
      const owner = authority.ownerOf(entity.kind, entity.id);
      if (owner) ownership.set(key, owner);
    }
    const peek = authority.peekMappedContext();
    const present = (entry: StudioScopedWriteContext["creations"][number]) => {
      const target = policy?.targets.find((target) => target.definition.id === entry.targetId);
      return target && after.entities.has(scopedEntityKey(entry.kind, entry.id, target.definition.pageId));
    };
    const restorations = [...peek.restorations.filter(present)];
    for (const [key, entity] of after.entities) {
      const targetId = ownership.get(key);
      if (!before.entities.has(key) && targetId && !restorations.some((entry) => entry.kind === entity.kind && entry.id === entity.id)) restorations.push({ kind: entity.kind, id: entity.id, targetId });
    }
    const context = { ...peek, creations: peek.creations.filter(present), restorations };
    const target = authority.currentTarget;
    const admitted = admitStudioScopedWriteEffects({ before, after, context, ownership,
      targets: target ? [target] : [], mappedFull: { controlledTargets: authority.controlledTargets.filter((target) => !input.pageOnly || target.definition.pageId === input.pageOnly) } });
    if (admitted.targetIds.length && !input.previewOnly) {
      if (!target || !authority.drawingAllowed) throw failure();
      const ticket = authority.captureDrawingTicket(target.definition.pageId, target.definition.layerId);
      for (const entry of restorations) authority.registerRestoration(ticket, entry.kind, entry.id);
      authority.admitMappedEdit();
    }
    return true;
  } catch (cause) { input.reportError(cause instanceof Error ? cause.message : failure().message); return false; }
}

/** 실제 시작점·그리기 레이어를 대조하고 보호 범위 밖의 일반 그리기는 보존한다. */
export function mappedStudioDrawAuthority(owner: Owner, pageId: string, stroke: DrawEl): StudioScopedWriteAuthority | null {
  const authority = studioScopedWriteAuthority(owner);
  if (!authority?.mappedFullEdit) return null;
  if (!authority.mappedPolicyVerified) throw failure();
  const affected = authority.controlledTargets.filter(({ definition }) => definition.pageId === pageId
    && (definition.layerId !== null ? definition.layerId === (stroke.groupId ?? "page-root")
      : definition.frameId !== null ? definition.frameId === stroke.frameClipId : true));
  if (!affected.length) return null;
  if (affected.length !== 1 || authority.targetId !== affected[0]?.definition.id || !authority.drawingAllowed) throw failure();
  return authority;
}

export function studioMappedStrokeRequiresAuthority(owner: Owner, strokeId: string): boolean {
  const authority = studioScopedWriteAuthority(owner);
  return authority?.mappedFullEdit === true && authority.ownerOf("stroke", strokeId) !== null;
}
