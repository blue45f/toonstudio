/**
 * neon-usage-readonly.ts — Neon compute·디스크 사용량 읽기 전용 장치
 * (6단계 지속 운영, 2026-10-25).
 *
 * 읽기 전용을 구조로 강제한다:
 *  - 이 모듈이 정의하는 판독기 인터페이스(`NeonUsageReader`)에는
 *    조회 메서드 하나만 있다. 변경·삭제·생성 메서드는 존재하지
 *    않는다.
 *  - 이 모듈은 시크릿·연결 문자열을 일절 받지 않는다. 판독기는
 *    호출부(운영에서 시크릿 스토어를 쓰는 구성 단계)가 주입하고,
 *    이 모듈은 주입된 판독기의 반환 형태만 검증·표시한다.
 *  - Neon API를 직접 호출하지 않는다. 실제 조회에 필요한 읽기 전용
 *    연결 정보·권한은 소유자 항목으로 남는다 (STAGE56.md 참조).
 *  - 반환 스냅샷의 수치는 음수·비유한수를 거부하고, 단위 변환은
 *    표시 단계에서만 한다.
 */

export type NeonUsageRefusalReason = "neon_usage_invalid_snapshot";

export class NeonUsageError extends Error {
  readonly code: NeonUsageRefusalReason;

  constructor(code: NeonUsageRefusalReason, message: string) {
    super(message);
    this.name = "NeonUsageError";
    this.code = code;
  }
}

/** Neon 사용량 스냅샷 (읽기 전용 조회 결과). */
export interface NeonUsageSnapshot {
  /** 컴퓨트 사용량 (CU-hours 등, 제공자 단위 그대로). */
  readonly computeUnits: number | null;
  /** 디스크 사용량 (바이트). */
  readonly storageBytes: number | null;
  /** 측정 시각 (ISO 문자열). */
  readonly measuredAt: string;
  /** 출처 표기 (항상 읽기 전용 조회). */
  readonly source: "neon-readonly";
}

/**
 * 읽기 전용 판독기 seam. 메서드가 조회 하나뿐이므로 이 seam으로는
 * 변경·삭제를 표현할 수 없다. 시크릿은 이 인터페이스에 없다.
 */
export interface NeonUsageReader {
  readUsage(): Promise<NeonUsageSnapshot>;
}

/** 테스트·스텁용 고정 스냅샷 판독기. */
export class FixedNeonUsageReader implements NeonUsageReader {
  constructor(private readonly snapshot: NeonUsageSnapshot) {}

  async readUsage(): Promise<NeonUsageSnapshot> {
    return validateNeonUsageSnapshot(this.snapshot);
  }
}

function finiteNonNegative(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * 외부에서 들어온 스냅샷 형태를 검증한다. 수치가 비정상(음수·
 * 비유한수)이면 null로 두지 않고 스냅샷 자체를 거부한다 — 사용량
 * 표시에서 잘못된 수치가 정상처럼 보이는 것을 막기 위해서다.
 * 단, 제공자가 값을 안 준 경우(null)는 허용한다.
 */
export function validateNeonUsageSnapshot(
  raw: unknown,
): NeonUsageSnapshot {
  if (typeof raw !== "object" || raw === null) {
    throw new NeonUsageError(
      "neon_usage_invalid_snapshot",
      "Neon 사용량 스냅샷 형태가 아닙니다.",
    );
  }
  const candidate = raw as Record<string, unknown>;
  const measuredAt =
    typeof candidate.measuredAt === "string" ? candidate.measuredAt : "";
  const measured = new Date(measuredAt);
  if (!measuredAt || !Number.isFinite(measured.getTime())) {
    throw new NeonUsageError(
      "neon_usage_invalid_snapshot",
      "Neon 사용량 측정 시각이 유효하지 않습니다.",
    );
  }
  const computeRaw = candidate.computeUnits;
  const storageRaw = candidate.storageBytes;
  const computeUnits =
    computeRaw === null || computeRaw === undefined
      ? null
      : finiteNonNegative(computeRaw);
  const storageBytes =
    storageRaw === null || storageRaw === undefined
      ? null
      : finiteNonNegative(storageRaw);
  if (
    (computeRaw !== null
      && computeRaw !== undefined
      && computeUnits === null)
    || (storageRaw !== null
      && storageRaw !== undefined
      && storageBytes === null)
  ) {
    throw new NeonUsageError(
      "neon_usage_invalid_snapshot",
      "Neon 사용량 수치가 유효하지 않습니다.",
    );
  }
  return {
    computeUnits,
    storageBytes,
    measuredAt: measured.toISOString(),
    source: "neon-readonly",
  };
}

export interface NeonUsageDisplay {
  readonly computeLabel: string;
  readonly storageLabel: string;
  readonly measuredAtLabel: string;
  readonly sourceLabel: string;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "미보고";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GiB`;
}

/** 스냅샷을 어드민 표시 문자열로 바꾼다 (원본 수치는 바꾸지 않음). */
export function formatNeonUsage(
  snapshot: NeonUsageSnapshot,
): NeonUsageDisplay {
  return {
    computeLabel:
      snapshot.computeUnits === null
        ? "미보고"
        : `${snapshot.computeUnits.toLocaleString("en-US")} 단위`,
    storageLabel: formatBytes(snapshot.storageBytes),
    measuredAtLabel: snapshot.measuredAt,
    sourceLabel: "Neon 읽기 전용 조회",
  };
}
