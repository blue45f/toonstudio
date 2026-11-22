/**
 * Rights BOM 상업 라이선스 검증 엔진 (Fail-Closed).
 *
 * PRODUCT.md 원칙에 따라 플랫폼 납품 패키지 생성 전 사용된 폰트·브러시·3D 배경·효과·오디오
 * 소재의 상업 이용 권한, 출처 표기 충족 여부, 라이선스 만료를 검사한다.
 * 비상업(`non-commercial`), 제한(`restricted`), 미확인(`unknown`), 출처 표기 누락,
 * 기한 만료 항목이 1건이라도 있으면 상업 납품을 차단한다.
 */

import { isLicenseBlockedForCommercial } from "../export/studio-commercial-preflight-gate";
import type { StudioProjectDiagnosticAsset } from "../studio-project-diagnostics";

export const DELIVERY_BOM_ASSET_CATEGORIES = Object.freeze([
  "font",
  "brush",
  "bg3d",
  "effect",
  "audio",
  "reference",
] as const);

export type DeliveryBomAssetCategory = (typeof DELIVERY_BOM_ASSET_CATEGORIES)[number];

export const DELIVERY_BOM_CATEGORY_LABELS: Readonly<
  Record<DeliveryBomAssetCategory, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  font: Object.freeze({ ko: "폰트", en: "Font" }),
  brush: Object.freeze({ ko: "브러시", en: "Brush" }),
  bg3d: Object.freeze({ ko: "3D 배경", en: "3D Background" }),
  effect: Object.freeze({ ko: "효과·톤", en: "Effect / Tone" }),
  audio: Object.freeze({ ko: "오디오", en: "Audio" }),
  reference: Object.freeze({ ko: "기타 소재", en: "Reference Asset" }),
});

export const DELIVERY_BOM_LICENSE_STATUSES = Object.freeze([
  "commercial-allowed",
  "commercial-attribution",
  "non-commercial",
  "restricted",
  "unknown",
] as const);

export type DeliveryBomLicenseStatus = (typeof DELIVERY_BOM_LICENSE_STATUSES)[number];

export interface DeliveryRightsBomAsset {
  readonly id: string;
  readonly name: string;
  readonly category: DeliveryBomAssetCategory;
  readonly licenseStatus: DeliveryBomLicenseStatus;
  readonly licenseCode: string;
  readonly creatorOrVendor: string;
  readonly requiresAttribution: boolean;
  readonly attributionText?: string | null;
  readonly sourceUrl?: string | null;
  readonly licenseProofRef?: string | null;
  readonly expiresAt?: string | null;
  readonly episodeNumbers?: readonly number[];
}

export type DeliveryRightsViolationCode =
  | "NON_COMMERCIAL_LICENSE"
  | "RESTRICTED_LICENSE"
  | "UNKNOWN_LICENSE"
  | "ATTRIBUTION_MISSING"
  | "LICENSE_EXPIRED"
  | "INVALID_EXPIRATION_DATE"
  | "LICENSE_EXPIRING_SOON"
  | "MISSING_ASSET_IDENTITY"
  | "DUPLICATE_ASSET_ID";

export interface DeliveryRightsViolation {
  readonly code: DeliveryRightsViolationCode;
  readonly severity: "blocker" | "warning";
  readonly assetId: string;
  readonly assetName: string;
  readonly category: DeliveryBomAssetCategory;
  readonly messageKo: string;
  readonly messageEn: string;
  readonly remediationKo: string;
}

export interface DeliveryRightsBomAuditReport {
  readonly clearedForDelivery: boolean;
  readonly evaluatedAt: string;
  readonly totalAssetCount: number;
  readonly clearedAssetCount: number;
  readonly blockedAssetCount: number;
  readonly warningCount: number;
  readonly attributionRequiredCount: number;
  readonly categoryCounts: Readonly<Record<DeliveryBomAssetCategory, number>>;
  readonly attributionLines: readonly string[];
  readonly violations: readonly DeliveryRightsViolation[];
  readonly blockers: readonly DeliveryRightsViolation[];
  readonly warnings: readonly DeliveryRightsViolation[];
}

const NON_COMMERCIAL_CODE_RE =
  /\b(CC-BY-NC-ND|CC-BY-NC-SA|CC-BY-NC|NON-COMMERCIAL|PERSONAL-ONLY|NC)\b|비상업|비영리|개인용/iu;

const RESTRICTED_CODE_RE =
  /\b(AGPL|GPL|LGPL|RESTRICTED|EDITORIAL-ONLY|DEMO-ONLY|TRIAL-ONLY|NO-COMMERCIAL|PROHIBITED)\b|연재금지|상업불가|제한/iu;

const ATTRIBUTION_IMPLIED_CODE_RE = /\bCC-BY(?:-SA|-ND)?(?:-\d(?:\.\d)?)?\b|BY-4\.0|출처\s*필수/iu;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function emptyCategoryCounts(): Record<DeliveryBomAssetCategory, number> {
  return {
    font: 0,
    brush: 0,
    bg3d: 0,
    effect: 0,
    audio: 0,
    reference: 0,
  };
}

function resolveEvaluatedAt(evaluatedAt?: string): { readonly iso: string; readonly ms: number } {
  const iso = evaluatedAt ?? new Date().toISOString();
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new Error("Rights BOM 평가 시각(evaluatedAt)이 올바른 ISO 날짜 형식이 아닙니다.");
  }
  return { iso, ms };
}

/**
 * 상업 납품 전 Rights BOM 소재 목록을 fail-closed 기준으로 전수 검증한다.
 */
export function validateDeliveryRightsBom(
  assets: readonly DeliveryRightsBomAsset[],
  options: { readonly evaluatedAt?: string } = {},
): DeliveryRightsBomAuditReport {
  const { iso: evaluatedAt, ms: evaluatedAtMs } = resolveEvaluatedAt(options.evaluatedAt);
  const violations: DeliveryRightsViolation[] = [];
  const blockedIds = new Set<string>();
  const seenIds = new Set<string>();
  const categoryCounts = emptyCategoryCounts();
  const attributionSet = new Set<string>();
  let attributionRequiredCount = 0;

  for (const [index, asset] of assets.entries()) {
    categoryCounts[asset.category] += 1;

    const trimmedId = asset.id.trim();
    const trimmedName = asset.name.trim();
    const displayId = trimmedId || `asset-row-${index + 1}`;
    const displayName = trimmedName || displayId;
    const trimmedCode = asset.licenseCode.trim();
    const trimmedAttribution = asset.attributionText?.trim() ?? "";

    const pushBlocker = (
      code: DeliveryRightsViolationCode,
      messageKo: string,
      messageEn: string,
      remediationKo: string,
    ): void => {
      blockedIds.add(displayId);
      violations.push(
        Object.freeze({
          code,
          severity: "blocker",
          assetId: displayId,
          assetName: displayName,
          category: asset.category,
          messageKo,
          messageEn,
          remediationKo,
        }),
      );
    };

    if (!trimmedId || !trimmedName) {
      pushBlocker(
        "MISSING_ASSET_IDENTITY",
        `소재 식별자 또는 이름이 비어 있어 권리를 증명할 수 없습니다(${displayId}).`,
        `Asset identity or name is missing for ${displayId}.`,
        "소재 ID와 표시 이름을 모두 기록한 뒤 다시 검증하세요.",
      );
    } else if (seenIds.has(trimmedId)) {
      pushBlocker(
        "DUPLICATE_ASSET_ID",
        `소재 ID '${trimmedId}'가 Rights BOM 목록에 중복 등록되어 있습니다.`,
        `Duplicate Rights BOM asset id '${trimmedId}'.`,
        "중복된 소재 항목을 하나로 정리한 뒤 다시 패키지를 생성하세요.",
      );
    } else {
      seenIds.add(trimmedId);
    }

    const codeIsNonCommercial =
      NON_COMMERCIAL_CODE_RE.test(trimmedCode) || isLicenseBlockedForCommercial(trimmedCode);
    const codeIsRestricted = RESTRICTED_CODE_RE.test(trimmedCode);
    let licenseBlocked = false;

    if (asset.licenseStatus === "non-commercial") {
      licenseBlocked = true;
      pushBlocker(
        "NON_COMMERCIAL_LICENSE",
        `비상업 전용 소재 '${displayName}'(${trimmedCode || "non-commercial"})은 상업 플랫폼 납품에 포함할 수 없습니다.`,
        `Non-commercial asset '${displayName}' cannot be included in a commercial delivery pack.`,
        "상업적 이용이 허용된 소재로 교체하거나 원고에서 제거하세요.",
      );
    } else if (asset.licenseStatus === "restricted") {
      licenseBlocked = true;
      pushBlocker(
        "RESTRICTED_LICENSE",
        `사용 제한 소재 '${displayName}'(${trimmedCode || "restricted"})은 납품 승인이 차단되었습니다.`,
        `Restricted asset '${displayName}' is blocked from platform delivery.`,
        "유효한 상업 연재 계약서를 연결하거나 허용된 대체 소재로 교체하세요.",
      );
    } else if (asset.licenseStatus === "unknown" || !trimmedCode) {
      licenseBlocked = true;
      pushBlocker(
        "UNKNOWN_LICENSE",
        `소재 '${displayName}'의 라이선스 코드가 확인되지 않아 안전을 위해 납품을 차단했습니다.`,
        `Asset '${displayName}' has an unverified or empty license and is blocked fail-closed.`,
        "정확한 라이선스 코드(예: OFL-1.1, CC0-1.0, 상업 구매 라이선스)를 확인해 입력하세요.",
      );
    } else if (codeIsRestricted) {
      licenseBlocked = true;
      pushBlocker(
        "RESTRICTED_LICENSE",
        `소재 '${displayName}'의 라이선스 코드(${trimmedCode})에 상업 배포 제한 조건이 포함되어 있습니다.`,
        `License code '${trimmedCode}' on '${displayName}' restricts commercial distribution.`,
        "GPL/제한 조건이 없는 상업 허용 소재로 교체하세요.",
      );
    } else if (codeIsNonCommercial) {
      licenseBlocked = true;
      pushBlocker(
        "NON_COMMERCIAL_LICENSE",
        `소재 '${displayName}'의 라이선스 코드(${trimmedCode})가 비상업 전용으로 판별되었습니다.`,
        `License code '${trimmedCode}' on '${displayName}' is non-commercial.`,
        "비상업(NC) 조건이 없는 상업용 라이선스로 교체하세요.",
      );
    }

    const needsAttribution =
      !licenseBlocked &&
      (asset.requiresAttribution ||
        asset.licenseStatus === "commercial-attribution" ||
        ATTRIBUTION_IMPLIED_CODE_RE.test(trimmedCode));

    if (needsAttribution) {
      attributionRequiredCount += 1;
      if (!trimmedAttribution) {
        pushBlocker(
          "ATTRIBUTION_MISSING",
          `출처 표기 필수 소재 '${displayName}'의 출처 문구가 누락되어 납품이 차단되었습니다.`,
          `Attribution text is required for '${displayName}' before delivery.`,
          "권리자와 출처 문구(예: '배경 제공: ○○ / CC-BY 4.0')를 입력해 증명서에 포함하세요.",
        );
      } else {
        attributionSet.add(trimmedAttribution);
      }
    } else if (trimmedAttribution) {
      attributionSet.add(trimmedAttribution);
    }

    if (asset.expiresAt !== undefined && asset.expiresAt !== null && asset.expiresAt.trim() !== "") {
      const expiresMs = Date.parse(asset.expiresAt);
      if (!Number.isFinite(expiresMs)) {
        pushBlocker(
          "INVALID_EXPIRATION_DATE",
          `소재 '${displayName}'의 만료일('${asset.expiresAt}')을 해석할 수 없어 납품을 차단했습니다.`,
          `Invalid license expiration date '${asset.expiresAt}' on '${displayName}'.`,
          "YYYY-MM-DD 또는 ISO 날짜 형식으로 라이선스 만료일을 수정하세요.",
        );
      } else if (expiresMs <= evaluatedAtMs) {
        pushBlocker(
          "LICENSE_EXPIRED",
          `소재 '${displayName}'의 라이선스가 만료되었습니다(${asset.expiresAt.slice(0, 10)}).`,
          `License for '${displayName}' expired on ${asset.expiresAt.slice(0, 10)}.`,
          "라이선스를 갱신하고 새 만료일을 반영한 뒤 납품 패키지를 다시 생성하세요.",
        );
      } else if (expiresMs - evaluatedAtMs <= THIRTY_DAYS_MS) {
        const daysLeft = Math.max(1, Math.ceil((expiresMs - evaluatedAtMs) / (24 * 60 * 60 * 1000)));
        violations.push(
          Object.freeze({
            code: "LICENSE_EXPIRING_SOON",
            severity: "warning",
            assetId: displayId,
            assetName: displayName,
            category: asset.category,
            messageKo: `소재 '${displayName}'의 라이선스 만료가 ${daysLeft}일 남았습니다(${asset.expiresAt.slice(0, 10)}).`,
            messageEn: `License for '${displayName}' expires in ${daysLeft} day(s).`,
            remediationKo: "연재 일정 중 만료되지 않도록 갱신 일정을 미리 확인하세요.",
          }),
        );
      }
    }
  }

  const blockers = violations.filter((item) => item.severity === "blocker");
  const warnings = violations.filter((item) => item.severity === "warning");
  const attributionLines = [...attributionSet].sort((left, right) => left.localeCompare(right));

  return Object.freeze({
    clearedForDelivery: blockers.length === 0,
    evaluatedAt,
    totalAssetCount: assets.length,
    clearedAssetCount: Math.max(0, assets.length - blockedIds.size),
    blockedAssetCount: blockedIds.size,
    warningCount: warnings.length,
    attributionRequiredCount,
    categoryCounts: Object.freeze(categoryCounts),
    attributionLines: Object.freeze(attributionLines),
    violations: Object.freeze(violations),
    blockers: Object.freeze(blockers),
    warnings: Object.freeze(warnings),
  });
}

function inferCategoryFromAssetId(assetId: string): DeliveryBomAssetCategory {
  const lower = assetId.toLowerCase();
  if (lower.includes("font") || lower.includes("typeface")) return "font";
  if (lower.includes("brush") || lower.includes("pen")) return "brush";
  if (lower.includes("bg3d") || lower.includes("3d") || lower.includes("scene") || lower.includes("glb")) {
    return "bg3d";
  }
  if (lower.includes("audio") || lower.includes("bgm") || lower.includes("sfx-sound")) return "audio";
  if (lower.includes("tone") || lower.includes("effect") || lower.includes("fx") || lower.includes("texture")) {
    return "effect";
  }
  return "reference";
}

/**
 * 스튜디오 프로젝트 워크스페이스의 자산 상태 스냅샷을 납품용 Rights BOM 입력으로 투영한다.
 * `blocked`는 `restricted`, `warning`은 출처 표기 확인이 필요한 `commercial-attribution`으로
 * 보수적(fail-closed) 매핑한다.
 */
export function mapWorkspaceDiagnosticAssetsToDeliveryBom(
  assets: readonly StudioProjectDiagnosticAsset[],
): readonly DeliveryRightsBomAsset[] {
  return Object.freeze(
    assets.map((asset) => {
      const category = inferCategoryFromAssetId(asset.id);
      if (asset.status === "blocked") {
        return Object.freeze({
          id: asset.id,
          name: `워크스페이스 차단 소재 (${asset.id})`,
          category,
          licenseStatus: "restricted",
          licenseCode: "RESTRICTED",
          creatorOrVendor: "확인 필요",
          requiresAttribution: false,
          attributionText: null,
        });
      }
      if (asset.status === "warning") {
        return Object.freeze({
          id: asset.id,
          name: `출처 확인 필요 소재 (${asset.id})`,
          category,
          licenseStatus: "commercial-attribution",
          licenseCode: "CC-BY-4.0",
          creatorOrVendor: "출처 입력 필요",
          requiresAttribution: true,
          attributionText: null,
        });
      }
      return Object.freeze({
        id: asset.id,
        name: `승인된 프로젝트 소재 (${asset.id})`,
        category,
        licenseStatus: "commercial-allowed",
        licenseCode: "COMMERCIAL-CLEARED",
        creatorOrVendor: "ToonStudio Project",
        requiresAttribution: false,
        attributionText: null,
      });
    }),
  );
}
