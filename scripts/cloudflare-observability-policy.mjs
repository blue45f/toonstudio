import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { analyticsDeploymentConfig } from "./deploy-cloudflare-analytics.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);

export const CLOUDFLARE_OBSERVABILITY_CONFIG_PATHS = Object.freeze([
  "deploy/cloudflare-apex-redirect/wrangler.jsonc",
  "deploy/cloudflare-realtime/wrangler.jsonc",
  "deploy/cloudflare-static/wrangler.jsonc",
]);

const ANALYTICS_SOURCE = "scripts/deploy-cloudflare-analytics.mjs";
const REVIEW = "계정 요금제·공유 사용량·비용 근거를 확인한 뒤 관측 활성화 정책을 검토하세요.";
const RECHECK = "설정을 복구하고 pnpm run verify:free-infrastructure를 다시 실행하세요.";

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// 기존 realtime 계약과 같은 Wrangler raw parser를 사용한다. 기본값 정규화,
// 저장소의 배포 redirect, 로컬 환경변수 로딩으로 미선언 설정을 보충하지 않는다.
// Wrangler는 파싱 시점에만 로드하므로 순수 정책 import에는 CLI를 올리지 않는다.
export function parseObservabilityWranglerJsonc(source) {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-observability-policy-"));
  try {
    const config = join(directory, "wrangler.jsonc");
    writeFileSync(config, source, { encoding: "utf8", mode: 0o600 });
    const { experimental_readRawConfig } = require("wrangler");
    const { rawConfig } = experimental_readRawConfig({ config });
    if (!record(rawConfig)) throw new Error("Wrangler 설정의 최상위 값은 객체여야 합니다.");
    return rawConfig;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function inspectScope(scope, label, issues) {
  if (!record(scope)) {
    issues.push(`${label}: Worker 설정은 객체여야 합니다. ${RECHECK}`);
    return;
  }
  const observability = scope.observability;
  if (observability !== undefined) {
    if (!record(observability)) {
      issues.push(`${label}.observability: 객체 설정이 필요합니다. ${RECHECK}`);
    } else {
      inspectObservability(observability, `${label}.observability`, issues);
    }
  }
  // 런타임의 정확한 문자열 opt-in과 일치시킨다. 다른 변수·문자열은 검색하지 않는다.
  if (scope.vars?.EDGE_ERROR_DIAGNOSTICS_ENABLED === "true") {
    issues.push(`${label}.vars.EDGE_ERROR_DIAGNOSTICS_ENABLED: 새 오류 진단을 명시 활성화했습니다. ${REVIEW}`);
  }
}

function inspectObservability(observability, label, issues) {
  // 확인한 Wrangler 경로만 검사한다. enabled는 logs.enabled의 별칭이며
  // traces/Issues 비활성화를 뜻하지 않는다. persist는 logs/traces에만 있다.
  // https://developers.cloudflare.com/workers/wrangler/configuration/#observability
  // https://developers.cloudflare.com/workers/observability/opentelemetry-export/
  const booleanPaths = [["enabled"]];
  for (const feature of ["logs", "traces", "issues"]) {
    if (observability[feature] !== undefined && !record(observability[feature])) {
      issues.push(`${label}.${feature}: 객체 설정이 필요합니다. ${RECHECK}`);
      continue;
    }
    booleanPaths.push([feature, "enabled"]);
    if (feature !== "issues") booleanPaths.push([feature, "persist"]);
  }
  for (const path of booleanPaths) {
    const value = path.reduce((parent, key) => parent?.[key], observability);
    if (value !== undefined && typeof value !== "boolean") {
      issues.push(`${label}.${path.join(".")}: boolean 설정이 필요합니다. ${RECHECK}`);
    }
  }

  const logsEnabled = observability.logs?.enabled ?? observability.enabled;
  const enabledPaths = [
    [observability.logs?.enabled !== undefined ? "logs.enabled" : "enabled", logsEnabled],
    ["traces.enabled", observability.traces?.enabled],
    ["issues.enabled", observability.issues?.enabled],
  ];
  for (const [path, enabled] of enabledPaths) {
    if (enabled === true) issues.push(`${label}.${path}: 관측 수집을 명시 활성화했습니다. ${REVIEW}`);
  }
  for (const [feature, enabled] of [["logs", logsEnabled], ["traces", observability.traces?.enabled]]) {
    // 명시 비활성인 소스의 persist:true만으로 실제 저장이 켜졌다고 판정하지 않는다.
    // 활성 여부 미선언 상태의 새 persistence도 검토하지만 과금 발생으로 단정하지 않는다.
    if (observability[feature]?.persist === true && enabled !== false) {
      issues.push(`${label}.${feature}.persist: 수집 비활성이 확인되지 않은 영구 저장 설정입니다. ${REVIEW}`);
    }
  }
}

/** 저장소의 명시 opt-in만 검사한다. 통과해도 live 설정·사용량·0원은 확인되지 않는다. */
export function validateCloudflareObservabilityConfig(config, label = "Worker 설정", { analytics = false } = {}) {
  const issues = [];
  inspectScope(config, label, issues);
  if (!record(config)) return issues;
  if (analytics && config.observability?.enabled !== false) {
    issues.push(`${label}.observability.enabled: Analytics 생성기의 기존 false 기본값을 유지하세요. ${REVIEW}`);
  }
  if (config.env !== undefined) {
    if (!record(config.env)) {
      issues.push(`${label}.env: 환경별 설정은 객체여야 합니다. ${RECHECK}`);
    } else {
      for (const name of Object.keys(config.env).sort()) inspectScope(config.env[name], `${label}.env.${name}`, issues);
    }
  }
  return issues;
}

function inspectAnalytics(factory) {
  const issues = [];
  // 생성 함수만 호출한다. 실제 계정·환경변수·Git·네트워크·배포 함수는 읽거나 실행하지 않는다.
  const sha = "a".repeat(40);
  const modes = [
    { production: false, environment: {}, gitState: undefined },
    {
      production: true,
      environment: {
        CLOUDFLARE_ACCOUNT_ID: "0".repeat(32),
        TRAFFIC_ANALYTICS_D1_DATABASE_ID: "00000000-0000-0000-0000-000000000001",
        TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "cloudflare-analytics-production",
        TOONSPECTRUM_APPROVED_MAIN_SHA: sha,
      },
      gitState: { head: sha, branch: "main", dirty: false },
    },
  ];
  for (const { production, environment, gitState } of modes) {
    const label = `${ANALYTICS_SOURCE} (${production ? "production" : "dry-run"})`;
    try {
      const config = factory(environment, production, gitState);
      issues.push(...validateCloudflareObservabilityConfig(config, label, { analytics: true }));
    } catch {
      // 외부 오류 원문에 설정/환경변수가 들어갈 수 있으므로 출력하지 않는다.
      issues.push(`${label}: 설정 생성 검사를 완료하지 못했습니다. ${RECHECK}`);
    }
  }
  return issues;
}

export function validateCloudflareObservabilityRepository(root = ROOT, { analyticsConfigFactory = analyticsDeploymentConfig } = {}) {
  const issues = [];
  for (const path of CLOUDFLARE_OBSERVABILITY_CONFIG_PATHS) {
    try {
      const config = parseObservabilityWranglerJsonc(readFileSync(resolve(root, path), "utf8"));
      issues.push(...validateCloudflareObservabilityConfig(config, path));
    } catch {
      // JSONC 오류의 원문, 변수 값, 절대 임시 경로를 노출하지 않는다.
      issues.push(`${path}: 설정 파일을 읽거나 JSONC 객체로 해석하지 못했습니다. ${RECHECK}`);
    }
  }
  issues.push(...inspectAnalytics(analyticsConfigFactory));
  return issues;
}
