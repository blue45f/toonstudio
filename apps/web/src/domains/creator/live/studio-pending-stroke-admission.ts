import type { DrawEl } from "../studio-element-model";

export interface StudioPendingStrokeScope {
  readonly documentKey: string;
  readonly pageId: string;
  readonly generation: number;
  readonly accessGeneration: number;
}

export interface StudioPendingStrokeAdmissionEntry {
  readonly stroke: DrawEl;
  readonly scope: StudioPendingStrokeScope;
  readonly pendingStrokeIds?: readonly string[];
  /** 시작 때 고른 provider와 설정을 닫아 둔 콜백. 다른 renderer를 다시 선택하지 않는다. */
  readonly admit: (stroke: DrawEl, complete: boolean, finish?: () => void) => boolean;
  readonly recover: (stroke: DrawEl, reason: string) => void;
  readonly checkpoint?: (stroke: DrawEl) => void;
  readonly settled?: (stroke: DrawEl, accepted: boolean) => void;
}

interface PendingEntry extends StudioPendingStrokeAdmissionEntry {
  stroke: DrawEl;
  readonly predecessors: Set<string>;
  readonly order: number;
  expectedGeneration: number;
  complete: boolean;
  finish?: () => void;
  readonly queuedAt: number;
}

function sameInputScope(original: StudioPendingStrokeScope, current: StudioPendingStrokeScope): boolean {
  return original.documentKey === current.documentKey && original.pageId === current.pageId
    && original.accessGeneration === current.accessGeneration;
}

/**
 * 포인터 샘플러와 문서 커밋 사이의 준비 대기열. 미준비 획은 원래 DrawEl로 수집하며,
 * FIFO·페이지·세대 검사를 통과한 같은 provider만 기존 finish 경로를 호출할 수 있다.
 * 시간 초과나 문서 전환은 원본을 복구 저널에 넘기며 앞선 항목을 무통보 퇴출하지 않는다.
 */
export class StudioPendingStrokeAdmissionQueue {
  private readonly entries: PendingEntry[] = [];
  private readonly strokeOrder = new Map<string, number>();
  private nextOrder = 0;
  private attemptingId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(private readonly ports: {
    readonly currentScope: () => StudioPendingStrokeScope;
    readonly activeStrokeId: () => string | null;
    readonly now?: () => number;
    readonly timeoutMs?: number;
  }) {}

  get size(): number { return this.entries.length; }

  has(strokeId: string | undefined): boolean {
    return strokeId !== undefined && strokeId !== this.attemptingId
      && this.entries.some((entry) => entry.stroke.id === strokeId);
  }

  defer(input: StudioPendingStrokeAdmissionEntry): void {
    if (this.disposed) { input.recover(input.stroke, "입력 대기열이 종료되었습니다."); return; }
    if (this.entries.some((entry) => entry.stroke.id === input.stroke.id)) return;
    if (!this.entries.length) this.strokeOrder.clear();
    const order = ++this.nextOrder;
    this.strokeOrder.set(input.stroke.id, order);
    this.entries.push({ ...input, scope: { ...input.scope }, order, predecessors: new Set(input.pendingStrokeIds),
      expectedGeneration: input.scope.generation, complete: false, queuedAt: this.now() });
    this.schedule();
  }

  /** 원고 권한으로 실제 확정한 선행 획만 그 뒤에 수집된 입력의 세대를 진행시킨다. */
  noteCommittedPredecessors(pageId: string, strokes: readonly DrawEl[], previousGeneration: number): void {
    if (!this.entries.length || !strokes.length) return;
    const current = this.ports.currentScope();
    if (current.pageId !== pageId || current.generation <= previousGeneration) return;
    for (const entry of this.entries) {
      if (!sameInputScope(entry.scope, current) || entry.expectedGeneration !== previousGeneration) continue;
      if (!strokes.every(stroke => entry.predecessors.has(stroke.id) || (this.strokeOrder.get(stroke.id) ?? Infinity) < entry.order)) continue;
      for (const stroke of strokes) entry.predecessors.delete(stroke.id);
      entry.expectedGeneration = current.generation;
    }
    for (const stroke of strokes) this.strokeOrder.delete(stroke.id);
  }

  canResume(strokeId: string): boolean {
    const entry = this.entries[0];
    if (!entry || entry.stroke.id !== strokeId) return false;
    const current = this.ports.currentScope();
    return sameInputScope(entry.scope, current) && entry.expectedGeneration === current.generation;
  }

  update(stroke: DrawEl): void {
    const entry = this.entries.find((item) => item.stroke.id === stroke.id);
    if (entry && !entry.complete) entry.stroke = stroke;
  }

  complete(stroke: DrawEl, finish?: () => void): boolean {
    const entry = this.entries.find((item) => item.stroke.id === stroke.id);
    if (!entry || this.attemptingId === stroke.id) return false;
    entry.stroke = structuredClone(stroke);
    entry.complete = true;
    entry.finish = finish;
    entry.checkpoint?.(entry.stroke);
    this.schedule();
    return true;
  }

  cancel(strokeId: string, reason: string): void {
    const index = this.entries.findIndex((entry) => entry.stroke.id === strokeId);
    if (index < 0) return;
    const [entry] = this.entries.splice(index, 1);
    this.strokeOrder.delete(strokeId);
    if (entry) {
      entry.settled?.(entry.stroke, false);
      entry.recover(structuredClone(entry.stroke), reason);
    }
  }

  /** History/navigation boundaries invalidate every queued admission from the previous snapshot. */
  cancelAll(reason: string): void {
    const queued = [...this.entries];
    for (const entry of queued) this.cancel(entry.stroke.id, reason);
    if (this.timer !== null && this.entries.length === 0) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 테스트와 준비 상태 변경 알림에서도 동일한 실제 전이를 호출한다. */
  pump(): void {
    if (this.disposed || this.attemptingId !== null) return;
    const entry = this.entries[0];
    if (!entry) return;
    if (!this.canResume(entry.stroke.id)) {
      this.cancel(entry.stroke.id, "문서 또는 페이지가 바뀌어 원래 위치의 획 복구에 보관했습니다.");
      this.schedule();
      return;
    }
    const active = this.ports.activeStrokeId();
    if (active !== null && active !== entry.stroke.id) { this.schedule(); return; }
    // provider의 기존 초기화 제한보다 먼저 사용자의 획을 복구함으로 보내는 새 제한은 두지 않는다.
    if (entry.complete && this.ports.timeoutMs !== undefined && this.now() - entry.queuedAt >= this.ports.timeoutMs) {
      this.cancel(entry.stroke.id, "선택한 렌더러의 준비가 지연되어 원본 입력을 획 복구에 보관했습니다.");
      this.schedule();
      return;
    }
    this.attemptingId = entry.stroke.id;
    try {
      if (entry.admit(entry.stroke, entry.complete, entry.finish)) {
        const index = this.entries.indexOf(entry);
        if (index >= 0) this.entries.splice(index, 1);
        entry.settled?.(entry.stroke, true);
      }
    } catch (error) {
      this.cancel(entry.stroke.id, error instanceof Error ? error.message : "선택한 렌더러에서 입력 처리를 완료하지 못했습니다.");
    } finally {
      this.attemptingId = null;
      this.schedule();
    }
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.disposed = true;
    this.strokeOrder.clear();
    for (const entry of this.entries.splice(0)) {
      entry.settled?.(entry.stroke, false);
      entry.recover(structuredClone(entry.stroke), "편집기가 닫혀 대기 중 원본 입력을 획 복구에 보관했습니다.");
    }
  }

  private now(): number { return this.ports.now?.() ?? Date.now(); }

  private schedule(): void {
    if (this.disposed || this.timer !== null || this.entries.length === 0) return;
    this.timer = setTimeout(() => { this.timer = null; this.pump(); }, 32);
  }
}
