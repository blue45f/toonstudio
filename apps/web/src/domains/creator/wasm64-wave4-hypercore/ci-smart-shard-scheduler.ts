/**
 * 스마트 CI 변경 파일 의존성 그래프 경로 필터 및 LPT(Longest-Processing-Time) 샤드 부하 분산기.
 *
 * - 변경된 파일 경로로부터 역방향 패키지·도메인 의존성 전파를 계산해 불필요한 중량 워크플로만 건너뜀
 * - `core` 및 `verify` 필수 릴리스 보호 게이트는 문서 전용 변경을 포함한 모든 경우 100% 강제 보존
 * - Graham LPT(`4/3 - 1/(3m)` 근사 보장) 알고리즘으로 러너 샤드 간 완료 시간(Makespan) 편차를 최소화
 */

/** 브랜치 보호 정책상 어떤 경우에도 절대 생략할 수 없는 필수 릴리스 게이트 목록. */
export const MANDATORY_RELEASE_GATES = Object.freeze(["core", "verify"] as const);

export type MandatoryReleaseGateId = (typeof MANDATORY_RELEASE_GATES)[number];

export type CiOptionalWorkflowId =
  | "web-studio-unit"
  | "web-3d-bg3d-e2e"
  | "api-postgres-integration"
  | "cloudflare-static-worker"
  | "cloudflare-realtime-do"
  | "market-playwright-e2e"
  | "rust-wasm64-kernels"
  | "docs-architecture-check";

export type CiWorkflowId = MandatoryReleaseGateId | CiOptionalWorkflowId;

export interface CiWorkflowSpec {
  readonly id: CiWorkflowId;
  readonly mandatory: boolean;
  readonly baselineRunnerMinutes: number;
  readonly dependsOnPackages: readonly string[];
}

export interface CiTestSuiteTiming {
  readonly suiteId: string;
  readonly domainPackage: string;
  readonly estimatedDurationMs: number;
  readonly testCount: number;
}

export interface CiShardBucket {
  readonly shardIndex: number;
  readonly suites: readonly CiTestSuiteTiming[];
  readonly totalDurationMs: number;
  readonly totalTests: number;
}

export interface CiSmartSchedulePlan {
  readonly changedFiles: readonly string[];
  readonly impactedPackages: readonly string[];
  readonly selectedWorkflows: readonly CiWorkflowId[];
  readonly skippedWorkflows: readonly CiOptionalWorkflowId[];
  readonly mandatoryGatesPreserved: true;
  readonly shards: readonly CiShardBucket[];
  readonly makespanMs: number;
  readonly idealLowerBoundMs: number;
  readonly shardImbalanceRatio: number;
  readonly baselineRunnerMinutes: number;
  readonly scheduledRunnerMinutes: number;
  readonly savedRunnerMinutes: number;
  readonly savingsRatioPct: number;
}

/** 모노레포 내부 패키지 정방향 의존성(key가 의존하는 하위 패키지 목록). */
const WORKSPACE_FORWARD_DEPS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "apps/web": ["packages/core", "packages/studio-wasm64", "docs"],
  "apps/admin-web": ["packages/core"],
  "apps/api": ["packages/core"],
  "deploy/cloudflare-static": ["apps/web"],
  "deploy/cloudflare-realtime": ["packages/core"],
  "e2e/market": ["apps/web", "apps/api"],
  "packages/studio-wasm64": [],
  "packages/core": [],
  "scripts/ci-root": [],
  docs: [],
});

export const DEFAULT_CI_WORKFLOW_CATALOG: readonly CiWorkflowSpec[] = Object.freeze([
  { id: "core", mandatory: true, baselineRunnerMinutes: 4.5, dependsOnPackages: ["*"] },
  { id: "verify", mandatory: true, baselineRunnerMinutes: 5.5, dependsOnPackages: ["*"] },
  {
    id: "web-studio-unit",
    mandatory: false,
    baselineRunnerMinutes: 6.0,
    dependsOnPackages: ["apps/web", "packages/core", "packages/studio-wasm64", "scripts/ci-root"],
  },
  {
    id: "web-3d-bg3d-e2e",
    mandatory: false,
    baselineRunnerMinutes: 11.0,
    dependsOnPackages: ["apps/web:3d", "packages/studio-wasm64", "scripts/ci-root"],
  },
  {
    id: "api-postgres-integration",
    mandatory: false,
    baselineRunnerMinutes: 8.5,
    dependsOnPackages: ["apps/api", "packages/core", "scripts/ci-root"],
  },
  {
    id: "cloudflare-static-worker",
    mandatory: false,
    baselineRunnerMinutes: 3.0,
    dependsOnPackages: ["deploy/cloudflare-static", "apps/web", "scripts/ci-root"],
  },
  {
    id: "cloudflare-realtime-do",
    mandatory: false,
    baselineRunnerMinutes: 3.5,
    dependsOnPackages: ["deploy/cloudflare-realtime", "packages/core", "scripts/ci-root"],
  },
  {
    id: "market-playwright-e2e",
    mandatory: false,
    baselineRunnerMinutes: 12.0,
    dependsOnPackages: ["e2e/market", "apps/web:market", "apps/api", "scripts/ci-root"],
  },
  {
    id: "rust-wasm64-kernels",
    mandatory: false,
    baselineRunnerMinutes: 7.0,
    dependsOnPackages: ["packages/studio-wasm64", "scripts/ci-root"],
  },
  {
    id: "docs-architecture-check",
    mandatory: false,
    baselineRunnerMinutes: 1.5,
    dependsOnPackages: ["docs", "apps/web", "apps/api", "scripts/ci-root"],
  },
]);

function normalizeRepoPath(rawPath: string): string {
  let clean = rawPath.trim().replaceAll("\\", "/");
  while (clean.startsWith("./")) clean = clean.slice(2);
  while (clean.startsWith("/")) clean = clean.slice(1);
  return clean;
}

/** 변경 파일 경로 하나를 모노레포 논리 영향 노드 집합으로 분류한다. */
export function classifyChangedFileNode(rawPath: string): readonly string[] {
  const path = normalizeRepoPath(rawPath);
  if (path.length === 0) return [];

  if (
    path === "package.json" ||
    path === "pnpm-lock.yaml" ||
    path === "vitest.config.ts" ||
    path.startsWith("tsconfig") ||
    path.startsWith(".github/workflows/") ||
    path.startsWith("scripts/")
  ) {
    return ["scripts/ci-root"];
  }
  if (path.endsWith(".md") || path.startsWith("docs/")) {
    return ["docs"];
  }
  if (path.startsWith("crates/") || path.startsWith("packages/studio-")) {
    return ["packages/studio-wasm64"];
  }
  if (path.startsWith("packages/")) {
    return ["packages/core"];
  }
  if (path.startsWith("apps/api/")) {
    return ["apps/api"];
  }
  if (path.startsWith("apps/admin-web/")) {
    return ["apps/admin-web"];
  }
  if (path.startsWith("deploy/cloudflare-static/")) {
    return ["deploy/cloudflare-static"];
  }
  if (path.startsWith("deploy/cloudflare-realtime/")) {
    return ["deploy/cloudflare-realtime"];
  }
  if (path.startsWith("e2e/")) {
    return ["e2e/market"];
  }
  if (path.startsWith("apps/web/")) {
    const tags = ["apps/web"];
    if (
      path.includes("/bg3d/") ||
      path.includes("/scene3d/") ||
      path.includes("/vrm/") ||
      path.includes("/character-")
    ) {
      tags.push("apps/web:3d");
    }
    if (path.includes("/market/") || path.includes("/membership/") || path.includes("/billing/")) {
      tags.push("apps/web:market");
    }
    return tags;
  }
  // 미분류 루트 설정 파일은 안전하게 전체 루트 변경으로 간주한다(fail-closed).
  return ["scripts/ci-root"];
}

/** 직접 변경된 패키지로부터 역방향 의존성 그래프를 따라 영향받는 모든 상위 노드를 계산한다. */
export function propagateImpactedPackages(changedFiles: readonly string[]): readonly string[] {
  if (changedFiles.length === 0) {
    return ["scripts/ci-root"];
  }

  const impacted = new Set<string>();
  for (const file of changedFiles) {
    for (const node of classifyChangedFileNode(file)) {
      impacted.add(node);
    }
  }

  if (impacted.has("scripts/ci-root")) {
    for (const pkg of Object.keys(WORKSPACE_FORWARD_DEPS)) {
      impacted.add(pkg);
    }
    impacted.add("apps/web:3d");
    impacted.add("apps/web:market");
    return [...impacted].sort();
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [consumer, deps] of Object.entries(WORKSPACE_FORWARD_DEPS)) {
      if (impacted.has(consumer)) continue;
      // docs 전용 변경은 apps/web 전체 재빌드를 유발하지 않도록 문서 검사 노드로만 한정한다.
      const nonDocDeps = deps.filter((d) => d !== "docs");
      if (nonDocDeps.some((dep) => impacted.has(dep))) {
        impacted.add(consumer);
        changed = true;
      }
    }
  }

  return [...impacted].sort();
}

/**
 * Graham LPT(Longest-Processing-Time-First) 알고리즘으로 테스트 스위트를 `shardCount`개 러너 샤드에 배분한다.
 */
export function balanceSuitesLpt(
  suites: readonly CiTestSuiteTiming[],
  shardCount: number,
): {
  readonly shards: readonly CiShardBucket[];
  readonly makespanMs: number;
  readonly idealLowerBoundMs: number;
  readonly shardImbalanceRatio: number;
} {
  const k = Math.max(1, Math.round(shardCount));
  const mutableShards: {
    readonly shardIndex: number;
    readonly suites: CiTestSuiteTiming[];
    totalDurationMs: number;
    totalTests: number;
  }[] = Array.from({ length: k }, (_, idx) => ({
    shardIndex: idx,
    suites: [],
    totalDurationMs: 0,
    totalTests: 0,
  }));

  const sorted = [...suites].sort((a, b) => {
    const diff = b.estimatedDurationMs - a.estimatedDurationMs;
    return diff !== 0 ? diff : a.suiteId.localeCompare(b.suiteId);
  });

  let totalWorkMs = 0;
  let maxSingleMs = 0;

  for (const suite of sorted) {
    const dur = Math.max(1, suite.estimatedDurationMs);
    totalWorkMs += dur;
    if (dur > maxSingleMs) maxSingleMs = dur;

    let lightest = mutableShards[0]!;
    for (let s = 1; s < k; s += 1) {
      const candidate = mutableShards[s]!;
      if (candidate.totalDurationMs < lightest.totalDurationMs) {
        lightest = candidate;
      }
    }
    lightest.suites.push(suite);
    lightest.totalDurationMs += dur;
    lightest.totalTests += Math.max(1, suite.testCount);
  }

  let makespanMs = 0;
  for (const shard of mutableShards) {
    if (shard.totalDurationMs > makespanMs) makespanMs = shard.totalDurationMs;
  }
  const idealLowerBoundMs = suites.length > 0 ? Math.max(maxSingleMs, totalWorkMs / k) : 0;
  const meanMs = k > 0 ? totalWorkMs / k : 0;
  const shardImbalanceRatio = meanMs > 0 ? makespanMs / meanMs : 1;

  return {
    shards: mutableShards.map((s) => ({
      shardIndex: s.shardIndex,
      suites: s.suites,
      totalDurationMs: s.totalDurationMs,
      totalTests: s.totalTests,
    })),
    makespanMs,
    idealLowerBoundMs,
    shardImbalanceRatio,
  };
}

/**
 * 변경된 파일 목록과 스위트 실행 시간 기록으로부터 필수 게이트(`core`+`verify`)를 100% 유지한
 * 최소 CI 실행 계획 및 LPT 샤드 배치·러너 시간 절감량을 산출한다.
 */
export function buildSmartCiSchedulePlan(params: {
  readonly changedFiles: readonly string[];
  readonly suites: readonly CiTestSuiteTiming[];
  readonly shardCount?: number;
  readonly workflowCatalog?: readonly CiWorkflowSpec[];
}): CiSmartSchedulePlan {
  const requested = params.workflowCatalog ?? DEFAULT_CI_WORKFLOW_CATALOG;
  const specifiedIds = new Set(requested.map((workflow) => workflow.id));
  const missingGates = DEFAULT_CI_WORKFLOW_CATALOG.filter(
    (workflow) => workflow.mandatory && !specifiedIds.has(workflow.id),
  );
  const catalog = [...missingGates, ...requested];
  const impacted = propagateImpactedPackages(params.changedFiles);
  const impactedSet = new Set(impacted);

  const selectedSet = new Set<CiWorkflowId>(MANDATORY_RELEASE_GATES);
  const skippedWorkflows: CiOptionalWorkflowId[] = [];

  for (const wf of catalog) {
    if (wf.mandatory || wf.id === "core" || wf.id === "verify") {
      selectedSet.add(wf.id);
      continue;
    }
    const triggered = wf.dependsOnPackages.some(
      (dep) => dep === "*" || impactedSet.has(dep),
    );
    if (triggered) {
      selectedSet.add(wf.id);
    } else {
      skippedWorkflows.push(wf.id as CiOptionalWorkflowId);
    }
  }

  const relevantSuites = params.suites.filter(
    (s) => impactedSet.has("scripts/ci-root") || impactedSet.has(s.domainPackage),
  );
  const lpt = balanceSuitesLpt(relevantSuites, params.shardCount ?? 4);

  let baselineRunnerMinutes = 0;
  let scheduledRunnerMinutes = 0;
  for (const wf of catalog) {
    baselineRunnerMinutes += wf.baselineRunnerMinutes;
    if (selectedSet.has(wf.id)) {
      scheduledRunnerMinutes += wf.baselineRunnerMinutes;
    }
  }

  const savedRunnerMinutes = Math.max(0, baselineRunnerMinutes - scheduledRunnerMinutes);
  const savingsRatioPct =
    baselineRunnerMinutes > 0 ? (savedRunnerMinutes / baselineRunnerMinutes) * 100 : 0;

  return {
    changedFiles: [...params.changedFiles],
    impactedPackages: impacted,
    selectedWorkflows: catalog.filter((w) => selectedSet.has(w.id)).map((w) => w.id),
    skippedWorkflows,
    mandatoryGatesPreserved: true,
    shards: lpt.shards,
    makespanMs: lpt.makespanMs,
    idealLowerBoundMs: lpt.idealLowerBoundMs,
    shardImbalanceRatio: lpt.shardImbalanceRatio,
    baselineRunnerMinutes,
    scheduledRunnerMinutes,
    savedRunnerMinutes,
    savingsRatioPct,
  };
}
