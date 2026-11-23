/**
 * 오프라인 다중 기기 편집을 위한 HLC(Hybrid Logical Clock) 및 Vector Clock 엔진.
 *
 * Kulkarni et al. (2014) HLC 규약과 점별 최댓값(pointwise max) Vector Clock 결합 반격자
 * (join-semilattice)를 구현한다. 모든 동률 비교는 deviceId UTF-16 코드 단위 사전순으로
 * 결정론적 수렴을 보장한다.
 */

export interface HlcTimestamp {
  /** 물리 시계 구성요소(정수 밀리초, 0 이상) */
  readonly physicalMs: number;
  /** 동일 밀리초 내 인과 순서를 구분하는 논리 카운터(정수, 0 이상) */
  readonly logical: number;
  /** 결정론적 타이브레이커용 기기 고유 식별자 */
  readonly deviceId: string;
}

export type VectorClock = Readonly<Record<string, number>>;

export type CausalityOrder = "before" | "after" | "equal" | "concurrent";

const MAX_SAFE_LOGICAL = 0xffffff;
const HLC_SERIALIZED_PATTERN = /^(\d{15}):(\d{6}):(.+)$/u;

function assertValidDeviceId(deviceId: string): string {
  const trimmed = deviceId.trim();
  if (trimmed.length === 0) {
    throw new RangeError("deviceId must be a non-empty string");
  }
  return trimmed;
}

function normalizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.trunc(value);
}

/**
 * 로케일에 무관한 결정론적 UTF-16 코드 단위 사전순 비교.
 * `localeCompare`는 런타임 로케일에 따라 순서가 달라질 수 있어 CRDT 타이브레이커로 쓰지 않는다.
 */
export function compareDeviceIds(a: string, b: string): -1 | 0 | 1 {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** 초기 HLC 타임스탬프를 생성한다. */
export function createHlc(
  deviceId: string,
  physicalMs: number = Date.now(),
  logical = 0,
): HlcTimestamp {
  return Object.freeze({
    physicalMs: normalizeNonNegativeInt(physicalMs),
    logical: Math.min(MAX_SAFE_LOGICAL, normalizeNonNegativeInt(logical)),
    deviceId: assertValidDeviceId(deviceId),
  });
}

/**
 * 로컬 편집 이벤트 발생 시 HLC를 단조 증가시킨다.
 * 로컬 시스템 시계가 역행하더라도 `compareHlc(next, current) > 0`을 보장한다.
 */
export function tickHlc(
  current: HlcTimestamp,
  nowMs: number = Date.now(),
): HlcTimestamp {
  const wall = normalizeNonNegativeInt(nowMs);
  const nextPhysical = Math.max(current.physicalMs, wall);
  const nextLogical = nextPhysical === current.physicalMs
    ? current.logical + 1
    : 0;

  return Object.freeze({
    physicalMs: nextPhysical,
    logical: nextLogical,
    deviceId: assertValidDeviceId(current.deviceId),
  });
}

/**
 * 원격 기기의 HLC를 수신할 때 로컬 HLC를 인과적으로 전진시킨다.
 * 반환값은 항상 `local`과 `remote` 모두보다 엄격히 큰 `(physicalMs, logical)`을 갖는다.
 */
export function receiveHlc(
  local: HlcTimestamp,
  remote: HlcTimestamp,
  nowMs: number = Date.now(),
): HlcTimestamp {
  const wall = normalizeNonNegativeInt(nowMs);
  const nextPhysical = Math.max(local.physicalMs, remote.physicalMs, wall);

  let nextLogical: number;
  if (nextPhysical === local.physicalMs && nextPhysical === remote.physicalMs) {
    nextLogical = Math.max(local.logical, remote.logical) + 1;
  } else if (nextPhysical === local.physicalMs) {
    nextLogical = local.logical + 1;
  } else if (nextPhysical === remote.physicalMs) {
    nextLogical = remote.logical + 1;
  } else {
    nextLogical = 0;
  }

  return Object.freeze({
    physicalMs: nextPhysical,
    logical: nextLogical,
    deviceId: assertValidDeviceId(local.deviceId),
  });
}

/**
 * 두 HLC 타임스탬프를 전순서(total order)로 비교한다.
 * `physicalMs → logical → deviceId` 순으로 비교해 모든 기기에서 동일한 결과를 얻는다.
 */
export function compareHlc(a: HlcTimestamp, b: HlcTimestamp): -1 | 0 | 1 {
  if (a.physicalMs !== b.physicalMs) {
    return a.physicalMs < b.physicalMs ? -1 : 1;
  }
  if (a.logical !== b.logical) {
    return a.logical < b.logical ? -1 : 1;
  }
  return compareDeviceIds(a.deviceId, b.deviceId);
}

/** 두 HLC 중 전순서상 큰 값을 반환하는 결합 반격자(join) 연산. */
export function maxHlc(a: HlcTimestamp, b: HlcTimestamp): HlcTimestamp {
  return compareHlc(a, b) >= 0 ? a : b;
}

/** HLC를 고정폭 사전순 정렬 가능한 문자열로 직렬화한다. */
export function serializeHlc(hlc: HlcTimestamp): string {
  const phys = String(normalizeNonNegativeInt(hlc.physicalMs)).padStart(15, "0");
  const logic = String(normalizeNonNegativeInt(hlc.logical)).padStart(6, "0");
  return `${phys}:${logic}:${hlc.deviceId}`;
}

/** 직렬화된 HLC 문자열을 파싱한다. 형식이 잘못되면 `null`을 반환한다. */
export function parseHlc(serialized: string): HlcTimestamp | null {
  const match = HLC_SERIALIZED_PATTERN.exec(serialized);
  if (!match) return null;
  const physicalText = match[1];
  const logicalText = match[2];
  const deviceId = match[3];
  if (!physicalText || !logicalText || !deviceId || deviceId.trim().length === 0) {
    return null;
  }
  const physicalMs = Number.parseInt(physicalText, 10);
  const logical = Number.parseInt(logicalText, 10);
  if (!Number.isSafeInteger(physicalMs) || !Number.isSafeInteger(logical)) {
    return null;
  }
  return createHlc(deviceId, physicalMs, logical);
}

/** Vector Clock을 키 정렬 및 양수 정규화된 불변 맵으로 변환한다. */
export function createVectorClock(
  entries: Readonly<Record<string, number>> = {},
): VectorClock {
  const sortedKeys = Object.keys(entries).sort(compareDeviceIds);
  const normalized: Record<string, number> = {};
  for (const key of sortedKeys) {
    const cleanKey = key.trim();
    if (cleanKey.length === 0) continue;
    const raw = entries[key];
    if (raw === undefined) continue;
    const count = normalizeNonNegativeInt(raw);
    if (count > 0) {
      normalized[cleanKey] = count;
    }
  }
  return Object.freeze(normalized);
}

/** 특정 기기의 논리 시계 항목을 1 증가시킨다. */
export function incrementVectorClock(
  clock: VectorClock,
  deviceId: string,
): VectorClock {
  const id = assertValidDeviceId(deviceId);
  const next: Record<string, number> = {};
  const keys = new Set([...Object.keys(clock), id]);
  const sortedKeys = [...keys].sort(compareDeviceIds);
  for (const key of sortedKeys) {
    const current = normalizeNonNegativeInt(clock[key] ?? 0);
    const value = key === id ? current + 1 : current;
    if (value > 0) {
      next[key] = value;
    }
  }
  return Object.freeze(next);
}

/** 두 Vector Clock의 점별 최댓값(pointwise max)을 계산한다. (교환·결합·멱등) */
export function mergeVectorClocks(a: VectorClock, b: VectorClock): VectorClock {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const sortedKeys = [...keys].sort(compareDeviceIds);
  const merged: Record<string, number> = {};
  for (const key of sortedKeys) {
    const valA = normalizeNonNegativeInt(a[key] ?? 0);
    const valB = normalizeNonNegativeInt(b[key] ?? 0);
    const maxVal = Math.max(valA, valB);
    if (maxVal > 0) {
      merged[key] = maxVal;
    }
  }
  return Object.freeze(merged);
}

/**
 * 두 Vector Clock의 인과 관계(happened-before)를 판정한다.
 * - `"equal"`: 모든 기기 카운터가 동일
 * - `"before"`: `a`가 `b`보다 엄격히 선행(`a < b`)
 * - `"after"`: `a`가 `b`보다 엄격히 후행(`a > b`)
 * - `"concurrent"`: 서로 관측하지 못한 동시 편집(`a || b`)
 */
export function compareCausality(a: VectorClock, b: VectorClock): CausalityOrder {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let hasLess = false;
  let hasGreater = false;

  for (const key of keys) {
    const valA = normalizeNonNegativeInt(a[key] ?? 0);
    const valB = normalizeNonNegativeInt(b[key] ?? 0);
    if (valA < valB) hasLess = true;
    else if (valA > valB) hasGreater = true;
    if (hasLess && hasGreater) return "concurrent";
  }

  if (!hasLess && !hasGreater) return "equal";
  return hasLess ? "before" : "after";
}

/** UI·로그 표시용 간결한 Vector Clock 문자열을 반환한다. */
export function formatVectorClock(clock: VectorClock): string {
  const normalized = createVectorClock(clock);
  const entries = Object.entries(normalized);
  if (entries.length === 0) return "∅";
  return entries.map(([deviceId, count]) => `${deviceId}:${count}`).join(" · ");
}
