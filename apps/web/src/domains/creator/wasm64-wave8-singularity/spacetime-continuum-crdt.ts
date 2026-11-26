/**
 * Wave 8 Singularity — 시공간 하이브리드 논리 벡터 시계(HLC + Vector Clock) CRDT 컨티뉴엄 엔진 (₩0 로컬).
 *
 * 오프라인 다중 기기 스트로크 연산의 인과 선후(Happened-Before)와 동시 분기(Concurrent Branch)를 판별하고,
 * 임의 과거 논리 컷(Logical Cut) 시점의 캔버스 상태를 네트워크 도착 순서와 무관하게 결정론적으로 재현한다.
 */

export type VectorClockMap = Readonly<Record<string, number>>;
export type CausalOrderRelation = "equal" | "happened-before" | "happened-after" | "concurrent";

export interface HybridLogicalTimestamp {
  readonly wallTimeMs: number;
  readonly logicalCounter: number;
  readonly actorId: string;
}

export interface StrokePointSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export type ContinuumStrokePayload =
  | {
      readonly kind: "add-stroke";
      readonly strokeId: string;
      readonly layerId: string;
      readonly brushId: string;
      readonly colorHex: string;
      readonly widthPx: number;
      readonly points: readonly StrokePointSample[];
    }
  | {
      readonly kind: "modify-stroke";
      readonly strokeId: string;
      readonly widthPx?: number;
      readonly opacity?: number;
      readonly offsetX?: number;
      readonly offsetY?: number;
    }
  | {
      readonly kind: "erase-stroke";
      readonly strokeId: string;
    };

export interface SpacetimeStrokeOperation {
  readonly opId: string;
  readonly hlc: HybridLogicalTimestamp;
  readonly vectorClock: VectorClockMap;
  readonly payload: ContinuumStrokePayload;
}

export interface MaterializedContinuumStroke {
  readonly strokeId: string;
  readonly layerId: string;
  readonly brushId: string;
  readonly colorHex: string;
  readonly widthPx: number;
  readonly opacity: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly points: readonly StrokePointSample[];
  readonly createdByActor: string;
  readonly lastModifiedByActor: string;
}

export interface ConcurrentBranchPair {
  readonly opIdA: string;
  readonly opIdB: string;
  readonly actorA: string;
  readonly actorB: string;
}

export interface ContinuumReplaySnapshot {
  readonly appliedOperationIds: readonly string[];
  readonly activeStrokes: readonly MaterializedContinuumStroke[];
  readonly erasedStrokeIds: readonly string[];
  readonly frontierVectorClock: VectorClockMap;
  readonly serverCostKrw: 0;
}

/** 두 벡터 시계의 부분 인과 순서(선행·후행·동일·동시 분기)를 판정한다. */
export function compareVectorClocks(vcA: VectorClockMap, vcB: VectorClockMap): CausalOrderRelation {
  const actors = new Set<string>([...Object.keys(vcA), ...Object.keys(vcB)]);
  let aLess = false;
  let bLess = false;
  for (const actor of actors) {
    const va = vcA[actor] ?? 0;
    const vb = vcB[actor] ?? 0;
    if (va < vb) aLess = true;
    else if (va > vb) bLess = true;
    if (aLess && bLess) return "concurrent";
  }
  if (aLess) return "happened-before";
  if (bLess) return "happened-after";
  return "equal";
}

/** 두 HLC 타임스탬프의 결정론적 전순서(Total Order)를 비교한다. */
export function compareHlcTimestamps(a: HybridLogicalTimestamp, b: HybridLogicalTimestamp): number {
  if (a.wallTimeMs !== b.wallTimeMs) return a.wallTimeMs - b.wallTimeMs;
  if (a.logicalCounter !== b.logicalCounter) return a.logicalCounter - b.logicalCounter;
  if (a.actorId < b.actorId) return -1;
  if (a.actorId > b.actorId) return 1;
  return 0;
}

function isWithinLogicalCut(opVc: VectorClockMap, cutVc: VectorClockMap): boolean {
  for (const actor of Object.keys(opVc)) {
    if ((opVc[actor] ?? 0) > (cutVc[actor] ?? 0)) return false;
  }
  return true;
}

/** 인과적 부분 순서를 100% 보존하면서 동시 분기를 HLC 전순서로 결정론적 위상 정렬한다. */
function sortOperationsCausally(
  ops: readonly SpacetimeStrokeOperation[],
): SpacetimeStrokeOperation[] {
  const n = ops.length;
  if (n <= 1) return [...ops];

  const baseSorted = [...ops].sort((a, b) => {
    const hlcCmp = compareHlcTimestamps(a.hlc, b.hlc);
    if (hlcCmp !== 0) return hlcCmp;
    return a.opId < b.opId ? -1 : a.opId > b.opId ? 1 : 0;
  });

  const inDegree = new Int32Array(n);
  const dependents: number[][] = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const rel = compareVectorClocks(baseSorted[i]!.vectorClock, baseSorted[j]!.vectorClock);
      if (rel === "happened-before") {
        dependents[i]!.push(j);
        inDegree[j] = inDegree[j]! + 1;
      } else if (rel === "happened-after") {
        dependents[j]!.push(i);
        inDegree[i] = inDegree[i]! + 1;
      }
    }
  }

  const ready: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (inDegree[i] === 0) ready.push(i);
  }

  const ordered: SpacetimeStrokeOperation[] = [];
  while (ready.length > 0) {
    ready.sort((a, b) => a - b);
    const pick = ready.shift()!;
    ordered.push(baseSorted[pick]!);
    for (const nextIdx of dependents[pick]!) {
      inDegree[nextIdx] = inDegree[nextIdx]! - 1;
      if (inDegree[nextIdx] === 0) ready.push(nextIdx);
    }
  }

  return ordered.length === n ? ordered : baseSorted;
}

/** 오프라인 다중 기기 스트로크 연산을 HLC + 벡터 시계로 통합하고 과거 논리 컷을 재현하는 CRDT 엔진. */
export class SpacetimeContinuumEngine {
  public readonly actorId: string;
  private hlcWallMs = 0;
  private hlcLogical = 0;
  private readonly vc: Record<string, number> = {};
  private readonly opMap = new Map<string, SpacetimeStrokeOperation>();

  public constructor(actorId: string, initialWallTimeMs = 0) {
    if (!actorId.trim()) {
      throw new Error("기기·작업자 식별자(actorId)는 비어 있을 수 없습니다.");
    }
    this.actorId = actorId;
    this.hlcWallMs = Math.max(0, Math.trunc(initialWallTimeMs));
    this.vc[actorId] = 0;
  }

  public get currentVectorClock(): VectorClockMap {
    return { ...this.vc };
  }

  public get operationCount(): number {
    return this.opMap.size;
  }

  /** 로컬 스트로크 연산을 발행하고 HLC 및 자기 벡터 시계 성분을 전진시킨다. */
  public issueLocalOperation(
    payload: ContinuumStrokePayload,
    physicalTimeMs: number,
  ): SpacetimeStrokeOperation {
    const phys = Math.max(0, Math.trunc(physicalTimeMs));
    if (phys > this.hlcWallMs) {
      this.hlcWallMs = phys;
      this.hlcLogical = 0;
    } else {
      this.hlcLogical += 1;
    }

    const nextSeq = (this.vc[this.actorId] ?? 0) + 1;
    this.vc[this.actorId] = nextSeq;

    const op: SpacetimeStrokeOperation = {
      opId: `${this.actorId}:${nextSeq}`,
      hlc: {
        wallTimeMs: this.hlcWallMs,
        logicalCounter: this.hlcLogical,
        actorId: this.actorId,
      },
      vectorClock: { ...this.vc },
      payload,
    };
    this.opMap.set(op.opId, op);
    return op;
  }

  /** 원격 기기에서 전달된 오프라인/실시간 스트로크 연산을 멱등 병합한다. */
  public applyRemoteOperation(op: SpacetimeStrokeOperation, physicalTimeMs: number): boolean {
    if (this.opMap.has(op.opId)) return false;

    const phys = Math.max(0, Math.trunc(physicalTimeMs));
    const prevWall = this.hlcWallMs;
    const nextWall = Math.max(prevWall, op.hlc.wallTimeMs, phys);

    if (nextWall === prevWall && nextWall === op.hlc.wallTimeMs) {
      this.hlcLogical = Math.max(this.hlcLogical, op.hlc.logicalCounter) + 1;
    } else if (nextWall === prevWall) {
      this.hlcLogical += 1;
    } else if (nextWall === op.hlc.wallTimeMs) {
      this.hlcLogical = op.hlc.logicalCounter + 1;
    } else {
      this.hlcLogical = 0;
    }
    this.hlcWallMs = nextWall;

    for (const [actor, seq] of Object.entries(op.vectorClock)) {
      this.vc[actor] = Math.max(this.vc[actor] ?? 0, seq);
    }

    this.opMap.set(op.opId, op);
    return true;
  }

  /** 서로 다른 기기에서 인과 연결 없이 동시에 발행된 오프라인 분기 쌍을 모두 탐지한다. */
  public detectConcurrentBranches(): readonly ConcurrentBranchPair[] {
    const ops = sortOperationsCausally([...this.opMap.values()]);
    const pairs: ConcurrentBranchPair[] = [];
    for (let i = 0; i < ops.length; i += 1) {
      for (let j = i + 1; j < ops.length; j += 1) {
        const a = ops[i]!;
        const b = ops[j]!;
        if (compareVectorClocks(a.vectorClock, b.vectorClock) === "concurrent") {
          pairs.push({
            opIdA: a.opId,
            opIdB: b.opId,
            actorA: a.hlc.actorId,
            actorB: b.hlc.actorId,
          });
        }
      }
    }
    return pairs;
  }

  /** 지정한 벡터 시계 논리 컷(생략 시 전체 현재 프런티어) 이하의 결정론적 컨티뉴엄 상태를 재현한다. */
  public replayAtLogicalCut(cutVectorClock?: VectorClockMap): ContinuumReplaySnapshot {
    const eligible = cutVectorClock
      ? [...this.opMap.values()].filter((op) => isWithinLogicalCut(op.vectorClock, cutVectorClock))
      : [...this.opMap.values()];

    const ordered = sortOperationsCausally(eligible);
    const strokeTable = new Map<string, MaterializedContinuumStroke>();
    const erasedSet = new Set<string>();
    const frontier: Record<string, number> = {};
    const appliedOperationIds: string[] = [];

    for (const op of ordered) {
      appliedOperationIds.push(op.opId);
      for (const [actor, seq] of Object.entries(op.vectorClock)) {
        frontier[actor] = Math.max(frontier[actor] ?? 0, seq);
      }

      const { payload } = op;
      if (payload.kind === "add-stroke") {
        if (!erasedSet.has(payload.strokeId)) {
          strokeTable.set(payload.strokeId, {
            strokeId: payload.strokeId,
            layerId: payload.layerId,
            brushId: payload.brushId,
            colorHex: payload.colorHex,
            widthPx: payload.widthPx,
            opacity: 1,
            offsetX: 0,
            offsetY: 0,
            points: payload.points,
            createdByActor: op.hlc.actorId,
            lastModifiedByActor: op.hlc.actorId,
          });
        }
      } else if (payload.kind === "modify-stroke") {
        const existing = strokeTable.get(payload.strokeId);
        if (existing && !erasedSet.has(payload.strokeId)) {
          strokeTable.set(payload.strokeId, {
            ...existing,
            widthPx: payload.widthPx ?? existing.widthPx,
            opacity: payload.opacity ?? existing.opacity,
            offsetX: existing.offsetX + (payload.offsetX ?? 0),
            offsetY: existing.offsetY + (payload.offsetY ?? 0),
            lastModifiedByActor: op.hlc.actorId,
          });
        }
      } else if (payload.kind === "erase-stroke") {
        erasedSet.add(payload.strokeId);
        strokeTable.delete(payload.strokeId);
      }
    }

    return {
      appliedOperationIds,
      activeStrokes: [...strokeTable.values()],
      erasedStrokeIds: [...erasedSet].sort(),
      frontierVectorClock: frontier,
      serverCostKrw: 0,
    };
  }
}
