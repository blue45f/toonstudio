import { admitStudioScopedWriteEffects, scopedEntityKey, StudioScopedWriteDeniedError,
  validateStudioScopedWriteTarget, type StudioScopedDocumentState } from "./studio-scoped-write-effects";
import { applyStudioLiveOpToState, cloneStudioLiveOpFoldState, createStudioLiveOpFoldState,
  type SequencedStudioLiveOp, type StudioLiveOp, type StudioLiveOpFoldState } from "./studio-live-op";
import { studioScopedEffectParameters, studioScopedRequiresEffectAdmission, type StudioScopedAuthorization } from "./studio-scoped-write-store";

function affectedId(op: StudioLiveOp): string { return op.body.kind === "add" ? op.body.stroke.id : op.body.strokeId; }

function projectJournal(base: StudioScopedDocumentState, folded: StudioLiveOpFoldState, events: readonly StudioLiveOp[], authorization: StudioScopedAuthorization) {
  const entities = new Map(base.entities), order = new Map(base.entityOrder);
  const eventsById = new Map<string, StudioLiveOp[]>();
  for (const event of events) { const id = affectedId(event), list = eventsById.get(id) ?? []; list.push(event); eventsById.set(id, list); }
  for (const stroke of folded.strokes.values()) {
    if (stroke.placeholder || !stroke.pageId || !stroke.layerId) throw new StudioScopedWriteDeniedError("unresolved");
    const transform = stroke.payload.transform;
    // 병행 journal은 아직 transform의 실제 renderer 소비 계약을 제공하지 않는다.
    if (transform && (transform.dx !== 0 || transform.dy !== 0 || transform.scale !== 1 || transform.rotation !== 0)) {
      const controlled = authorization.mappedFull?.controlledTargets;
      const owner = authorization.policy.ownership[scopedEntityKey("stroke", stroke.id)];
      if (!controlled || controlled.some((target) => target.definition.id === owner
        || (target.definition.pageId === stroke.pageId && (target.definition.layerId === null || target.definition.layerId === stroke.layerId)))) {
        throw new StudioScopedWriteDeniedError("ambiguous");
      }
    }
    const key = scopedEntityKey("stroke", stroke.id);
    entities.set(key, { kind: "stroke", id: stroke.id, pageId: stroke.pageId, layerId: stroke.layerId,
      deleted: stroke.deleted, value: { ...stroke.payload, id: stroke.id,
        ...(stroke.layerId === "page-root" ? {} : { groupId: stroke.layerId }) },
      raw: { stroke, events: eventsById.get(stroke.id) ?? [] } });
  }
  for (const [key, ids] of folded.order) {
    const split = key.indexOf("\u0000"), pageId = key.slice(0, split), layerId = key.slice(split + 1);
    const orderKey = `${pageId}:elements`, previous = order.get(orderKey) ?? [];
    const journalIds = new Set(ids.map((id) => scopedEntityKey("stroke", id)));
    const retained = previous.filter((id) => !journalIds.has(id));
    const insertion = retained.findIndex((id) => entities.get(id)?.layerId === layerId);
    const incoming = ids.map((id) => scopedEntityKey("stroke", id));
    order.set(orderKey, insertion < 0 ? [...retained, ...incoming]
      : [...retained.slice(0, insertion), ...incoming, ...retained.slice(insertion)]);
  }
  return { ...base, entities, entityOrder: order };
}

/** 최신 CRDT와 별도 journal 양쪽의 현재 귀속을 검사한다. 캐시 room 상태를 승인 근거로 쓰지 않는다. */
export function admitStudioScopedLiveOp(authorization: StudioScopedAuthorization, authority: StudioScopedDocumentState,
  durable: readonly SequencedStudioLiveOp[], candidate: StudioLiveOp) {
  if (!studioScopedRequiresEffectAdmission(authorization)) return undefined;
  const parameters = studioScopedEffectParameters(authorization), context = parameters.context, id = affectedId(candidate), key = scopedEntityKey("stroke", id);
  const ownership = new Map(Object.entries(authorization.policy.ownership));
  const targetId = ownership.get(key) ?? context.creations.find((entry) => entry.kind === "stroke" && entry.id === id)?.targetId;
  const target = authorization.targets.find((entry) => entry.definition.id === targetId);
  if (!target && !authorization.mappedFull) throw new StudioScopedWriteDeniedError("scope");
  if (target && authority.entities.has(key)) validateStudioScopedWriteTarget({ ...target,
    definition: { ...target.definition, entities: [{ kind: "stroke", id }] } }, authority, ownership);
  const beforeFold = createStudioLiveOpFoldState();
  for (const event of durable) applyStudioLiveOpToState(beforeFold, event);
  if (candidate.body.kind !== "add" && !beforeFold.strokes.has(id)) throw new StudioScopedWriteDeniedError("unresolved");
  const afterFold = cloneStudioLiveOpFoldState(beforeFold); applyStudioLiveOpToState(afterFold, candidate);
  const before = projectJournal(authority, beforeFold, durable, authorization), after = projectJournal(authority, afterFold, [...durable, candidate], authorization);
  return admitStudioScopedWriteEffects({ before, after, ...parameters });
}
