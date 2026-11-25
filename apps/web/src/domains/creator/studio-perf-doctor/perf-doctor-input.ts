import { MAX_RING_CAPACITY, MIN_RING_CAPACITY } from "./perf-doctor-contracts";
import type { AdaptiveGuardrailPlan, FrameTimeRingBuffer, StudioPerfDoctorSnapshot } from "./perf-doctor-contracts";

/** 계산에 필요한 원본 수치를 유한한 음이 아닌 값으로 제한한다. */
export function assertSimulationInput(snapshot: StudioPerfDoctorSnapshot, plan: AdaptiveGuardrailPlan): void {
  const groups = [snapshot.telemetry.vram, snapshot.telemetry.tileCache, snapshot.telemetry.opfsWal];
  for (const group of groups) {
    for (const [name, value] of Object.entries(group)) {
      if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
        throw new RangeError(`Invalid simulation input: ${name}`);
      }
    }
  }
  for (const step of plan.steps) {
    const estimates = [step.estimatedP99ReductionMs, step.estimatedVramReleaseMb, step.estimatedTileHitGainPct, step.estimatedWalReductionMs];
    if (estimates.some((value) => !Number.isFinite(value) || value < 0)) {
      throw new RangeError(`Invalid simulation estimate: ${step.id}`);
    }
  }
}

/** 링 길이와 인덱스를 검증해 잘못된 크기로 순회하거나 기록을 버리지 않는다. */
export function assertFrameRing(ring: FrameTimeRingBuffer): void {
  if (!Number.isSafeInteger(ring.capacity) || ring.capacity < MIN_RING_CAPACITY || ring.capacity > MAX_RING_CAPACITY
    || !Number.isSafeInteger(ring.size) || ring.size < 0 || ring.size > ring.capacity
    || !Number.isSafeInteger(ring.writeIndex) || ring.writeIndex < 0 || ring.writeIndex >= ring.capacity
    || !Number.isSafeInteger(ring.totalRecorded) || ring.totalRecorded < ring.size
    || ring.slots.length !== ring.capacity
    || ring.size !== Math.min(ring.capacity, ring.totalRecorded)
    || ring.writeIndex !== ring.totalRecorded % ring.capacity) {
    throw new RangeError("Invalid frame ring geometry");
  }
  const start = ring.size < ring.capacity ? 0 : ring.writeIndex;
  for (let offset = 0; offset < ring.capacity; offset += 1) {
    const sample = ring.slots[(start + offset) % ring.capacity];
    if (offset < ring.size) {
      if (!sample || sample.frameIndex !== ring.totalRecorded - ring.size + offset + 1) {
        throw new RangeError("Missing or inconsistent active frame slot");
      }
    } else if (sample !== null) {
      throw new RangeError("Unexpected inactive frame slot");
    }
  }
}
