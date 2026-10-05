// Compute Pressure(Pressure Observer) — 기기 CPU 압력을 읽어 두는 실험 모듈.
//
// 지원: Chrome/Edge 125+ 데스크톱 한정 (Firefox·Safari·Android 미지원, 보안 컨텍스트 필요).
// 용도: 지금은 설정의 실험 섹션이 현재 압력을 보여 주고, 최신 판정을 모듈 상태에 남겨
// 둔다. 가상스튜디오·ONNX 품질 적응 같은 실제 소비자는 각 소관 트랙이 이 모듈의
// getLatestComputePressure()를 읽어 붙이는 것이 후속이다 (이 트랙은 접점만 연다).
// 미지원 환경에서는 observe가 아무 일도 하지 않는 해제 함수만 돌려준다.

export type ComputePressureState = "nominal" | "fair" | "serious" | "critical";

export interface ComputePressureReading {
  readonly state: ComputePressureState;
  /** 현재는 "cpu"만 관찰한다. */
  readonly source: "cpu";
  /** 판정을 받은 시각 (Date.now()). */
  readonly at: number;
}

interface PressureRecordLike {
  readonly state?: unknown;
  readonly source?: unknown;
}

interface PressureObserverLike {
  observe(source: string, options?: { sampleInterval?: number }): Promise<void>;
  disconnect(): void;
}

type PressureObserverCtor = new (
  callback: (records: readonly PressureRecordLike[]) => void,
) => PressureObserverLike;

const PRESSURE_STATES: readonly ComputePressureState[] = [
  "nominal",
  "fair",
  "serious",
  "critical",
];

function isPressureState(value: unknown): value is ComputePressureState {
  return typeof value === "string"
    && (PRESSURE_STATES as readonly string[]).includes(value);
}

export function getPressureObserverCtor(): PressureObserverCtor | null {
  try {
    const ctor = (globalThis as unknown as Record<string, unknown>)["PressureObserver"];
    return typeof ctor === "function" ? (ctor as PressureObserverCtor) : null;
  } catch {
    // 전역 접근이 막힌 환경 — 미지원과 동일하게 취급한다.
    return null;
  }
}

export function isComputePressureSupported(): boolean {
  return getPressureObserverCtor() !== null;
}

let latestReading: ComputePressureReading | null = null;

/** 가장 최근 판정. 아직 관찰한 적이 없거나 미지원이면 null. */
export function getLatestComputePressure(): ComputePressureReading | null {
  return latestReading;
}

/**
 * CPU 압력 관찰을 시작한다. 상태가 바뀔 때마다 onChange가 불리고, 최신 판정은
 * getLatestComputePressure()에도 남는다. 반환된 함수를 부르면 관찰을 멈춘다.
 */
export function observeComputePressure(
  onChange: (reading: ComputePressureReading) => void,
): () => void {
  const Ctor = getPressureObserverCtor();
  if (!Ctor) return () => undefined;

  let stopped = false;
  let observer: PressureObserverLike | null = null;
  try {
    observer = new Ctor((records) => {
      const last = records[records.length - 1];
      if (!last || !isPressureState(last.state)) return;
      const reading: ComputePressureReading = {
        state: last.state,
        source: "cpu",
        at: Date.now(),
      };
      latestReading = reading;
      if (!stopped) onChange(reading);
    });
    const pending = observer.observe("cpu", { sampleInterval: 1000 });
    if (pending && typeof pending.catch === "function") {
      pending.catch(() => {
        // observe 거부(권한·미지원 소스)는 조용한 부재로 처리한다.
      });
    }
  } catch {
    // 생성자 자체가 던지는 환경 — 관찰 없이 종료한다.
    return () => undefined;
  }

  return () => {
    stopped = true;
    try {
      observer?.disconnect();
    } catch {
      // 이미 끊긴 관찰자의 재해제는 의미가 없다.
    }
  };
}
