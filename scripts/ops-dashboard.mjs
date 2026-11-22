#!/usr/bin/env node
/**
 * ToonStudio 크로스-LLM 통합 운영 상태판 CLI.
 *
 * 사용 예:
 *   node scripts/ops-dashboard.mjs
 *   node scripts/ops-dashboard.mjs --json
 *   node scripts/ops-dashboard.mjs --offline --json
 */
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
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
  validateHttpsOrigin,
} from "./lib/ops-dashboard-core.mjs";

const MODULE_PATH = realpathSync(fileURLToPath(import.meta.url));

export class OpsDashboardUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "OpsDashboardUsageError";
  }
}

export const USAGE_TEXT = [
  "사용법: node scripts/ops-dashboard.mjs [옵션]",
  "  --json                   크로스-LLM 기계 판독용 JSON 리포트 출력",
  "  --offline                라이브 HTTP 헬스 및 GitHub CI(gh) 조회 건너뛰기",
  "  --root <dir>             점검할 저장소 루트 경로 지정",
  `  --web-url <https-origin> 운영 웹 원점 지정 (기본: ${DEFAULT_WEB_URL})`,
  `  --api-url <https-origin> 운영 Core API 원점 지정 (기본: ${DEFAULT_API_URL})`,
  `  --timeout-ms <ms>        외부 요청·명령 제한 시간(200~10000, 기본 ${DEFAULT_TIMEOUT_MS})`,
  "  --help, -h               도움말 출력",
].join("\n");

function parseTimeoutMs(raw) {
  const text = String(raw ?? "").trim();
  const parsed = /^\d+$/u.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 200 || parsed > 10_000) {
    throw new OpsDashboardUsageError("--timeout-ms는 200~10000 범위의 정수여야 합니다.");
  }
  return parsed;
}

export function parseOpsDashboardArgs(argv) {
  const options = {
    json: false,
    offline: false,
    help: false,
    rootDir: DEFAULT_REPOSITORY_ROOT,
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

  const report = await collectOpsDashboard({
    rootDir: options.rootDir,
    webUrl: options.webUrl,
    apiUrl: options.apiUrl,
    repoSlug: options.repoSlug,
    offline: options.offline,
    timeoutMs: options.timeoutMs,
    fetchImpl,
    execImpl,
    execEnv,
    now,
  });

  log(options.json ? JSON.stringify(report, null, 2) : formatOpsDashboardReport(report));
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
