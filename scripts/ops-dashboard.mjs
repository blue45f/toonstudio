#!/usr/bin/env node
/**
 * ToonStudio 크로스-LLM 통합 운영 상태판 CLI.
 *
 * 사용 예:
 *   node scripts/ops-dashboard.mjs
 *   node scripts/ops-dashboard.mjs --json
 *   node scripts/ops-dashboard.mjs --offline --json
 *   node scripts/ops-dashboard.mjs --offline --mobile-3d-report artifacts/studio-3d-production-audit/report.json --json
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_API_URL,
  DEFAULT_REPOSITORY_ROOT,
  DEFAULT_REPO_SLUG,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_WEB_URL,
  buildExecEnv,
  collectOpsDashboard,
  defaultExecImpl,
  formatOpsDashboardReport,
  sanitizeOpsText,
  sanitizeOpsValue,
  validateHttpsOrigin,
} from "./lib/ops-dashboard-core.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));

export const DEFAULT_MOBILE_3D_AUDIT_REPORT = "artifacts/studio-3d-production-audit/report.json";
export const DEFAULT_MOBILE_3D_AUDIT_MARKDOWN = "artifacts/studio-3d-production-audit/report.md";
export const MOBILE_3D_AUDIT_ISSUE_TITLE = "[3D QA] production visual quality regression";
export const CODE_SCANNING_PAGE_SIZE = 100;

const CODE_SCANNING_SEVERITY_KEYS = Object.freeze([
  "critical",
  "high",
  "medium",
  "low",
  "error",
  "warning",
  "note",
  "unknown",
]);

export class OpsDashboardUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "OpsDashboardUsageError";
  }
}

export const USAGE_TEXT = [
  "사용법: node scripts/ops-dashboard.mjs [옵션]",
  "  --json                     크로스-LLM 기계 판독용 JSON 리포트 출력",
  "  --offline                  라이브 HTTP 헬스 및 GitHub CI/CodeQL 조회 건너뛰기",
  "  --root <dir>               점검할 저장소 루트 경로 지정",
  `  --mobile-3d-report <path>  모바일 3D 감사 report.json/report.md 경로 지정 (기본: ${DEFAULT_MOBILE_3D_AUDIT_REPORT})`,
  `  --web-url <https-origin>   운영 웹 원점 지정 (기본: ${DEFAULT_WEB_URL})`,
  `  --api-url <https-origin>   운영 Core API 원점 지정 (기본: ${DEFAULT_API_URL})`,
  `  --timeout-ms <ms>          외부 요청·명령 제한 시간(200~10000, 기본 ${DEFAULT_TIMEOUT_MS})`,
  "  --help, -h                 도움말 출력",
].join("\n");

function parseTimeoutMs(raw) {
  const text = String(raw ?? "").trim();
  const parsed = /^\d+$/u.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 200 || parsed > 10_000) {
    throw new OpsDashboardUsageError("--timeout-ms는 200~10000 범위의 정수여야 합니다.");
  }
  return parsed;
}

function invokeExecStdout(execImpl, command, args, options) {
  return Promise.resolve(execImpl(command, args, options)).then((result) => {
    if (typeof result === "string") return result;
    return result && typeof result === "object" && typeof result.stdout === "string"
      ? result.stdout
      : "";
  });
}

function classifyGhError(error) {
  const code = String(error?.code ?? "");
  const text = `${error?.message ?? ""} ${error?.stderr ?? ""}`.toLowerCase();
  if (code === "ENOENT" || text.includes("not logged") || text.includes("gh auth login") || text.includes("http 401")) {
    return "gh-unavailable";
  }
  if (
    text.includes("http 403")
    || text.includes("resource not accessible")
    || text.includes("security_events")
    || text.includes("must have admin")
    || text.includes("forbidden")
  ) {
    return "gh-forbidden";
  }
  if (
    text.includes("http 404")
    || text.includes("no analysis found")
    || text.includes("code scanning is not enabled")
    || text.includes("advanced security must be enabled")
  ) {
    return "code-scanning-unavailable";
  }
  return "gh-error";
}

/** GitHub Code Scanning(CodeQL) 열림 경보 JSON 배열을 순수 파싱·집계한다. */
export function parseCodeScanningAlertsPayload(rawPayload) {
  const parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  if (!Array.isArray(parsed)) {
    throw new Error("Code Scanning 경보 응답이 배열 형식이 아닙니다.");
  }

  const bySeverity = Object.fromEntries(CODE_SCANNING_SEVERITY_KEYS.map((key) => [key, 0]));
  const tools = new Set();
  const sampleRules = [];
  let openAlertsCount = 0;

  for (const alert of parsed) {
    if (!alert || typeof alert !== "object") continue;
    const state = typeof alert.state === "string" ? alert.state.toLowerCase() : "open";
    if (state !== "open") continue;

    openAlertsCount += 1;
    const rawSeverity = String(
      alert.rule?.security_severity_level ?? alert.rule?.severity ?? "unknown",
    ).toLowerCase();
    const severityKey = Object.hasOwn(bySeverity, rawSeverity) ? rawSeverity : "unknown";
    bySeverity[severityKey] += 1;

    const toolName = typeof alert.tool?.name === "string" && alert.tool.name.trim()
      ? sanitizeOpsText(alert.tool.name.trim())
      : null;
    if (toolName) tools.add(toolName);

    if (sampleRules.length < 5) {
      sampleRules.push({
        number: Number.isSafeInteger(alert.number) ? alert.number : null,
        ruleId: typeof alert.rule?.id === "string" ? sanitizeOpsText(alert.rule.id) : "unknown",
        severity: severityKey,
        tool: toolName ?? "unknown",
      });
    }
  }

  return sanitizeOpsValue({
    openAlertsCount,
    bySeverity,
    tools: [...tools].sort(),
    truncated: parsed.length >= CODE_SCANNING_PAGE_SIZE,
    sampleRules,
  });
}

function isAbortedRequestError(errorText) {
  return /err_aborted/iu.test(String(errorText ?? ""));
}

/** scripts/audit-studio-3d-production.mjs 가 생성한 report.json 에서 모바일 타깃 actionable 실패 요청을 순수 파싱한다. */
export function parseMobile3dAuditReportPayload(
  rawPayload,
  { source = "local-report-json", sourcePath = DEFAULT_MOBILE_3D_AUDIT_REPORT } = {},
) {
  const parsed = typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.targets)) {
    throw new Error("모바일 3D 감사 report.json에 targets 배열이 없습니다.");
  }

  const mobileTarget = parsed.targets.find((target) => String(target?.name ?? "").toLowerCase() === "mobile")
    ?? parsed.targets.find((target) => Boolean(target?.mobile) || /mobile/iu.test(String(target?.name ?? "")));
  if (!mobileTarget) {
    throw new Error("모바일 3D 감사 report.json에서 mobile 타깃을 찾지 못했습니다.");
  }

  const summary = mobileTarget.failedRequestSummary;
  let totalFailedRequests;
  let abortedRequests;
  let actionableFailedRequests;
  let httpErrorCount;

  if (summary && typeof summary === "object" && Number.isFinite(summary.actionableCount)) {
    actionableFailedRequests = Math.max(0, Math.trunc(summary.actionableCount));
    abortedRequests = Number.isFinite(summary.abortedCount) ? Math.max(0, Math.trunc(summary.abortedCount)) : 0;
    totalFailedRequests = Number.isFinite(summary.totalCount)
      ? Math.max(0, Math.trunc(summary.totalCount))
      : actionableFailedRequests + abortedRequests;
    httpErrorCount = Number.isFinite(summary.httpErrorCount)
      ? Math.max(0, Math.trunc(summary.httpErrorCount))
      : Array.isArray(mobileTarget.httpErrors) ? mobileTarget.httpErrors.length : 0;
  } else {
    const rawFailed = Array.isArray(mobileTarget.failedRequests) ? mobileTarget.failedRequests : [];
    abortedRequests = rawFailed.filter((item) => isAbortedRequestError(item?.error ?? item)).length;
    actionableFailedRequests = Math.max(0, rawFailed.length - abortedRequests);
    totalFailedRequests = rawFailed.length;
    httpErrorCount = Array.isArray(mobileTarget.httpErrors) ? mobileTarget.httpErrors.length : 0;
  }

  return sanitizeOpsValue({
    source,
    sourcePath,
    targetName: typeof mobileTarget.name === "string" ? mobileTarget.name : "mobile",
    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : null,
    actionableFailedRequests,
    abortedRequests,
    httpErrorCount,
    totalFailedRequests,
    consoleErrorCount: Array.isArray(mobileTarget.consoleErrors) ? mobileTarget.consoleErrors.length : 0,
    pageErrorCount: Array.isArray(mobileTarget.pageErrors) ? mobileTarget.pageErrors.length : 0,
    blockingFailuresCount: Array.isArray(parsed.failures) ? parsed.failures.length : 0,
  });
}

/** report.md 또는 [3D QA] GitHub 이슈 본문에서 모바일 타깃 actionable 실패 요청 수치를 순수 파싱한다. */
export function parseMobile3dAuditMarkdown(
  markdownText,
  { source = "local-report-md", sourcePath = DEFAULT_MOBILE_3D_AUDIT_MARKDOWN, generatedAt = null } = {},
) {
  if (typeof markdownText !== "string" || !markdownText.trim()) return null;

  const generatedMatch = /^- Generated at:\s*([^\r\n]+)/mu.exec(markdownText);
  const resolvedGeneratedAt = generatedAt ?? (generatedMatch?.[1]?.trim() || null);

  const headingMatch = /^###\s+mobile\b[^\r\n]*$/imu.exec(markdownText);
  let scopeText = markdownText;
  let targetName = "summary";
  if (headingMatch && headingMatch.index >= 0) {
    const start = headingMatch.index + headingMatch[0].length;
    const rest = markdownText.slice(start);
    const nextHeading = /\r?\n#{2,3}\s+/u.exec(rest);
    scopeText = nextHeading ? rest.slice(0, nextHeading.index) : rest;
    targetName = "mobile";
  }

  const breakdownMatch =
    /aborted\(ERR_ABORTED\)=(\d+),\s*actionable\(network\/policy\)=(\d+),\s*httpErrors\(4xx\/5xx\)=(\d+)/iu.exec(
      scopeText,
    );
  if (!breakdownMatch) return null;

  const abortedRequests = Number.parseInt(breakdownMatch[1], 10);
  const actionableFailedRequests = Number.parseInt(breakdownMatch[2], 10);
  const httpErrorCount = Number.parseInt(breakdownMatch[3], 10);
  const totalMatch = /^- Failed requests:\s*(\d+)/imu.exec(scopeText);
  const totalFailedRequests = totalMatch
    ? Number.parseInt(totalMatch[1], 10)
    : abortedRequests + actionableFailedRequests;

  return sanitizeOpsValue({
    source,
    sourcePath,
    targetName,
    generatedAt: resolvedGeneratedAt,
    actionableFailedRequests,
    abortedRequests,
    httpErrorCount,
    totalFailedRequests,
    consoleErrorCount: null,
    pageErrorCount: null,
    blockingFailuresCount: null,
  });
}

/** GitHub Code Scanning(CodeQL) 열림 경보 수를 fail-safe로 수집한다. */
export async function collectCodeScanningStatus({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  repoSlug = DEFAULT_REPO_SLUG,
  offline = false,
  execImpl = defaultExecImpl,
  execEnv = buildExecEnv(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (offline) {
    return {
      skipped: true,
      reason: "offline",
      available: null,
      status: "skipped",
      repoSlug,
      openAlertsCount: null,
      bySeverity: null,
      tools: [],
      truncated: false,
      sampleRules: [],
      issues: [],
    };
  }

  const execOpts = { cwd: rootDir, env: execEnv, timeoutMs };
  try {
    const rawJson = await invokeExecStdout(
      execImpl,
      "gh",
      ["api", `repos/${repoSlug}/code-scanning/alerts?state=open&per_page=${CODE_SCANNING_PAGE_SIZE}`],
      execOpts,
    );
    const parsed = parseCodeScanningAlertsPayload(rawJson);
    return sanitizeOpsValue({
      skipped: false,
      reason: null,
      available: true,
      status: parsed.openAlertsCount > 0 ? "alert" : "ok",
      repoSlug,
      ...parsed,
      issues: [],
    });
  } catch (error) {
    const reason = classifyGhError(error);
    const unavailable = reason !== "gh-error";
    const issueMessage = reason === "gh-unavailable"
      ? "gh CLI 미설치 또는 미인증 상태 — CodeQL 열림 경보 조회를 건너뛰었습니다."
      : reason === "gh-forbidden"
        ? "Code Scanning 읽기 권한(security_events) 미부여 — CodeQL 열림 경보 조회를 건너뛰었습니다."
        : reason === "code-scanning-unavailable"
          ? "저장소 Code Scanning 분석 결과가 없거나 비활성 상태입니다."
          : `CodeQL 열림 경보 조회 실패: ${sanitizeOpsText(error instanceof Error ? error.message : "조회 오류")}`;
    return sanitizeOpsValue({
      skipped: false,
      reason,
      available: !unavailable,
      status: unavailable ? "unavailable" : "degraded",
      repoSlug,
      openAlertsCount: null,
      bySeverity: null,
      tools: [],
      truncated: false,
      sampleRules: [],
      issues: [issueMessage],
    });
  }
}

/** 최근 모바일 3D 감사의 actionable 실패 요청 수를 로컬 산출물 또는 GitHub 이슈에서 fail-safe로 수집한다. */
export async function collectMobile3dAuditStatus({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  repoSlug = DEFAULT_REPO_SLUG,
  mobile3dReportPath = null,
  offline = false,
  execImpl = defaultExecImpl,
  execEnv = buildExecEnv(),
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const empty = {
    skipped: false,
    reason: null,
    available: false,
    status: "unavailable",
    source: null,
    sourcePath: null,
    targetName: "mobile",
    generatedAt: null,
    actionableFailedRequests: null,
    abortedRequests: null,
    httpErrorCount: null,
    totalFailedRequests: null,
    consoleErrorCount: null,
    pageErrorCount: null,
    blockingFailuresCount: null,
    issueNumber: null,
    issueState: null,
    issues: [],
  };

  const resolveReportPath = (candidate) => (isAbsolute(candidate) ? candidate : join(rootDir, candidate));
  const localJsonPath = mobile3dReportPath
    ? resolveReportPath(mobile3dReportPath)
    : join(rootDir, DEFAULT_MOBILE_3D_AUDIT_REPORT);
  const displayPath = (absPath) => {
    const rel = relative(rootDir, absPath);
    return rel && !rel.startsWith("..") ? rel : absPath;
  };

  if (existsSync(localJsonPath)) {
    try {
      const content = readFileSync(localJsonPath, "utf8");
      const parsed = localJsonPath.endsWith(".md")
        ? parseMobile3dAuditMarkdown(content, { source: "local-report-md", sourcePath: displayPath(localJsonPath) })
        : parseMobile3dAuditReportPayload(content, { source: "local-report-json", sourcePath: displayPath(localJsonPath) });
      if (!parsed) {
        return {
          ...empty,
          status: "degraded",
          reason: "invalid-local-report",
          sourcePath: displayPath(localJsonPath),
          issues: ["모바일 3D 감사 마크다운에서 actionable 실패 요청 요약을 찾지 못했습니다."],
        };
      }
      return sanitizeOpsValue({
        ...empty,
        available: true,
        status: parsed.actionableFailedRequests > 0 ? "alert" : "ok",
        ...parsed,
      });
    } catch (error) {
      return sanitizeOpsValue({
        ...empty,
        status: "degraded",
        reason: "invalid-local-report",
        sourcePath: displayPath(localJsonPath),
        issues: [`모바일 3D 감사 리포트 파싱 실패: ${sanitizeOpsText(error instanceof Error ? error.message : "읽기 오류")}`],
      });
    }
  }

  const localMdPath = join(rootDir, DEFAULT_MOBILE_3D_AUDIT_MARKDOWN);
  if (!mobile3dReportPath && existsSync(localMdPath)) {
    try {
      const parsed = parseMobile3dAuditMarkdown(readFileSync(localMdPath, "utf8"), {
        source: "local-report-md",
        sourcePath: DEFAULT_MOBILE_3D_AUDIT_MARKDOWN,
      });
      if (parsed) {
        return sanitizeOpsValue({
          ...empty,
          available: true,
          status: parsed.actionableFailedRequests > 0 ? "alert" : "ok",
          ...parsed,
        });
      }
    } catch {
      // 로컬 마크다운 파싱 실패 시 오프라인/온라인 폴백으로 이어간다.
    }
  }

  if (offline) {
    return {
      ...empty,
      skipped: true,
      reason: "offline-no-local-report",
      status: "skipped",
      issues: ["로컬 모바일 3D 감사 산출물이 없고 오프라인 모드이므로 원격 이슈 조회를 건너뛰었습니다."],
    };
  }

  const execOpts = { cwd: rootDir, env: execEnv, timeoutMs };
  try {
    const rawJson = await invokeExecStdout(
      execImpl,
      "gh",
      ["api", `repos/${repoSlug}/issues?state=all&per_page=20`],
      execOpts,
    );
    const issuesList = JSON.parse(rawJson);
    if (!Array.isArray(issuesList)) throw new Error("GitHub issues 응답이 배열 형식이 아닙니다.");

    const matched = issuesList.find(
      (issue) => issue && typeof issue === "object" && !issue.pull_request && issue.title === MOBILE_3D_AUDIT_ISSUE_TITLE,
    );
    if (!matched) {
      return {
        ...empty,
        reason: "no-audit-report",
        issues: ["로컬 모바일 3D 감사 산출물 및 최근 [3D QA] 회귀 이슈가 없습니다."],
      };
    }

    const issueNumber = Number.isSafeInteger(matched.number) ? matched.number : null;
    const issueState = typeof matched.state === "string" ? matched.state.toLowerCase() : null;
    const updatedAt = typeof matched.updated_at === "string" ? matched.updated_at : null;
    const parsedFromIssue = parseMobile3dAuditMarkdown(String(matched.body ?? ""), {
      source: "github-issue",
      sourcePath: issueNumber ? `github:${repoSlug}#${issueNumber}` : `github:${repoSlug}`,
      generatedAt: updatedAt,
    });

    if (issueState === "closed") {
      return sanitizeOpsValue({
        ...empty,
        available: true,
        status: "ok",
        source: "github-issue",
        sourcePath: issueNumber ? `github:${repoSlug}#${issueNumber}` : `github:${repoSlug}`,
        generatedAt: parsedFromIssue?.generatedAt ?? updatedAt,
        actionableFailedRequests: 0,
        abortedRequests: parsedFromIssue?.abortedRequests ?? 0,
        httpErrorCount: 0,
        totalFailedRequests: parsedFromIssue?.abortedRequests ?? 0,
        issueNumber,
        issueState,
      });
    }

    if (parsedFromIssue) {
      return sanitizeOpsValue({
        ...empty,
        available: true,
        status: parsedFromIssue.actionableFailedRequests > 0 ? "alert" : "ok",
        ...parsedFromIssue,
        issueNumber,
        issueState,
      });
    }

    return sanitizeOpsValue({
      ...empty,
      available: true,
      status: "degraded",
      reason: "issue-body-unparsed",
      source: "github-issue",
      sourcePath: issueNumber ? `github:${repoSlug}#${issueNumber}` : `github:${repoSlug}`,
      generatedAt: updatedAt,
      issueNumber,
      issueState,
      issues: ["열린 [3D QA] 이슈 본문에서 모바일 actionable 실패 요청 요약을 찾지 못했습니다."],
    });
  } catch (error) {
    const reason = classifyGhError(error);
    const unavailable = reason !== "gh-error";
    return sanitizeOpsValue({
      ...empty,
      reason,
      available: false,
      status: unavailable ? "unavailable" : "degraded",
      issues: [
        unavailable
          ? "gh CLI 미설치·미인증 또는 권한 부족 — 원격 모바일 3D 감사 조회를 건너뛰었습니다."
          : `원격 모바일 3D 감사 이슈 조회 실패: ${sanitizeOpsText(error instanceof Error ? error.message : "조회 오류")}`,
      ],
    });
  }
}

/** 기존 ops-dashboard 스냅샷에 CodeQL 열림 경보 수 + 모바일 3D 감사 actionable 실패 요청 지표를 병렬 결합한다. */
export async function collectExtendedOpsDashboard({
  rootDir = DEFAULT_REPOSITORY_ROOT,
  webUrl = DEFAULT_WEB_URL,
  apiUrl = DEFAULT_API_URL,
  repoSlug = DEFAULT_REPO_SLUG,
  mobile3dReportPath = null,
  offline = false,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  execImpl = defaultExecImpl,
  execEnv = buildExecEnv(),
  now = () => new Date(),
} = {}) {
  const [baseReport, codeScanning, mobile3dAudit] = await Promise.all([
    collectOpsDashboard({
      rootDir,
      webUrl,
      apiUrl,
      repoSlug,
      offline,
      timeoutMs,
      fetchImpl,
      execImpl,
      execEnv,
      now,
    }),
    collectCodeScanningStatus({ rootDir, repoSlug, offline, execImpl, execEnv, timeoutMs }),
    collectMobile3dAuditStatus({ rootDir, repoSlug, mobile3dReportPath, offline, execImpl, execEnv, timeoutMs }),
  ]);

  const degradedReasons = [...baseReport.degradedReasons];
  const recommendations = [...baseReport.recommendations];

  if (codeScanning.available && typeof codeScanning.openAlertsCount === "number" && codeScanning.openAlertsCount > 0) {
    degradedReasons.push(`CodeQL 열림 경보 ${codeScanning.openAlertsCount}건 감지`);
    recommendations.push({
      priority: "high",
      reason: `GitHub Code Scanning(CodeQL) 열림 경보 ${codeScanning.openAlertsCount}건이 확인되었습니다.`,
      command: `gh api repos/${repoSlug}/code-scanning/alerts?state=open`,
    });
  }
  if (
    mobile3dAudit.available
    && typeof mobile3dAudit.actionableFailedRequests === "number"
    && mobile3dAudit.actionableFailedRequests > 0
  ) {
    degradedReasons.push(`모바일 3D 감사 actionable 실패 요청 ${mobile3dAudit.actionableFailedRequests}건 감지`);
    recommendations.push({
      priority: "high",
      reason: `최근 모바일 3D 감사에서 actionable 실패 요청 ${mobile3dAudit.actionableFailedRequests}건이 감지되었습니다.`,
      command: "node scripts/audit-studio-3d-production.mjs --targets mobile",
    });
  }

  return sanitizeOpsValue({
    ...baseReport,
    overallStatus: degradedReasons.length === 0 ? "ok" : "degraded",
    degradedReasons,
    codeScanning,
    mobile3dAudit,
    recommendations,
  });
}

/** CodeQL 열림 경보 및 모바일 3D 감사 지표를 포함한 통합 상태판 텍스트 리포트를 생성한다. */
export function formatExtendedOpsDashboardReport(report) {
  const baseText = formatOpsDashboardReport(report);
  const extraLines = ["", "8. Code Scanning (CodeQL)"];
  const cs = report.codeScanning;
  if (!cs || cs.skipped) {
    extraLines.push("  - 건너뜀 (--offline 모드)");
  } else if (!cs.available) {
    extraLines.push(`  - 미가용(${cs.reason ?? "unavailable"}): ${cs.issues?.[0] ?? "조회 불가"}`);
  } else {
    const suffix = cs.truncated ? "+" : "";
    const toolsText = cs.tools?.length ? ` · 도구=${cs.tools.join(", ")}` : "";
    extraLines.push(
      `  - 열림 경보: ${cs.openAlertsCount ?? 0}${suffix}건 (critical=${cs.bySeverity?.critical ?? 0}, high=${cs.bySeverity?.high ?? 0}, medium=${cs.bySeverity?.medium ?? 0}, low=${cs.bySeverity?.low ?? 0})${toolsText}`,
    );
  }

  extraLines.push("", "9. 모바일 3D 감사 (actionable 실패 요청)");
  const m3d = report.mobile3dAudit;
  if (!m3d || m3d.skipped) {
    extraLines.push("  - 건너뜀 (--offline 모드, 로컬 산출물 없음)");
  } else if (!m3d.available) {
    extraLines.push(`  - 미가용(${m3d.reason ?? "unavailable"}): ${m3d.issues?.[0] ?? "산출물 없음"}`);
  } else {
    extraLines.push(
      `  - 타깃(${m3d.targetName ?? "mobile"}): actionable 실패 요청=${m3d.actionableFailedRequests ?? 0}건 · ERR_ABORTED=${m3d.abortedRequests ?? 0}건 · HTTP 4xx/5xx=${m3d.httpErrorCount ?? 0}건 · 출처=${m3d.source ?? "unknown"}`,
    );
  }

  return sanitizeOpsText(`${baseText}\n${extraLines.join("\n")}`);
}

export function parseOpsDashboardArgs(argv) {
  const options = {
    json: false,
    offline: false,
    help: false,
    rootDir: DEFAULT_REPOSITORY_ROOT,
    mobile3dReportPath: null,
    webUrl: DEFAULT_WEB_URL,
    apiUrl: DEFAULT_API_URL,
    repoSlug: DEFAULT_REPO_SLUG,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (arg === "--json") { options.json = true; continue; }
    if (arg === "--offline") { options.offline = true; continue; }

    const eqIndex = arg.indexOf("=");
    const flag = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
    const takeValue = () => {
      if (eqIndex >= 0) {
        const inline = arg.slice(eqIndex + 1);
        if (!inline) throw new OpsDashboardUsageError(`${flag} 옵션 값이 비어 있습니다.`);
        return inline;
      }
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        throw new OpsDashboardUsageError(`${flag} 옵션에는 값이 필요합니다.`);
      }
      index += 1;
      return next;
    };

    try {
      if (flag === "--root") options.rootDir = resolve(takeValue());
      else if (flag === "--mobile-3d-report") options.mobile3dReportPath = takeValue();
      else if (flag === "--web-url") options.webUrl = validateHttpsOrigin(takeValue(), "--web-url");
      else if (flag === "--api-url") options.apiUrl = validateHttpsOrigin(takeValue(), "--api-url");
      else if (flag === "--timeout-ms") options.timeoutMs = parseTimeoutMs(takeValue());
      else throw new OpsDashboardUsageError("지원하지 않는 옵션입니다(--help로 사용법을 확인하세요).");
    } catch (error) {
      if (error instanceof OpsDashboardUsageError) throw error;
      throw new OpsDashboardUsageError(error instanceof Error ? error.message : "옵션 해석 실패");
    }
  }

  return options;
}

export async function executeOpsDashboardCli(
  argv = process.argv.slice(2),
  {
    fetchImpl = globalThis.fetch,
    execImpl = defaultExecImpl,
    execEnv = buildExecEnv(),
    now = () => new Date(),
    log = (line) => console.log(line),
    errorLog = (line) => console.error(line),
  } = {},
) {
  let options;
  try {
    options = parseOpsDashboardArgs(argv);
  } catch (error) {
    errorLog(`[ops-dashboard] 입력 오류: ${sanitizeOpsText(error instanceof Error ? error.message : "잘못된 옵션")}`);
    errorLog(USAGE_TEXT);
    return 2;
  }

  if (options.help) {
    log(USAGE_TEXT);
    return 0;
  }

  const report = await collectExtendedOpsDashboard({
    rootDir: options.rootDir,
    webUrl: options.webUrl,
    apiUrl: options.apiUrl,
    repoSlug: options.repoSlug,
    mobile3dReportPath: options.mobile3dReportPath,
    offline: options.offline,
    timeoutMs: options.timeoutMs,
    fetchImpl,
    execImpl,
    execEnv,
    now,
  });

  log(options.json ? JSON.stringify(report, null, 2) : formatExtendedOpsDashboardReport(report));
  return 0;
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  executeOpsDashboardCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[ops-dashboard] 실행 오류: ${sanitizeOpsText(error instanceof Error ? error.message : "알 수 없는 오류")}`);
      process.exitCode = 1;
    });
}
