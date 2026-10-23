import type {
  AssetRequirement,
  ProductionProjectAggregate,
  ProductionRoleType,
  ProductionTask,
} from "@toonstudio/core/production";

/**
 * 공유 자원 우선순위 규칙과 라이선스 자동 검사.
 *
 * 배경: 배경팀·채색팀 같은 공유 인력 풀과 공용 에셋은 여러 작품이 동시에
 * 끌어다 쓴다. 지금까지는 작품별로만 보여서 "어느 작품 작업부터 처리해야
 * 하는지"와 "이 에셋을 다른 작품에 나눠 써도 되는지"를 사람이 기억에
 * 의존해 판단했다. 이 모듈은 그 두 판단을 명문화된 규칙으로 고정한다.
 *
 * 근거(체크리스트 항목): Qvisten Animation의 Qube! 도입 사례
 * (https://www.4rfv.com/CWOO6KEMZDKT/qube-rewires-render-pipeline-at-scandinavias-biggest-animation-studio.htm)
 * — 렌더 잡의 우선순위를 자동 판별하고 라이선스를 인식해 배분하는 방식.
 * 여기서는 렌더 잡 대신 제작 작업·에셋 배분에 같은 원리를 적용한다:
 * 마감·공정 단계 기반 우선순위 점수와, 사용·배분 시점의 라이선스 자동 검사.
 * 라이선스 상업성 섹션(라이선스 감사)의 원칙 — 상업 이용 불가·불명확한
 * 자산은 배분하지 않는다 — 을 검사 규칙의 차단 조건으로 그대로 잇는다.
 *
 * 정직성 규칙:
 * - 견적이 없는 작업은 0시간으로 지어내지 않고 unknownEstimate로 따로 센다.
 * - 자원 달력이 없는 사람은 기본 용량(40h)을 쓰되 capacitySource로 구분한다.
 *   같은 사람이 여러 작품에 배정돼도 용량은 작품 수만큼 불리지 않는다
 *   (사람의 한 주는 하나다 — 달력 중 가장 큰 weeklyHours를 그 사람의 용량으로 본다).
 * - 라이선스 메타데이터가 없는 에셋은 "검사 통과"가 아니라 차단이다.
 *   모르는 것을 허용으로 지어내지 않는다.
 * - 모든 정렬은 결정적이다(점수 → 마감 → id 코드포인트). localeCompare를 쓰지 않는다.
 */

/** 부하 집계 창(일). 마감 지난 작업은 창과 무관하게 항상 포함한다. */
export const SHARED_RESOURCE_HORIZON_DAYS = 14;
/** 자원 달력이 없을 때 쓰는 기본 주간 용량(시간). */
export const SHARED_RESOURCE_DEFAULT_WEEKLY_CAPACITY_HOURS = 40;
/** 부하율이 이 값 이상이면 '여유 없음', 1을 넘으면 '과부하'. */
export const SHARED_RESOURCE_TIGHT_LOAD_RATIO = 0.85;
/** 라이선스 만료가 이 일수 이내면 경고한다. */
export const LICENSE_EXPIRY_WARNING_DAYS = 30;

const CLOSED_TASK_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "approved",
  "done",
  "cancelled",
  "out-of-scope",
]);

/** 아직 시작 전이라 다른 사람에게 넘길 수 있는 상태. 진행 중·검수 중은 제외한다. */
const MOVABLE_TASK_STATUSES: ReadonlySet<ProductionTask["status"]> = new Set([
  "draft",
  "needs-input",
  "ready",
]);

// ---------------------------------------------------------------------------
// 우선순위 규칙 (명문화)
// ---------------------------------------------------------------------------

/**
 * 우선순위 점수 규칙 v1. 점수는 0~100으로 접고, 근거 코드를 함께 남겨
 * 화면이 "왜 이 작업이 먼저인지"를 그대로 설명할 수 있게 한다.
 *
 * - 마감 경과: +40 (가장 무겁다 — 이미 늦은 공유 작업은 다른 작품까지 늦춘다)
 * - 마감 48시간 이내: +30 / 7일 이내: +15
 * - 공정 단계: 워크플로 단계가 뒤일수록(게시 직전일수록) 단계당 비례해 최대 +15.
 *   프로필이 없으면 단계 점수는 0이고 stageKnown=false로 구분한다.
 * - 명시 우선순위: urgent +20 / high +10 / normal 0 / low −5 / 미지정 0
 * - 막힌 후행 작업: 이 작업을 기다리는 열린 후행 작업 1건당 +5, 최대 +15
 * - 작업 자체가 blocked 상태: +10 (공유 자원이 막혀 있으면 풀 전체가 멈춘다)
 */
export const SHARED_RESOURCE_PRIORITY_POLICY = Object.freeze({
  version: 1 as const,
  overduePoints: 40,
  dueWithin48hPoints: 30,
  dueWithin7dPoints: 15,
  maxStagePoints: 15,
  explicitPoints: Object.freeze({
    urgent: 20,
    high: 10,
    normal: 0,
    low: -5,
  }) as Readonly<Record<NonNullable<ProductionTask["priority"]>, number>>,
  downstreamBlockedPointsPerTask: 5,
  downstreamBlockedMaxPoints: 15,
  blockedTaskPoints: 10,
});

export type SharedPriorityBand = "P0" | "P1" | "P2" | "P3";

export const SHARED_PRIORITY_BAND_LABELS: Readonly<
  Record<SharedPriorityBand, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  P0: { ko: "P0 · 즉시", en: "P0 · Now" },
  P1: { ko: "P1 · 우선", en: "P1 · High" },
  P2: { ko: "P2 · 보통", en: "P2 · Normal" },
  P3: { ko: "P3 · 여유", en: "P3 · Low" },
});

export type SharedPriorityReasonCode =
  | "overdue"
  | "due-within-48h"
  | "due-within-7d"
  | "late-stage"
  | "explicit-urgent"
  | "explicit-high"
  | "explicit-low"
  | "downstream-waiting"
  | "task-blocked";

export const SHARED_PRIORITY_REASON_LABELS: Readonly<
  Record<SharedPriorityReasonCode, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  overdue: { ko: "마감 지남", en: "Overdue" },
  "due-within-48h": { ko: "마감 48시간 이내", en: "Due within 48h" },
  "due-within-7d": { ko: "마감 7일 이내", en: "Due within 7 days" },
  "late-stage": { ko: "후반 공정", en: "Late process stage" },
  "explicit-urgent": { ko: "긴급 지정", en: "Marked urgent" },
  "explicit-high": { ko: "높음 지정", en: "Marked high" },
  "explicit-low": { ko: "낮음 지정", en: "Marked low" },
  "downstream-waiting": { ko: "기다리는 후행 작업 있음", en: "Downstream work is waiting" },
  "task-blocked": { ko: "막힌 작업", en: "Blocked" },
});

export interface SharedPriorityScore {
  readonly score: number;
  readonly band: SharedPriorityBand;
  readonly reasons: readonly SharedPriorityReasonCode[];
  /** 워크플로 프로필이 없어 단계 점수를 매기지 못했으면 false. */
  readonly stageKnown: boolean;
}

function priorityBand(score: number): SharedPriorityBand {
  if (score >= 70) return "P0";
  if (score >= 45) return "P1";
  if (score >= 20) return "P2";
  return "P3";
}

const HOUR_MS = 60 * 60 * 1000;

function parseTime(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 작업 하나의 우선순위를 채점한다. downstreamWaitingCount는 이 작업을
 * dependencyTaskIds에 넣고 아직 닫히지 않은 작업 수(호출자가 집계해 넘긴다).
 */
export function scoreSharedTaskPriority(input: {
  readonly task: ProductionTask;
  readonly workflowStepIndex: number | null;
  readonly workflowStepCount: number;
  readonly downstreamWaitingCount: number;
  readonly now: Date;
}): SharedPriorityScore {
  const policy = SHARED_RESOURCE_PRIORITY_POLICY;
  const { task, now } = input;
  const reasons: SharedPriorityReasonCode[] = [];
  let score = 0;

  const dueMs = parseTime(task.dueAt);
  const nowMs = now.getTime();
  if (dueMs !== null) {
    if (dueMs < nowMs && !CLOSED_TASK_STATUSES.has(task.status)) {
      score += policy.overduePoints;
      reasons.push("overdue");
    } else if (dueMs - nowMs <= 48 * HOUR_MS) {
      score += policy.dueWithin48hPoints;
      reasons.push("due-within-48h");
    } else if (dueMs - nowMs <= 7 * 24 * HOUR_MS) {
      score += policy.dueWithin7dPoints;
      reasons.push("due-within-7d");
    }
  }

  const stageKnown = input.workflowStepIndex !== null && input.workflowStepCount > 1;
  if (stageKnown && input.workflowStepIndex !== null) {
    const stagePoints = Math.round(
      (policy.maxStagePoints * input.workflowStepIndex) / (input.workflowStepCount - 1),
    );
    score += stagePoints;
    if (stagePoints >= 10) reasons.push("late-stage");
  }

  if (task.priority) {
    score += policy.explicitPoints[task.priority];
    if (task.priority === "urgent") reasons.push("explicit-urgent");
    if (task.priority === "high") reasons.push("explicit-high");
    if (task.priority === "low") reasons.push("explicit-low");
  }

  if (input.downstreamWaitingCount > 0) {
    score += Math.min(
      policy.downstreamBlockedMaxPoints,
      policy.downstreamBlockedPointsPerTask * input.downstreamWaitingCount,
    );
    reasons.push("downstream-waiting");
  }

  if (task.status === "blocked") {
    score += policy.blockedTaskPoints;
    reasons.push("task-blocked");
  }

  const clamped = Math.max(0, Math.min(100, score));
  return { score: clamped, band: priorityBand(clamped), reasons, stageKnown };
}

// ---------------------------------------------------------------------------
// 라이선스 메타데이터와 자동 검사
// ---------------------------------------------------------------------------

export type AssetLicenseUse =
  | "internal-production"
  | "cross-project-share"
  | "publication"
  | "merchandise"
  | "adaptation";

export const ASSET_LICENSE_USE_LABELS: Readonly<
  Record<AssetLicenseUse, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  "internal-production": { ko: "작품 내부 제작", en: "Internal production" },
  "cross-project-share": { ko: "다른 작품과 공유", en: "Share across projects" },
  publication: { ko: "게시·출판", en: "Publication" },
  merchandise: { ko: "굿즈", en: "Merchandise" },
  adaptation: { ko: "영상화 등 2차 이용", en: "Adaptation" },
});

/**
 * 자산 메타데이터에 넣는 라이선스·사용 조건. StudioAsset.rights
 * (licenseId·attributionRequired·rightsConfirmed)와 RightsInterest의
 * 기간 개념을 배분 판정에 쓸 수 있는 형태로 모은 계약이다.
 * 모르는 값은 지어내지 않고 "unknown"으로 남긴다 — 검사가 그 값을 보고 판단한다.
 */
export interface AssetLicenseMetadata {
  readonly assetId: string;
  readonly title: string;
  /** 예: "CC0-1.0", "CC-BY-4.0", "CC-BY-NC-4.0", "proprietary". 모르면 "unknown". */
  readonly licenseId: string;
  readonly commercialUse: "allowed" | "forbidden" | "unknown";
  readonly redistribution: "allowed" | "forbidden" | "unknown";
  /** 사용할 수 있는 작품 id. null이면 작품 제한 없음. 빈 배열은 어느 작품도 불가. */
  readonly allowedProjectIds: readonly string[] | null;
  /** 허용 용도. null이면 용도 제한 없음(다른 조건이 판단한다). */
  readonly allowedUses: readonly AssetLicenseUse[] | null;
  readonly expiresAt: string | null;
  readonly attributionRequired: boolean | null;
  /** 권리 확인이 끝났는지. false면 어떤 배분도 차단한다. */
  readonly rightsConfirmed: boolean;
}

export interface AssetLicenseCheckContext {
  readonly projectId: string;
  readonly use: AssetLicenseUse;
  /** ToonStudio는 상업 운영 전제다. 비상업 맥락에서만 false로 넘긴다. */
  readonly commercialContext: boolean;
  readonly at: Date;
}

export type AssetLicenseIssueCode =
  | "metadata-missing"
  | "rights-unconfirmed"
  | "license-unknown"
  | "noncommercial-license"
  | "commercial-unknown"
  | "redistribution-forbidden"
  | "redistribution-unknown"
  | "project-not-licensed"
  | "use-not-licensed"
  | "license-expired"
  | "license-expiring-soon"
  | "attribution-required"
  | "attribution-unknown";

export interface AssetLicenseIssue {
  readonly code: AssetLicenseIssueCode;
  readonly severity: "blocker" | "warning";
  /** D4 구조화 방출: 표시 문구 대신 params만 싣는다. 해석은 표시 지점의 license 리졸버가 한다. */
  readonly params?: Readonly<Record<string, string>>;
}

export interface AssetLicenseCheckResult {
  readonly assetId: string;
  readonly title: string;
  readonly verdict: "allow" | "warn" | "block";
  readonly issues: readonly AssetLicenseIssue[];
}

/**
 * 사용·배분 시점의 라이선스 자동 검사. metadata가 null이면 차단이다
 * (메타데이터 없는 에셋은 공유·게시 배분 대상이 될 수 없다).
 * 차단 조건: 권리 미확인 / 비상업 라이선스의 상업 사용 / 재배포 금지인데
 * 공유하려 함 / 허용 작품 아님 / 허용 용도 아님 / 만료 / (공유·게시 용도에서)
 * 라이선스 자체를 모름. 경고: 만료 임박 / 출처표기 필요·불명 / 상업·재배포
 * 가능 여부가 불명인 채 내부 제작에만 쓰는 경우.
 */
export function checkAssetLicense(
  metadata: AssetLicenseMetadata | null,
  context: AssetLicenseCheckContext,
  fallback: { readonly assetId: string; readonly title: string },
): AssetLicenseCheckResult {
  const issues: AssetLicenseIssue[] = [];
  const block = (code: AssetLicenseIssueCode, params?: Readonly<Record<string, string>>) =>
    issues.push({ code, severity: "blocker", ...(params ? { params } : {}) });
  const warn = (code: AssetLicenseIssueCode, params?: Readonly<Record<string, string>>) =>
    issues.push({ code, severity: "warning", ...(params ? { params } : {}) });

  if (!metadata) {
    block("metadata-missing");
    return { assetId: fallback.assetId, title: fallback.title, verdict: "block", issues };
  }

  if (!metadata.rightsConfirmed) {
    block("rights-unconfirmed");
  }

  const licenseId = metadata.licenseId.trim();
  if (!licenseId || licenseId.toLowerCase() === "unknown") {
    if (context.use === "cross-project-share" || context.use === "publication") {
      block("license-unknown");
    } else {
      warn("license-unknown");
    }
  }

  if (context.commercialContext) {
    if (metadata.commercialUse === "forbidden") {
      block("noncommercial-license");
    } else if (metadata.commercialUse === "unknown") {
      warn("commercial-unknown");
    }
  }

  if (context.use === "cross-project-share") {
    if (metadata.redistribution === "forbidden") {
      block("redistribution-forbidden");
    } else if (metadata.redistribution === "unknown") {
      warn("redistribution-unknown");
    }
  }

  if (metadata.allowedProjectIds !== null && !metadata.allowedProjectIds.includes(context.projectId)) {
    block("project-not-licensed");
  }

  if (metadata.allowedUses !== null && !metadata.allowedUses.includes(context.use)) {
    // 용도는 라벨 문구가 아니라 용도 코드를 params로 싣는다 — 표시 지점이 용도 사전으로 해석한다.
    block("use-not-licensed", { usage: context.use });
  }

  const expiresMs = parseTime(metadata.expiresAt);
  if (expiresMs !== null) {
    const atMs = context.at.getTime();
    if (expiresMs <= atMs) {
      block("license-expired");
    } else if (expiresMs - atMs <= LICENSE_EXPIRY_WARNING_DAYS * 24 * HOUR_MS) {
      warn("license-expiring-soon", { days: String(LICENSE_EXPIRY_WARNING_DAYS) });
    }
  }

  if (metadata.attributionRequired === true) {
    warn("attribution-required");
  } else if (metadata.attributionRequired === null) {
    warn("attribution-unknown");
  }

  const verdict = issues.some((issue) => issue.severity === "blocker")
    ? "block"
    : issues.length > 0
      ? "warn"
      : "allow";
  return { assetId: metadata.assetId, title: metadata.title, verdict, issues };
}

/** 배분 요청 하나. 화면·서버가 "이 에셋을 이 작품에 이 용도로" 시도할 때 만든다. */
export interface AssetAllocationRequest {
  readonly assetId: string;
  readonly title: string;
  readonly projectId: string;
  readonly use: AssetLicenseUse;
}

export interface AssetAllocationDecision extends AssetLicenseCheckResult {
  readonly projectId: string;
  readonly use: AssetLicenseUse;
  /** verdict가 block이 아닌 경우에만 true. 경고는 사람이 확인하고 진행할 수 있다. */
  readonly allocatable: boolean;
}

/** 배분 시점 게이트: 요청 묶음을 한 번에 검사해 허용/차단을 가른다. */
export function evaluateAssetAllocations(input: {
  readonly licenses: readonly AssetLicenseMetadata[];
  readonly requests: readonly AssetAllocationRequest[];
  readonly commercialContext?: boolean;
  readonly at: Date;
}): readonly AssetAllocationDecision[] {
  const byId = new Map(input.licenses.map((license) => [license.assetId, license]));
  return input.requests.map((request) => {
    const result = checkAssetLicense(
      byId.get(request.assetId) ?? null,
      {
        projectId: request.projectId,
        use: request.use,
        commercialContext: input.commercialContext ?? true,
        at: input.at,
      },
      { assetId: request.assetId, title: request.title },
    );
    return {
      ...result,
      projectId: request.projectId,
      use: request.use,
      allocatable: result.verdict !== "block",
    };
  });
}

/**
 * AssetRequirement에서 배분 검사용 메타데이터를 잇는 어댑터.
 * 요구사항 자체에는 구조화된 라이선스가 없어, 등록된 메타데이터가 없으면
 * null을 돌려준다 — 검사가 metadata-missing 차단으로 정직하게 떨어진다.
 * sourcing이 "existing"(기존 에셋 재사용)이면 공유 용도로, 아니면 내부 제작으로 본다.
 */
export function licenseUseForRequirement(requirement: AssetRequirement): AssetLicenseUse {
  return requirement.sourcing === "existing" ? "cross-project-share" : "internal-production";
}

// ---------------------------------------------------------------------------
// 부하 통합 뷰 + 우선순위 큐 + 배분 제안
// ---------------------------------------------------------------------------

export interface SharedResourcePoolLoad {
  readonly roleType: ProductionRoleType;
  readonly memberPartyIds: readonly string[];
  readonly memberCount: number;
  /** 집계 창 안 열린 작업 수 (담당 유무 무관, 이 역할이 필요한 작업). */
  readonly openTaskCount: number;
  readonly loadHours: number;
  readonly capacityHours: number;
  readonly capacitySource: "calendar" | "default" | "mixed";
  readonly loadRatio: number;
  readonly state: "over" | "tight" | "ok" | "idle";
  readonly overdueCount: number;
  readonly unknownEstimateCount: number;
}

export interface SharedPersonLoad {
  readonly partyId: string;
  readonly displayName: string;
  readonly roleTypes: readonly ProductionRoleType[];
  readonly projectIds: readonly string[];
  readonly openTaskCount: number;
  readonly loadHours: number;
  readonly capacityHours: number;
  readonly capacitySource: "calendar" | "default";
  readonly loadRatio: number;
  readonly state: "over" | "tight" | "ok";
  readonly overdueCount: number;
}

export interface SharedPriorityQueueEntry {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly processKey: string;
  readonly requiredRole: ProductionRoleType | null;
  readonly status: ProductionTask["status"];
  readonly dueAt: string | null;
  readonly assigneePartyIds: readonly string[];
  readonly assigneeNames: readonly string[];
  readonly remainingHours: number | null;
  readonly score: SharedPriorityScore;
  /** 이 작업이 필요로 하는 에셋 요구 중 라이선스 차단이 있으면 true. */
  readonly licenseBlocked: boolean;
  readonly licenseBlockedAssetIds: readonly string[];
}

export interface SharedAllocationSuggestion {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly toPartyId: string;
  readonly toName: string;
  readonly roleType: ProductionRoleType;
  readonly hours: number | null;
  readonly reason: "unassigned" | "pool-overload";
  readonly priorityBand: SharedPriorityBand;
}

export interface SharedResourceBoard {
  readonly horizonStartAt: string;
  readonly horizonEndAt: string;
  readonly pools: readonly SharedResourcePoolLoad[];
  readonly people: readonly SharedPersonLoad[];
  readonly queue: readonly SharedPriorityQueueEntry[];
  /** 작품별 열린 에셋 요구에 대한 자동 검사 결과 (차단 → 경고 → 허용 순). */
  readonly assetChecks: readonly (AssetLicenseCheckResult & {
    readonly projectId: string;
    readonly use: AssetLicenseUse;
    readonly requirementId: string;
  })[];
  readonly blockedAssetCount: number;
  readonly suggestions: readonly SharedAllocationSuggestion[];
  readonly unknownEstimateCount: number;
}

function compareCodePoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function remainingHoursOf(task: ProductionTask): number | null {
  if (typeof task.remainingEstimateHours === "number") return task.remainingEstimateHours;
  return task.estimateHours ? task.estimateHours.likely : null;
}

interface PersonAccumulator {
  partyId: string;
  displayName: string;
  roleTypes: Set<ProductionRoleType>;
  projectIds: Set<string>;
  openTaskCount: number;
  loadHours: number;
  capacityHours: number;
  hasCalendar: boolean;
  overdueCount: number;
}

interface PoolAccumulator {
  roleType: ProductionRoleType;
  memberPartyIds: Set<string>;
  openTaskCount: number;
  loadHours: number;
  overdueCount: number;
  unknownEstimateCount: number;
}

/**
 * 부하 통합 뷰를 만든다. 인력 부하는 "사람"과 "역할 풀" 두 축으로 집계하고,
 * 우선순위 큐는 전 작품의 열린 작업을 하나의 순서로 정렬한다.
 * 에셋 검사는 작품별 열린 AssetRequirement 전부에 대해 자동 실행한다:
 * 요구 작품·용도(재사용이면 공유) 기준으로 판정하고, 라이선스 차단된
 * 에셋이 필요한 작업은 큐에서 licenseBlocked로 표시해 배분 제안에서 뺀다.
 */
export function buildSharedResourceBoard(
  aggregates: readonly ProductionProjectAggregate[],
  options: {
    readonly now: Date;
    readonly licenses?: readonly AssetLicenseMetadata[];
    readonly commercialContext?: boolean;
    readonly horizonDays?: number;
  },
): SharedResourceBoard {
  const now = options.now;
  const nowMs = now.getTime();
  const horizonDays = options.horizonDays ?? SHARED_RESOURCE_HORIZON_DAYS;
  const horizonEndMs = nowMs + horizonDays * 24 * HOUR_MS;
  const licenses = options.licenses ?? [];
  const licenseById = new Map(licenses.map((license) => [license.assetId, license]));

  // --- 에셋 자동 검사 (작품별 열린 요구 전수) ---
  const assetChecks: (AssetLicenseCheckResult & {
    projectId: string;
    use: AssetLicenseUse;
    requirementId: string;
  })[] = [];
  /** projectId → 차단된 requirement id 집합. 큐의 licenseBlocked 표시에 쓴다. */
  const blockedRequirementIdsByProject = new Map<string, Set<string>>();
  for (const aggregate of aggregates) {
    for (const requirement of aggregate.assetRequirements) {
      if (requirement.status === "cancelled") continue;
      const use = licenseUseForRequirement(requirement);
      const result = checkAssetLicense(
        licenseById.get(requirement.id) ?? null,
        {
          projectId: aggregate.projectId,
          use,
          commercialContext: options.commercialContext ?? true,
          at: now,
        },
        { assetId: requirement.id, title: requirement.title },
      );
      assetChecks.push({ ...result, projectId: aggregate.projectId, use, requirementId: requirement.id });
      if (result.verdict === "block") {
        const set = blockedRequirementIdsByProject.get(aggregate.projectId) ?? new Set<string>();
        set.add(requirement.id);
        blockedRequirementIdsByProject.set(aggregate.projectId, set);
      }
    }
  }
  const verdictRank = { block: 0, warn: 1, allow: 2 } as const;
  assetChecks.sort(
    (a, b) =>
      verdictRank[a.verdict] - verdictRank[b.verdict] ||
      compareCodePoint(a.projectId, b.projectId) ||
      compareCodePoint(a.assetId, b.assetId),
  );

  // --- 사람·풀·큐 집계 ---
  const people = new Map<string, PersonAccumulator>();
  const pools = new Map<ProductionRoleType, PoolAccumulator>();
  const queue: SharedPriorityQueueEntry[] = [];
  let unknownEstimateCount = 0;

  const ensurePool = (roleType: ProductionRoleType): PoolAccumulator => {
    const existing = pools.get(roleType);
    if (existing) return existing;
    const created: PoolAccumulator = {
      roleType,
      memberPartyIds: new Set(),
      openTaskCount: 0,
      loadHours: 0,
      overdueCount: 0,
      unknownEstimateCount: 0,
    };
    pools.set(roleType, created);
    return created;
  };

  for (const aggregate of aggregates) {
    const partyNameById = new Map(aggregate.parties.map((party) => [party.id, party.publicDisplayName]));
    const assignmentById = new Map(aggregate.assignments.map((assignment) => [assignment.id, assignment]));
    const stepIndexByKey = new Map(
      (aggregate.workflowProfile?.steps ?? []).map((step, index) => [step.key, index] as const),
    );
    const stepCount = aggregate.workflowProfile?.steps.length ?? 0;
    const requiredRoleByProcess = new Map(
      (aggregate.workflowProfile?.steps ?? []).map((step) => [step.key, step.defaultRole] as const),
    );

    // 후행 대기 수: 닫히지 않은 작업의 dependencyTaskIds를 센다.
    const downstreamWaiting = new Map<string, number>();
    for (const task of aggregate.tasks) {
      if (CLOSED_TASK_STATUSES.has(task.status)) continue;
      for (const dependencyId of task.dependencyTaskIds) {
        downstreamWaiting.set(dependencyId, (downstreamWaiting.get(dependencyId) ?? 0) + 1);
      }
    }

    // 사람 용량: 배정별 달력 중 가장 큰 weeklyHours (작품 수로 불리지 않는다).
    const capacityByParty = new Map<string, { hours: number; hasCalendar: boolean }>();
    for (const calendar of aggregate.resourceCalendars ?? []) {
      const assignment = assignmentById.get(calendar.assignmentId);
      if (!assignment) continue;
      const current = capacityByParty.get(assignment.partyId) ?? { hours: 0, hasCalendar: false };
      capacityByParty.set(assignment.partyId, {
        hours: Math.max(current.hours, calendar.weeklyHours),
        hasCalendar: true,
      });
    }
    for (const assignment of aggregate.assignments) {
      if (assignment.status === "ended") continue;
      const capacity = capacityByParty.get(assignment.partyId);
      const existing = people.get(assignment.partyId);
      const base: PersonAccumulator = existing ?? {
        partyId: assignment.partyId,
        displayName: partyNameById.get(assignment.partyId) ?? assignment.partyId,
        roleTypes: new Set(),
        projectIds: new Set(),
        openTaskCount: 0,
        loadHours: 0,
        capacityHours: 0,
        hasCalendar: false,
        overdueCount: 0,
      };
      base.roleTypes.add(assignment.roleType);
      base.projectIds.add(aggregate.projectId);
      if (capacity?.hasCalendar) {
        base.capacityHours = Math.max(base.capacityHours, capacity.hours);
        base.hasCalendar = true;
      }
      people.set(assignment.partyId, base);
      ensurePool(assignment.roleType).memberPartyIds.add(assignment.partyId);
    }

    const blockedRequirements = blockedRequirementIdsByProject.get(aggregate.projectId);
    // 작업 ↔ 에셋 요구 연결: 같은 작품의 컷 계획이 요구를 참조하면 그 작업 범위와 잇는다.
    const requirementIdsByScopeId = new Map<string, Set<string>>();
    for (const cut of aggregate.cutPlans) {
      for (const requirementId of cut.assetRequirementIds) {
        const set = requirementIdsByScopeId.get(cut.cutId) ?? new Set<string>();
        set.add(requirementId);
        requirementIdsByScopeId.set(cut.cutId, set);
      }
    }

    for (const task of aggregate.tasks) {
      if (CLOSED_TASK_STATUSES.has(task.status)) continue;
      const dueMs = parseTime(task.dueAt);
      const overdue = dueMs !== null && dueMs < nowMs;
      const inHorizon = overdue || dueMs === null || dueMs <= horizonEndMs;
      const remaining = remainingHoursOf(task);
      const requiredRole = requiredRoleByProcess.get(task.processKey) ?? null;
      const assigneePartyIds: string[] = [];
      const assigneeNames: string[] = [];
      for (const assignmentId of task.assignmentIds) {
        const assignment = assignmentById.get(assignmentId);
        if (!assignment) continue;
        assigneePartyIds.push(assignment.partyId);
        assigneeNames.push(partyNameById.get(assignment.partyId) ?? assignment.partyId);
      }

      const linkedRequirementIds = requirementIdsByScopeId.get(task.scope.id) ?? new Set<string>();
      const licenseBlockedAssetIds = [...linkedRequirementIds].filter((id) =>
        blockedRequirements?.has(id),
      );

      queue.push({
        taskId: task.id,
        taskTitle: task.title,
        projectId: aggregate.projectId,
        projectTitle: aggregate.title,
        processKey: task.processKey,
        requiredRole,
        status: task.status,
        dueAt: task.dueAt,
        assigneePartyIds,
        assigneeNames,
        remainingHours: remaining,
        score: scoreSharedTaskPriority({
          task,
          workflowStepIndex: stepIndexByKey.get(task.processKey) ?? null,
          workflowStepCount: stepCount,
          downstreamWaitingCount: downstreamWaiting.get(task.id) ?? 0,
          now,
        }),
        licenseBlocked: licenseBlockedAssetIds.length > 0,
        licenseBlockedAssetIds,
      });

      if (!inHorizon) continue;
      if (remaining === null) unknownEstimateCount += 1;
      const shareCount = Math.max(1, assigneePartyIds.length);
      const sharedHours = remaining === null ? 0 : remaining / shareCount;

      if (requiredRole) {
        const pool = ensurePool(requiredRole);
        pool.openTaskCount += 1;
        pool.loadHours += remaining ?? 0;
        if (overdue) pool.overdueCount += 1;
        if (remaining === null) pool.unknownEstimateCount += 1;
      }
      for (const partyId of assigneePartyIds) {
        const person = people.get(partyId);
        if (!person) continue;
        person.openTaskCount += 1;
        person.loadHours += sharedHours;
        if (overdue) person.overdueCount += 1;
      }
    }
  }

  queue.sort((a, b) => {
    if (b.score.score !== a.score.score) return b.score.score - a.score.score;
    const dueA = parseTime(a.dueAt);
    const dueB = parseTime(b.dueAt);
    if (dueA !== dueB) {
      if (dueA === null) return 1;
      if (dueB === null) return -1;
      return dueA - dueB;
    }
    return compareCodePoint(a.taskId, b.taskId);
  });

  const personLoads: SharedPersonLoad[] = [...people.values()]
    .map((person) => {
      const capacityHours = person.hasCalendar
        ? person.capacityHours
        : SHARED_RESOURCE_DEFAULT_WEEKLY_CAPACITY_HOURS;
      // 부하는 horizon(기본 14일=2주) 창 기준이라 용량도 같은 창으로 환산한다.
      const windowCapacity = capacityHours * (horizonDays / 7);
      const loadRatio = windowCapacity > 0 ? person.loadHours / windowCapacity : 0;
      return {
        partyId: person.partyId,
        displayName: person.displayName,
        roleTypes: [...person.roleTypes].sort(compareCodePoint),
        projectIds: [...person.projectIds].sort(compareCodePoint),
        openTaskCount: person.openTaskCount,
        loadHours: Math.round(person.loadHours * 10) / 10,
        capacityHours: windowCapacity,
        capacitySource: person.hasCalendar ? ("calendar" as const) : ("default" as const),
        loadRatio: Math.round(loadRatio * 1000) / 1000,
        state: loadRatio > 1 ? ("over" as const) : loadRatio >= SHARED_RESOURCE_TIGHT_LOAD_RATIO ? ("tight" as const) : ("ok" as const),
        overdueCount: person.overdueCount,
      };
    })
    .sort((a, b) => b.loadRatio - a.loadRatio || compareCodePoint(a.partyId, b.partyId));

  const personById = new Map(personLoads.map((person) => [person.partyId, person]));
  const poolLoads: SharedResourcePoolLoad[] = [...pools.values()]
    .map((pool) => {
      let capacityHours = 0;
      let calendarMembers = 0;
      for (const partyId of pool.memberPartyIds) {
        const person = personById.get(partyId);
        if (!person) continue;
        capacityHours += person.capacityHours;
        if (person.capacitySource === "calendar") calendarMembers += 1;
      }
      const loadRatio = capacityHours > 0 ? pool.loadHours / capacityHours : 0;
      return {
        roleType: pool.roleType,
        memberPartyIds: [...pool.memberPartyIds].sort(compareCodePoint),
        memberCount: pool.memberPartyIds.size,
        openTaskCount: pool.openTaskCount,
        loadHours: Math.round(pool.loadHours * 10) / 10,
        capacityHours,
        capacitySource:
          pool.memberPartyIds.size === 0 || calendarMembers === 0
            ? ("default" as const)
            : calendarMembers === pool.memberPartyIds.size
              ? ("calendar" as const)
              : ("mixed" as const),
        loadRatio: Math.round(loadRatio * 1000) / 1000,
        state:
          pool.openTaskCount === 0
            ? ("idle" as const)
            : loadRatio > 1
              ? ("over" as const)
              : loadRatio >= SHARED_RESOURCE_TIGHT_LOAD_RATIO
                ? ("tight" as const)
                : ("ok" as const),
        overdueCount: pool.overdueCount,
        unknownEstimateCount: pool.unknownEstimateCount,
      };
    })
    .sort((a, b) => b.loadRatio - a.loadRatio || compareCodePoint(a.roleType, b.roleType));

  // --- 배분 제안: 우선순위 높은 순으로, 미배정·풀 과부하 작업을 여유 있는 사람에게 ---
  // 라이선스 차단 작업은 제안에서 제외한다(권리부터 풀어야 한다).
  // 진행 중·검수 중 작업은 옮기지 않는다(MOVABLE만).
  const suggestions: SharedAllocationSuggestion[] = [];
  const projectedLoad = new Map(personLoads.map((person) => [person.partyId, person.loadHours]));
  const projectedCapacity = new Map(personLoads.map((person) => [person.partyId, person.capacityHours]));
  const overloadedRoles = new Set(
    poolLoads.filter((pool) => pool.state === "over").map((pool) => pool.roleType),
  );
  for (const entry of queue) {
    if (entry.licenseBlocked) continue;
    if (!MOVABLE_TASK_STATUSES.has(entry.status)) continue;
    if (!entry.requiredRole) continue;
    const isUnassigned = entry.assigneePartyIds.length === 0;
    if (!isUnassigned && !overloadedRoles.has(entry.requiredRole)) continue;
    const candidates = personLoads
      .filter((person) => person.roleTypes.includes(entry.requiredRole as ProductionRoleType))
      .filter((person) => !entry.assigneePartyIds.includes(person.partyId))
      .map((person) => ({
        person,
        ratio:
          (projectedCapacity.get(person.partyId) ?? 0) > 0
            ? (projectedLoad.get(person.partyId) ?? 0) / (projectedCapacity.get(person.partyId) ?? 1)
            : 0,
      }))
      .filter((candidate) => candidate.ratio < 1)
      .sort((a, b) => a.ratio - b.ratio || compareCodePoint(a.person.partyId, b.person.partyId));
    const chosen = candidates[0];
    if (!chosen) continue;
    suggestions.push({
      taskId: entry.taskId,
      taskTitle: entry.taskTitle,
      projectId: entry.projectId,
      projectTitle: entry.projectTitle,
      toPartyId: chosen.person.partyId,
      toName: chosen.person.displayName,
      roleType: entry.requiredRole,
      hours: entry.remainingHours,
      reason: isUnassigned ? "unassigned" : "pool-overload",
      priorityBand: entry.score.band,
    });
    if (entry.remainingHours !== null) {
      projectedLoad.set(
        chosen.person.partyId,
        (projectedLoad.get(chosen.person.partyId) ?? 0) + entry.remainingHours,
      );
    }
  }

  return {
    horizonStartAt: now.toISOString(),
    horizonEndAt: new Date(horizonEndMs).toISOString(),
    pools: poolLoads,
    people: personLoads,
    queue,
    assetChecks,
    blockedAssetCount: assetChecks.filter((check) => check.verdict === "block").length,
    suggestions,
    unknownEstimateCount,
  };
}

/** 공유 풀(역할) 표시 이름. 배경팀·채색팀처럼 현장에서 부르는 이름 우선. */
export const SHARED_POOL_ROLE_LABELS: Readonly<
  Record<ProductionRoleType, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  "story-lead": { ko: "스토리 리드", en: "Story lead" },
  writer: { ko: "글작가", en: "Writer" },
  "adaptation-writer": { ko: "각색 작가", en: "Adaptation writer" },
  "storyboard-artist": { ko: "콘티팀", en: "Storyboard team" },
  "art-lead": { ko: "작화 리드", en: "Art lead" },
  "line-artist": { ko: "선화팀", en: "Line art team" },
  colorist: { ko: "채색팀", en: "Color team" },
  "background-artist": { ko: "배경팀", en: "Background team" },
  letterer: { ko: "식자팀", en: "Lettering team" },
  localizer: { ko: "번역·현지화", en: "Localization" },
  editor: { ko: "편집", en: "Editor" },
  producer: { ko: "프로듀서", en: "Producer" },
  "rights-reviewer": { ko: "권리 검수", en: "Rights review" },
  assistant: { ko: "어시스턴트", en: "Assistant" },
  vendor: { ko: "외주", en: "Vendor" },
});
