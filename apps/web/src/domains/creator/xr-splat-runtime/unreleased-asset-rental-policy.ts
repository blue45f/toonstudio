/**
 * 미출시 에셋(배경 3D·2D·브러시·리깅·톤팩) 협업 어시스턴트 기간제 공유 대여 정책 엔진.
 *
 * - 기간 한정(`startsAtMs`~`expiresAtMs`), 강제 가시/추적 워터마크, 원본 파일 다운로드 차단 정책
 * - 만료 자동 차단 및 소유자 즉시 회수(`revokeRentalGrantImmediately`) — 회수된 권한은 연장 불가
 * - 회수·만료 시 로컬 OPFS/메모리 캐시 즉각 파기(`requiresImmediateCachePurge`) 지시
 * - 기존 `studio-rights-bom-provenance`의 `RightsBomItem` / `auditRightsCompliance`와 직접 연동
 */

import {
  auditRightsCompliance,
  createRightsBomRegistry,
  type RightsAssetKind,
  type RightsBomItem,
  type RightsComplianceDiagnostic,
  type StudioRightsBomRegistry,
} from "../studio-rights-bom-provenance";

export const UNRELEASED_ASSET_RENTAL_POLICY_VERSION = 1 as const;
export const MAX_UNRELEASED_RENTAL_DURATION_MS = 90 * 86_400_000;

export type UnreleasedAssetCategory =
  | "background-3d"
  | "background-2d"
  | "brush-preset"
  | "character-rig"
  | "tone-pack";

export type RentalGrantStatus = "pending" | "active" | "expired" | "revoked";

export type RentalAssetAction =
  | "preview-in-canvas"
  | "render-episode-panel"
  | "download-raw-source"
  | "export-standalone-asset"
  | "transfer-to-third-party";

export type RentalDecisionCode =
  | "ALLOWED"
  | "GRANT_NOT_STARTED"
  | "GRANT_EXPIRED"
  | "GRANT_REVOKED"
  | "ASSISTANT_MISMATCH"
  | "EPISODE_SCOPE_MISMATCH"
  | "DEVICE_LIMIT_EXCEEDED"
  | "RAW_DOWNLOAD_FORBIDDEN"
  | "EXTERNAL_EXPORT_FORBIDDEN"
  | "THIRD_PARTY_TRANSFER_FORBIDDEN"
  | "EPISODE_RENDER_FORBIDDEN";

export interface RentalWatermarkPolicy {
  readonly enforced: true;
  readonly labelTemplate: string;
  readonly opacity: number;
  readonly embedInvisibleTraceId: boolean;
  readonly traceToken: string;
}

export interface RentalDownloadRestriction {
  readonly allowRawSourceDownload: boolean;
  readonly allowLocalCacheOnly: boolean;
  readonly allowExternalExport: boolean;
  readonly allowEpisodeRenderEmbed: boolean;
  readonly maxConcurrentDevices: number;
}

export interface RentalAuditEvent {
  readonly type: "GRANT_ISSUED" | "GRANT_EXTENDED" | "GRANT_REVOKED";
  readonly actorId: string;
  readonly atMs: number;
  readonly detail: string;
}

export interface UnreleasedAssetRentalGrant {
  readonly version: typeof UNRELEASED_ASSET_RENTAL_POLICY_VERSION;
  readonly grantId: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly category: UnreleasedAssetCategory;
  readonly ownerCreatorId: string;
  readonly ownerCreatorName: string;
  readonly assistantId: string;
  readonly assistantName: string;
  readonly episodeId: string;
  readonly issuedAtMs: number;
  readonly startsAtMs: number;
  readonly expiresAtMs: number;
  readonly revokedAtMs: number | null;
  readonly revocationReason: string | null;
  readonly watermark: RentalWatermarkPolicy;
  readonly restrictions: RentalDownloadRestriction;
  readonly auditTrail: readonly RentalAuditEvent[];
}

export interface CreateUnreleasedAssetRentalGrantInput {
  readonly grantId: string;
  readonly assetId: string;
  readonly assetName: string;
  readonly category: UnreleasedAssetCategory;
  readonly ownerCreatorId: string;
  readonly ownerCreatorName: string;
  readonly assistantId: string;
  readonly assistantName: string;
  readonly episodeId: string;
  readonly issuedAtMs: number;
  readonly startsAtMs?: number;
  readonly expiresAtMs: number;
  readonly watermarkOpacity?: number;
  readonly watermarkTemplate?: string;
  readonly restrictions?: Partial<RentalDownloadRestriction>;
}

export interface RentalAccessRequest {
  readonly action: RentalAssetAction;
  readonly assistantId: string;
  readonly episodeId: string;
  readonly nowMs: number;
  readonly activeDeviceCount?: number;
}

export interface RentalAccessDecision {
  readonly allowed: boolean;
  readonly status: RentalGrantStatus;
  readonly code: RentalDecisionCode;
  readonly reason: string;
  readonly watermarkText: string;
  readonly traceToken: string;
  readonly requiresImmediateCachePurge: boolean;
  readonly remainingMs: number;
}

export interface RentalSweepSummary {
  readonly active: readonly UnreleasedAssetRentalGrant[];
  readonly pending: readonly UnreleasedAssetRentalGrant[];
  readonly expired: readonly UnreleasedAssetRentalGrant[];
  readonly revoked: readonly UnreleasedAssetRentalGrant[];
  readonly cachePurgeAssetIds: readonly string[];
}

export interface RentalRightsBomAuditReport {
  readonly mergedRegistry: StudioRightsBomRegistry;
  readonly bomDiagnostics: readonly RightsComplianceDiagnostic[];
  readonly revokedGrantIds: readonly string[];
  readonly expiredGrantIds: readonly string[];
  readonly hasBlockingViolations: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function deriveDeterministicTraceToken(
  grantId: string,
  assetId: string,
  assistantId: string,
  episodeId: string,
): string {
  const payload = `${grantId}|${assetId}|${assistantId}|${episodeId}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i += 1) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i * 17), 0x85ebca6b) >>> 0;
  }
  return `ts-rent-${h1.toString(16).padStart(8, "0")}${h2.toString(16).padStart(8, "0")}`;
}

function formatUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** 워터마크 템플릿에 어시스턴트·대여 ID·만료일을 치환해 오버레이 문구를 만든다. */
export function renderRentalWatermarkLabel(grant: UnreleasedAssetRentalGrant): string {
  return grant.watermark.labelTemplate
    .replaceAll("{assistantName}", grant.assistantName)
    .replaceAll("{assistantId}", grant.assistantId)
    .replaceAll("{grantId}", grant.grantId)
    .replaceAll("{assetName}", grant.assetName)
    .replaceAll("{episodeId}", grant.episodeId)
    .replaceAll("{expiresDate}", formatUtcDate(grant.expiresAtMs));
}

/**
 * 미출시 에셋 협업 대여 권한을 생성한다.
 * 보안 기본값: 원본 파일 다운로드 금지, 외부 단독 반출 금지, 가시+비가시 워터마크 강제.
 */
export function createUnreleasedAssetRentalGrant(
  input: CreateUnreleasedAssetRentalGrantInput,
): UnreleasedAssetRentalGrant {
  const grantId = input.grantId.trim();
  const assetId = input.assetId.trim();
  const assistantId = input.assistantId.trim();
  const episodeId = input.episodeId.trim();
  if (!grantId || !assetId || !assistantId || !episodeId) {
    throw new Error("grantId, assetId, assistantId, episodeId는 모두 비어 있지 않아야 합니다.");
  }

  const startsAtMs = input.startsAtMs ?? input.issuedAtMs;
  if (input.expiresAtMs <= startsAtMs) {
    throw new Error("대여 만료 시각(expiresAtMs)은 시작 시각(startsAtMs)보다 이후여야 합니다.");
  }
  if (input.expiresAtMs - startsAtMs > MAX_UNRELEASED_RENTAL_DURATION_MS) {
    throw new Error("미출시 에셋 대여 기간은 1회 최대 90일을 초과할 수 없습니다.");
  }

  const traceToken = deriveDeterministicTraceToken(grantId, assetId, assistantId, episodeId);
  const watermark: RentalWatermarkPolicy = Object.freeze({
    enforced: true,
    labelTemplate:
      input.watermarkTemplate ??
      "미출시 대여 · {assistantName} · {episodeId} · 만료 {expiresDate} · {grantId}",
    opacity: clamp(input.watermarkOpacity ?? 0.35, 0.15, 0.65),
    embedInvisibleTraceId: true,
    traceToken,
  });

  const restrictions: RentalDownloadRestriction = Object.freeze({
    allowRawSourceDownload: input.restrictions?.allowRawSourceDownload ?? false,
    allowLocalCacheOnly: input.restrictions?.allowLocalCacheOnly ?? true,
    allowExternalExport: input.restrictions?.allowExternalExport ?? false,
    allowEpisodeRenderEmbed: input.restrictions?.allowEpisodeRenderEmbed ?? true,
    maxConcurrentDevices: Math.round(clamp(input.restrictions?.maxConcurrentDevices ?? 2, 1, 3)),
  });

  const issuedEvent: RentalAuditEvent = Object.freeze({
    type: "GRANT_ISSUED",
    actorId: input.ownerCreatorId.trim(),
    atMs: input.issuedAtMs,
    detail: `어시스턴트(${input.assistantName})에게 ${formatUtcDate(input.expiresAtMs)}까지 기간제 대여 발급`,
  });

  return Object.freeze({
    version: UNRELEASED_ASSET_RENTAL_POLICY_VERSION,
    grantId,
    assetId,
    assetName: input.assetName.trim(),
    category: input.category,
    ownerCreatorId: input.ownerCreatorId.trim(),
    ownerCreatorName: input.ownerCreatorName.trim(),
    assistantId,
    assistantName: input.assistantName.trim(),
    episodeId,
    issuedAtMs: input.issuedAtMs,
    startsAtMs,
    expiresAtMs: input.expiresAtMs,
    revokedAtMs: null,
    revocationReason: null,
    watermark,
    restrictions,
    auditTrail: Object.freeze([issuedEvent]),
  });
}

/** 현재 시각 기준 대여 권한 상태(회수 > 대기 > 만료 > 활성)를 판정한다. */
export function resolveRentalGrantStatus(
  grant: UnreleasedAssetRentalGrant,
  nowMs: number,
): RentalGrantStatus {
  if (grant.revokedAtMs !== null && nowMs >= grant.revokedAtMs) return "revoked";
  if (nowMs < grant.startsAtMs) return "pending";
  if (nowMs >= grant.expiresAtMs) return "expired";
  return "active";
}

/** 소유자가 미출시 에셋 대여 권한을 즉시 회수한다(멱등: 최초 회수 시각 보존). */
export function revokeRentalGrantImmediately(
  grant: UnreleasedAssetRentalGrant,
  params: { readonly revokedBy: string; readonly reason: string; readonly nowMs: number },
): UnreleasedAssetRentalGrant {
  if (grant.revokedAtMs !== null) {
    return grant;
  }
  const cleanReason = params.reason.trim() || "소유자 즉시 회수 요청";
  const event: RentalAuditEvent = Object.freeze({
    type: "GRANT_REVOKED",
    actorId: params.revokedBy.trim(),
    atMs: params.nowMs,
    detail: cleanReason,
  });
  return Object.freeze({
    ...grant,
    revokedAtMs: params.nowMs,
    revocationReason: cleanReason,
    auditTrail: Object.freeze([...grant.auditTrail, event]),
  });
}

/**
 * 활성/만료 예정 대여 권한의 만료 시각을 연장한다.
 * 보안 불변식: 이미 회수(revoked)된 권한은 재활성화하거나 연장할 수 없다.
 */
export function extendRentalGrant(
  grant: UnreleasedAssetRentalGrant,
  params: { readonly newExpiresAtMs: number; readonly extendedBy: string; readonly nowMs: number },
): UnreleasedAssetRentalGrant {
  if (grant.revokedAtMs !== null) {
    throw new Error("이미 회수된 미출시 에셋 대여 권한은 연장할 수 없습니다. 새 대여를 발급해 주세요.");
  }
  if (params.newExpiresAtMs <= grant.expiresAtMs) {
    throw new Error("새 만료 시각은 기존 만료 시각보다 이후여야 합니다.");
  }
  if (params.newExpiresAtMs - params.nowMs > MAX_UNRELEASED_RENTAL_DURATION_MS) {
    throw new Error("연장 만료 시각은 현재 시각 기준 최대 90일 이내여야 합니다.");
  }
  const event: RentalAuditEvent = Object.freeze({
    type: "GRANT_EXTENDED",
    actorId: params.extendedBy.trim(),
    atMs: params.nowMs,
    detail: `만료 시각을 ${formatUtcDate(params.newExpiresAtMs)}로 연장`,
  });
  return Object.freeze({
    ...grant,
    expiresAtMs: params.newExpiresAtMs,
    auditTrail: Object.freeze([...grant.auditTrail, event]),
  });
}

/** 어시스턴트의 구체적 에셋 접근·렌더·다운로드 요청을 정책 엔진으로 심사한다. */
export function evaluateRentalAssetAction(
  grant: UnreleasedAssetRentalGrant,
  request: RentalAccessRequest,
): RentalAccessDecision {
  const status = resolveRentalGrantStatus(grant, request.nowMs);
  const watermarkText = renderRentalWatermarkLabel(grant);
  const traceToken = grant.watermark.traceToken;
  const remainingMs = status === "active" ? Math.max(0, grant.expiresAtMs - request.nowMs) : 0;

  const deny = (
    code: RentalDecisionCode,
    reason: string,
    requiresImmediateCachePurge = false,
  ): RentalAccessDecision =>
    Object.freeze({
      allowed: false,
      status,
      code,
      reason,
      watermarkText,
      traceToken,
      requiresImmediateCachePurge,
      remainingMs,
    });

  if (request.assistantId !== grant.assistantId) {
    return deny("ASSISTANT_MISMATCH", "대여 대상 어시스턴트 계정과 일치하지 않습니다.", true);
  }
  if (request.episodeId !== grant.episodeId) {
    return deny("EPISODE_SCOPE_MISMATCH", "허가된 회차(Episode) 범위 밖에서는 사용할 수 없습니다.");
  }
  if (status === "revoked") {
    return deny(
      "GRANT_REVOKED",
      `소유자가 대여를 회수했습니다(${grant.revocationReason ?? "사유 미기재"}). 로컬 캐시를 즉시 파기합니다.`,
      true,
    );
  }
  if (status === "expired") {
    return deny(
      "GRANT_EXPIRED",
      `대여 기간이 만료되었습니다(${formatUtcDate(grant.expiresAtMs)}). 로컬 캐시를 즉시 파기합니다.`,
      true,
    );
  }
  if (status === "pending") {
    return deny("GRANT_NOT_STARTED", "아직 대여 시작 시각에 도달하지 않았습니다.");
  }

  const deviceCount = request.activeDeviceCount ?? 1;
  if (deviceCount > grant.restrictions.maxConcurrentDevices) {
    return deny(
      "DEVICE_LIMIT_EXCEEDED",
      `동시 사용 기기 상한(${grant.restrictions.maxConcurrentDevices}대)을 초과했습니다.`,
    );
  }

  if (request.action === "transfer-to-third-party") {
    return deny("THIRD_PARTY_TRANSFER_FORBIDDEN", "미출시 대여 에셋은 제3자에게 재배포·전달할 수 없습니다.");
  }
  if (request.action === "download-raw-source" && !grant.restrictions.allowRawSourceDownload) {
    return deny("RAW_DOWNLOAD_FORBIDDEN", "미출시 에셋의 원본 파일 다운로드는 정책상 차단되어 있습니다.");
  }
  if (request.action === "export-standalone-asset" && !grant.restrictions.allowExternalExport) {
    return deny("EXTERNAL_EXPORT_FORBIDDEN", "미출시 에셋의 단독 외부 내보내기는 허용되지 않습니다.");
  }
  if (request.action === "render-episode-panel" && !grant.restrictions.allowEpisodeRenderEmbed) {
    return deny("EPISODE_RENDER_FORBIDDEN", "이 대여 권한은 회차 컷 렌더링 임베드를 허용하지 않습니다.");
  }

  return Object.freeze({
    allowed: true,
    status,
    code: "ALLOWED",
    reason: "워터마크 및 로컬 캐시 전용 정책 하에 요청을 승인했습니다.",
    watermarkText,
    traceToken,
    requiresImmediateCachePurge: false,
    remainingMs,
  });
}

/** 대여 목록 전체를 일괄 점검해 활성·대기·만료·회수 및 캐시 파기 대상 에셋 ID를 분류한다. */
export function sweepExpiredRentalGrants(
  grants: readonly UnreleasedAssetRentalGrant[],
  nowMs: number,
): RentalSweepSummary {
  const active: UnreleasedAssetRentalGrant[] = [];
  const pending: UnreleasedAssetRentalGrant[] = [];
  const expired: UnreleasedAssetRentalGrant[] = [];
  const revoked: UnreleasedAssetRentalGrant[] = [];
  const purgeIds = new Set<string>();

  for (const grant of grants) {
    const status = resolveRentalGrantStatus(grant, nowMs);
    if (status === "active") active.push(grant);
    else if (status === "pending") pending.push(grant);
    else if (status === "expired") {
      expired.push(grant);
      purgeIds.add(grant.assetId);
    } else {
      revoked.push(grant);
      purgeIds.add(grant.assetId);
    }
  }

  return Object.freeze({
    active: Object.freeze(active),
    pending: Object.freeze(pending),
    expired: Object.freeze(expired),
    revoked: Object.freeze(revoked),
    cachePurgeAssetIds: Object.freeze([...purgeIds].sort()),
  });
}

function mapCategoryToRightsAssetKind(category: UnreleasedAssetCategory): RightsAssetKind {
  switch (category) {
    case "background-3d":
      return "3d-scene";
    case "character-rig":
      return "3d-prop";
    case "brush-preset":
      return "brush-preset";
    case "background-2d":
    case "tone-pack":
      return "texture-pattern";
  }
}

/**
 * 미출시 에셋 대여 권한을 기존 `studio-rights-bom-provenance`의 `RightsBomItem`으로 변환한다.
 * 회수된 경우 만료 시각을 `revokedAtMs`로 강제 설정해 Rights BOM 감사에서 즉시 오류로 검출되게 한다.
 */
export function buildRightsBomItemFromRentalGrant(
  grant: UnreleasedAssetRentalGrant,
): RightsBomItem {
  const effectiveExpiresAtMs = grant.revokedAtMs !== null
    ? Math.min(grant.revokedAtMs, grant.expiresAtMs)
    : grant.expiresAtMs;

  return Object.freeze({
    id: `rental:${grant.grantId}`,
    assetRef: grant.assetId,
    assetName: `${grant.assetName} (미출시 대여 · ${grant.assistantName})`,
    kind: mapCategoryToRightsAssetKind(grant.category),
    attribution: Object.freeze({
      creatorName: grant.ownerCreatorName,
      copyrightHolder: grant.ownerCreatorName,
      contractId: grant.grantId,
    }),
    license: "custom-contract",
    permissions: Object.freeze({
      allowCommercialUse: false,
      allowModification: false,
      allowRedistribution: false,
      requireAttribution: true,
    }),
    allowedMediaTypes: Object.freeze([grant.episodeId]),
    expiresAtMs: effectiveExpiresAtMs,
  });
}

/**
 * 기존 회차 Rights BOM 레지스트리에 미출시 대여 에셋 항목을 합쳐 만료·회수·상업 출고 위험을 일괄 감사한다.
 */
export function auditRentalGrantsWithRightsBom(params: {
  readonly baseRegistry: StudioRightsBomRegistry;
  readonly grants: readonly UnreleasedAssetRentalGrant[];
  readonly nowMs: number;
  readonly isCommercialPublish?: boolean;
}): RentalRightsBomAuditReport {
  const existingIds = new Set(params.baseRegistry.items.map((item) => item.id));
  const rentalItems = params.grants
    .map(buildRightsBomItemFromRentalGrant)
    .filter((item) => !existingIds.has(item.id));

  const mergedRegistry = createRightsBomRegistry({
    id: params.baseRegistry.id,
    episodeId: params.baseRegistry.episodeId,
    items: [...params.baseRegistry.items, ...rentalItems],
    safetyFlags: params.baseRegistry.safetyFlags,
  });

  const bomDiagnostics = auditRightsCompliance(
    mergedRegistry,
    {
      isCommercial: params.isCommercialPublish ?? false,
      targetMediaType: params.baseRegistry.episodeId,
    },
    params.nowMs,
  );

  const sweep = sweepExpiredRentalGrants(params.grants, params.nowMs);
  const revokedGrantIds = Object.freeze(sweep.revoked.map((g) => g.grantId));
  const expiredGrantIds = Object.freeze(sweep.expired.map((g) => g.grantId));
  const hasBlockingViolations =
    revokedGrantIds.length > 0 ||
    expiredGrantIds.length > 0 ||
    bomDiagnostics.some((diag) => diag.severity === "error");

  return Object.freeze({
    mergedRegistry,
    bomDiagnostics,
    revokedGrantIds,
    expiredGrantIds,
    hasBlockingViolations,
  });
}
