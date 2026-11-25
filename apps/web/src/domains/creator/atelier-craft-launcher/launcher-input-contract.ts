import type { CraftLauncherPinState, CraftStationSpec } from "./atelier-craft-launcher-engine";

export function assertCount(value: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label}는 1~${maximum}의 유한한 정수여야 합니다.`);
  }
}

export function assertPinState(state: CraftLauncherPinState, catalog: readonly CraftStationSpec[]): void {
  assertCount(state.maxPinned, catalog.length, "핀 한도");
  const known = new Set(catalog.map((station) => station.id));
  if (state.storageKind !== "in-memory-preferences" || state.persistent !== false
    || state.pinnedIds.length > state.maxPinned || new Set(state.pinnedIds).size !== state.pinnedIds.length
    || state.pinnedIds.some((id) => !known.has(id))) {
    throw new RangeError("핀 상태가 메모리 목록 계약과 일치하지 않습니다.");
  }
}
