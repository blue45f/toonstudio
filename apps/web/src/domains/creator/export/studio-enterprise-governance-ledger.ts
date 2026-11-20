/**
 * Waves 31–39: 엔터프라이즈 포트폴리오 거버넌스 원장(Enterprise Governance Ledger)
 * - W31: Multi-Label Rights Policy Matrix
 * - W32: Asset Dependency Impact Graph
 * - W33: SLA Breach Escalation Engine
 * - W34: Automated Escrow Hold/Release Guard
 * - W35: Co-Author Split Amendment Ledger
 * - W36: External Auditor Read-Only Snapshot
 * - W37: Platform Takedown Response Packet
 * - W38: Compliance Risk Heat-Score Calculator
 * - W39: Portfolio Governance Quarterly Rollup
 */

export interface LabelRightsPolicy {
  readonly labelId: string;
  readonly labelName: string;
  readonly requireCommercialAssets: boolean;
  readonly requireAiTrainingOptOut: boolean;
  readonly requireVoiceConsent: boolean;
  readonly maxRecoverySlaHours: number;
}

export interface AssetDependencyEdge {
  readonly assetId: string;
  readonly assetLabel: string;
  readonly usedInEpisodes: readonly string[];
}

export interface SlaBreachAlert {
  readonly episodeKey: string;
  readonly elapsedHours: number;
  readonly slaHours: number;
  readonly severity: "ok" | "warning" | "breached";
}

export interface EscrowHoldDecision {
  readonly episodeKey: string;
  readonly action: "release" | "hold";
  readonly amountKrw: number;
  readonly reason: string;
}

export interface CoAuthorSplitAmendment {
  readonly amendmentId: string;
  readonly episodeKey: string;
  readonly previousSplits: Readonly<Record<string, number>>;
  readonly nextSplits: Readonly<Record<string, number>>;
  readonly validSum100: boolean;
  readonly amendmentHash: string;
}

export interface TakedownResponsePacket {
  readonly ticketId: string;
  readonly episodeKey: string;
  readonly masterAuditHash: string;
  readonly cleanEvidenceReady: boolean;
  readonly packetDigestHash: string;
}

export interface EnterpriseQuarterlyRollup {
  readonly quarterLabel: string;
  readonly labelId: string;
  readonly totalEpisodes: number;
  readonly complianceRiskScore: number;
  readonly heldEscrowKrw: number;
  readonly releasedEscrowKrw: number;
  readonly breachedSlaCount: number;
  readonly auditorSnapshotHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** W31: 레이블 정책 매트릭스 준수 여부 평가 */
export function evaluateLabelPolicyCompliance(
  policy: LabelRightsPolicy,
  episode: {
    readonly commercialCleared: boolean;
    readonly aiOptOut: boolean;
    readonly voiceConsentVerified: boolean;
  },
): { readonly compliant: boolean; readonly violations: readonly string[] } {
  const violations: string[] = [];
  if (policy.requireCommercialAssets && !episode.commercialCleared) {
    violations.push("상업 에셋 미승인");
  }
  if (policy.requireAiTrainingOptOut && !episode.aiOptOut) {
    violations.push("AI 학습 금지(TDMRep) 누락");
  }
  if (policy.requireVoiceConsent && !episode.voiceConsentVerified) {
    violations.push("성우 음성권 미인증");
  }
  return { compliant: violations.length === 0, violations };
}

/** W32: 공유 에셋 의존성 역추적 그래프 */
export function traceImpactedEpisodesByAsset(
  edges: readonly AssetDependencyEdge[],
  revokedAssetIds: readonly string[],
): readonly string[] {
  const revokedSet = new Set(revokedAssetIds);
  const impacted = new Set<string>();
  for (const edge of edges) {
    if (revokedSet.has(edge.assetId)) {
      for (const ep of edge.usedInEpisodes) {
        impacted.add(ep);
      }
    }
  }
  return [...impacted].sort();
}

/** W33: 철회 복구 SLA 위반 에스컬레이션 계산 */
export function evaluateRecoverySlaAlerts(
  incidents: readonly { readonly episodeKey: string; readonly elapsedHours: number }[],
  maxRecoverySlaHours: number,
): readonly SlaBreachAlert[] {
  return incidents.map((item) => {
    let severity: "ok" | "warning" | "breached" = "ok";
    if (item.elapsedHours > maxRecoverySlaHours) {
      severity = "breached";
    } else if (item.elapsedHours >= maxRecoverySlaHours * 0.75) {
      severity = "warning";
    }
    return {
      episodeKey: item.episodeKey,
      elapsedHours: item.elapsedHours,
      slaHours: maxRecoverySlaHours,
      severity,
    };
  });
}

/** W34: 철회 연동 자동 에스크로 보류/해제 가드 */
export function decideEscrowHoldOrRelease(params: {
  readonly episodeKey: string;
  readonly amountKrw: number;
  readonly sealActive: boolean;
}): EscrowHoldDecision {
  if (!params.sealActive) {
    return {
      episodeKey: params.episodeKey,
      action: "hold",
      amountKrw: Math.max(0, Math.round(params.amountKrw)),
      reason: "트러스트 배지 비활성(철회/만료) — 복구 재발급 완료 시까지 정산 보류",
    };
  }
  return {
    episodeKey: params.episodeKey,
    action: "release",
    amountKrw: Math.max(0, Math.round(params.amountKrw)),
    reason: "클린 IP 배지 유효 — 에스크로 정상 지급 승인",
  };
}

/** W35: 공동작가 지분 변경 원장 */
export function createCoAuthorSplitAmendment(params: {
  readonly amendmentId: string;
  readonly episodeKey: string;
  readonly previousSplits: Readonly<Record<string, number>>;
  readonly nextSplits: Readonly<Record<string, number>>;
}): CoAuthorSplitAmendment {
  const sum = Object.values(params.nextSplits).reduce((acc, v) => acc + v, 0);
  const validSum100 = Math.abs(sum - 100) < 1e-6;
  const amendmentHash = fnv1aHex(
    JSON.stringify({
      amendmentId: params.amendmentId,
      episodeKey: params.episodeKey,
      previousSplits: params.previousSplits,
      nextSplits: params.nextSplits,
      validSum100,
    }),
  );
  return { ...params, validSum100, amendmentHash };
}

/** W37: 플랫폼 권리침해 이의제기 대응 패킷 생성 */
export function buildTakedownResponsePacket(params: {
  readonly ticketId: string;
  readonly episodeKey: string;
  readonly masterAuditHash: string;
  readonly receiptVerified: boolean;
  readonly sealActive: boolean;
}): TakedownResponsePacket {
  const cleanEvidenceReady = params.receiptVerified && params.sealActive;
  const packetDigestHash = fnv1aHex(
    JSON.stringify({
      ticketId: params.ticketId,
      episodeKey: params.episodeKey,
      masterAuditHash: params.masterAuditHash,
      cleanEvidenceReady,
    }),
  );
  return {
    ticketId: params.ticketId,
    episodeKey: params.episodeKey,
    masterAuditHash: params.masterAuditHash,
    cleanEvidenceReady,
    packetDigestHash,
  };
}

/** W36 + W38 + W39: 외부 감사관용 스냅샷·리스크 히트스코어·분기 결산 롤업 */
export function buildEnterpriseQuarterlyRollup(params: {
  readonly quarterLabel: string;
  readonly labelId: string;
  readonly escrowDecisions: readonly EscrowHoldDecision[];
  readonly slaAlerts: readonly SlaBreachAlert[];
}): EnterpriseQuarterlyRollup {
  const totalEpisodes = params.escrowDecisions.length;
  let heldEscrowKrw = 0;
  let releasedEscrowKrw = 0;
  let heldCount = 0;
  for (const d of params.escrowDecisions) {
    if (d.action === "hold") {
      heldEscrowKrw += d.amountKrw;
      heldCount += 1;
    } else {
      releasedEscrowKrw += d.amountKrw;
    }
  }
  const breachedSlaCount = params.slaAlerts.filter((a) => a.severity === "breached").length;
  const rawRisk =
    totalEpisodes === 0
      ? 0
      : Math.min(100, Math.round((heldCount / totalEpisodes) * 60 + breachedSlaCount * 20));

  const auditorSnapshotHash = fnv1aHex(
    JSON.stringify({
      quarterLabel: params.quarterLabel,
      labelId: params.labelId,
      totalEpisodes,
      complianceRiskScore: rawRisk,
      heldEscrowKrw,
      releasedEscrowKrw,
      breachedSlaCount,
    }),
  );

  return {
    quarterLabel: params.quarterLabel,
    labelId: params.labelId,
    totalEpisodes,
    complianceRiskScore: rawRisk,
    heldEscrowKrw,
    releasedEscrowKrw,
    breachedSlaCount,
    auditorSnapshotHash,
  };
}
