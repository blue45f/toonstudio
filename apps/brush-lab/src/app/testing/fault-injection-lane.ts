import { createMockLane } from "./mock-lane";

import type { MockLaneOptions } from "./mock-lane";
import type { LabImage, RawSample } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type {
  BrushEngineLane,
  DabBatchReceipt,
  LaneCapabilityReport,
  LaneEnvironment,
  LaneInit,
  LaneStats,
  StrokeAbortReceipt,
  StrokeOptions,
  StrokeReceipt,
} from "../../lanes/lane";

/**
 * 비동기 수명주기·결함 주입(fault-injection) 레인 픽스처.
 *
 * - 실제 레인(`cpu-reference`, `wasm-cpu`) 또는 모의 레인(`createMockLane`, GPU 손실·복원 불가 시나리오)을 감싸서
 *   `init`·`beginStroke`·`addSamples`·`endStroke`·`abortStroke`·`readback`·`readbackLinear`의
 *   동기 예외, 비동기 거부(rejected Promise), 지연 게이트(수동 resolve/reject)를 결정적으로 제어한다.
 * - 호출 순서 로그(`calls`, `callLog`), 해제 횟수(`disposedCount`), 해제 후 호출(`postDisposeCalls`),
 *   진행 중 비동기 작업 수(`activeInFlightCount`)를 기록해 자원 누수와 stale 완료 경합을 검증한다.
 */

export type FaultOp =
  | "probe"
  | "init"
  | "beginStroke"
  | "addSamples"
  | "endStroke"
  | "abortStroke"
  | "readback"
  | "readbackLinear"
  | "dispose";

export interface HeldCallGate {
  readonly op: FaultOp;
  readonly callIndex: number;
  /** 해당 연산이 호출되어 게이트에 도달했을 때 resolve되는 약속. */
  readonly entered: Promise<void>;
  /** 외부에서 `resolve()` 또는 `reject(err)`를 부를 때까지 대기하는 약속. */
  readonly promise: Promise<void>;
  /** 보류 중인 호출을 정상 완료시킨다. */
  resolve: () => void;
  /** 보류 중인 호출을 지정한 오류로 거부시킨다. */
  reject: (error: unknown) => void;
  /** 현재 호출이 게이트에 도달해 대기 중인가. */
  readonly isWaiting: boolean;
}

export type FaultRule =
  | { kind: "throw-sync"; error: unknown; onCall?: number }
  | { kind: "reject-async"; error: unknown; onCall?: number }
  | { kind: "hold"; onCall?: number; gate?: HeldCallGate };

export interface FaultCallEntry {
  readonly op: FaultOp;
  readonly callIndex: number;
  readonly inFlightAtEntry: number;
  readonly disposedAtEntry: boolean;
}

export interface FaultInjectionLaneOptions extends MockLaneOptions {
  /** 감쌀 실제 레인(생략하면 `createMockLane(opts)`를 감싼다). */
  inner?: BrushEngineLane;
  /** 연산별 초기 결함 규칙 목록. */
  faults?: Partial<Record<FaultOp, FaultRule[]>>;
}

export interface FaultInjectionLane extends BrushEngineLane {
  readonly inner: BrushEngineLane;
  readonly calls: FaultOp[];
  readonly callLog: FaultCallEntry[];
  readonly postDisposeCalls: FaultOp[];
  readonly disposedCount: number;
  readonly activeInFlightCount: number;
  /** 지정한 연산의 `onCall`번째(생략 시 다음 호출)를 보류하는 게이트를 걸고 돌려준다. */
  holdNext(op: FaultOp, onCall?: number): HeldCallGate;
  /** 지정한 연산의 `onCall`번째(생략 시 다음 호출)에서 동기 예외를 던지게 한다. */
  failNextSync(op: FaultOp, error: unknown, onCall?: number): void;
  /** 지정한 연산의 `onCall`번째(생략 시 다음 호출)에서 거부된 Promise를 돌려주게 한다. */
  failNextAsync(op: FaultOp, error: unknown, onCall?: number): void;
}

export function createHeldCallGate(op: FaultOp, callIndex = 1): HeldCallGate {
  let markEntered: () => void = () => undefined;
  let resolveGate: () => void = () => undefined;
  let rejectGate: (error: unknown) => void = () => undefined;
  let waiting = false;

  const entered = new Promise<void>((res) => {
    markEntered = () => {
      waiting = true;
      res();
    };
  });

  const promise = new Promise<void>((res, rej) => {
    resolveGate = () => {
      waiting = false;
      res();
    };
    rejectGate = (error: unknown) => {
      waiting = false;
      rej(error);
    };
  });

  const gate: HeldCallGate & { _notifyEntered(): void } = {
    op,
    callIndex,
    entered,
    promise,
    resolve: () => resolveGate(),
    reject: (error: unknown) => rejectGate(error),
    get isWaiting(): boolean {
      return waiting;
    },
    _notifyEntered: () => markEntered(),
  };

  return gate;
}

export function createFaultInjectionLane(opts: FaultInjectionLaneOptions = {}): FaultInjectionLane {
  const inner = opts.inner ?? createMockLane(opts);
  const calls: FaultOp[] = [];
  const callLog: FaultCallEntry[] = [];
  const postDisposeCalls: FaultOp[] = [];
  const opCounts = new Map<FaultOp, number>();
  const rules = new Map<FaultOp, FaultRule[]>();

  if (opts.faults) {
    for (const [op, list] of Object.entries(opts.faults) as Array<[FaultOp, FaultRule[] | undefined]>) {
      if (list) rules.set(op, [...list]);
    }
  }

  let disposedCount = 0;
  let activeInFlightCount = 0;

  const nextIndex = (op: FaultOp): number => {
    const idx = (opCounts.get(op) ?? 0) + 1;
    opCounts.set(op, idx);
    calls.push(op);
    const disposedAtEntry = disposedCount > 0;
    if (disposedAtEntry && op !== "dispose") {
      postDisposeCalls.push(op);
    }
    callLog.push({
      op,
      callIndex: idx,
      inFlightAtEntry: activeInFlightCount,
      disposedAtEntry,
    });
    return idx;
  };

  const takeRule = (op: FaultOp, callIndex: number): FaultRule | null => {
    const list = rules.get(op);
    if (!list || list.length === 0) return null;
    const matchIdx = list.findIndex((r) => r.onCall === undefined || r.onCall === callIndex);
    if (matchIdx < 0) return null;
    const [matched] = list.splice(matchIdx, 1);
    return matched ?? null;
  };

  const notifyGate = (gate: HeldCallGate): void => {
    const internal = gate as HeldCallGate & { _notifyEntered?: () => void };
    internal._notifyEntered?.();
  };

  const runAsyncOp = async <T>(op: FaultOp, invoke: () => Promise<T> | T): Promise<T> => {
    const idx = nextIndex(op);
    const rule = takeRule(op, idx);
    if (rule?.kind === "throw-sync") {
      throw rule.error;
    }
    activeInFlightCount += 1;
    try {
      if (rule?.kind === "reject-async") {
        await Promise.resolve();
        throw rule.error;
      }
      if (rule?.kind === "hold") {
        const gate = rule.gate ?? createHeldCallGate(op, idx);
        // init은 내부 부작용(장치·표면 생성) 전에 게이트에서 대기할 수도 있고,
        // endStroke·readback·readbackLinear는 내부 결과를 준비해 둔 뒤 게이트가 풀릴 때 완료/거부되게 한다.
        if (op === "init") {
          notifyGate(gate);
          await gate.promise;
          return await invoke();
        }
        const value = await invoke();
        notifyGate(gate);
        await gate.promise;
        return value;
      }
      return await invoke();
    } finally {
      activeInFlightCount -= 1;
    }
  };

  const runSyncOrInjectedAsyncOp = <T>(op: FaultOp, invoke: () => T): T => {
    const idx = nextIndex(op);
    const rule = takeRule(op, idx);
    if (rule?.kind === "throw-sync") {
      throw rule.error;
    }
    if (rule?.kind === "reject-async") {
      activeInFlightCount += 1;
      const rejected = Promise.resolve().then(
        () => {
          activeInFlightCount -= 1;
          throw rule.error;
        },
      );
      return rejected as unknown as T;
    }
    if (rule?.kind === "hold") {
      const gate = rule.gate ?? createHeldCallGate(op, idx);
      const value = invoke();
      activeInFlightCount += 1;
      notifyGate(gate);
      const held = gate.promise.then(
        () => {
          activeInFlightCount -= 1;
          return value;
        },
        (error: unknown) => {
          activeInFlightCount -= 1;
          throw error;
        },
      );
      return held as unknown as T;
    }
    return invoke();
  };

  const addRule = (op: FaultOp, rule: FaultRule): void => {
    const list = rules.get(op) ?? [];
    list.push(rule);
    rules.set(op, list);
  };

  return {
    get id() {
      return inner.id;
    },
    get label() {
      return inner.label;
    },
    get kind() {
      return inner.kind;
    },
    get status() {
      return inner.status;
    },
    get engineVersion() {
      return inner.engineVersion;
    },
    inner,
    calls,
    callLog,
    postDisposeCalls,
    get disposedCount(): number {
      return disposedCount;
    },
    get activeInFlightCount(): number {
      return activeInFlightCount;
    },
    holdNext(op: FaultOp, onCall?: number): HeldCallGate {
      const predictedCall = onCall ?? (opCounts.get(op) ?? 0) + 1;
      const gate = createHeldCallGate(op, predictedCall);
      addRule(op, { kind: "hold", onCall, gate });
      return gate;
    },
    failNextSync(op: FaultOp, error: unknown, onCall?: number): void {
      addRule(op, { kind: "throw-sync", error, onCall });
    },
    failNextAsync(op: FaultOp, error: unknown, onCall?: number): void {
      addRule(op, { kind: "reject-async", error, onCall });
    },
    probe(env: LaneEnvironment): Promise<LaneCapabilityReport> {
      return runAsyncOp("probe", () => inner.probe(env));
    },
    init(env: LaneEnvironment, config: LaneInit): Promise<void> {
      return runAsyncOp("init", () => inner.init(env, config));
    },
    beginStroke(program: BrushProgram, seed: number, options?: StrokeOptions): void {
      return runSyncOrInjectedAsyncAsyncBegin(program, seed, options);
    },
    addSamples(samples: readonly RawSample[]): DabBatchReceipt {
      return runSyncOrInjectedAsyncOp("addSamples", () => inner.addSamples(samples));
    },
    endStroke(): Promise<StrokeReceipt> {
      return runAsyncOp("endStroke", () => inner.endStroke());
    },
    abortStroke(): StrokeAbortReceipt {
      return runSyncOrInjectedAsyncOp("abortStroke", () => inner.abortStroke());
    },
    readback(): Promise<LabImage> {
      return runAsyncOp("readback", () => inner.readback());
    },
    readbackLinear(): Promise<Float32Array | null> {
      return runAsyncOp("readbackLinear", () => inner.readbackLinear());
    },
    stats(): LaneStats {
      return inner.stats();
    },
    dispose(): void {
      nextIndex("dispose");
      disposedCount += 1;
      inner.dispose();
    },
  };

  function runSyncOrInjectedAsyncAsyncBegin(program: BrushProgram, seed: number, options?: StrokeOptions): void {
    return runSyncOrInjectedAsyncOp("beginStroke", () => {
      if (options !== undefined) inner.beginStroke(program, seed, options);
      else inner.beginStroke(program, seed);
    });
  }
}
