/**
 * 독립 관리자(apps/admin-web) 컷오버 통합 조회 모델.
 *
 * - ops-dashboard JSON, 배포 원장(Cloudflare + 서울 onpod), DB 133/133 마이그레이션 원장,
 *   CodeQL 열림 경보, 모바일 3D 감사 actionable 실패 요청 수치를 화이트리스트 스키마로 정규화한다.
 * - 모든 입력/출력은 admin-response-whitelist 를 통과하므로 .env 키·내부 호스트·자격증명이
 *   UI 상태나 내보내기 JSON에 절대 남지 않는다.
 */
import {
  ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA,
  assertSafeAdminDiagnosticOutput,
  serializeWhitelistedAdminPayload,
  stringifyWhitelistedAdminPayload,
} from "../../../platform/http/admin-response-whitelist";

export interface OpsCutoverSummary {
  readonly schemaVersion: string;
  readonly generatedAt: string;
  readonly sourceKind: "baseline" | "imported-ops-dashboard";
  readonly mode: "offline" | "online" | "baseline";
  readonly overallStatus: "ok" | "degraded" | "unknown";
  readonly degradedReasons: readonly string[];
  readonly git: {
    readonly branch: string | null;
    readonly headShortSha: string | null;
    readonly originMainShortSha: string | null;
    readonly headMatchesOriginMain: boolean;
    readonly clean: boolean;
  };
  readonly deploymentLedger: {
    readonly webProvider: string;
    readonly webUrl: string;
    readonly webResource: string;
    readonly apiProvider: string;
    readonly apiUrl: string;
    readonly apiResource: string;
    readonly databaseResource: string;
    readonly databaseEngine: string;
    readonly standingApprovalMode: string;
    readonly standingApprovalOk: boolean;
    readonly activeScopes: readonly string[];
    readonly onpodRequiresExplicitApproval: boolean;
    readonly retiredProviders: readonly string[];
    readonly forbiddenCommands: readonly string[];
  };
  readonly migrations: {
    readonly ok: boolean;
    readonly totalCount: number;
    readonly diskCount: number;
    readonly latestNumber: string | null;
    readonly latestName: string | null;
    readonly missingFilesCount: number;
    readonly unregisteredFilesCount: number;
  };
  readonly liveHealth: {
    readonly status: string;
    readonly passed: number;
    readonly total: number;
    readonly studioCoopCoepIsolated: boolean;
  };
  readonly codeScanning: {
    readonly status: string;
    readonly openAlertsCount: number | null;
    readonly truncated: boolean;
    readonly tools: readonly string[];
  };
  readonly mobile3dAudit: {
    readonly status: string;
    readonly actionableFailedRequests: number | null;
    readonly abortedRequests: number | null;
    readonly httpErrorCount: number | null;
    readonly generatedAt: string | null;
  };
}

export interface OpsCutoverImportOutcome {
  readonly ok: true;
  readonly summary: OpsCutoverSummary;
  readonly strippedKeyCount: number;
  readonly redactedFieldCount: number;
  readonly blockedCategories: readonly string[];
}

export interface OpsCutoverImportFailure {
  readonly ok: false;
  readonly error: string;
}

export type OpsCutoverImportResult = OpsCutoverImportOutcome | OpsCutoverImportFailure;

export interface OpsCutoverReadiness {
  readonly migrationAligned: boolean;
  readonly migrationBadge: string;
  readonly deploymentApprovalLabel: string;
  readonly liveHealthLabel: string;
  readonly codeScanningLabel: string;
  readonly mobile3dLabel: string;
  readonly hasActionableAlert: boolean;
}

const MAX_IMPORT_BYTES = 512 * 1024;

/** 2026-11-23 정본 매니페스트(DEPLOY_MANIFEST.json · STANDING_APPROVAL.json · DB 133/133) 기준 스냅샷. */
export const OPS_CUTOVER_BASELINE_SUMMARY: OpsCutoverSummary = {
  schemaVersion: "1.0.0",
  generatedAt: "2026-11-23T00:00:00.000Z",
  sourceKind: "baseline",
  mode: "baseline",
  overallStatus: "ok",
  degradedReasons: [],
  git: {
    branch: "main",
    headShortSha: null,
    originMainShortSha: null,
    headMatchesOriginMain: false,
    clean: true,
  },
  deploymentLedger: {
    webProvider: "Cloudflare Static",
    webUrl: "https://www.toonstudio.cloud",
    webResource: "toonspectrum-web",
    apiProvider: "Seoul onpod",
    apiUrl: "https://toonstudio-api.onpod.ai",
    apiResource: "toonstudio-api",
    databaseResource: "toonstudio-db",
    databaseEngine: "PostgreSQL 17",
    standingApprovalMode: "standing-approval",
    standingApprovalOk: true,
    activeScopes: [
      "cloudflare-static-production",
      "cloudflare-apex-redirect-production",
      "core-api-container-release",
    ],
    onpodRequiresExplicitApproval: true,
    retiredProviders: ["vercel", "render", "supabase", "neon"],
    forbiddenCommands: [
      "onpod app deploy --attach-db",
      "onpod app rollback",
      "onpod app rm",
      "onpod db rm",
    ],
  },
  migrations: {
    ok: true,
    totalCount: 133,
    diskCount: 133,
    latestNumber: "0133",
    latestName: "0133_production_division_os",
    missingFilesCount: 0,
    unregisteredFilesCount: 0,
  },
  liveHealth: {
    status: "unverified",
    passed: 0,
    total: 4,
    studioCoopCoepIsolated: false,
  },
  codeScanning: {
    status: "unverified",
    openAlertsCount: null,
    truncated: false,
    tools: [],
  },
  mobile3dAudit: {
    status: "unverified",
    actionableFailedRequests: null,
    abortedRequests: null,
    httpErrorCount: null,
    generatedAt: null,
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown, extract?: (item: Record<string, unknown>) => unknown): string[] {
  if (!Array.isArray(value)) return [];
  const list: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") list.push(entry);
    else if (extract) {
      const rec = asRecord(entry);
      const extracted = rec ? extract(rec) : null;
      if (typeof extracted === "string") list.push(extracted);
    }
  }
  return list;
}

function mapRawOpsDashboardToCandidate(raw: Record<string, unknown>): Record<string, unknown> {
  // 이미 투영된 OpsCutoverSummary 형식이면 그대로 화이트리스트 투영에 전달한다.
  if (asRecord(raw.deploymentLedger)) {
    return {
      ...raw,
      sourceKind: "imported-ops-dashboard",
    };
  }

  const infra = asRecord(raw.infrastructure);
  const active = asRecord(infra?.active);
  const web = asRecord(active?.web);
  const api = asRecord(active?.api);
  const db = asRecord(active?.database);
  const standing = asRecord(raw.standingApproval);
  const git = asRecord(raw.git);
  const migrations = asRecord(raw.migrations);
  const liveHealth = asRecord(raw.liveHealth);
  const liveSummary = asRecord(liveHealth?.summary);
  const liveHeaders = asRecord(liveHealth?.headers);
  const webStudio = asRecord(liveHeaders?.webStudio);
  const codeScanning = asRecord(raw.codeScanning);
  const mobile3dAudit = asRecord(raw.mobile3dAudit);

  // 최상위 미등록/금지 키가 있으면 화이트리스트 감사가 카운트할 수 있도록 함께 넘긴다.
  const passthroughExtras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!Object.hasOwn(ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA, key)) {
      passthroughExtras[key] = value;
    }
  }

  return {
    ...passthroughExtras,
    schemaVersion: typeof raw.schemaVersion === "string" ? raw.schemaVersion : "1.0.0",
    generatedAt: typeof raw.generatedAt === "string" ? raw.generatedAt : new Date().toISOString(),
    sourceKind: "imported-ops-dashboard",
    mode: raw.mode === "online" || raw.mode === "offline" ? raw.mode : "offline",
    overallStatus: raw.overallStatus === "ok" || raw.overallStatus === "degraded" ? raw.overallStatus : "unknown",
    degradedReasons: asStringArray(raw.degradedReasons),
    git: {
      branch: typeof git?.branch === "string" ? git.branch : null,
      headShortSha: typeof git?.headShortSha === "string" ? git.headShortSha : null,
      originMainShortSha: typeof git?.originMainShortSha === "string" ? git.originMainShortSha : null,
      headMatchesOriginMain: Boolean(git?.headMatchesOriginMain),
      clean: Boolean(git?.clean),
    },
    deploymentLedger: {
      webProvider: typeof web?.provider === "string" ? web.provider : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.webProvider,
      webUrl: typeof web?.url === "string" ? web.url : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.webUrl,
      webResource: typeof web?.resource === "string" ? web.resource : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.webResource,
      apiProvider: typeof api?.provider === "string" ? api.provider : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.apiProvider,
      apiUrl: typeof api?.url === "string" ? api.url : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.apiUrl,
      apiResource: typeof api?.resource === "string" ? api.resource : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.apiResource,
      databaseResource: typeof db?.resource === "string" ? db.resource : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.databaseResource,
      databaseEngine: typeof db?.engine === "string" ? db.engine : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.databaseEngine,
      standingApprovalMode: typeof standing?.mode === "string" ? standing.mode : OPS_CUTOVER_BASELINE_SUMMARY.deploymentLedger.standingApprovalMode,
      standingApprovalOk: typeof standing?.ok === "boolean" ? standing.ok : false,
      activeScopes: asStringArray(standing?.activeScopes),
      onpodRequiresExplicitApproval: standing?.onpodRequiresExplicitApproval !== false,
      retiredProviders: asStringArray(infra?.retired, (entry) => entry.id),
      forbiddenCommands: asStringArray(infra?.forbiddenCommands, (entry) => entry.command),
    },
    migrations: {
      ok: Boolean(migrations?.ok),
      totalCount: typeof migrations?.totalCount === "number" ? migrations.totalCount : 0,
      diskCount: typeof migrations?.diskCount === "number" ? migrations.diskCount : 0,
      latestNumber: typeof migrations?.latestNumber === "string" ? migrations.latestNumber : null,
      latestName: typeof migrations?.latestName === "string" ? migrations.latestName : null,
      missingFilesCount: typeof migrations?.missingFilesCount === "number" ? migrations.missingFilesCount : 0,
      unregisteredFilesCount: typeof migrations?.unregisteredFilesCount === "number" ? migrations.unregisteredFilesCount : 0,
    },
    liveHealth: {
      status: typeof liveHealth?.status === "string" ? liveHealth.status : "unverified",
      passed: typeof liveSummary?.passed === "number" ? liveSummary.passed : 0,
      total: typeof liveSummary?.total === "number" ? liveSummary.total : 4,
      studioCoopCoepIsolated: Boolean(webStudio?.isolated),
    },
    codeScanning: {
      status: typeof codeScanning?.status === "string" ? codeScanning.status : "unverified",
      openAlertsCount: typeof codeScanning?.openAlertsCount === "number" ? codeScanning.openAlertsCount : null,
      truncated: Boolean(codeScanning?.truncated),
      tools: asStringArray(codeScanning?.tools),
    },
    mobile3dAudit: {
      status: typeof mobile3dAudit?.status === "string" ? mobile3dAudit.status : "unverified",
      actionableFailedRequests: typeof mobile3dAudit?.actionableFailedRequests === "number" ? mobile3dAudit.actionableFailedRequests : null,
      abortedRequests: typeof mobile3dAudit?.abortedRequests === "number" ? mobile3dAudit.abortedRequests : null,
      httpErrorCount: typeof mobile3dAudit?.httpErrorCount === "number" ? mobile3dAudit.httpErrorCount : null,
      generatedAt: typeof mobile3dAudit?.generatedAt === "string" ? mobile3dAudit.generatedAt : null,
    },
  };
}

/** `node scripts/ops-dashboard.mjs --json` 출력을 화이트리스트 스키마로 검증·투영한다. */
export function parseOpsCutoverDashboardJson(rawJson: string): OpsCutoverImportResult {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return { ok: false, error: "붙여넣은 JSON이 비어 있습니다. `node scripts/ops-dashboard.mjs --json` 출력을 입력하세요." };
  }
  if (trimmed.length > MAX_IMPORT_BYTES) {
    return { ok: false, error: "입력 JSON이 허용 크기(512KB)를 초과했습니다." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "유효한 JSON 형식이 아닙니다. ops-dashboard --json 전체 출력을 확인하세요." };
  }

  const record = asRecord(parsed);
  if (!record || (!asRecord(record.migrations) && !asRecord(record.deploymentLedger))) {
    return { ok: false, error: "ops-dashboard 또는 배포 원장 요약 JSON 형식이 아닙니다(migrations 필드 누락)." };
  }

  const candidate = mapRawOpsDashboardToCandidate(record);
  const projected = serializeWhitelistedAdminPayload(candidate, ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA);
  const serialized = JSON.stringify(projected.data);
  const audit = assertSafeAdminDiagnosticOutput(serialized);
  if (!audit.ok) {
    return {
      ok: false,
      error: `화이트리스트 안전성 검증을 통과하지 못했습니다(${audit.violations.join(", ")}).`,
    };
  }

  return {
    ok: true,
    summary: projected.data as unknown as OpsCutoverSummary,
    strippedKeyCount: projected.strippedKeyCount,
    redactedFieldCount: projected.redactedFieldCount,
    blockedCategories: projected.blockedCategories,
  };
}

/** 화이트리스트 검증과 사후 검사를 마친 안전한 요약 JSON 문자열을 생성한다. */
export function exportOpsCutoverSummaryJson(summary: OpsCutoverSummary): string {
  return stringifyWhitelistedAdminPayload(summary, ADMIN_OPS_CUTOVER_SUMMARY_SCHEMA);
}

/** UI 카드 표시용 상태 라벨과 경보 여부를 계산한다. */
export function summarizeOpsCutoverReadiness(summary: OpsCutoverSummary): OpsCutoverReadiness {
  const m = summary.migrations;
  const migrationAligned =
    m.ok && m.totalCount > 0 && m.totalCount === m.diskCount && m.missingFilesCount === 0 && m.unregisteredFilesCount === 0;
  const migrationBadge = migrationAligned
    ? `${m.totalCount}/${m.diskCount} 일치`
    : `${m.totalCount}/${m.diskCount} 드리프트 확인 필요`;

  const deploymentApprovalLabel = summary.deploymentLedger.standingApprovalOk
    ? `상시 승인 ${summary.deploymentLedger.activeScopes.length}범위 · onpod 명시 승인`
    : "명시 승인 전용(fail-closed)";

  const liveHealthLabel = summary.liveHealth.status === "healthy"
    ? `${summary.liveHealth.passed}/${summary.liveHealth.total} 정상`
    : summary.liveHealth.status === "skipped"
      ? "건너뜀(오프라인)"
      : summary.liveHealth.status === "unverified"
        ? "미확인(기준 스냅샷)"
        : `${summary.liveHealth.passed}/${summary.liveHealth.total} 주의`;

  const cs = summary.codeScanning;
  const codeScanningLabel = typeof cs.openAlertsCount === "number"
    ? `열림 경보 ${cs.openAlertsCount}${cs.truncated ? "+" : ""}건`
    : cs.status === "skipped"
      ? "건너뜀(오프라인)"
      : cs.status === "unavailable"
        ? "권한/미인증 미조회"
        : "미확인(스냅샷 필요)";

  const m3d = summary.mobile3dAudit;
  const mobile3dLabel = typeof m3d.actionableFailedRequests === "number"
    ? `actionable ${m3d.actionableFailedRequests}건`
    : m3d.status === "skipped"
      ? "건너뜀(오프라인)"
      : m3d.status === "unavailable"
        ? "산출물 없음"
        : "미확인(스냅샷 필요)";

  const hasActionableAlert =
    !migrationAligned
    || (typeof cs.openAlertsCount === "number" && cs.openAlertsCount > 0)
    || (typeof m3d.actionableFailedRequests === "number" && m3d.actionableFailedRequests > 0)
    || summary.overallStatus === "degraded";

  return {
    migrationAligned,
    migrationBadge,
    deploymentApprovalLabel,
    liveHealthLabel,
    codeScanningLabel,
    mobile3dLabel,
    hasActionableAlert,
  };
}
