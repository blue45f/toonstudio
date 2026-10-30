import { StudioScopedWriteContextSchema, StudioScopedWritePolicySchema, type StudioScopedEntityKind, type StudioScopedWriteContext, type StudioScopedWritePolicy, type StudioScopedWriteTarget } from "@toonstudio/contracts/studio-scoped-write";
import { studioCrdtProjectionGroupKey } from "@toonstudio/contracts/studio-crdt-authoring/group-key";

export interface StudioScopedWriteFence { readonly authScopeKey: string | null; readonly workId: string | null; readonly accessGeneration: number; readonly documentGeneration: number; readonly scopedMutationReady?: boolean }
export interface StudioScopedDrawingTicket {
  readonly epoch: number; readonly targetId: string; readonly authScopeKey: string; readonly workId: string;
  readonly accessGeneration: number; readonly documentGeneration: number;
  readonly context: StudioScopedWriteContext;
}
export interface StudioScopedCrdtPublisher {
  captureWriteContext(present?: (kind: StudioScopedEntityKind, id: string, pageId: string, restoration: boolean) => boolean): StudioScopedWriteContext;
  bindFlushBoundary(flush: (() => void) | null): () => void;
}
const key = (kind: StudioScopedEntityKind, id: string, pageId?: string) => kind === "group" ? `group:${studioCrdtProjectionGroupKey(pageId ?? "", id)}` : `${kind}:${id}`;
const activeAt = (start: string, end: string | null, now: number) => Date.parse(start) <= now && (end === null || now <= Date.parse(end));

/** 전역 권한과 독립적인, 실제 객체 ID에 대한 제한 편집 권위다. 선택·재전송·서버 소유 확인을 구분한다. */
export class StudioScopedWriteAuthority implements StudioScopedCrdtPublisher {
  private policy: StudioScopedWritePolicy | null = null;
  private selectedTargetId: string | null = null;
  private selectedGrantId: string | null = null;
  private epoch = 0;
  private disposed = false;
  private verified = false;
  private mutationHolds = 0;
  private refreshPolicy: (() => Promise<StudioScopedWritePolicy | null>) | null = null;
  private flushBoundary: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly localTargets = new Map<string, string>();
  private readonly creationTickets = new Map<string, StudioScopedDrawingTicket>();
  private readonly declaredCreations = new Set<string>();
  private readonly historyEdges = new Map<string, { targetId: string; grantIds: readonly string[]; accessGeneration: number; documentGeneration: number }>();
  private readonly queuedCreations = new Map<string, { kind: StudioScopedEntityKind; id: string; targetId: string; policyVersion: number }>();
  private readonly queuedRestorations = new Map<string, { kind: StudioScopedEntityKind; id: string; targetId: string; policyVersion: number }>();
  private queuedContext: StudioScopedWriteContext | null = null;
  private lastAdmittedContext: StudioScopedWriteContext | null = null;
  constructor(readonly authScopeKey: string, readonly workId: string, private readonly fence: () => StudioScopedWriteFence, private readonly now = Date.now) {}
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  readonly getEpoch = () => this.epoch;
  bindFlushBoundary(flush: (() => void) | null): () => void { this.flushBoundary = flush; return () => { if (this.flushBoundary === flush) this.flushBoundary = null; }; }
  bindPolicyRefresh(refresh: (() => Promise<StudioScopedWritePolicy | null>) | null): void { this.refreshPolicy = refresh; }
  refresh(): Promise<StudioScopedWritePolicy | null> { return this.refreshPolicy?.() ?? Promise.resolve(null); }
  mount(): void { this.disposed = false; this.invalidate(); }
  holdMutations(): () => void {
    this.flushBoundary?.(); this.mutationHolds++; this.invalidate(); let released = false;
    return () => { if (released) return; released = true; this.mutationHolds = Math.max(0, this.mutationHolds - 1); this.invalidate(); };
  }
  suspend(): void { try { this.flushBoundary?.(); } finally { this.verified = false; this.invalidate(); } }
  get snapshot(): StudioScopedWritePolicy | null { return this.policy; }
  get targetId(): string | null { return this.selectedTargetId; }
  get grantId(): string | null { return this.selectedGrantId; }
  get hasCurrentIdentity(): boolean { return !this.disposed && this.sameIdentity(); }
  get drawingAllowed(): boolean { return !this.mutationHolds && this.fence().scopedMutationReady !== false && Boolean(this.currentTarget && this.grantsForSelection.length); }
  get currentTarget(): StudioScopedWriteTarget | null { return this.availableTargets.find((target) => target.definition.id === this.selectedTargetId) ?? null; }
  get availableTargets(): readonly StudioScopedWriteTarget[] {
    if (this.disposed || !this.verified || !this.policy?.scopedWrite || !this.sameIdentity()) return [];
    const now = this.now(), grants = this.policy.grants.filter((grant) => grant.actorUserId === this.authScopeKey && grant.revokedAt === null && activeAt(grant.startsAt, grant.endsAt, now));
    return this.policy.targets.filter((target) => target.revokedAt === null && grants.some((grant) => grant.productionProjectId === target.definition.productionProjectId && grant.targetIds.includes(target.definition.id)));
  }
  get grantsForSelection() {
    const target = this.currentTarget, now = this.now();
    return target && this.policy ? this.policy.grants.filter((grant) => grant.actorUserId === this.authScopeKey && grant.revokedAt === null && activeAt(grant.startsAt, grant.endsAt, now)
      && grant.productionProjectId === target.definition.productionProjectId && grant.targetIds.includes(target.definition.id)
      && (this.selectedGrantId === null || grant.id === this.selectedGrantId)) : [];
  }
  setPolicy(value: StudioScopedWritePolicy): void {
    let policy: StudioScopedWritePolicy, owners: Array<{ identity: string; targetId: string }>;
    try {
      policy = StudioScopedWritePolicySchema.parse(value);
      if (policy.workId !== this.workId || !this.sameIdentity()) return;
      this.flushBoundary?.();
      owners = policy.ownedEntities.map((owned) => {
        const target = policy.targets.find((entry) => entry.definition.id === owned.targetId);
        if (!target) throw new Error("서버 원고 귀속의 실제 대상이 없습니다. 초안을 보존하고 다시 확인하세요.");
        const identity = key(owned.kind, owned.id, target.definition.pageId), local = this.localTargets.get(identity);
        if (local && local !== owned.targetId) throw new Error("서버 원고 귀속이 로컬 초안과 다릅니다. 초안을 보존하고 다시 확인하세요.");
        return { identity, targetId: owned.targetId };
      });
    } catch (cause) { this.verified = false; this.invalidate(); throw cause; }
    this.queuedContext = null; this.lastAdmittedContext = null;
    this.policy = policy; this.verified = true;
    for (const owned of owners) {
      this.localTargets.set(owned.identity, owned.targetId);
    }
    this.invalidate();
  }
  chooseTarget(id: string | null, grantId: string | null = null): void {
    if (id !== null && !this.availableTargets.some((target) => target.definition.id === id)) throw new Error("현재 계정에 배정된 원고 범위를 선택하세요.");
    if (grantId !== null && !this.policy?.grants.some((grant) => grant.id === grantId && grant.actorUserId === this.authScopeKey && grant.revokedAt === null && activeAt(grant.startsAt, grant.endsAt, this.now()) && id !== null && grant.targetIds.includes(id))) throw new Error("현재 유효한 작업 배정을 선택하세요.");
    if (id === this.selectedTargetId && grantId === this.selectedGrantId) return;
    this.flushBoundary?.(); this.selectedTargetId = id; this.selectedGrantId = grantId; this.invalidate();
  }
  expire(): void { this.flushBoundary?.(); this.invalidate(); }
  dispose(): void { this.flushBoundary?.(); this.disposed = true; this.invalidate(); this.flushBoundary = null; this.listeners.clear(); }
  captureDrawingTicket(pageId: string, layerId: string | null): StudioScopedDrawingTicket {
    if (this.mutationHolds || this.fence().scopedMutationReady === false) throw new Error("동기화·저장 경계가 끝난 뒤 담당 원고를 편집하세요.");
    const target = this.currentTarget, context = this.purposeContext();
    if (!target || target.definition.pageId !== pageId || (target.definition.layerId !== null && target.definition.layerId !== (layerId ?? "page-root"))) throw new Error("선택한 담당 페이지와 레이어에서 그려 주세요.");
    const current = this.fence();
    return { epoch: this.epoch, targetId: target.definition.id, authScopeKey: this.authScopeKey, workId: this.workId,
      accessGeneration: current.accessGeneration, documentGeneration: current.documentGeneration, context };
  }
  allows(ticket: StudioScopedDrawingTicket): boolean {
    const current = this.fence();
    return !this.disposed && !this.mutationHolds && current.scopedMutationReady !== false && this.sameIdentity() && ticket.epoch === this.epoch && ticket.targetId === this.selectedTargetId && Boolean(this.currentTarget)
      && ticket.accessGeneration === current.accessGeneration && ticket.documentGeneration === current.documentGeneration;
  }
  registerCreation(ticket: StudioScopedDrawingTicket, kind: StudioScopedEntityKind, id: string): void {
    if (!this.allows(ticket)) throw new Error("담당 범위나 원고가 변경되어 새 요소를 적용하지 않았습니다.");
    const identity = this.identity(kind, id, ticket.targetId);
    if (this.localTargets.has(identity) || this.policy?.ownedEntities.some((owned) => this.identity(owned.kind, owned.id, owned.targetId) === identity)
      || this.policy?.targets.some((target) => target.definition.entities.some((entity) => this.identity(entity.kind, entity.id, target.definition.id) === identity))) throw new Error("기존 원고 ID를 새 요소로 등록할 수 없습니다.");
    this.admitContext(ticket.context); this.localTargets.set(identity, ticket.targetId);
    this.creationTickets.set(identity, ticket);
    this.queuedCreations.set(identity, { kind, id, targetId: ticket.targetId, policyVersion: ticket.context.policyVersion });
  }
  registerRestoration(ticket: StudioScopedDrawingTicket, kind: StudioScopedEntityKind, id: string): void {
    if (!this.allows(ticket) || this.ownerOf(kind, id) !== ticket.targetId) throw new Error("원래 담당 범위가 확인되는 요소만 복원할 수 있습니다.");
    this.admitContext(ticket.context); this.queuedRestorations.set(this.identity(kind, id, ticket.targetId), { kind, id, targetId: ticket.targetId, policyVersion: ticket.context.policyVersion });
  }
  registerDerivedCreation(sourceKind: StudioScopedEntityKind, sourceId: string, kind: StudioScopedEntityKind, id: string): void {
    const ticket = this.creationTickets.get(this.identity(sourceKind, sourceId));
    if (!ticket) throw new Error("파생 원고의 실제 생성 원본을 확인할 수 없습니다.");
    this.registerCreation(ticket, kind, id);
  }
  assertCreationContinuation(kind: StudioScopedEntityKind, id: string): void {
    const ticket = this.creationTickets.get(this.identity(kind, id));
    if (!ticket || !this.allows(ticket)) throw new Error("담당 범위·기간 또는 원고가 변경되어 늦은 획 결과를 적용하지 않았습니다.");
    this.admitContext(ticket.context);
  }
  canContinueCreation(kind: StudioScopedEntityKind, id: string): boolean {
    const ticket = this.creationTickets.get(this.identity(kind, id)); return Boolean(ticket && this.allows(ticket));
  }
  recordHistoryEdge(signature: string): void {
    if (!this.drawingAllowed || !this.selectedTargetId) return;
    const fence = this.fence();
    this.historyEdges.set(signature, { targetId: this.selectedTargetId, grantIds: this.grantsForSelection.map((grant) => grant.id), accessGeneration: fence.accessGeneration, documentGeneration: fence.documentGeneration });
  }
  allowsHistoryEdge(signature: string): boolean {
    const edge = this.historyEdges.get(signature), grants = new Set(this.grantsForSelection.map((grant) => grant.id)), fence = this.fence();
    return this.drawingAllowed && Boolean(edge && edge.targetId === this.selectedTargetId && edge.accessGeneration === fence.accessGeneration && edge.documentGeneration === fence.documentGeneration && edge.grantIds.length && edge.grantIds.every((id) => grants.has(id)));
  }
  requiresRestoration(kind: StudioScopedEntityKind, id: string): boolean {
    const identity = this.identity(kind, id);
    return this.declaredCreations.has(identity) || Boolean(this.policy?.ownedEntities.some((entry) => this.identity(entry.kind, entry.id, entry.targetId) === identity)
      || this.policy?.targets.some((target) => target.definition.entities.some((entry) => this.identity(entry.kind, entry.id, target.definition.id) === identity)));
  }
  admitExisting(ticket: StudioScopedDrawingTicket, kind: StudioScopedEntityKind, id: string): void {
    if (!this.allows(ticket) || this.ownerOf(kind, id) !== ticket.targetId) throw new Error("선택한 담당 범위의 원고만 변경할 수 있습니다.");
    this.admitContext(ticket.context);
  }
  ownerOf(kind: StudioScopedEntityKind, id: string): string | null {
    const identity = this.identity(kind, id), local = this.localTargets.get(identity);
    if (local) return local;
    const owned = this.policy?.ownedEntities.find((entity) => this.identity(entity.kind, entity.id, entity.targetId) === identity);
    if (owned) return owned.targetId;
    return this.policy?.targets.find((target) => target.definition.entities.some((entity) => this.identity(entity.kind, entity.id, target.definition.id) === identity))?.definition.id ?? null;
  }
  purposeContext(): StudioScopedWriteContext {
    if (!this.currentTarget || !this.policy || !this.sameIdentity()) throw new Error("현재 유효한 담당 원고 범위를 선택하세요.");
    const grantIds = this.grantsForSelection.map((grant) => grant.id);
    if (!grantIds.length) throw new Error("담당 원고 편집 기간이 종료됐습니다. 초안을 보존하고 배정을 다시 확인하세요.");
    return StudioScopedWriteContextSchema.parse({ version: 1, policyVersion: this.policy.policyVersion, grantIds, creations: [], restorations: [] });
  }
  /** 한 번 대기열에 넣은 선언은 해당 요청 본문에 귀속된다. 재시도는 그 요청을 그대로 사용한다. */
  captureWriteContext(present: (kind: StudioScopedEntityKind, id: string, pageId: string, restoration: boolean) => boolean = () => true): StudioScopedWriteContext {
    const context = this.queuedContext ?? this.lastAdmittedContext;
    if (!context) throw new Error("명시적으로 승인된 담당 범위 변경이 없습니다.");
    const take = (entries: typeof this.queuedCreations, restoration: boolean) => [...entries].flatMap(([identity, entry]) => {
      const pageId = this.policy?.targets.find((target) => target.definition.id === entry.targetId)?.definition.pageId;
      if (!pageId || entry.policyVersion !== context.policyVersion || !present(entry.kind, entry.id, pageId, restoration)) return [];
      entries.delete(identity); if (!restoration) this.declaredCreations.add(identity); return [{ kind: entry.kind, id: entry.id, targetId: entry.targetId }];
    });
    const value = StudioScopedWriteContextSchema.parse({ ...context, creations: take(this.queuedCreations, false), restorations: take(this.queuedRestorations, true) });
    this.queuedContext = null;
    return value;
  }
  private admitContext(value: StudioScopedWriteContext): void {
    if (this.queuedContext && this.queuedContext.policyVersion !== value.policyVersion) this.flushBoundary?.();
    this.queuedContext = this.queuedContext ? { ...this.queuedContext, grantIds: [...new Set([...this.queuedContext.grantIds, ...value.grantIds])] } : structuredClone(value);
    this.lastAdmittedContext = structuredClone(this.queuedContext);
  }
  private sameIdentity(): boolean { const current = this.fence(); return current.authScopeKey === this.authScopeKey && current.workId === this.workId; }
  private identity(kind: StudioScopedEntityKind, id: string, targetId = this.selectedTargetId): string {
    const pageId = kind === "group" ? this.policy?.targets.find((target) => target.definition.id === targetId)?.definition.pageId : undefined;
    return key(kind, id, pageId);
  }
  private invalidate(): void { this.epoch++; for (const listener of this.listeners) listener(); }
}

const ports = new WeakMap<object, StudioScopedWriteAuthority>();
export function bindStudioScopedWriteAuthority(owner: object, authority: StudioScopedWriteAuthority): () => void {
  ports.set(owner, authority); return () => { if (ports.get(owner) === authority) ports.delete(owner); };
}
export function studioScopedWriteAuthority(owner: object): StudioScopedWriteAuthority | null { return ports.get(owner) ?? null; }
