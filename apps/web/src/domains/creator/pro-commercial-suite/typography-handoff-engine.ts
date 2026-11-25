/**
 * Wave 39C — 엔진 3·4: 작품 전역 말풍선·식자 스타일시트 토큰 & 라이브 컷 잠금 어시스턴트 핸드오프.
 *
 * - 화자/감정별 폰트·자간·행간·외곽선·꼬리 곡률 토큰을 중앙 관리해 1회 수정으로 회차 내 매칭 말풍선에
 *   일괄 전파하고 필드 단위 diff 리포트를 산출한다.
 * - 컷×공정(선화/밑색/명암/배경/식자) 단위 잠금 임대(lease), 충돌 감지, 결정론적 인수인계 영수증을
 *   불변 상태 전환으로 처리한다(전역 가변 저장소·Web Storage 미사용).
 */

export type EmotionTone = "neutral" | "shout" | "whisper" | "monologue" | "narrator";
export type BalloonShapeKind = "oval" | "spiky" | "cloud" | "box" | "dashed";

export interface LetteringVisualStyle {
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly fontSizePx: number;
  readonly letterSpacingEm: number;
  readonly lineHeight: number;
  readonly strokeWidthPx: number;
  readonly strokeOklch: string;
  readonly fillOklch: string;
  readonly balloonShape: BalloonShapeKind;
  readonly tailCurvature: number;
}

export interface LetteringStyleToken extends LetteringVisualStyle {
  readonly tokenId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly speakerId: string;
  readonly speakerNameKo: string;
  readonly emotion: EmotionTone;
  readonly version: number;
}

export type LetteringTokenPatch = Partial<LetteringVisualStyle>;

export interface EpisodeBalloonNode {
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly speakerId: string;
  readonly speakerNameKo: string;
  readonly emotion: EmotionTone;
  readonly text: string;
  readonly boundTokenId: string | null;
  readonly appliedStyle: LetteringVisualStyle;
}

export type LetteringStyleFieldKey = keyof LetteringVisualStyle;

export interface BalloonStyleFieldDiff {
  readonly field: LetteringStyleFieldKey;
  readonly before: string | number;
  readonly after: string | number;
}

export interface BalloonDiffEntry {
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly tokenId: string;
  readonly matchReason: "bound-token" | "speaker-emotion";
  readonly changedFields: readonly BalloonStyleFieldDiff[];
}

export interface TokenPropagationReport {
  readonly updatedToken: LetteringStyleToken;
  readonly updatedTokens: readonly LetteringStyleToken[];
  readonly updatedBalloons: readonly EpisodeBalloonNode[];
  readonly matchedCount: number;
  readonly modifiedCount: number;
  readonly unchangedCount: number;
  readonly diffs: readonly BalloonDiffEntry[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface TypographyDriftIssue {
  readonly balloonId: string;
  readonly cutNumber: number;
  readonly tokenId: string | null;
  readonly reason: "unbound" | "style-drift";
  readonly driftedFields: readonly LetteringStyleFieldKey[];
}

export interface TypographyConsistencyAudit {
  readonly totalBalloons: number;
  readonly syncedCount: number;
  readonly driftedCount: number;
  readonly unboundCount: number;
  readonly compliancePct: number;
  readonly issues: readonly TypographyDriftIssue[];
}

const VISUAL_STYLE_KEYS: readonly LetteringStyleFieldKey[] = [
  "fontFamily",
  "fontWeight",
  "fontSizePx",
  "letterSpacingEm",
  "lineHeight",
  "strokeWidthPx",
  "strokeOklch",
  "fillOklch",
  "balloonShape",
  "tailCurvature",
];

function extractVisualStyle(token: LetteringVisualStyle): LetteringVisualStyle {
  return {
    fontFamily: token.fontFamily,
    fontWeight: token.fontWeight,
    fontSizePx: token.fontSizePx,
    letterSpacingEm: token.letterSpacingEm,
    lineHeight: token.lineHeight,
    strokeWidthPx: token.strokeWidthPx,
    strokeOklch: token.strokeOklch,
    fillOklch: token.fillOklch,
    balloonShape: token.balloonShape,
    tailCurvature: token.tailCurvature,
  };
}

function clampNumeric(value: number, min: number, max: number, digits = 3): number {
  const safe = Number.isFinite(value) ? value : min;
  return Number(Math.min(max, Math.max(min, safe)).toFixed(digits));
}

function sanitizeTokenPatch(current: LetteringStyleToken, patch: LetteringTokenPatch): LetteringStyleToken {
  return {
    ...current,
    fontFamily: patch.fontFamily?.trim() || current.fontFamily,
    fontWeight: patch.fontWeight !== undefined ? Math.round(clampNumeric(patch.fontWeight, 300, 900, 0)) : current.fontWeight,
    fontSizePx: patch.fontSizePx !== undefined ? clampNumeric(patch.fontSizePx, 11, 72, 1) : current.fontSizePx,
    letterSpacingEm: patch.letterSpacingEm !== undefined ? clampNumeric(patch.letterSpacingEm, -0.1, 0.3, 3) : current.letterSpacingEm,
    lineHeight: patch.lineHeight !== undefined ? clampNumeric(patch.lineHeight, 1.0, 2.2, 2) : current.lineHeight,
    strokeWidthPx: patch.strokeWidthPx !== undefined ? clampNumeric(patch.strokeWidthPx, 0, 8, 2) : current.strokeWidthPx,
    strokeOklch: patch.strokeOklch?.trim() || current.strokeOklch,
    fillOklch: patch.fillOklch?.trim() || current.fillOklch,
    balloonShape: patch.balloonShape ?? current.balloonShape,
    tailCurvature: patch.tailCurvature !== undefined ? clampNumeric(patch.tailCurvature, -1, 1, 2) : current.tailCurvature,
    version: current.version + 1,
  };
}

function diffVisualStyles(before: LetteringVisualStyle, after: LetteringVisualStyle): readonly BalloonStyleFieldDiff[] {
  const diffs: BalloonStyleFieldDiff[] = [];
  for (const field of VISUAL_STYLE_KEYS) {
    if (before[field] !== after[field]) {
      diffs.push({ field, before: before[field], after: after[field] });
    }
  }
  return diffs;
}

export const LETTERING_FONT_CATALOG: readonly string[] = [
  "Pretendard",
  "NanumSquareNeo",
  "KoPub Batang",
  "Gmarket Sans",
  "MaruBuri",
];

export function createDefaultLetteringTokens(): readonly LetteringStyleToken[] {
  return [
    {
      tokenId: "tok-seoyeon-neutral", labelKo: "서연 · 기본 대사", labelEn: "Seoyeon · Neutral",
      speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "neutral",
      fontFamily: "NanumSquareNeo", fontWeight: 600, fontSizePx: 18, letterSpacingEm: -0.02, lineHeight: 1.42,
      strokeWidthPx: 0, strokeOklch: "oklch(0.98 0.005 90)", fillOklch: "oklch(0.2 0.01 260)",
      balloonShape: "oval", tailCurvature: 0.32, version: 1,
    },
    {
      tokenId: "tok-seoyeon-shout", labelKo: "서연 · 외침·액션", labelEn: "Seoyeon · Shout",
      speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "shout",
      fontFamily: "Gmarket Sans", fontWeight: 800, fontSizePx: 26, letterSpacingEm: -0.04, lineHeight: 1.22,
      strokeWidthPx: 2.5, strokeOklch: "oklch(0.98 0.01 90)", fillOklch: "oklch(0.22 0.04 25)",
      balloonShape: "spiky", tailCurvature: 0.05, version: 1,
    },
    {
      tokenId: "tok-doyun-whisper", labelKo: "도윤 · 속삭임", labelEn: "Doyun · Whisper",
      speakerId: "doyun", speakerNameKo: "한도윤", emotion: "whisper",
      fontFamily: "KoPub Batang", fontWeight: 500, fontSizePx: 15, letterSpacingEm: 0.05, lineHeight: 1.56,
      strokeWidthPx: 0.5, strokeOklch: "oklch(0.95 0.01 240)", fillOklch: "oklch(0.32 0.02 250)",
      balloonShape: "dashed", tailCurvature: -0.28, version: 1,
    },
    {
      tokenId: "tok-monologue-cloud", labelKo: "내면 독백", labelEn: "Inner Monologue",
      speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "monologue",
      fontFamily: "MaruBuri", fontWeight: 500, fontSizePx: 16, letterSpacingEm: 0.01, lineHeight: 1.52,
      strokeWidthPx: 0, strokeOklch: "oklch(0.96 0.005 240)", fillOklch: "oklch(0.26 0.02 258)",
      balloonShape: "cloud", tailCurvature: 0.48, version: 1,
    },
    {
      tokenId: "tok-narrator-box", labelKo: "내레이션 박스", labelEn: "Narration Box",
      speakerId: "narrator", speakerNameKo: "내레이션", emotion: "narrator",
      fontFamily: "KoPub Batang", fontWeight: 600, fontSizePx: 17, letterSpacingEm: 0.02, lineHeight: 1.6,
      strokeWidthPx: 0, strokeOklch: "oklch(0.2 0.01 260)", fillOklch: "oklch(0.22 0.01 260)",
      balloonShape: "box", tailCurvature: 0, version: 1,
    },
  ];
}

export function createDefaultEpisodeBalloons(
  tokens: readonly LetteringStyleToken[] = createDefaultLetteringTokens(),
): readonly EpisodeBalloonNode[] {
  const byId = (id: string): LetteringVisualStyle => extractVisualStyle(tokens.find((t) => t.tokenId === id) ?? tokens[0]!);
  return [
    { balloonId: "BLN-01", cutNumber: 1, speakerId: "narrator", speakerNameKo: "내레이션", emotion: "narrator", text: "자정이 지나자 성벽 너머로 은빛 안개가 밀려왔다.", boundTokenId: "tok-narrator-box", appliedStyle: byId("tok-narrator-box") },
    { balloonId: "BLN-02", cutNumber: 3, speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "neutral", text: "잠깐, 북쪽 문 쪽 기척이 달라졌어.", boundTokenId: "tok-seoyeon-neutral", appliedStyle: byId("tok-seoyeon-neutral") },
    { balloonId: "BLN-03", cutNumber: 4, speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "shout", text: "지금이야! 방어막 걷어!", boundTokenId: "tok-seoyeon-shout", appliedStyle: byId("tok-seoyeon-shout") },
    { balloonId: "BLN-04", cutNumber: 6, speakerId: "doyun", speakerNameKo: "한도윤", emotion: "whisper", text: "서두르지 마… 아직 저쪽 패가 남아 있어.", boundTokenId: "tok-doyun-whisper", appliedStyle: byId("tok-doyun-whisper") },
    { balloonId: "BLN-05", cutNumber: 9, speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "shout", text: "물러서지 마, 여기서 끝낸다!", boundTokenId: null, appliedStyle: { ...byId("tok-seoyeon-shout"), fontSizePx: 23, strokeWidthPx: 1.5 } },
    { balloonId: "BLN-06", cutNumber: 12, speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "monologue", text: "이번 컷에서 놓치면 다음 화까지 추적할 수 없다.", boundTokenId: "tok-monologue-cloud", appliedStyle: byId("tok-monologue-cloud") },
    { balloonId: "BLN-07", cutNumber: 15, speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "neutral", text: "도윤아, 신호탄 준비됐지?", boundTokenId: "tok-seoyeon-neutral", appliedStyle: byId("tok-seoyeon-neutral") },
    { balloonId: "BLN-08", cutNumber: 18, speakerId: "seoyeon", speakerNameKo: "강서연", emotion: "shout", text: "검기 전개—!!", boundTokenId: "tok-seoyeon-shout", appliedStyle: byId("tok-seoyeon-shout") },
  ];
}

/** 작품 전역 식자 토큰을 1회 수정하고 회차 내 모든 매칭 말풍선에 일괄 전파 + diff 리포트를 생성한다. */
export function updateTokenAndPropagate(
  tokens: readonly LetteringStyleToken[],
  balloons: readonly EpisodeBalloonNode[],
  tokenId: string,
  patch: LetteringTokenPatch,
): TokenPropagationReport {
  const existing = tokens.find((t) => t.tokenId === tokenId);
  if (!existing) throw new Error(`식자 스타일시트 토큰(${tokenId})을 찾을 수 없습니다.`);

  const updatedToken = sanitizeTokenPatch(existing, patch);
  const nextStyle = extractVisualStyle(updatedToken);
  const updatedTokens = tokens.map((t) => (t.tokenId === tokenId ? updatedToken : t));

  const diffs: BalloonDiffEntry[] = [];
  let matchedCount = 0;
  let modifiedCount = 0;

  const updatedBalloons = balloons.map((balloon) => {
    const isDirectBound = balloon.boundTokenId === tokenId;
    const isRuleMatched =
      balloon.boundTokenId === null &&
      balloon.speakerId === updatedToken.speakerId &&
      balloon.emotion === updatedToken.emotion;
    if (!isDirectBound && !isRuleMatched) return balloon;

    matchedCount += 1;
    const changedFields = diffVisualStyles(balloon.appliedStyle, nextStyle);
    if (changedFields.length > 0 || !isDirectBound) {
      modifiedCount += 1;
      diffs.push({
        balloonId: balloon.balloonId,
        cutNumber: balloon.cutNumber,
        tokenId,
        matchReason: isDirectBound ? "bound-token" : "speaker-emotion",
        changedFields,
      });
    }
    return { ...balloon, boundTokenId: tokenId, appliedStyle: nextStyle };
  });

  return {
    updatedToken,
    updatedTokens,
    updatedBalloons,
    matchedCount,
    modifiedCount,
    unchangedCount: balloons.length - modifiedCount,
    diffs,
    summaryKo: `${updatedToken.labelKo} v${updatedToken.version} 반영 완료: 매칭 ${matchedCount}개 중 ${modifiedCount}개 말풍선 일괄 갱신`,
    summaryEn: `Applied ${updatedToken.labelEn} v${updatedToken.version}: updated ${modifiedCount}/${matchedCount} matched balloons`,
  };
}

/** 회차 내 말풍선이 작품 전역 스타일시트 토큰과 일치하는지 감사한다. */
export function auditEpisodeTypographyConsistency(
  tokens: readonly LetteringStyleToken[],
  balloons: readonly EpisodeBalloonNode[],
): TypographyConsistencyAudit {
  const issues: TypographyDriftIssue[] = [];
  let syncedCount = 0;
  let driftedCount = 0;
  let unboundCount = 0;

  for (const balloon of balloons) {
    const token = balloon.boundTokenId ? tokens.find((t) => t.tokenId === balloon.boundTokenId) : undefined;
    if (!balloon.boundTokenId || !token) {
      unboundCount += 1;
      issues.push({ balloonId: balloon.balloonId, cutNumber: balloon.cutNumber, tokenId: balloon.boundTokenId, reason: "unbound", driftedFields: [] });
      continue;
    }
    const diffs = diffVisualStyles(balloon.appliedStyle, extractVisualStyle(token));
    if (diffs.length > 0) {
      driftedCount += 1;
      issues.push({ balloonId: balloon.balloonId, cutNumber: balloon.cutNumber, tokenId: token.tokenId, reason: "style-drift", driftedFields: diffs.map((d) => d.field) });
    } else {
      syncedCount += 1;
    }
  }

  const totalBalloons = balloons.length;
  return {
    totalBalloons,
    syncedCount,
    driftedCount,
    unboundCount,
    compliancePct: totalBalloons === 0 ? 100 : Number(((syncedCount / totalBalloons) * 100).toFixed(1)),
    issues,
  };
}

// ============================================================================
// 엔진 4: 라이브 컷 잠금 어시스턴트 핸드오프 (Live Cut-Lock Assistant Handoff)
// ============================================================================

export type CutPipelineStage = "lineart" | "flat" | "shading" | "background" | "lettering";
export type CutLockStatus = "active" | "expired" | "handed-off" | "released";

export interface CutPipelineStageSpec {
  readonly id: CutPipelineStage;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly nextStage: CutPipelineStage | "final-review";
}

export const CUT_PIPELINE_STAGES: readonly CutPipelineStageSpec[] = [
  { id: "lineart", labelKo: "선화", labelEn: "Lineart", nextStage: "flat" },
  { id: "flat", labelKo: "밑색", labelEn: "Flat Color", nextStage: "shading" },
  { id: "shading", labelKo: "명암", labelEn: "Shading", nextStage: "background" },
  { id: "background", labelKo: "배경", labelEn: "Background", nextStage: "lettering" },
  { id: "lettering", labelKo: "식자", labelEn: "Lettering", nextStage: "final-review" },
];

export interface CutStageLockLease {
  readonly leaseId: string;
  readonly cutId: string;
  readonly stage: CutPipelineStage;
  readonly holderId: string;
  readonly holderName: string;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
  readonly status: CutLockStatus;
  readonly note: string;
}

export interface LockConflictDetail {
  readonly cutId: string;
  readonly stage: CutPipelineStage;
  readonly existingLeaseId: string;
  readonly existingHolderId: string;
  readonly existingHolderName: string;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly remainingMs: number;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface HandoffReceipt {
  readonly receiptId: string;
  readonly cutId: string;
  readonly fromStage: CutPipelineStage;
  readonly toStage: CutPipelineStage | "final-review";
  readonly fromMemberId: string;
  readonly fromMemberName: string;
  readonly toMemberId: string;
  readonly toMemberName: string;
  readonly issuedAtMs: number;
  readonly checksum: string;
  readonly checklistPassed: boolean;
  readonly note: string;
}

export interface CutHandoffBoardState {
  readonly episodeId: string;
  readonly leases: readonly CutStageLockLease[];
  readonly receipts: readonly HandoffReceipt[];
  readonly conflicts: readonly LockConflictDetail[];
}

export interface AcquireCutLockRequest {
  readonly cutId: string;
  readonly stage: CutPipelineStage;
  readonly holderId: string;
  readonly holderName: string;
  readonly leaseDurationMs: number;
  readonly nowMs: number;
  readonly note?: string;
}

export interface AcquireCutLockOutcome {
  readonly ok: boolean;
  readonly state: CutHandoffBoardState;
  readonly lease?: CutStageLockLease;
  readonly conflict?: LockConflictDetail;
}

export interface HandoffCutStageRequest {
  readonly cutId: string;
  readonly fromStage: CutPipelineStage;
  readonly toStage?: CutPipelineStage | "final-review";
  readonly fromMemberId: string;
  readonly fromMemberName: string;
  readonly toMemberId: string;
  readonly toMemberName: string;
  readonly nowMs: number;
  readonly nextLeaseDurationMs?: number;
  readonly checklistPassed?: boolean;
  readonly note?: string;
}

export interface HandoffCutStageOutcome {
  readonly ok: boolean;
  readonly state: CutHandoffBoardState;
  readonly receipt?: HandoffReceipt;
  readonly nextLease?: CutStageLockLease;
  readonly errorKo?: string;
}

/** 32-bit FNV-1a 결정론적 16진 다이제스트 (BigInt 리터럴 미사용). */
export function computeDeterministicDigest32(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

export function getStageLabelKo(stage: CutPipelineStage | "final-review"): string {
  if (stage === "final-review") return "최종 검수";
  return CUT_PIPELINE_STAGES.find((s) => s.id === stage)?.labelKo ?? stage;
}

function expireStaleLeases(leases: readonly CutStageLockLease[], nowMs: number): readonly CutStageLockLease[] {
  return leases.map((lease) =>
    lease.status === "active" && lease.expiresAtMs <= nowMs ? { ...lease, status: "expired" } : lease,
  );
}

export const STUDIO_ASSISTANT_ROSTER: readonly { readonly id: string; readonly name: string; readonly specialtyKo: string }[] = [
  { id: "member-main", name: "김도현 (메인작가)", specialtyKo: "선화·최종 검수" },
  { id: "member-flat", name: "박지은 (밑색 어시)", specialtyKo: "밑색·마스크" },
  { id: "member-shade", name: "최민서 (명암 어시)", specialtyKo: "명암·리라이트" },
  { id: "member-bg", name: "정우진 (배경 어시)", specialtyKo: "3D 배경·보정" },
  { id: "member-type", name: "이수빈 (식자·편집)", specialtyKo: "말풍선·식자" },
];

export const DEFAULT_HANDOFF_CUT_IDS: readonly string[] = ["CUT-01", "CUT-02", "CUT-03", "CUT-04", "CUT-05"];

/** 초기 컷×공정 잠금 보드 상태를 생성한다. */
export function createInitialCutHandoffState(baseNowMs = 1764000000000): CutHandoffBoardState {
  const hourMs = 3600000;
  return {
    episodeId: "EP-14",
    leases: [
      { leaseId: "LEASE-CUT-01-LINEART-1", cutId: "CUT-01", stage: "lineart", holderId: "member-main", holderName: "김도현 (메인작가)", acquiredAtMs: baseNowMs - 1200000, expiresAtMs: baseNowMs + hourMs, status: "active", note: "클라이맥스 오프닝 컷 펜선 정리 중" },
      { leaseId: "LEASE-CUT-02-FLAT-1", cutId: "CUT-02", stage: "flat", holderId: "member-flat", holderName: "박지은 (밑색 어시)", acquiredAtMs: baseNowMs - 900000, expiresAtMs: baseNowMs + hourMs, status: "active", note: "주인공 코트·헤어 알베도 분리 채색" },
      { leaseId: "LEASE-CUT-03-SHADING-1", cutId: "CUT-03", stage: "shading", holderId: "member-shade", holderName: "최민서 (명암 어시)", acquiredAtMs: baseNowMs - 600000, expiresAtMs: baseNowMs + hourMs, status: "active", note: "노을 리라이트 그림자 패스 작업" },
    ],
    receipts: [
      {
        receiptId: "RCPT-0001", cutId: "CUT-02", fromStage: "lineart", toStage: "flat",
        fromMemberId: "member-main", fromMemberName: "김도현 (메인작가)",
        toMemberId: "member-flat", toMemberName: "박지은 (밑색 어시)",
        issuedAtMs: baseNowMs - 950000,
        checksum: computeDeterministicDigest32("CUT-02|lineart|flat|member-main|member-flat|1"),
        checklistPassed: true, note: "폐곡선 누수 검사 통과 후 밑색 인계",
      },
    ],
    conflicts: [],
  };
}

/** 컷×공정 단위 잠금을 임대(lease)하고 충돌 시 상세 충돌 리포트를 반환한다. */
export function acquireCutStageLock(state: CutHandoffBoardState, request: AcquireCutLockRequest): AcquireCutLockOutcome {
  const durationMs = Math.max(60000, Math.floor(request.leaseDurationMs));
  const normalizedLeases = expireStaleLeases(state.leases, request.nowMs);
  const existingActive = normalizedLeases.find(
    (lease) => lease.cutId === request.cutId && lease.stage === request.stage && lease.status === "active",
  );

  if (existingActive && existingActive.holderId !== request.holderId) {
    const remainingMs = Math.max(0, existingActive.expiresAtMs - request.nowMs);
    const remainingMin = Math.max(1, Math.ceil(remainingMs / 60000));
    const stageKo = getStageLabelKo(request.stage);
    const conflict: LockConflictDetail = {
      cutId: request.cutId, stage: request.stage,
      existingLeaseId: existingActive.leaseId, existingHolderId: existingActive.holderId, existingHolderName: existingActive.holderName,
      requesterId: request.holderId, requesterName: request.holderName, remainingMs,
      reasonKo: `${request.cutId} [${stageKo}] 공정은 ${existingActive.holderName} 님이 점유 중입니다 (잔여 약 ${remainingMin}분).`,
      reasonEn: `${request.cutId} [${request.stage}] is actively locked by ${existingActive.holderName} (~${remainingMin}m left).`,
    };
    return {
      ok: false,
      conflict,
      state: { ...state, leases: normalizedLeases, conflicts: [conflict, ...state.conflicts].slice(0, 12) },
    };
  }

  if (existingActive && existingActive.holderId === request.holderId) {
    const renewed: CutStageLockLease = {
      ...existingActive,
      expiresAtMs: request.nowMs + durationMs,
      note: request.note?.trim() || existingActive.note,
    };
    return { ok: true, lease: renewed, state: { ...state, leases: normalizedLeases.map((l) => (l.leaseId === renewed.leaseId ? renewed : l)) } };
  }

  const newLease: CutStageLockLease = {
    leaseId: `LEASE-${request.cutId}-${request.stage.toUpperCase()}-${normalizedLeases.length + 1}`,
    cutId: request.cutId, stage: request.stage,
    holderId: request.holderId, holderName: request.holderName,
    acquiredAtMs: request.nowMs, expiresAtMs: request.nowMs + durationMs,
    status: "active", note: request.note?.trim() || `${getStageLabelKo(request.stage)} 공정 잠금 임대`,
  };
  return { ok: true, lease: newLease, state: { ...state, leases: [newLease, ...normalizedLeases] } };
}

/** 전달받은 예제 상태의 공정을 옮기고 비암호학적 체크섬 기록을 만든다. 실제 팀 권한이나 전자서명은 처리하지 않는다. */
export function handoffCutStage(state: CutHandoffBoardState, request: HandoffCutStageRequest): HandoffCutStageOutcome {
  const normalizedLeases = expireStaleLeases(state.leases, request.nowMs);
  const stageSpec = CUT_PIPELINE_STAGES.find((s) => s.id === request.fromStage);
  const targetStage = request.toStage ?? stageSpec?.nextStage ?? "final-review";
  const currentLease = normalizedLeases.find(
    (lease) => lease.cutId === request.cutId && lease.stage === request.fromStage && lease.status === "active",
  );

  if (!currentLease) {
    return { ok: false, state: { ...state, leases: normalizedLeases }, errorKo: `${request.cutId} [${getStageLabelKo(request.fromStage)}]에 활성 잠금이 없어 인수인계할 수 없습니다.` };
  }
  if (currentLease.holderId !== request.fromMemberId) {
    return { ok: false, state: { ...state, leases: normalizedLeases }, errorKo: `현재 잠금 보유자(${currentLease.holderName})만 해당 공정을 인수인계할 수 있습니다.` };
  }

  let nextLeases = normalizedLeases.map((lease) =>
    lease.leaseId === currentLease.leaseId ? { ...lease, status: "handed-off" as const } : lease,
  );

  let nextLease: CutStageLockLease | undefined;
  if (targetStage !== "final-review") {
    const targetConflict = nextLeases.find((l) => l.cutId === request.cutId && l.stage === targetStage && l.status === "active");
    if (targetConflict) {
      return { ok: false, state: { ...state, leases: normalizedLeases }, errorKo: `대상 공정 [${getStageLabelKo(targetStage)}]이 이미 ${targetConflict.holderName} 님에게 점유되어 있습니다.` };
    }
    const durationMs = Math.max(60000, Math.floor(request.nextLeaseDurationMs ?? 3600000));
    nextLease = {
      leaseId: `LEASE-${request.cutId}-${targetStage.toUpperCase()}-${nextLeases.length + 1}`,
      cutId: request.cutId, stage: targetStage,
      holderId: request.toMemberId, holderName: request.toMemberName,
      acquiredAtMs: request.nowMs, expiresAtMs: request.nowMs + durationMs,
      status: "active", note: `${request.fromMemberName} 님으로부터 인수 (${getStageLabelKo(request.fromStage)} 완료)`,
    };
    nextLeases = [nextLease, ...nextLeases];
  }

  const receiptId = `RCPT-${String(state.receipts.length + 1).padStart(4, "0")}`;
  const receipt: HandoffReceipt = {
    receiptId, cutId: request.cutId, fromStage: request.fromStage, toStage: targetStage,
    fromMemberId: request.fromMemberId, fromMemberName: request.fromMemberName,
    toMemberId: request.toMemberId, toMemberName: request.toMemberName,
    issuedAtMs: request.nowMs,
    checksum: computeDeterministicDigest32(`${receiptId}|${request.cutId}|${request.fromStage}|${targetStage}|${request.fromMemberId}|${request.toMemberId}|${request.nowMs}`),
    checklistPassed: request.checklistPassed ?? true,
    note: request.note?.trim() || `${getStageLabelKo(request.fromStage)} → ${getStageLabelKo(targetStage)} 정상 인수인계`,
  };

  return { ok: true, receipt, nextLease, state: { ...state, leases: nextLeases, receipts: [receipt, ...state.receipts] } };
}

/** 활성 컷 잠금을 수동 반납(release)한다. */
export function releaseCutStageLock(state: CutHandoffBoardState, leaseId: string, nowMs: number): CutHandoffBoardState {
  const normalized = expireStaleLeases(state.leases, nowMs);
  return {
    ...state,
    leases: normalized.map((lease) => (lease.leaseId === leaseId && lease.status === "active" ? { ...lease, status: "released" } : lease)),
  };
}

/** 현재 시각 기준으로 활성 잠금 목록과 만료된 잠금 수를 진단한다. */
export function summarizeCutHandoffBoard(state: CutHandoffBoardState, nowMs: number): {
  readonly activeLeases: readonly CutStageLockLease[];
  readonly expiredCount: number;
  readonly receiptCount: number;
  readonly conflictCount: number;
} {
  const normalized = expireStaleLeases(state.leases, nowMs);
  return {
    activeLeases: normalized.filter((l) => l.status === "active"),
    expiredCount: normalized.filter((l) => l.status === "expired").length,
    receiptCount: state.receipts.length,
    conflictCount: state.conflicts.length,
  };
}
