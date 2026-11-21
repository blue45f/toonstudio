/**
 * CRECO++ 클린룸 협업 엔진 (파트 2):
 * 4) ₩0 무료 AI 어시스턴트 음영 생성 + 가운데 0~100% 와이프 핸들 전/후 비교
 * 5) 세부 공정·시트 권한 제어(ACL) + ₩0 무제한 시트 경제성 + 보안 공유 링크 검증 + 해시 체인 활동 로그 & 리드타임 성과 집계
 * 6) 단축키 빠른 조작 매퍼 및 6대 플랫폼 다중 규격 내보내기 재수출
 */

import type { CrecoStageId } from "./creco-version-compare-types";
import {
  CRECO_SHORTCUT_DEFINITIONS,
  WEBTOON_PLATFORM_SPECS,
  buildMultiSpecExportManifest,
  mapCrecoViewerShortcut,
  type ExportQualityTier,
  type ExportResizeMode,
  type WebtoonPlatformId,
} from "./creco-export-shortcuts-engine";

export {
  CRECO_SHORTCUT_DEFINITIONS,
  WEBTOON_PLATFORM_SPECS,
  buildMultiSpecExportManifest,
  mapCrecoViewerShortcut,
  type ExportQualityTier,
  type ExportResizeMode,
  type WebtoonPlatformId,
};

export type ShadingLightDirection =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "front"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right"
  | "backlight"
  | "optimal";

export type ShadingEdgeStyle = "cel-hard" | "soft-gradient";
export type ShadingTonePresetId = "indigo-dusk" | "warm-plum" | "slate-ink" | "sunset-amber";
export type ShadingResolution = "2K" | "4K";
export type ShadingOutputMode = "merged" | "separate-alpha";
export type ShadingApprovalStatus = "preview" | "approved" | "applied-to-canvas";

export interface ShadingLightPreset {
  readonly id: ShadingLightDirection;
  readonly label: string;
  readonly angleDeg: number;
  readonly vectorX: number;
  readonly vectorY: number;
}

export const SHADING_LIGHT_PRESETS: readonly ShadingLightPreset[] = [
  { id: "top-left", label: "좌상단", angleDeg: 135, vectorX: 0.72, vectorY: 0.72 },
  { id: "top", label: "정면 상단", angleDeg: 180, vectorX: 0, vectorY: 0.92 },
  { id: "top-right", label: "우상단", angleDeg: 225, vectorX: -0.72, vectorY: 0.72 },
  { id: "left", label: "좌측", angleDeg: 90, vectorX: 0.94, vectorY: 0.08 },
  { id: "front", label: "정면광", angleDeg: 180, vectorX: 0, vectorY: 0.25 },
  { id: "right", label: "우측", angleDeg: 270, vectorX: -0.94, vectorY: 0.08 },
  { id: "bottom-left", label: "좌하단", angleDeg: 45, vectorX: 0.72, vectorY: -0.72 },
  { id: "bottom", label: "하단 반사광", angleDeg: 0, vectorX: 0, vectorY: -0.88 },
  { id: "bottom-right", label: "우하단", angleDeg: 315, vectorX: -0.72, vectorY: -0.72 },
  { id: "backlight", label: "역광 실루엣", angleDeg: 195, vectorX: -0.15, vectorY: 0.95 },
  { id: "optimal", label: "AI 자동 최적", angleDeg: 148, vectorX: 0.58, vectorY: 0.76 },
];

export interface ShadingTonePreset {
  readonly id: ShadingTonePresetId;
  readonly label: string;
  readonly shadowOklch: string;
  readonly rimOklch: string;
}

export const SHADING_TONE_PRESETS: readonly ShadingTonePreset[] = [
  {
    id: "indigo-dusk",
    label: "야경 인디고",
    shadowOklch: "oklch(0.36 0.12 262)",
    rimOklch: "oklch(0.86 0.11 225)",
  },
  {
    id: "warm-plum",
    label: "로판 플럼",
    shadowOklch: "oklch(0.42 0.11 335)",
    rimOklch: "oklch(0.90 0.09 78)",
  },
  {
    id: "slate-ink",
    label: "무채색 먹톤",
    shadowOklch: "oklch(0.38 0.02 250)",
    rimOklch: "oklch(0.92 0.02 240)",
  },
  {
    id: "sunset-amber",
    label: "석양 앰버",
    shadowOklch: "oklch(0.45 0.13 36)",
    rimOklch: "oklch(0.91 0.13 84)",
  },
];

export interface FreeAssistantShadingInput {
  readonly cutIndex: number;
  readonly lightDirection: ShadingLightDirection;
  readonly edgeStyle: ShadingEdgeStyle;
  readonly shadowDensityPct: number;
  readonly rimLightPct: number;
  readonly tonePresetId: ShadingTonePresetId;
  readonly resolution: ShadingResolution;
  readonly outputMode: ShadingOutputMode;
  readonly wipePercent: number;
  readonly approvalStatus?: ShadingApprovalStatus;
}

export interface FreeAssistantShadingPreview {
  readonly cutIndex: number;
  readonly lightDirection: ShadingLightDirection;
  readonly lightLabel: string;
  readonly edgeStyle: ShadingEdgeStyle;
  readonly shadowDensityPct: number;
  readonly rimLightPct: number;
  readonly tonePresetId: ShadingTonePresetId;
  readonly resolution: ShadingResolution;
  readonly outputMode: ShadingOutputMode;
  readonly wipePercent: number;
  readonly approvalStatus: ShadingApprovalStatus;
  readonly costKrw: 0;
  readonly tokenCost: 0;
  readonly crecoEquivalentTokens: number;
  readonly gradientAngleDeg: number;
  readonly shadowVectorX: number;
  readonly shadowVectorY: number;
  readonly shadowOpacity: number;
  readonly shadowFillOklch: string;
  readonly rimStrokeOklch: string;
  readonly rimOpacity: number;
  readonly gradientCss: string;
  readonly summaryText: string;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function computeChainHash(seed: string): string {
  let hash = 2166136261;
  for (let idx = 0; idx < seed.length; idx += 1) {
    hash ^= seed.charCodeAt(idx);
    hash = Math.imul(hash, 16777619);
  }
  return `audit_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function generateFreeAssistantShadingPreview(
  input: FreeAssistantShadingInput,
): FreeAssistantShadingPreview {
  const light =
    SHADING_LIGHT_PRESETS.find((item) => item.id === input.lightDirection) ??
    SHADING_LIGHT_PRESETS[0];
  const tone =
    SHADING_TONE_PRESETS.find((item) => item.id === input.tonePresetId) ??
    SHADING_TONE_PRESETS[0];

  const shadowDensityPct = Math.round(clamp(input.shadowDensityPct, 0, 100));
  const rimLightPct = Math.round(clamp(input.rimLightPct, 0, 100));
  const wipePercent = Math.round(clamp(input.wipePercent, 0, 100));
  const crecoEquivalentTokens = input.resolution === "4K" ? 55 : 40;
  const shadowOpacity = Math.round((0.18 + (shadowDensityPct / 100) * 0.62) * 100) / 100;
  const rimOpacity = Math.round(((rimLightPct / 100) * 0.92) * 100) / 100;

  const stopPoint = input.edgeStyle === "cel-hard" ? 52 : 76;
  const hardFalloff = input.edgeStyle === "cel-hard" ? 54 : 96;
  const gradientCss = `linear-gradient(${light.angleDeg}deg, transparent 0%, transparent ${stopPoint}%, ${tone.shadowOklch} ${hardFalloff}%)`;

  const edgeLabel = input.edgeStyle === "cel-hard" ? "셀 하드 엣지" : "소프트 그라데이션";
  const outputLabel = input.outputMode === "separate-alpha" ? "분리 투명 레이어" : "합쳐진 결과물";

  return {
    cutIndex: Math.max(0, Math.round(input.cutIndex)),
    lightDirection: light.id,
    lightLabel: light.label,
    edgeStyle: input.edgeStyle,
    shadowDensityPct,
    rimLightPct,
    tonePresetId: tone.id,
    resolution: input.resolution,
    outputMode: input.outputMode,
    wipePercent,
    approvalStatus: input.approvalStatus ?? "preview",
    costKrw: 0,
    tokenCost: 0,
    crecoEquivalentTokens,
    gradientAngleDeg: light.angleDeg,
    shadowVectorX: light.vectorX,
    shadowVectorY: light.vectorY,
    shadowOpacity,
    shadowFillOklch: tone.shadowOklch,
    rimStrokeOklch: tone.rimOklch,
    rimOpacity,
    gradientCss,
    summaryText: `컷 ${input.cutIndex + 1} · ${light.label} 광원 · ${edgeLabel} · 농도 ${shadowDensityPct}% · 림라이트 ${rimLightPct}% · ${input.resolution} ${outputLabel} (₩0 무과금, 외부 유료 ${crecoEquivalentTokens}토큰 절감)`,
  };
}

export type WorkspaceRole = "owner" | "admin" | "member" | "guest";
export type StageAclLevel = "admin" | "edit" | "limited-edit" | "comment" | "view" | "none";
export type StageAction = "view" | "comment" | "upload" | "approve" | "download";

export const STAGE_ACL_LABELS: Readonly<Record<StageAclLevel, string>> = {
  admin: "관리 허용",
  edit: "편집 허용",
  "limited-edit": "제한된 편집",
  comment: "의견 허용",
  view: "보기 허용",
  none: "접근 제한",
};

const ACL_ALLOWED_ACTIONS: Readonly<Record<StageAclLevel, readonly StageAction[]>> = {
  admin: ["view", "comment", "upload", "approve", "download"],
  edit: ["view", "comment", "upload", "download"],
  "limited-edit": ["view", "comment", "upload"],
  comment: ["view", "comment"],
  view: ["view"],
  none: [],
};

export interface StudioSeatMember {
  readonly memberId: string;
  readonly name: string;
  readonly role: WorkspaceRole;
  readonly title: string;
  readonly stagePermissions: Readonly<Partial<Record<CrecoStageId, StageAclLevel>>>;
}

export interface SeatEconomicsSummary {
  readonly totalMembers: number;
  readonly crecoRequiredPaidSeats: number;
  readonly crecoFreeGuests: number;
  readonly toonStudioPaidSeats: 0;
  readonly toonStudioCostKrw: 0;
  readonly unlimitedSeats: true;
  readonly summaryText: string;
}

export interface SecurityShareLinkPolicy {
  readonly linkId: string;
  readonly recipientLabel: string;
  readonly expiresAtIso: string;
  readonly password: string;
  readonly allowDownload: boolean;
  readonly watermarkEnabled: boolean;
  readonly ndaRequired: boolean;
  readonly active: boolean;
}

export interface ShareLinkAccessRequest {
  readonly nowIso: string;
  readonly providedPassword: string;
  readonly ndaAccepted: boolean;
  readonly wantsDownload: boolean;
}

export interface ShareLinkValidationResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly watermarkText: string | null;
}

export interface CrecoAuditLogEntry {
  readonly seq: number;
  readonly timestampIso: string;
  readonly actorName: string;
  readonly stageId: CrecoStageId;
  readonly action: StageAction;
  readonly outcome: "allowed" | "denied";
  readonly reason: string;
  readonly leadTimeMinutes: number;
  readonly viaShareLinkId: string | null;
  readonly prevHash: string;
  readonly entryHash: string;
}

export interface CrecoGovernanceState {
  readonly members: readonly StudioSeatMember[];
  readonly sharePolicy: SecurityShareLinkPolicy;
  readonly auditLogs: readonly CrecoAuditLogEntry[];
}

export interface EvaluateStageAclRequest {
  readonly memberId: string;
  readonly stageId: CrecoStageId;
  readonly action: StageAction;
  readonly leadTimeMinutes?: number;
  readonly timestampIso?: string;
  readonly shareAccess?: ShareLinkAccessRequest;
}

export interface EvaluateStageAclResult {
  readonly allowed: boolean;
  readonly reason: string;
  readonly watermarkText: string | null;
  readonly nextState: CrecoGovernanceState;
  readonly logEntry: CrecoAuditLogEntry;
}

export interface WorkerLeadTimeMetric {
  readonly actorName: string;
  readonly totalActions: number;
  readonly allowedCount: number;
  readonly deniedCount: number;
  readonly uploadsCount: number;
  readonly approvalsCount: number;
  readonly commentsCount: number;
  readonly avgLeadTimeMinutes: number;
  readonly slaStatus: "fast" | "steady" | "needs-support";
}

function appendAuditEntry(
  logs: readonly CrecoAuditLogEntry[],
  payload: Omit<CrecoAuditLogEntry, "seq" | "prevHash" | "entryHash">,
): CrecoAuditLogEntry {
  const prev = logs[logs.length - 1];
  const seq = prev ? prev.seq + 1 : 1;
  const prevHash = prev ? prev.entryHash : "audit_genesis_00000000";
  const entryHash = computeChainHash(
    `${seq}|${prevHash}|${payload.timestampIso}|${payload.actorName}|${payload.stageId}|${payload.action}|${payload.outcome}`,
  );
  return { ...payload, seq, prevHash, entryHash };
}

export function createInitialGovernanceState(): CrecoGovernanceState {
  const members: readonly StudioSeatMember[] = [
    {
      memberId: "mem-pd",
      name: "오태훈(담당 PD)",
      role: "owner",
      title: "총괄 PD · 승인권자",
      stagePermissions: {
        "script-conti": "admin",
        "storyboard-conti": "admin",
        lineart: "admin",
        bg3d: "admin",
        coloring: "admin",
        lettering: "admin",
        "loc-ja": "admin",
        "loc-en": "admin",
      },
    },
    {
      memberId: "mem-line",
      name: "박하린(선화)",
      role: "member",
      title: "메인 선화 작가",
      stagePermissions: {
        "storyboard-conti": "comment",
        lineart: "edit",
        bg3d: "view",
        coloring: "comment",
        lettering: "view",
        "loc-ja": "none",
        "loc-en": "none",
      },
    },
    {
      memberId: "mem-color-sub",
      name: "최지우(채색·외주)",
      role: "guest",
      title: "채색·음영 파트너",
      stagePermissions: {
        "storyboard-conti": "view",
        lineart: "view",
        bg3d: "view",
        coloring: "limited-edit",
        lettering: "none",
        "loc-ja": "none",
        "loc-en": "none",
      },
    },
    {
      memberId: "mem-ja-loc",
      name: "사토 미유(일본어)",
      role: "guest",
      title: "일본어 현지화 식자",
      stagePermissions: {
        "storyboard-conti": "none",
        lineart: "none",
        bg3d: "none",
        coloring: "view",
        lettering: "view",
        "loc-ja": "limited-edit",
        "loc-en": "none",
      },
    },
    {
      memberId: "mem-buyer",
      name: "글로벌 플랫폼 편집자",
      role: "guest",
      title: "외부 검수 열람 게스트",
      stagePermissions: {
        "storyboard-conti": "none",
        lineart: "none",
        bg3d: "none",
        coloring: "none",
        lettering: "comment",
        "loc-ja": "view",
        "loc-en": "view",
      },
    },
  ];

  const sharePolicy: SecurityShareLinkPolicy = {
    linkId: "sec-link-ep42-partner",
    recipientLabel: "피코마_일본편집부",
    expiresAtIso: "2026-12-01T23:59:59Z",
    password: "MOON-42-SAFE",
    allowDownload: false,
    watermarkEnabled: true,
    ndaRequired: true,
    active: true,
  };

  let logs: CrecoAuditLogEntry[] = [];
  const seeds: readonly Omit<CrecoAuditLogEntry, "seq" | "prevHash" | "entryHash">[] = [
    {
      timestampIso: "2026-11-18T09:15:00Z",
      actorName: "박하린(선화)",
      stageId: "lineart",
      action: "upload",
      outcome: "allowed",
      reason: "선화 1차 불변 스냅샷 등록",
      leadTimeMinutes: 54,
      viaShareLinkId: null,
    },
    {
      timestampIso: "2026-11-18T11:20:00Z",
      actorName: "오태훈(담당 PD)",
      stageId: "lineart",
      action: "comment",
      outcome: "allowed",
      reason: "컷 1 어깨 실루엣 레드라인 피드백 등록",
      leadTimeMinutes: 18,
      viaShareLinkId: null,
    },
    {
      timestampIso: "2026-11-18T13:45:00Z",
      actorName: "최지우(채색·외주)",
      stageId: "coloring",
      action: "upload",
      outcome: "allowed",
      reason: "채색 2차 무료 AI 음영 레이어 등록",
      leadTimeMinutes: 42,
      viaShareLinkId: null,
    },
    {
      timestampIso: "2026-11-18T15:10:00Z",
      actorName: "오태훈(담당 PD)",
      stageId: "lettering",
      action: "approve",
      outcome: "allowed",
      reason: "식자 3차 공정 마감 및 공유 링크 최신본 자동 반영",
      leadTimeMinutes: 22,
      viaShareLinkId: null,
    },
  ];

  for (const item of seeds) {
    logs = [...logs, appendAuditEntry(logs, item)];
  }
  return { members, sharePolicy, auditLogs: logs };
}

export function calculateSeatEconomics(
  members: readonly StudioSeatMember[],
): SeatEconomicsSummary {
  let crecoRequiredPaidSeats = 0;
  let crecoFreeGuests = 0;
  for (const member of members) {
    const hasEditLikeStage = Object.values(member.stagePermissions).some(
      (level) => level === "admin" || level === "edit" || level === "limited-edit",
    );
    if (member.role !== "guest" || hasEditLikeStage) crecoRequiredPaidSeats += 1;
    else crecoFreeGuests += 1;
  }
  return {
    totalMembers: members.length,
    crecoRequiredPaidSeats,
    crecoFreeGuests,
    toonStudioPaidSeats: 0,
    toonStudioCostKrw: 0,
    unlimitedSeats: true,
    summaryText: `현재 참여자 ${members.length}명 기준 외부 툴 유료 시트 ${crecoRequiredPaidSeats}석 필요 → ToonStudio는 전 공정 무제한 ₩0`,
  };
}

export function validateSecurityShareLink(
  policy: SecurityShareLinkPolicy,
  request: ShareLinkAccessRequest,
): ShareLinkValidationResult {
  if (!policy.active) {
    return {
      allowed: false,
      reason: "비활성화된 공유 링크입니다. 담당자가 링크를 다시 활성화해야 합니다.",
      watermarkText: null,
    };
  }
  if (Date.parse(request.nowIso) > Date.parse(policy.expiresAtIso)) {
    return {
      allowed: false,
      reason: `만료된 공유 링크입니다 (만료 시각: ${policy.expiresAtIso.slice(0, 10)}).`,
      watermarkText: null,
    };
  }
  if (policy.password && request.providedPassword !== policy.password) {
    return { allowed: false, reason: "공유 링크 비밀번호가 일치하지 않습니다.", watermarkText: null };
  }
  if (policy.ndaRequired && !request.ndaAccepted) {
    return {
      allowed: false,
      reason: "기밀 유지(NDA) 안내에 동의해야 원고를 열람할 수 있습니다.",
      watermarkText: null,
    };
  }
  if (request.wantsDownload && !policy.allowDownload) {
    return {
      allowed: false,
      reason: "이 보안 링크는 원본 다운로드가 차단되어 있습니다.",
      watermarkText: null,
    };
  }
  const viewDate = request.nowIso.slice(0, 10);
  const watermarkText = policy.watermarkEnabled
    ? `${policy.recipientLabel} · ${viewDate} · 대외비 무단유출 금지`
    : null;
  return {
    allowed: true,
    reason: request.wantsDownload
      ? "보안 링크 검증 및 다운로드 허용"
      : "보안 링크 열람 승인 (동적 워터마크 적용)",
    watermarkText,
  };
}

export function updateMemberStageAcl(
  state: CrecoGovernanceState,
  memberId: string,
  stageId: CrecoStageId,
  nextLevel: StageAclLevel,
): CrecoGovernanceState {
  return {
    ...state,
    members: state.members.map((member) =>
      member.memberId !== memberId
        ? member
        : { ...member, stagePermissions: { ...member.stagePermissions, [stageId]: nextLevel } },
    ),
  };
}

export function evaluateStageAclAndLog(
  state: CrecoGovernanceState,
  request: EvaluateStageAclRequest,
): EvaluateStageAclResult {
  const member = state.members.find((item) => item.memberId === request.memberId);
  const timestampIso = request.timestampIso ?? "2026-11-21T18:25:00Z";
  const leadTimeMinutes = Math.max(0, Math.round(request.leadTimeMinutes ?? 15));

  let allowed = false;
  let reason: string;
  let watermarkText: string | null = null;
  let viaShareLinkId: string | null = null;

  if (!member) {
    reason = `등록되지 않은 작업자(${request.memberId})의 접근이 차단되었습니다.`;
  } else {
    const stageLevel: StageAclLevel = member.stagePermissions[request.stageId] ?? "none";
    const allowedActions = ACL_ALLOWED_ACTIONS[stageLevel];
    if (!allowedActions.includes(request.action)) {
      reason = `${member.name}님은 해당 공정 권한이 "${STAGE_ACL_LABELS[stageLevel]}"이므로 "${request.action}" 작업을 실행할 수 없습니다.`;
    } else if (request.shareAccess) {
      viaShareLinkId = state.sharePolicy.linkId;
      const linkResult = validateSecurityShareLink(state.sharePolicy, {
        ...request.shareAccess,
        wantsDownload: request.action === "download" || request.shareAccess.wantsDownload,
      });
      allowed = linkResult.allowed;
      reason = linkResult.reason;
      watermarkText = linkResult.watermarkText;
    } else {
      allowed = true;
      reason = `${member.name}님 "${STAGE_ACL_LABELS[stageLevel]}" 권한으로 "${request.action}" 허용`;
    }
  }

  const logEntry = appendAuditEntry(state.auditLogs, {
    timestampIso,
    actorName: member ? member.name : request.memberId,
    stageId: request.stageId,
    action: request.action,
    outcome: allowed ? "allowed" : "denied",
    reason,
    leadTimeMinutes,
    viaShareLinkId,
  });

  return {
    allowed,
    reason,
    watermarkText,
    nextState: { ...state, auditLogs: [...state.auditLogs, logEntry] },
    logEntry,
  };
}

export function aggregateWorkerLeadTimeMetrics(
  logs: readonly CrecoAuditLogEntry[],
): readonly WorkerLeadTimeMetric[] {
  const map = new Map<
    string,
    {
      totalActions: number;
      allowedCount: number;
      deniedCount: number;
      uploadsCount: number;
      approvalsCount: number;
      commentsCount: number;
      leadTimeSum: number;
      leadTimeSamples: number;
    }
  >();

  for (const entry of logs) {
    const current = map.get(entry.actorName) ?? {
      totalActions: 0,
      allowedCount: 0,
      deniedCount: 0,
      uploadsCount: 0,
      approvalsCount: 0,
      commentsCount: 0,
      leadTimeSum: 0,
      leadTimeSamples: 0,
    };
    current.totalActions += 1;
    if (entry.outcome === "allowed") {
      current.allowedCount += 1;
      if (entry.action === "upload") current.uploadsCount += 1;
      if (entry.action === "approve") current.approvalsCount += 1;
      if (entry.action === "comment") current.commentsCount += 1;
      if (entry.leadTimeMinutes > 0) {
        current.leadTimeSum += entry.leadTimeMinutes;
        current.leadTimeSamples += 1;
      }
    } else {
      current.deniedCount += 1;
    }
    map.set(entry.actorName, current);
  }

  return [...map.entries()].map(([actorName, stat]) => {
    const avgLeadTimeMinutes =
      stat.leadTimeSamples > 0 ? Math.round(stat.leadTimeSum / stat.leadTimeSamples) : 0;
    const slaStatus: WorkerLeadTimeMetric["slaStatus"] =
      avgLeadTimeMinutes <= 30 ? "fast" : avgLeadTimeMinutes <= 60 ? "steady" : "needs-support";
    return {
      actorName,
      totalActions: stat.totalActions,
      allowedCount: stat.allowedCount,
      deniedCount: stat.deniedCount,
      uploadsCount: stat.uploadsCount,
      approvalsCount: stat.approvalsCount,
      commentsCount: stat.commentsCount,
      avgLeadTimeMinutes,
      slaStatus,
    };
  });
}
