#!/usr/bin/env node
/**
 * 크로스-LLM(Gemini · GPT/Codex · Claude · Cursor · OpenCode) 단일 배포 매니페스트 로더,
 * JSON 브리핑 생성기, 위험/퇴역 명령 fail-closed 교정 가드 및 GitHub Actions `mode` 프리셋 해석기.
 *
 * 보안 불변식:
 * - 실제 토큰·시크릿·DSN 원문을 출력하거나 JSON 브리핑에 포함하지 않는다.
 * - 퇴역 인프라(vercel·render·supabase·neon) 및 금지 명령(--attach-db·onpod app rollback·rm)을
 *   사전 차단하고 정확한 서울 onpod `--image` 교정 명령을 안내한다.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ONPOD_CANONICAL_ORIGIN, redactSensitiveText } from "./deploy-auth-env.mjs";
import { buildRecommendedDeployCommand } from "./deploy-change-scope.mjs";
import {
  REQUIRED_ONPOD_CONFIRM_PHRASE,
  SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
  SAFE_ONPOD_WORKFLOW_COMMAND,
  WORKFLOW_DEPLOY_MODES,
  extractShaFromImageRef,
  formatReleaseStepSummary,
  resolveWorkflowModePlan,
  runResolveWorkflowPlanCli,
  runWriteStepSummaryCli,
} from "./deploy-workflow-mode.mjs";

export {
  REQUIRED_ONPOD_CONFIRM_PHRASE,
  SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
  SAFE_ONPOD_WORKFLOW_COMMAND,
  WORKFLOW_DEPLOY_MODES,
  extractShaFromImageRef,
  formatReleaseStepSummary,
  resolveWorkflowModePlan,
};

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));
export const ROOT = resolve(dirname(MODULE_PATH), "../..");
export const DEPLOY_MANIFEST_PATH = "deploy/DEPLOY_MANIFEST.json";
export const DEPLOY_MANIFEST_SCHEMA_VERSION = "toonstudio.deploy-manifest.v1";
export const DEPLOY_BRIEFING_SCHEMA_VERSION = "toonstudio.deploy-briefing.v1";
export const SAFE_LOCAL_OAUTH_WEB_COMMAND =
  "env -u CLOUDFLARE_API_TOKEN pnpm run deploy:web -- --wrangler-oauth";

const RETIRED_HOST_SUFFIXES = Object.freeze([
  { id: "render", domain: "onrender.com" },
  { id: "vercel", domain: "vercel.app" },
  { id: "neon", domain: "neon.tech" },
  { id: "supabase", domain: "supabase.co" },
]);
const SECRET_LEAK_PATTERN =
  /(?:postgres(?:ql)?:\/\/[^:/@\s]+:[^@\s]+@|\b(?:opk?|op_u|op_k|gh[pousr])_[A-Za-z0-9_-]{8,}|\bBearer\s+[A-Za-z0-9._~+/=-]{12,}|\bsk-[A-Za-z0-9_-]{12,})/iu;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateDeployManifest(manifest) {
  const issues = [];
  if (!isPlainObject(manifest)) return ["매니페스트 최상위 구조는 JSON 객체여야 합니다."];
  if (manifest.schemaVersion !== DEPLOY_MANIFEST_SCHEMA_VERSION) {
    issues.push(`schemaVersion은 ${DEPLOY_MANIFEST_SCHEMA_VERSION}이어야 합니다.`);
  }
  if (manifest.status !== "current") {
    issues.push("status는 'current'여야 합니다.");
  }

  const active = isPlainObject(manifest.activeInfra) ? manifest.activeInfra : {};
  if (active["cloudflare-static"]?.url !== "https://www.toonstudio.cloud") {
    issues.push("activeInfra['cloudflare-static'].url은 https://www.toonstudio.cloud여야 합니다.");
  }
  if (active["onpod-seoul-api"]?.url !== ONPOD_CANONICAL_ORIGIN) {
    issues.push(`activeInfra['onpod-seoul-api'].url은 ${ONPOD_CANONICAL_ORIGIN}여야 합니다.`);
  }
  if (active["onpod-seoul-db"]?.database !== "toonstudio-db") {
    issues.push("activeInfra['onpod-seoul-db'].database는 toonstudio-db여야 합니다.");
  }

  const retiredIds = new Set(
    Array.isArray(manifest.retiredInfra)
      ? manifest.retiredInfra.map((entry) => (typeof entry === "string" ? entry : entry?.id)).filter(Boolean)
      : [],
  );
  for (const requiredRetired of ["vercel", "render", "supabase"]) {
    if (!retiredIds.has(requiredRetired)) {
      issues.push(`retiredInfra에 퇴역/금지 항목 '${requiredRetired}'가 누락되었습니다.`);
    }
  }

  const forbiddenList = Array.isArray(manifest.forbiddenCommands)
    ? manifest.forbiddenCommands.map((entry) => (typeof entry === "string" ? entry : entry?.command)).filter(Boolean)
    : [];
  for (const requiredForbidden of [
    "onpod app deploy --attach-db",
    "onpod app rollback",
    "onpod app rm",
    "onpod db rm",
  ]) {
    if (!forbiddenList.includes(requiredForbidden)) {
      issues.push(`forbiddenCommands에 금지 명령 '${requiredForbidden}'가 누락되었습니다.`);
    }
  }

  if (manifest.approvalPolicy?.standingApprovalPath !== "deploy/STANDING_APPROVAL.json") {
    issues.push("approvalPolicy.standingApprovalPath는 deploy/STANDING_APPROVAL.json이어야 합니다.");
  }

  const workflowModes = Array.isArray(manifest.workflow?.modes) ? manifest.workflow.modes : [];
  for (const mode of WORKFLOW_DEPLOY_MODES) {
    if (!workflowModes.includes(mode)) {
      issues.push(`workflow.modes에 필수 프리셋 '${mode}'가 누락되었습니다.`);
    }
  }

  if (!isPlainObject(manifest.commands) || typeof manifest.commands.doctorJson !== "string") {
    issues.push("commands.doctorJson이 선언되어야 합니다.");
  }

  if (SECRET_LEAK_PATTERN.test(JSON.stringify(manifest))) {
    issues.push("매니페스트에 민감 자격증명 패턴이 포함되어 있습니다.");
  }

  return issues;
}

export function loadDeployManifest(rootDir = ROOT) {
  const manifestPath = join(rootDir, DEPLOY_MANIFEST_PATH);
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `[deploy:manifest] ${DEPLOY_MANIFEST_PATH}을 읽거나 파싱하지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  const issues = validateDeployManifest(parsed);
  if (issues.length > 0) {
    throw new Error(`[deploy:manifest] ${DEPLOY_MANIFEST_PATH} 검증 실패:\n - ${issues.join("\n - ")}`);
  }
  return parsed;
}

/**
 * 비로그인 서브셸·크로스-LLM 샌드박스에서 Node/pnpm/Homebrew/onpod 바이너리를 놓치지 않도록
 * HOME과 PATH를 자가치유해 정규화한다.
 */
export function buildSelfHealingExecPath({
  execPath = process.execPath,
  env = process.env,
  homeDir,
} = {}) {
  const detectedHome = homeDir
    ?? (env.HOME?.includes("/.gemini/") ? userInfo().homedir : env.HOME)
    ?? homedir();
  const nodeBin = dirname(execPath);
  const existing = (env.PATH ?? "").split(delimiter).filter(Boolean);
  const preferred = [
    nodeBin,
    detectedHome ? join(detectedHome, ".local", "share", "pnpm") : "",
    detectedHome ? join(detectedHome, ".local", "bin") : "",
    detectedHome ? join(detectedHome, ".onpod", "bin") : "",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    ...existing,
  ].filter(Boolean);
  const deduped = preferred.filter((entry, index, list) => list.indexOf(entry) === index);
  return {
    home: detectedHome || undefined,
    path: deduped.join(delimiter),
  };
}

function matchRetiredOriginHost(rawOrigin) {
  if (typeof rawOrigin !== "string" || !rawOrigin.trim()) return null;
  let hostname = "";
  try {
    hostname = new URL(rawOrigin.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  return (
    RETIRED_HOST_SUFFIXES.find(
      ({ domain }) => hostname === domain || hostname.endsWith(`.${domain}`),
    ) ?? null
  );
}

/**
 * 퇴역 인프라(Render·Vercel·Supabase·Neon) 또는 금지 onpod 명령/플래그(--attach-db,
 * onpod app rollback, onpod app rm, onpod db rm, --replace-env)를 탐지한다.
 * 인자 원문을 메시지에 반사하지 않으므로 시크릿 누출 없이 fail-closed 교정 안내만 반환한다.
 */
export function inspectForbiddenDeployArguments(argv = [], { rawOrigin = "" } = {}) {
  const tokens = Array.isArray(argv) ? argv.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
  const joinedLower = tokens.join(" ").toLowerCase();

  if (tokens.some((t) => /^--attach-db(?:=|$)/iu.test(t)) || /\b--attach-db\b/iu.test(joinedLower)) {
    return {
      code: "FORBIDDEN_ONPOD_ATTACH_DB",
      label: "onpod app deploy --attach-db",
      reason: "`--attach-db`는 운영 DB 비밀번호를 재발급·회전시켜 기존 런타임 시크릿 구성을 파손합니다.",
      safeCommand: SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
      workflowCommand: SAFE_ONPOD_WORKFLOW_COMMAND,
    };
  }

  if (
    /\bonpod\s+app\s+rollback\b/iu.test(joinedLower)
    || tokens.some((t) => /^(?:--rollback|rollback)$/iu.test(t))
  ) {
    return {
      code: "FORBIDDEN_ONPOD_ROLLBACK",
      label: "onpod app rollback",
      reason: "`onpod app rollback`은 환경변수 세대까지 함께 되돌려 출처 인증 시크릿 짝과 DB 비밀번호를 파손합니다.",
      safeCommand: SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
      workflowCommand: SAFE_ONPOD_WORKFLOW_COMMAND,
    };
  }

  if (
    /\bonpod\s+(?:app|db)\s+(?:rm|delete)\b/iu.test(joinedLower)
    || tokens.some((t) => /^--replace-env(?:=|$)/iu.test(t))
  ) {
    return {
      code: "FORBIDDEN_ONPOD_DESTRUCTIVE",
      label: "onpod 파괴적 삭제/전체 환경 덮어쓰기",
      reason: "운영 서울 onpod 앱·DB 삭제 또는 환경변수 전체 덮어쓰기는 금지되어 있습니다.",
      safeCommand: SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
      workflowCommand: SAFE_ONPOD_WORKFLOW_COMMAND,
    };
  }

  const retiredFlag = tokens.find((t) =>
    /^--(?:render|vercel|supabase|neon)(?:=|$)/iu.test(t)
    || /^--(?:profile|provider)=(?:render|vercel|supabase|neon)/iu.test(t),
  );
  if (retiredFlag) {
    const providerMatch = /(render|vercel|supabase|neon)/iu.exec(retiredFlag);
    const provider = (providerMatch?.[1] ?? "retired").toLowerCase();
    return {
      code: `RETIRED_PROVIDER_${provider.toUpperCase()}`,
      label: `퇴역 공급자(${provider})`,
      reason: `${provider} 인프라는 퇴역·미사용 상태입니다. 현역 Core API는 서울 onpod(${ONPOD_CANONICAL_ORIGIN}), 정적 웹은 Cloudflare(https://www.toonstudio.cloud)입니다.`,
      safeCommand: SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
      workflowCommand: SAFE_ONPOD_WORKFLOW_COMMAND,
    };
  }

  for (const token of tokens) {
    const candidateOrigin = token.startsWith("--core-origin=")
      ? token.slice("--core-origin=".length)
      : token;
    const retired = matchRetiredOriginHost(candidateOrigin);
    if (retired) {
      return {
        code: `RETIRED_ORIGIN_${retired.id.toUpperCase()}`,
        label: `퇴역 원점(${retired.domain})`,
        reason: `${retired.id}(${retired.domain}) 원점은 퇴역 상태입니다. 현역 서울 onpod 원점은 ${ONPOD_CANONICAL_ORIGIN}입니다.`,
        safeCommand: SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
        workflowCommand: SAFE_ONPOD_WORKFLOW_COMMAND,
      };
    }
  }

  const retiredFromEnv = matchRetiredOriginHost(rawOrigin);
  if (retiredFromEnv) {
    return {
      code: `RETIRED_ORIGIN_${retiredFromEnv.id.toUpperCase()}`,
      label: `퇴역 원점(${retiredFromEnv.domain})`,
      reason: `${retiredFromEnv.id}(${retiredFromEnv.domain}) 원점은 퇴역 상태입니다. 현역 서울 onpod 원점은 ${ONPOD_CANONICAL_ORIGIN}입니다.`,
      safeCommand: SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
      workflowCommand: SAFE_ONPOD_WORKFLOW_COMMAND,
    };
  }

  return null;
}

export function assertSafeDeployArguments(argv, { context = "deploy", rawOrigin = "" } = {}) {
  const violation = inspectForbiddenDeployArguments(argv, { rawOrigin });
  if (!violation) return;
  throw new Error(
    [
      `[${context}] 위험하거나 퇴역한 배포 인자가 감지되어 fail-closed로 차단했습니다 (${violation.label}).`,
      `• 사유: ${violation.reason}`,
      `• 서울 onpod 안전 교정 명령: ${violation.safeCommand}`,
      `• 클라우드 원클릭 대안: ${violation.workflowCommand}`,
    ].join("\n"),
  );
}

/**
 * 셸의 만료·불일치 CLOUDFLARE_API_TOKEN 충돌 시 OAuth 폴백 및 클라우드 대안 안내를 생성한다.
 */
export function buildCloudflareTokenConflictGuidance({
  hasShellToken = false,
  useLocalOAuth = false,
  localOAuthReady = false,
  accountIdConfigured = false,
} = {}) {
  const conflictDetected = Boolean(hasShellToken && !useLocalOAuth);
  const lines = [];
  if (conflictDetected) {
    lines.push(
      "[deploy:cloudflare] 셸 환경에 CLOUDFLARE_API_TOKEN이 설정되어 있어 만료·권한 불일치 충돌이 발생할 수 있습니다(토큰 원문 미출력).",
    );
    lines.push(`• 로컬 Wrangler OAuth 격리 실행: ${SAFE_LOCAL_OAUTH_WEB_COMMAND}`);
    lines.push("• GitHub Actions 클라우드 배포: gh workflow run cloud-production-deploy.yml -f mode=web-only");
    lines.push("• 통합 상태 진단(JSON): pnpm run deploy:doctor -- --json");
    if (!accountIdConfigured) {
      lines.push("• 참고: 로컬 OAuth 실행에는 .env.infrastructure.local 또는 셸의 CLOUDFLARE_ACCOUNT_ID(32자리)가 필요합니다.");
    } else if (localOAuthReady) {
      lines.push("• 확인됨: 로컬 Wrangler OAuth 세션으로 Worker·R2 조회가 정상 응답했습니다.");
    }
  }
  return {
    conflictDetected,
    fallbackCommand: SAFE_LOCAL_OAUTH_WEB_COMMAND,
    cloudCommand: "gh workflow run cloud-production-deploy.yml -f mode=web-only",
    doctorCommand: "pnpm run deploy:doctor -- --json",
    lines,
  };
}

export function inspectStandingApprovalStatus(rootDir = ROOT) {
  const readJsonSafe = (relPath) => {
    const abs = join(rootDir, relPath);
    if (!existsSync(abs)) return null;
    try {
      return JSON.parse(readFileSync(abs, "utf8"));
    } catch {
      return null;
    }
  };

  const rootApproval = readJsonSafe("deploy/STANDING_APPROVAL.json");
  const staticApproval = readJsonSafe("deploy/cloudflare-static/STANDING_APPROVAL.json");

  return {
    standingApprovalValid: Boolean(
      rootApproval
      && typeof rootApproval.grantedAt === "string"
      && Array.isArray(rootApproval.scopes)
      && rootApproval.scopes.length > 0,
    ),
    standingApprovalGrantedAt: typeof rootApproval?.grantedAt === "string" ? rootApproval.grantedAt : null,
    staticStandingApprovalValid: staticApproval?.scope === "cloudflare-static-production",
    staticStandingApprovalGrantedAt:
      typeof staticApproval?.grantedAt === "string" ? staticApproval.grantedAt : null,
  };
}

/**
 * `pnpm run deploy:doctor -- --json`용 크로스-LLM 단일 브리핑 JSON 객체를 생성한다.
 * 시크릿·토큰·DSN 원문을 일절 포함하지 않는다.
 */
export function buildCrossLlmDeployBriefing({
  rootDir = ROOT,
  manifest = loadDeployManifest(rootDir),
  originMainSha = null,
  originMainError = null,
  targetSha = "",
  gateInfo = null,
  ghEnv = { ghReady: false, environmentExists: false, configuredVariables: [], configuredSecrets: [] },
  scopeInfo = { unknownScope: true, baseSha: "", baseShaSource: "unavailable", diffSource: "unavailable", scope: null },
  localOAuthInfo = null,
  standingApproval = inspectStandingApprovalStatus(rootDir),
  generatedAt = new Date().toISOString(),
} = {}) {
  const effectiveSha = targetSha || originMainSha || null;
  const shaMatchesOriginMain = Boolean(effectiveSha && originMainSha && effectiveSha === originMainSha);
  const configuredVariables = Array.isArray(ghEnv?.configuredVariables) ? [...ghEnv.configuredVariables] : [];
  const configuredSecrets = Array.isArray(ghEnv?.configuredSecrets) ? [...ghEnv.configuredSecrets] : [];
  const cloudWebReady = Boolean(
    ghEnv?.ghReady
    && ghEnv?.environmentExists
    && configuredVariables.includes("CLOUDFLARE_ACCOUNT_ID")
    && configuredSecrets.includes("CLOUDFLARE_API_TOKEN"),
  );
  const cloudOnpodReady = Boolean(
    ghEnv?.ghReady
    && ghEnv?.environmentExists
    && configuredSecrets.includes("ONPOD_DEPLOY_TOKEN"),
  );
  const localOAuthReady = Boolean(
    localOAuthInfo?.workerStatus === 200 && localOAuthInfo?.r2Status === 200,
  );
  const shellApiTokenPresent = Boolean(localOAuthInfo?.shellApiTokenPresent);
  const shellApiTokenValid = localOAuthInfo?.shellApiTokenValid ?? null;
  const shellTokenConflict = Boolean(
    shellApiTokenPresent && (shellApiTokenValid === false || localOAuthReady),
  );

  const scope = scopeInfo?.scope ?? null;
  const unknownScope = Boolean(scopeInfo?.unknownScope || !scope);
  const changeScope = {
    unknownScope,
    baseSha: scopeInfo?.baseSha || null,
    baseShaSource: scopeInfo?.baseShaSource || "unavailable",
    diffSource: scopeInfo?.diffSource || "unavailable",
    webChanged: unknownScope ? null : Boolean(scope.webChanged),
    apiChanged: unknownScope ? null : Boolean(scope.apiChanged),
    apexChanged: unknownScope ? null : Boolean(scope.apexChanged),
    migrationsChanged: unknownScope ? null : Boolean(scope.migrationsChanged),
    changedFileCount: unknownScope ? null : scope.changedFiles.length,
    areas: unknownScope
      ? null
      : {
          web: scope.areas.web.length,
          api: scope.areas.api.length,
          apex: scope.areas.apex.length,
          migrations: scope.areas.migrations.length,
          shared: scope.areas.shared.length,
          nonDeployable: scope.areas.nonDeployable.length,
        },
  };

  const deploymentNeeded = unknownScope
    ? null
    : Boolean(scope.webChanged || scope.apiChanged || scope.apexChanged);

  const allCiGreen = Boolean(gateInfo?.allGreen);
  const readyToDeploy = Boolean(shaMatchesOriginMain && allCiGreen);

  let nextExactCommand;
  let nextExactCommandReason;
  let workflowDispatchCommand;

  if (!originMainSha) {
    nextExactCommand = ghEnv?.ghReady ? manifest.commands.doctorJson : "gh auth login";
    nextExactCommandReason = "원격 origin/main SHA를 확인하지 못했습니다. GitHub 인증 및 네트워크 상태를 점검하세요.";
    workflowDispatchCommand = manifest.commands.workflowDryRun;
  } else if (!shaMatchesOriginMain) {
    nextExactCommand = manifest.commands.doctorJson;
    nextExactCommandReason = "지정한 SHA가 현재 origin/main 끝 SHA와 일치하지 않습니다. 최신 origin/main 기준으로 다시 점검하세요.";
    workflowDispatchCommand = manifest.commands.workflowDryRun;
  } else if (!allCiGreen) {
    nextExactCommand = ghEnv?.ghReady
      ? manifest.commands.doctorJson
      : "gh auth login";
    nextExactCommandReason = gateInfo
      ? `필수 main push CI(core=${gateInfo.gates?.core ?? "unknown"}, verify=${gateInfo.gates?.verify ?? "unknown"})가 아직 녹색이 아닙니다.`
      : "필수 CI 체크를 조회하지 못했습니다. gh 인증 상태를 확인하세요.";
    workflowDispatchCommand = manifest.commands.workflowDryRun;
  } else if (unknownScope) {
    nextExactCommand = manifest.commands.cloudDryRun;
    nextExactCommandReason = "변경 범위를 자동 판별하지 못해 fail-closed 드라이런 명령을 안내합니다.";
    workflowDispatchCommand = manifest.commands.workflowDryRun;
  } else if (!deploymentNeeded) {
    nextExactCommand = manifest.commands.smokeOrigin;
    nextExactCommandReason = "운영 배포 대상(web·api·apex) 변경이 없어 배포를 생략하고 원점 상태만 확인합니다.";
    workflowDispatchCommand = null;
  } else if (scope.webChanged && !scope.apiChanged && !scope.apexChanged) {
    workflowDispatchCommand = manifest.commands.workflowWebOnly;
    if (cloudWebReady) {
      nextExactCommand = manifest.commands.cloudWeb;
      nextExactCommandReason = "웹 전용 변경이 감지되었고 GitHub production-deploy Cloudflare 인증이 준비되어 있습니다.";
    } else if (localOAuthReady) {
      nextExactCommand = shellApiTokenPresent
        ? SAFE_LOCAL_OAUTH_WEB_COMMAND
        : "pnpm run deploy:web -- --wrangler-oauth";
      nextExactCommandReason = shellApiTokenPresent
        ? "웹 전용 변경이 감지되었으며 셸 CLOUDFLARE_API_TOKEN 충돌을 피하기 위해 로컬 Wrangler OAuth 격리 배포를 권장합니다."
        : "웹 전용 변경이 감지되었으며 로컬 Wrangler OAuth 세션(Worker·R2 200)으로 즉시 배포할 수 있습니다.";
    } else {
      nextExactCommand = "pnpm run deploy:auth:sync";
      nextExactCommandReason = "웹 전용 변경이 감지되었으나 클라우드/로컬 Cloudflare 인증이 준비되지 않았습니다.";
    }
  } else if (scope.apiChanged && !scope.webChanged && !scope.apexChanged) {
    workflowDispatchCommand = manifest.commands.workflowApiOnly;
    nextExactCommand = manifest.commands.cloudApiImage;
    nextExactCommandReason =
      "Core API 전용 변경이 감지되었습니다. 상시 승인 범위인 GHCR 불변 이미지 발행 후, 사용자 명시 승인을 받아 서울 onpod 교체를 실행하세요.";
  } else {
    workflowDispatchCommand = manifest.commands.workflowSmartRelease;
    nextExactCommand = buildRecommendedDeployCommand(scope) ?? manifest.commands.cloudSmartRelease;
    nextExactCommandReason =
      "복합 변경 영역이 감지되어 변경된 단위만 선별하는 스마트 최소 배포 명령을 안내합니다.";
  }

  const briefing = {
    schemaVersion: DEPLOY_BRIEFING_SCHEMA_VERSION,
    generatedAt,
    manifestPath: DEPLOY_MANIFEST_PATH,
    repository: manifest.repository,
    branch: manifest.branch,
    release: {
      originMainSha,
      targetSha: effectiveSha,
      shaMatchesOriginMain,
      originMainError: originMainError ? redactSensitiveText(String(originMainError)) : null,
      requiredCi: gateInfo
        ? {
            runId: gateInfo.runId ?? null,
            runAttempt: gateInfo.runAttempt ?? null,
            runStatus: gateInfo.runStatus ?? "unknown",
            core: gateInfo.gates?.core ?? "missing",
            verify: gateInfo.gates?.verify ?? "missing",
            allGreen: Boolean(gateInfo.allGreen),
          }
        : null,
    },
    approvalPolicy: {
      ...manifest.approvalPolicy,
      ...standingApproval,
    },
    activeInfra: manifest.activeInfra,
    retiredInfra: manifest.retiredInfra,
    forbiddenCommands: manifest.forbiddenCommands,
    readiness: {
      ghReady: Boolean(ghEnv?.ghReady),
      environmentExists: Boolean(ghEnv?.environmentExists),
      cloudWebReady,
      cloudOnpodReady,
      configuredVariables,
      configuredSecrets,
      localOAuth: {
        checked: Boolean(localOAuthInfo?.checked),
        auth: localOAuthInfo?.auth ?? "unchecked",
        accountIdConfigured: Boolean(localOAuthInfo?.accountIdConfigured),
        workerStatus: localOAuthInfo?.workerStatus ?? null,
        r2Status: localOAuthInfo?.r2Status ?? null,
        ready: localOAuthReady,
        shellApiTokenPresent,
        shellApiTokenValid,
        shellTokenConflict,
        fallbackCommand: SAFE_LOCAL_OAUTH_WEB_COMMAND,
      },
    },
    changeScope,
    deploymentNeeded,
    readyToDeploy,
    nextExactCommand,
    nextExactCommandReason,
    workflowDispatchCommand,
    explicitApprovalCommands: {
      onpodApiDeploy: manifest.commands.workflowApiOnly,
      localOnpodApiDeploy: manifest.commands.cloudApiOnpod,
      directOnpodImageUpdate: SAFE_ONPOD_IMAGE_UPDATE_COMMAND,
      syncApiEnv: "pnpm run deploy:cloud -- --sync-api-env --confirm-onpod --watch",
    },
    smokeCommands: {
      origin: manifest.commands.smokeOrigin,
      postDeploy: manifest.commands.smokePostDeploy,
    },
    rollbackCommands: {
      web: manifest.commands.rollbackWeb,
      api: manifest.commands.rollbackApi,
    },
  };

  if (SECRET_LEAK_PATTERN.test(JSON.stringify(briefing))) {
    throw new Error("[deploy:doctor] 브리핑 출력에 민감 패턴이 감지되어 출력을 차단했습니다.");
  }

  return briefing;
}

if (process.argv[1] && realpathSync(process.argv[1]) === MODULE_PATH) {
  try {
    if (process.argv.includes("--resolve-workflow-plan")) {
      runResolveWorkflowPlanCli({ rootDir: ROOT });
    } else if (process.argv.includes("--write-step-summary")) {
      runWriteStepSummaryCli();
    } else {
      throw new Error("[deploy:manifest] 지원 옵션: --resolve-workflow-plan | --write-step-summary");
    }
  } catch (error) {
    console.error(redactSensitiveText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}
