import {
  buildWave1000MillenniumProof,
  type Wave1000MillenniumProof,
} from "@/shared/lib/wave1000-millennium-registry";

export interface Wave1000AutonomousGateInput {
  readonly seriesTitle: string;
  readonly masterReceiptHash: string;
  readonly webgpuFrameTimeMs: number;
  readonly federatedStudiosCount: number;
  readonly supportedLocalesCount: number;
  readonly realTimeRoyaltyLatencyMs: number;
  readonly zkArchivalYears: number;
  readonly creatorWeeklyHours: number;
  readonly activeRegionsCount: number;
  readonly autoReissuanceEnabled: boolean;
}

export interface Wave1000AutonomousGateResult {
  readonly seriesTitle: string;
  readonly millenniumPassed: boolean;
  readonly totalWavesVerified: number;
  readonly blockers: readonly string[];
  readonly millenniumProof: Wave1000MillenniumProof;
  readonly grandGateDigestHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Century 2–10 (Waves 101–1000) 통합 상업·기술·규제·자율운영 게이트 검증 엔진.
 */
export function evaluateWave1000AutonomousGate(
  input: Wave1000AutonomousGateInput,
): Wave1000AutonomousGateResult {
  const blockers: string[] = [];
  const millenniumProof = buildWave1000MillenniumProof({
    masterReceiptHash: input.masterReceiptHash,
  });

  if (!millenniumProof.dagAcyclic || millenniumProof.totalWavesVerified < 1000) {
    blockers.push("Wave 1000 센추리 DAG 무결성 미충족");
  }
  if (input.webgpuFrameTimeMs > 16.6) {
    blockers.push(`WebGPU 프레임 예산 초과 (${input.webgpuFrameTimeMs}ms > 16.6ms)`);
  }
  if (input.federatedStudiosCount < 2) {
    blockers.push("멀티 스튜디오 연방(2개 이상) 미연동");
  }
  if (input.supportedLocalesCount < 12) {
    blockers.push(`글로벌 현지화 권역 부족 (${input.supportedLocalesCount} < 12)`);
  }
  if (input.realTimeRoyaltyLatencyMs > 5_000) {
    blockers.push("실시간 로열티 스트리밍 지연 초과");
  }
  if (input.zkArchivalYears < 10) {
    blockers.push("장기 ZK 아카이브 보존 기간 미달");
  }
  if (input.creatorWeeklyHours > 52) {
    blockers.push("창작자 지속가능 주간 작업시간 초과");
  }
  if (input.activeRegionsCount < 3) {
    blockers.push("다중 리전 Active-Active(3리전 이상) 미충족");
  }
  if (!input.autoReissuanceEnabled) {
    blockers.push("자가복구 자동 배지 재발급 비활성화");
  }

  const millenniumPassed = blockers.length === 0;
  const grandGateDigestHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: input.seriesTitle,
      millenniumPassed,
      millenniumRoot: millenniumProof.wave1000MillenniumRootHash,
      totalWavesVerified: millenniumProof.totalWavesVerified,
    }),
  );

  return {
    seriesTitle: input.seriesTitle,
    millenniumPassed,
    totalWavesVerified: millenniumProof.totalWavesVerified,
    blockers,
    millenniumProof,
    grandGateDigestHash,
  };
}
