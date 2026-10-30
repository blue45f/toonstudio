/** 2D 테마·React·Three·네트워크 의존성이 없는 발행/수명 정책이다. */
export interface StudioThreeInteractionView {
  readonly id: string;
  readonly zoneId: string;
  readonly point: { readonly x: number; readonly y: number };
  readonly radius: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly action: string;
}

export interface StudioThreeNearbyNpcView<I extends StudioThreeInteractionView> {
  readonly id: string;
  readonly npc: unknown;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly activityKo: string;
  readonly activityEn: string;
  readonly skinKey: string;
  readonly distance: number;
  readonly interaction: I | null;
}

function sameInteraction<I extends StudioThreeInteractionView>(a: I | null, b: I | null): boolean {
  return a === b || (a !== null && b !== null && a.id === b.id && a.zoneId === b.zoneId
    && a.point.x === b.point.x && a.point.y === b.point.y && a.radius === b.radius
    && a.labelKo === b.labelKo && a.labelEn === b.labelEn && a.action === b.action);
}

function sameNpcs<I extends StudioThreeInteractionView, N extends StudioThreeNearbyNpcView<I>>(
  previous: readonly N[], next: readonly N[],
): boolean {
  return previous.length === next.length && previous.every((a, index) => {
    const b = next[index];
    // 순서는 프롬프트 대상을 바꾼다. HUD에서 사용하지 않는 소수 거리만 무시한다.
    return b !== undefined && a.id === b.id && a.labelKo === b.labelKo
      && a.labelEn === b.labelEn && a.activityKo === b.activityKo && a.activityEn === b.activityEn
      && a.skinKey === b.skinKey && sameInteraction(a.interaction, b.interaction);
  });
}

/** 정확한 게임 판정을 유지하며 HUD의 의미가 바뀌는 프레임에 즉시 발행한다. */
export class StudioThreeProximityPublication<I extends StudioThreeInteractionView, N extends StudioThreeNearbyNpcView<I>> {
  private initialized = false;
  private interaction: I | null = null;
  private npcs: readonly N[] = [];

  constructor(private readonly callbacks: {
    readonly interaction: (value: I | null) => void;
    readonly npcs: (value: readonly N[]) => void;
  }) {}

  sample(interaction: I | null, npcs: readonly N[]): void {
    const first = !this.initialized;
    this.initialized = true;
    if (first || !sameInteraction(this.interaction, interaction)) {
      this.interaction = interaction;
      this.callbacks.interaction(interaction);
    }
    if (first || !sameNpcs(this.npcs, npcs)) {
      this.npcs = [...npcs];
      this.callbacks.npcs(this.npcs);
    }
  }
}

export interface StudioThreeRuntimeCounters {
  /** 측정값이 아니라 호출자가 실제로 적용한 렌더 profile의 호환 태그다. 자동 품질 변경 금지. */
  readonly qualityTier: string;
  readonly peerCount: number;
  readonly visiblePeerCount: number;
  readonly npcCount: number;
  readonly visibleNpcCount: number;
  readonly routeWaypoints: number;
  readonly failedTextures: number;
}

export type StudioThreeRuntimeSample<C extends StudioThreeRuntimeCounters> = C & {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly updatedAt: number;
};

function sameCounters(a: StudioThreeRuntimeCounters, b: StudioThreeRuntimeCounters): boolean {
  return a.qualityTier === b.qualityTier && a.peerCount === b.peerCount
    && a.visiblePeerCount === b.visiblePeerCount && a.npcCount === b.npcCount
    && a.visibleNpcCount === b.visibleNpcCount && a.routeWaypoints === b.routeWaypoints
    && a.failedTextures === b.failedTextures;
}

/** rAF 간격을 측정한다. CPU/GPU 작업 시간이나 backend를 측정한 것처럼 표시하지 않는다. */
export class StudioThreeRuntimePublication<C extends StudioThreeRuntimeCounters> {
  private start: number | null = null;
  private previousFrameAt: number | null = null;
  private intervals = 0;
  private previous: StudioThreeRuntimeSample<C> | null = null;

  constructor(
    private readonly publish: (sample: StudioThreeRuntimeSample<C>) => void,
    private readonly readCounters: () => C,
  ) {}

  frame(now: number): void {
    if (!Number.isFinite(now)) return;
    if (this.previousFrameAt === null || this.start === null || now <= this.previousFrameAt) {
      this.start = now;
      this.previousFrameAt = now;
      this.intervals = 0;
      return;
    }
    this.previousFrameAt = now;
    this.intervals += 1;
    const elapsed = now - this.start;
    if (elapsed < 1_000) return;
    const counters = this.readCounters();
    const sample: StudioThreeRuntimeSample<C> = {
      ...counters,
      fps: Math.round(this.intervals * 10_000 / elapsed) / 10,
      frameTimeMs: Math.round(elapsed * 10 / this.intervals) / 10,
      updatedAt: now,
    };
    this.start = now;
    this.intervals = 0;
    const previous = this.previous;
    if (previous && previous.fps === sample.fps && previous.frameTimeMs === sample.frameTimeMs
      && sameCounters(previous, sample)) return;
    this.previous = sample;
    this.publish(sample);
  }
}

export interface StudioThreeActorLoadTicket<T extends object> {
  readonly id: string;
  readonly actor: T;
  readonly revision: number;
}

export interface StudioThreePendingController {
  readonly getPendingCount: () => number;
  readonly getPendingRevision: () => number;
  readonly whenIdle: () => Promise<void>;
}

/** fetch 이후 복제·배치·늦은 결과 해제까지 끝난 작업만 pending에서 제거한다. */
export class StudioThreePendingLoads implements StudioThreePendingController {
  private readonly tasks = new Set<Promise<void>>();
  private revision = 0;

  begin(): () => void {
    let complete: () => void = () => undefined;
    const task = new Promise<void>((resolve) => { complete = resolve; });
    this.tasks.add(task);
    this.revision += 1;
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      this.tasks.delete(task);
      this.revision += 1;
      complete();
    };
  }

  getPendingCount(): number { return this.tasks.size; }
  getPendingRevision(): number { return this.revision; }
  async whenIdle(): Promise<void> { while (this.tasks.size) await Promise.all([...this.tasks]); }
}

/** actor Map은 renderer 소유, 인스턴스 해제는 주입된 release가 유일하게 소유한다. */
export class StudioThreeActorLifetimes<T extends object> {
  private nextRevision = 0;
  private readonly pending = new Map<string, StudioThreeActorLoadTicket<T>>();
  private readonly released = new WeakSet<T>();
  private stopped = false;

  constructor(private readonly actors: Map<string, T>, private readonly release: (actor: T) => void) {}

  begin(id: string): StudioThreeActorLoadTicket<T> | null {
    const actor = this.actors.get(id);
    if (this.stopped || !actor) return null;
    const ticket = { id, actor, revision: ++this.nextRevision };
    this.pending.set(id, ticket);
    return ticket;
  }

  isCurrent(ticket: StudioThreeActorLoadTicket<T>): boolean {
    return !this.stopped && this.actors.get(ticket.id) === ticket.actor
      && this.pending.get(ticket.id) === ticket;
  }

  private remove(id: string): void {
    this.pending.delete(id);
    const actor = this.actors.get(id);
    this.actors.delete(id);
    if (!actor || this.released.has(actor)) return;
    this.released.add(actor);
    this.release(actor);
  }

  /** self와 manifest NPC는 보존한다. 같은 session ID 재입장도 예전 인스턴스와 구별한다. */
  prunePeers(activePeerActorIds: ReadonlySet<string>): void {
    const failures: unknown[] = [];
    for (const id of this.actors.keys()) {
      if (!id.startsWith("peer:") || activePeerActorIds.has(id)) continue;
      try { this.remove(id); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "퇴장한 3D 동료의 자원 해제에 실패했습니다.");
  }

  dispose(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.pending.clear();
    const failures: unknown[] = [];
    for (const id of this.actors.keys()) {
      try { this.remove(id); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, "3D 캐릭터 자원 해제에 실패했습니다.");
  }
}
