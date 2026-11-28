/**
 * 드로잉 안정성 가드 실시간 관측 카운터 스토어.
 *
 * 핫패스(120Hz/240Hz 포인터 스트림)에서는 순수 숫자 카운터만 갱신하고,
 * 사용자가 상태 레일 상세 패널을 열어 구독자가 실제로 존재할 때만 알림을 발행한다.
 * 평소 드로잉 중 React 렌더링 비용은 0이다.
 */

export interface StudioDrawingStabilityTelemetrySnapshot {
  readonly tailSpikesSuppressed: number;
  readonly pressureSpikesSuppressed: number;
  readonly palmTouchesIsolated: number;
  readonly interruptedStrokesSalvaged: number;
  readonly coalescedSamplesDecimated: number;
  readonly cornersPreserved: number;
}

export type StudioDrawingStabilityTelemetryField =
  keyof StudioDrawingStabilityTelemetrySnapshot;

const INITIAL_SNAPSHOT: StudioDrawingStabilityTelemetrySnapshot = Object.freeze({
  tailSpikesSuppressed: 0,
  pressureSpikesSuppressed: 0,
  palmTouchesIsolated: 0,
  interruptedStrokesSalvaged: 0,
  coalescedSamplesDecimated: 0,
  cornersPreserved: 0,
});

let currentSnapshot: StudioDrawingStabilityTelemetrySnapshot = INITIAL_SNAPSHOT;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  if (listeners.size === 0) return;
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // 개별 구독자 오류가 드로잉 파이프라인으로 전파되지 않도록 격리한다.
    }
  }
}

export function recordStudioDrawingStabilityCounts(
  delta: Partial<StudioDrawingStabilityTelemetrySnapshot>,
): void {
  const tail = delta.tailSpikesSuppressed ?? 0;
  const pressure = delta.pressureSpikesSuppressed ?? 0;
  const palm = delta.palmTouchesIsolated ?? 0;
  const salvaged = delta.interruptedStrokesSalvaged ?? 0;
  const decimated = delta.coalescedSamplesDecimated ?? 0;
  const corners = delta.cornersPreserved ?? 0;

  if (
    tail === 0
    && pressure === 0
    && palm === 0
    && salvaged === 0
    && decimated === 0
    && corners === 0
  ) {
    return;
  }

  currentSnapshot = Object.freeze({
    tailSpikesSuppressed: currentSnapshot.tailSpikesSuppressed + tail,
    pressureSpikesSuppressed: currentSnapshot.pressureSpikesSuppressed + pressure,
    palmTouchesIsolated: currentSnapshot.palmTouchesIsolated + palm,
    interruptedStrokesSalvaged: currentSnapshot.interruptedStrokesSalvaged + salvaged,
    coalescedSamplesDecimated: currentSnapshot.coalescedSamplesDecimated + decimated,
    cornersPreserved: currentSnapshot.cornersPreserved + corners,
  });
  notifyListeners();
}

export function getStudioDrawingStabilityTelemetrySnapshot(): StudioDrawingStabilityTelemetrySnapshot {
  return currentSnapshot;
}

export function subscribeStudioDrawingStabilityTelemetry(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function formatStudioDrawingStabilitySummary(
  snapshot: StudioDrawingStabilityTelemetrySnapshot,
): string {
  const parts: string[] = [];
  const spikeTotal = snapshot.tailSpikesSuppressed + snapshot.pressureSpikesSuppressed;
  if (spikeTotal > 0) parts.push(`꼬리 보정 ${spikeTotal}건`);
  if (snapshot.interruptedStrokesSalvaged > 0) {
    parts.push(`단절 복구 ${snapshot.interruptedStrokesSalvaged}건`);
  }
  if (snapshot.palmTouchesIsolated > 0) {
    parts.push(`팜 차단 ${snapshot.palmTouchesIsolated}건`);
  }
  if (snapshot.coalescedSamplesDecimated > 0) {
    parts.push(`고주사율 병합 ${snapshot.coalescedSamplesDecimated}점`);
  }
  return parts.length > 0 ? parts.join(" · ") : "보호 가동 중";
}

export function resetStudioDrawingStabilityTelemetryForTests(): void {
  currentSnapshot = INITIAL_SNAPSHOT;
  notifyListeners();
}
