/**
 * 오픈 플러그인·서드파티 소재 SDK 매니페스트·권한 샌드박스 검증기, 70/30 투명 마켓 정산,
 * 및 하이브리드 요금 미터링·IP 해시체인 계약 원장 통합 진입점.
 */

import { canonicalJson, sha256Hex } from "./deterministic-sha256";

export { GENESIS_PREVIOUS_HASH, sha256Hex } from "./deterministic-sha256";
export {
  CREDIT_PACK_CATALOG,
  DEFAULT_USAGE_EVENTS,
  HYBRID_OPERATION_CATALOG,
  SUBSCRIPTION_PLANS,
  simulateHybridBillingLedger,
  type BillingCycle,
  type CreditPackId,
  type CreditPackPurchaseInput,
  type CreditPackSpec,
  type HybridBillingLedger,
  type HybridBillingSimulationInput,
  type HybridLedgerEntry,
  type HybridOperationId,
  type HybridOperationSpec,
  type HybridUsageEventInput,
  type SubscriptionPlanSpec,
  type SubscriptionTierId,
} from "./hybrid-billing-metering";
export {
  SAMPLE_COPYRIGHT_STAKEHOLDERS,
  SAMPLE_CROWDFUNDING_CAMPAIGN,
  appendContractLedgerBlock,
  createContractLedgerGenesis,
  evaluateCrowdfundingCampaign,
  validateCopyrightSplitAndDistribute,
  verifyContractHashChain,
  type ContractChainVerificationResult,
  type ContractLedgerBlock,
  type ContractLedgerEventType,
  type CopyrightSplitValidationResult,
  type CopyrightStakeholder,
  type CrowdfundingCampaignInput,
  type CrowdfundingEvaluationResult,
  type CrowdfundingRewardTier,
  type CrowdfundingTierBreakdown,
  type IpFundingKind,
  type StakeholderPayout,
  type StakeholderRole,
} from "./ip-funding-hashchain-ledger";

export const SDK_HOST_VERSION = "2.4.0";
export const CREATOR_MARKET_REVENUE_SHARE = 0.7;
export const PLATFORM_MARKET_FEE_RATE = 0.3;

export type SdkPermissionScope =
  | "canvas.read"
  | "asset.insert"
  | "export.hook"
  | "material.publish"
  | "canvas.write"
  | "network.external"
  | "storage.raw"
  | "auth.session"
  | "filesystem.host";

export type SdkPluginCategory =
  | "brush-engine"
  | "material-pack"
  | "export-adapter"
  | "workflow-tool";

export interface SdkScopeDefinition {
  readonly id: SdkPermissionScope;
  readonly labelKo: string;
  readonly riskLevel: "standard" | "elevated" | "forbidden";
  readonly descriptionKo: string;
}

export const SDK_SCOPE_DEFINITIONS: readonly SdkScopeDefinition[] = Object.freeze([
  {
    id: "canvas.read",
    labelKo: "캔버스 읽기",
    riskLevel: "standard",
    descriptionKo: "현재 활성 컷의 레이어 메타데이터와 읽기 전용 뷰포트를 조회합니다.",
  },
  {
    id: "asset.insert",
    labelKo: "소재 삽입",
    riskLevel: "standard",
    descriptionKo: "검증된 브러시·스크린톤·3D 소품을 새 레이어에 안전하게 추가합니다.",
  },
  {
    id: "export.hook",
    labelKo: "내보내기 후크",
    riskLevel: "standard",
    descriptionKo: "내보내기 직전 해상도·규격·워터마크 메타 검사를 수행합니다.",
  },
  {
    id: "material.publish",
    labelKo: "소재 마켓 게시",
    riskLevel: "standard",
    descriptionKo: "서드파티 소재 패키지 메타데이터와 라이선스 선언을 등록합니다.",
  },
  {
    id: "canvas.write",
    labelKo: "캔버스 직접 쓰기",
    riskLevel: "elevated",
    descriptionKo: "원고 픽셀·벡터 데이터를 직접 수정하므로 격리 검토가 필요합니다.",
  },
  {
    id: "network.external",
    labelKo: "외부 네트워크",
    riskLevel: "elevated",
    descriptionKo: "외부 서버 통신 권한입니다. 원고 읽기·내보내기와 조합 시 즉시 차단됩니다.",
  },
  {
    id: "storage.raw",
    labelKo: "원시 저장소 접근",
    riskLevel: "elevated",
    descriptionKo: "로컬 OPFS/SQLite 원본 바이트 접근 권한으로 조합 검사가 엄격합니다.",
  },
  {
    id: "auth.session",
    labelKo: "인증 세션 접근",
    riskLevel: "forbidden",
    descriptionKo: "계정 쿠키·토큰 탈취 위험으로 서드파티 플러그인에 영구 금지됩니다.",
  },
  {
    id: "filesystem.host",
    labelKo: "호스트 파일시스템",
    riskLevel: "forbidden",
    descriptionKo: "운영체제 임의 경로 읽기/쓰기는 샌드박스 경계 위반으로 영구 금지됩니다.",
  },
]);

const KNOWN_SCOPES = new Set<string>(SDK_SCOPE_DEFINITIONS.map((item) => item.id));
const FORBIDDEN_SCOPES = new Set<SdkPermissionScope>(["auth.session", "filesystem.host"]);
const ELEVATED_SCOPES = new Set<SdkPermissionScope>(["canvas.write", "network.external", "storage.raw"]);

interface DangerousComboRule {
  readonly code: string;
  readonly pair: readonly [SdkPermissionScope, SdkPermissionScope];
  readonly messageKo: string;
}

const DANGEROUS_SCOPE_COMBINATIONS: readonly DangerousComboRule[] = Object.freeze([
  {
    code: "EXFILTRATION_CANVAS_NET",
    pair: ["canvas.read", "network.external"],
    messageKo: "캔버스 읽기(canvas.read)와 외부 네트워크(network.external) 동시 요청은 원고 무단 유출 위험으로 차단됩니다.",
  },
  {
    code: "EXFILTRATION_EXPORT_NET",
    pair: ["export.hook", "network.external"],
    messageKo: "내보내기 후크(export.hook)와 외부 네트워크(network.external) 조합은 완성 원고 반출 위험으로 차단됩니다.",
  },
  {
    code: "EXFILTRATION_PUBLISH_NET",
    pair: ["material.publish", "network.external"],
    messageKo: "소재 게시(material.publish)와 외부 네트워크(network.external) 조합은 서드파티 소재 무단 재배포 위험으로 차단됩니다.",
  },
  {
    code: "TAMPER_STORAGE_CANVAS",
    pair: ["storage.raw", "canvas.write"],
    messageKo: "원시 저장소(storage.raw)와 캔버스 직접 쓰기(canvas.write) 조합은 로컬 원고 변조 위험으로 차단됩니다.",
  },
  {
    code: "EXFILTRATION_STORAGE_NET",
    pair: ["storage.raw", "network.external"],
    messageKo: "원시 저장소(storage.raw)와 외부 네트워크(network.external) 조합은 전체 프로젝트 유출 위험으로 차단됩니다.",
  },
]);

export interface PluginManifestInput {
  readonly id: string;
  readonly name: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly category: SdkPluginCategory;
  readonly version: string;
  readonly sdkApiVersion: string;
  readonly entryModule: string;
  readonly requestedScopes: readonly string[];
}

export interface SdkSandboxViolation {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly messageKo: string;
  readonly scopes: readonly string[];
}

export interface SdkSandboxProfile {
  readonly isolationMode: "sandboxed-worker-no-network" | "reviewed-isolated-worker" | "denied";
  readonly networkAccess: "blocked" | "allowlist-review";
  readonly memoryCapMb: number;
  readonly cpuBudgetMs: number;
  readonly allowedApis: readonly SdkPermissionScope[];
}

export interface SdkSandboxValidationResult {
  readonly verdict: "approved" | "review-required" | "blocked";
  readonly valid: boolean;
  readonly normalizedScopes: readonly SdkPermissionScope[];
  readonly violations: readonly SdkSandboxViolation[];
  readonly sandboxProfile: SdkSandboxProfile;
  readonly manifestFingerprintSha256: string;
}

const PLUGIN_ID_RE = /^[a-z0-9]+(?:[.-][a-z0-9]+){1,5}$/u;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const SDK_RANGE_RE = /^\^?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const SAFE_ENTRY_RE = /^\.?\/?[a-zA-Z0-9._/-]+\.(?:js|mjs|wasm)$/u;

function parseHostMajorMinor(): readonly [number, number] {
  const parts = SDK_HOST_VERSION.split(".").map((part) => Number.parseInt(part, 10));
  return [parts[0] ?? 2, parts[1] ?? 4];
}

export function validatePluginManifestSandbox(manifest: PluginManifestInput): SdkSandboxValidationResult {
  const violations: SdkSandboxViolation[] = [];
  const trimmedId = manifest.id.trim();
  const trimmedVersion = manifest.version.trim();
  const trimmedApi = manifest.sdkApiVersion.trim();
  const trimmedEntry = manifest.entryModule.trim();

  if (!PLUGIN_ID_RE.test(trimmedId)) {
    violations.push({
      code: "INVALID_PLUGIN_ID",
      severity: "error",
      messageKo: "플러그인 ID는 영소문자·숫자·점(.)·하이픈(-) 조합의 네임스페이스 형식이어야 합니다.",
      scopes: [],
    });
  }
  if (!manifest.name.trim() || !manifest.authorName.trim() || !manifest.authorId.trim()) {
    violations.push({
      code: "MISSING_MANIFEST_IDENTITY",
      severity: "error",
      messageKo: "플러그인 이름과 제작자 식별 정보를 모두 입력해야 합니다.",
      scopes: [],
    });
  }
  if (!SEMVER_RE.test(trimmedVersion)) {
    violations.push({
      code: "INVALID_SEMVER",
      severity: "error",
      messageKo: `버전(${manifest.version || "비어 있음"})은 SemVer(예: 1.2.0) 규칙을 따라야 합니다.`,
      scopes: [],
    });
  }

  const sdkMatch = SDK_RANGE_RE.exec(trimmedApi);
  if (!sdkMatch) {
    violations.push({
      code: "INVALID_SDK_RANGE",
      severity: "error",
      messageKo: `호환 SDK 버전(${manifest.sdkApiVersion || "비어 있음"})은 ^2.0.0 형식이어야 합니다.`,
      scopes: [],
    });
  } else {
    const [hostMajor, hostMinor] = parseHostMajorMinor();
    const reqMajor = Number.parseInt(sdkMatch[1] ?? "0", 10);
    const reqMinor = Number.parseInt(sdkMatch[2] ?? "0", 10);
    if (reqMajor !== hostMajor || reqMinor > hostMinor) {
      violations.push({
        code: "INCOMPATIBLE_SDK_VERSION",
        severity: "error",
        messageKo: `현재 호스트 SDK(${SDK_HOST_VERSION})와 호환되지 않는 SDK 요구 버전(${trimmedApi})입니다.`,
        scopes: [],
      });
    }
  }

  if (
    !SAFE_ENTRY_RE.test(trimmedEntry) ||
    trimmedEntry.includes("..") ||
    trimmedEntry.startsWith("/") ||
    /^(?:https?|data|javascript):/iu.test(trimmedEntry)
  ) {
    violations.push({
      code: "UNSAFE_ENTRY_MODULE",
      severity: "error",
      messageKo: "진입 모듈은 상위 디렉터리 이동(..)이나 원격 URL이 없는 상대 .js/.mjs/.wasm 경로여야 합니다.",
      scopes: [],
    });
  }

  const uniqueRawScopes = [...new Set(manifest.requestedScopes.map((scope) => scope.trim()).filter(Boolean))];
  if (uniqueRawScopes.length === 0) {
    violations.push({
      code: "EMPTY_SCOPES",
      severity: "error",
      messageKo: "최소 1개 이상의 권한 스코프를 명시해야 합니다.",
      scopes: [],
    });
  }

  const normalizedScopes: SdkPermissionScope[] = [];
  for (const scope of uniqueRawScopes) {
    if (!KNOWN_SCOPES.has(scope)) {
      violations.push({
        code: "UNKNOWN_SCOPE",
        severity: "error",
        messageKo: `정의되지 않은 권한 스코프(${scope})는 샌드박스에서 허용하지 않습니다.`,
        scopes: [scope],
      });
    } else {
      normalizedScopes.push(scope as SdkPermissionScope);
    }
  }

  const scopeSet = new Set<SdkPermissionScope>(normalizedScopes);
  for (const forbidden of FORBIDDEN_SCOPES) {
    if (scopeSet.has(forbidden)) {
      violations.push({
        code: "FORBIDDEN_SCOPE",
        severity: "error",
        messageKo: `영구 금지 권한(${forbidden})을 요청해 설치가 즉시 차단됩니다.`,
        scopes: [forbidden],
      });
    }
  }

  for (const combo of DANGEROUS_SCOPE_COMBINATIONS) {
    if (scopeSet.has(combo.pair[0]) && scopeSet.has(combo.pair[1])) {
      violations.push({
        code: combo.code,
        severity: "error",
        messageKo: combo.messageKo,
        scopes: [...combo.pair],
      });
    }
  }

  const requestedElevated = normalizedScopes.filter((scope) => ELEVATED_SCOPES.has(scope));
  if (requestedElevated.length > 0 && !violations.some((v) => v.severity === "error")) {
    violations.push({
      code: "ELEVATED_SCOPE_REVIEW",
      severity: "warning",
      messageKo: `확장 권한(${requestedElevated.join(", ")})이 포함되어 수동 샌드박스 심사가 필요합니다.`,
      scopes: requestedElevated,
    });
  }

  if (manifest.category === "material-pack" && scopeSet.has("export.hook")) {
    violations.push({
      code: "OVERPRIVILEGED_MATERIAL_PACK",
      severity: "warning",
      messageKo: "소재 팩(material-pack)은 보통 asset.insert·material.publish만으로 충분합니다. export.hook 필요 여부를 확인하세요.",
      scopes: ["export.hook"],
    });
  }

  const hasError = violations.some((violation) => violation.severity === "error");
  const hasWarning = violations.some((violation) => violation.severity === "warning");
  const verdict: SdkSandboxValidationResult["verdict"] = hasError
    ? "blocked"
    : hasWarning
      ? "review-required"
      : "approved";

  const allowedApis = hasError
    ? []
    : normalizedScopes.filter((scope) => !FORBIDDEN_SCOPES.has(scope));

  const sandboxProfile: SdkSandboxProfile = hasError
    ? {
        isolationMode: "denied",
        networkAccess: "blocked",
        memoryCapMb: 0,
        cpuBudgetMs: 0,
        allowedApis: [],
      }
    : {
        isolationMode: verdict === "approved" ? "sandboxed-worker-no-network" : "reviewed-isolated-worker",
        networkAccess: scopeSet.has("network.external") ? "allowlist-review" : "blocked",
        memoryCapMb: manifest.category === "brush-engine" ? 128 : 64,
        cpuBudgetMs: manifest.category === "export-adapter" ? 500 : 120,
        allowedApis,
      };

  const manifestFingerprintSha256 = sha256Hex(
    canonicalJson({
      id: trimmedId,
      version: trimmedVersion,
      sdkApiVersion: trimmedApi,
      entryModule: trimmedEntry,
      category: manifest.category,
      scopes: [...normalizedScopes].sort(),
    }),
  );

  return {
    verdict,
    valid: !hasError,
    normalizedScopes,
    violations,
    sandboxProfile,
    manifestFingerprintSha256,
  };
}

export interface MarketplaceSettlementInput {
  readonly pluginId: string;
  readonly unitPriceKrw: number;
  readonly grossSalesCount: number;
  readonly refundCount: number;
  readonly pgFeeRateWithinPlatformShare?: number;
}

export interface MarketplaceSettlementResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly isFreeListing: boolean;
  readonly netSalesCount: number;
  readonly grossRevenueKrw: number;
  readonly refundedRevenueKrw: number;
  readonly netRevenueKrw: number;
  readonly creatorShareRate: number;
  readonly platformFeeRate: number;
  readonly creatorPayoutKrw: number;
  readonly platformGrossShareKrw: number;
  readonly estimatedPgFeeKrw: number;
  readonly platformNetMarginKrw: number;
}

/** 서드파티 플러그인·소재 마켓 투명 정산 (제작자 70% / 플랫폼 30%, PG 수수료는 플랫폼 30% 내부 부담). */
export function calculateMarketplaceSettlement(input: MarketplaceSettlementInput): MarketplaceSettlementResult {
  const errors: string[] = [];
  const pgRate = input.pgFeeRateWithinPlatformShare ?? 0.032;

  if (!Number.isInteger(input.unitPriceKrw) || input.unitPriceKrw < 0) {
    errors.push("판매 단가는 0원 이상의 정수여야 합니다.");
  }
  if (!Number.isInteger(input.grossSalesCount) || input.grossSalesCount < 0) {
    errors.push("총 판매 건수는 0 이상의 정수여야 합니다.");
  }
  if (!Number.isInteger(input.refundCount) || input.refundCount < 0) {
    errors.push("환불 건수는 0 이상의 정수여야 합니다.");
  }
  if (input.refundCount > input.grossSalesCount) {
    errors.push("환불 건수가 총 판매 건수를 초과할 수 없습니다.");
  }
  if (!Number.isFinite(pgRate) || pgRate < 0 || pgRate > PLATFORM_MARKET_FEE_RATE) {
    errors.push("결제 대행 수수료율은 0%에서 30% 사이여야 합니다.");
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      isFreeListing: false,
      netSalesCount: 0,
      grossRevenueKrw: 0,
      refundedRevenueKrw: 0,
      netRevenueKrw: 0,
      creatorShareRate: CREATOR_MARKET_REVENUE_SHARE,
      platformFeeRate: PLATFORM_MARKET_FEE_RATE,
      creatorPayoutKrw: 0,
      platformGrossShareKrw: 0,
      estimatedPgFeeKrw: 0,
      platformNetMarginKrw: 0,
    };
  }

  const netSalesCount = input.grossSalesCount - input.refundCount;
  const grossRevenueKrw = input.grossSalesCount * input.unitPriceKrw;
  const refundedRevenueKrw = input.refundCount * input.unitPriceKrw;
  const netRevenueKrw = netSalesCount * input.unitPriceKrw;
  const creatorPayoutKrw = Math.round(netRevenueKrw * CREATOR_MARKET_REVENUE_SHARE);
  const platformGrossShareKrw = netRevenueKrw - creatorPayoutKrw;
  const estimatedPgFeeKrw = Math.round(netRevenueKrw * pgRate);
  const platformNetMarginKrw = platformGrossShareKrw - estimatedPgFeeKrw;

  return {
    valid: true,
    errors: [],
    isFreeListing: input.unitPriceKrw === 0,
    netSalesCount,
    grossRevenueKrw,
    refundedRevenueKrw,
    netRevenueKrw,
    creatorShareRate: CREATOR_MARKET_REVENUE_SHARE,
    platformFeeRate: PLATFORM_MARKET_FEE_RATE,
    creatorPayoutKrw,
    platformGrossShareKrw,
    estimatedPgFeeKrw,
    platformNetMarginKrw,
  };
}

export const SAMPLE_PLUGIN_MANIFESTS: readonly PluginManifestInput[] = Object.freeze([
  {
    id: "kr.atelier.halftone-screentone",
    name: "아틀리에 클래식 스크린톤 팩",
    authorId: "creator-minji",
    authorName: "김민지 톤 공방",
    category: "material-pack",
    version: "1.4.2",
    sdkApiVersion: "^2.1.0",
    entryModule: "dist/screentone-pack.mjs",
    requestedScopes: ["asset.insert", "material.publish"],
  },
  {
    id: "kr.toonflow.naver-slice-preflight",
    name: "연재 플랫폼 규격 내보내기 검사기",
    authorId: "creator-junho",
    authorName: "박준호 도구실",
    category: "export-adapter",
    version: "2.0.0",
    sdkApiVersion: "^2.4.0",
    entryModule: "dist/slice-preflight.mjs",
    requestedScopes: ["canvas.read", "export.hook"],
  },
  {
    id: "io.untrusted.remote-scraper",
    name: "미검증 외부 원고 동기화(위험 샘플)",
    authorId: "ext-unknown",
    authorName: "외부 미검증 배포자",
    category: "workflow-tool",
    version: "0.9.1",
    sdkApiVersion: "^2.2.0",
    entryModule: "dist/sync-bridge.mjs",
    requestedScopes: ["canvas.read", "network.external", "auth.session"],
  },
]);
