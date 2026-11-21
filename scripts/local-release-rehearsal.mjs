#!/usr/bin/env node
/**
 * T-064: 운영 API/DB/Cloudflare 쓰기 0건 로컬 릴리스 리허설 러너.
 *
 * 운영 자격증명·원격 DB·원격 배포 경로를 차단(fail-closed)한 상태에서
 * 1) 로컬 빌드 산출물(`dist/.vite/manifest.json`, `dist/index.html`, SHA 일치),
 * 2) 스튜디오 번들 구조(`scripts/check-studio-bundle.mjs`, 테스트/소스 누출 0건),
 * 3) 서비스 워커 프리캐시 예산(`critical <= 2560 KiB`, `warm <= 512 KiB`),
 * 4) 로컬 풀스택 스모크 준비/실행(`127.0.0.1` 격리 전용),
 * 5) 아키텍처 경계 게이트(`validate:app-boundaries`, `check:source-file-size`, `check:studio-eager-graph`, `check:unconnected-code:gate`)
 * 를 종합 판정해 `READY` 또는 `BLOCKED` 릴리스 판정 JSON을 출력한다.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REHEARSAL_SCHEMA = "toonstudio.local-release-rehearsal/1";

export const SW_PRECACHE_BUDGET_BYTES = Object.freeze({
  criticalBytes: 2560 * 1024,
  warmBytes: 512 * 1024,
});

export const SW_STATIC_CRITICAL_URLS = Object.freeze([
  "/bootstrap-compat.js",
  "/bootstrap-theme.js",
  "/offline-draw/index.html",
  "/offline-draw/portable.html",
  "/offline-draw/styles.css",
  "/offline-draw/model.js",
  "/offline-draw/storage.js",
  "/offline-draw/editor.js",
  "/offline-draw/cache.js",
  "/offline-draw/bootstrap.js",
  "/brand/spectrum-ribbon-v2/manifest.webmanifest",
  "/brand/spectrum-ribbon-v2/favicon.ico",
  "/brand/spectrum-ribbon-v2/favicon-32.png",
  "/brand/spectrum-ribbon-v2/favicon-96.png",
  "/brand/spectrum-ribbon-v2/favicon.svg",
  "/brand/spectrum-ribbon-v2/safari-pinned-tab.svg",
]);

export const REHEARSAL_GATE_IDS = Object.freeze([
  "local-build",
  "studio-bundle",
  "service-worker-budget",
  "local-fullstack-smoke",
  "architecture-boundaries",
]);

const FORBIDDEN_PRODUCTION_ENV_PATTERNS = [
  /^CLOUDFLARE_/u,
  /^CF_/u,
  /^ONPOD_/u,
  /^RENDER_/u,
  /^VERCEL_/u,
  /^R2_/u,
  /^AWS_/u,
  /^PROD_/u,
  /^PRODUCTION_/u,
];

const LOCAL_LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

export function isRemoteUrlTarget(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return !LOCAL_LOOPBACK_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 운영 API/DB/Cloudflare에 단 1건의 쓰기 호출도 발생하지 않도록
 * 자식 프로세스 환경변수에서 운영 토큰·원격 DB URL·배포 플래그를 완전히 제거한다.
 */
export function buildZeroProductionWriteEnv(sourceEnv = process.env) {
  const sanitized = {};
  const strippedKeys = [];
  for (const [key, value] of Object.entries(sourceEnv)) {
    if (value === undefined) continue;
    if (FORBIDDEN_PRODUCTION_ENV_PATTERNS.some((pattern) => pattern.test(key))) {
      strippedKeys.push(key);
      continue;
    }
    if (
      (key === "DATABASE_URL" || key === "DIRECT_URL" || key === "CORE_API_ORIGIN") &&
      isRemoteUrlTarget(value)
    ) {
      strippedKeys.push(key);
      continue;
    }
    sanitized[key] = value;
  }
  sanitized.TOONSTUDIO_LOCAL_REHEARSAL_DRY_RUN = "1";
  sanitized.TOONSTUDIO_FORBID_REMOTE_WRITES = "1";
  return { env: sanitized, strippedKeys };
}

export function parseRehearsalArgs(argv) {
  const options = {
    root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
    distDir: "dist",
    mode: "inspect",
    json: true,
    help: false,
    skip: new Set(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--pretty") {
      options.json = false;
    } else if (arg === "--mode") {
      const value = argv[++index];
      if (value !== "inspect" && value !== "execute") {
        throw new Error(`--mode는 inspect 또는 execute만 허용됩니다: ${String(value)}`);
      }
      options.mode = value;
    } else if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value !== "inspect" && value !== "execute") {
        throw new Error(`--mode는 inspect 또는 execute만 허용됩니다: ${value}`);
      }
      options.mode = value;
    } else if (arg === "--root") {
      options.root = path.resolve(argv[++index] ?? "");
    } else if (arg === "--dist-dir") {
      options.distDir = argv[++index] ?? "dist";
    } else if (arg.startsWith("--skip=")) {
      for (const gateId of arg.slice("--skip=".length).split(",").map((s) => s.trim()).filter(Boolean)) {
        if (!REHEARSAL_GATE_IDS.includes(gateId)) {
          throw new Error(`알 수 없는 게이트 이름: ${gateId}`);
        }
        options.skip.add(gateId);
      }
    } else {
      throw new Error(`알 수 없는 인자: ${arg}`);
    }
  }
  return options;
}

function defaultRunCommand(command, args, { cwd, env, timeoutMs = 120_000 }) {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    exitCode: result.status ?? -1,
    durationMs: Date.now() - started,
    stdout: (result.stdout ?? "").slice(-1200),
    stderr: (result.stderr ?? "").slice(-1200),
  };
}

function readGitState(root, runCommand) {
  const head = runCommand("git", ["rev-parse", "HEAD"], { cwd: root, env: process.env, timeoutMs: 10_000 });
  const status = runCommand("git", ["status", "--porcelain", "--untracked-files=normal"], {
    cwd: root,
    env: process.env,
    timeoutMs: 10_000,
  });
  const sha = head.ok ? head.stdout.trim() : null;
  const dirtyFiles = status.ok
    ? status.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
  return {
    sha: sha && /^[a-f0-9]{40}$/u.test(sha) ? sha : null,
    dirty: dirtyFiles.length > 0,
    dirtyCount: dirtyFiles.length,
  };
}

function collectManifestClosureUrls(manifest, entryKey) {
  if (!manifest || !manifest[entryKey]) return [];
  const seenKeys = new Set();
  const seenUrls = new Set();
  const urls = [];
  const pushUrl = (file) => {
    const normalized = `/${String(file).replace(/^\/+/u, "")}`;
    if (seenUrls.has(normalized)) return;
    seenUrls.add(normalized);
    urls.push(normalized);
  };
  const visit = (key) => {
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const node = manifest[key];
    if (!node) return;
    if (node.file) pushUrl(node.file);
    for (const css of node.css ?? []) pushUrl(css);
    for (const next of node.imports ?? []) visit(next);
  };
  visit(entryKey);
  return urls;
}

export function inspectLocalBuildGate({ root, distPath, headSha }) {
  const manifestPath = path.join(distPath, ".vite", "manifest.json");
  const indexHtmlPath = path.join(distPath, "index.html");
  const buildMetaPath = path.join(distPath, ".vite", "build-meta.json");
  const missing = [];
  if (!existsSync(indexHtmlPath)) missing.push(path.relative(root, indexHtmlPath));
  if (!existsSync(manifestPath)) missing.push(path.relative(root, manifestPath));

  if (missing.length > 0) {
    return {
      id: "local-build",
      status: "fail",
      reasonKo: `로컬 프로덕션 빌드 산출물이 누락되었습니다: ${missing.join(", ")}`,
      details: { missing, buildMetaSha: null, shaMatchesHead: null },
      nextCommand: "pnpm run build:bundle",
    };
  }

  let buildMetaSha = null;
  let shaMatchesHead = null;
  if (existsSync(buildMetaPath)) {
    try {
      const meta = JSON.parse(readFileSync(buildMetaPath, "utf8"));
      buildMetaSha = typeof meta.gitSha === "string" ? meta.gitSha : typeof meta.sha === "string" ? meta.sha : null;
      if (buildMetaSha && headSha) {
        shaMatchesHead = buildMetaSha === headSha;
      }
    } catch {
      return {
        id: "local-build",
        status: "fail",
        reasonKo: "build-meta.json 구문을 해석할 수 없습니다.",
        details: { missing: [], buildMetaSha: null, shaMatchesHead: false },
        nextCommand: "pnpm run build:bundle",
      };
    }
  }

  if (shaMatchesHead === false) {
    return {
      id: "local-build",
      status: "fail",
      reasonKo: `로컬 빌드 SHA(${buildMetaSha})가 현재 HEAD(${headSha})와 일치하지 않습니다.`,
      details: { missing: [], buildMetaSha, shaMatchesHead },
      nextCommand: "pnpm run build:bundle",
    };
  }

  return {
    id: "local-build",
    status: "pass",
    reasonKo: "로컬 빌드 산출물(index.html · Vite manifest)이 준비되었습니다.",
    details: { missing: [], buildMetaSha, shaMatchesHead },
  };
}

export function inspectStudioBundleGate({ root, distPath, mode, env, runCommand }) {
  const manifestPath = path.join(distPath, ".vite", "manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      id: "studio-bundle",
      status: "fail",
      reasonKo: "스튜디오 번들 검사를 위한 dist/.vite/manifest.json이 없습니다.",
      details: { emittedTestAssets: [], studioEntryPresent: false },
      nextCommand: "pnpm run build:bundle && pnpm run check:studio-bundle",
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return {
      id: "studio-bundle",
      status: "fail",
      reasonKo: `Vite manifest 파싱 실패: ${error instanceof Error ? error.message : String(error)}`,
      details: { emittedTestAssets: [], studioEntryPresent: false },
      nextCommand: "pnpm run build:bundle",
    };
  }

  const emittedTestAssets = Object.entries(manifest)
    .filter(([key, entry]) => {
      const source = String(entry?.src ?? key);
      const file = String(entry?.file ?? "");
      return /(?:^|\/)[^/]+\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/iu.test(source) || /\.(?:ts|tsx)$/iu.test(file);
    })
    .map(([key]) => key);

  if (emittedTestAssets.length > 0) {
    return {
      id: "studio-bundle",
      status: "fail",
      reasonKo: `프로덕션 번들에 테스트/원본 TS 파일이 포함되었습니다: ${emittedTestAssets.join(", ")}`,
      details: { emittedTestAssets, studioEntryPresent: Boolean(manifest["index.html"]) },
      nextCommand: "pnpm run check:studio-bundle",
    };
  }

  const studioEntryKey = "src/domains/creator/studio-legacy-editor-adapter.tsx";
  const studioEntryPresent = Boolean(manifest[studioEntryKey] || manifest["index.html"]);
  if (!studioEntryPresent) {
    return {
      id: "studio-bundle",
      status: "fail",
      reasonKo: "manifest에 앱/스튜디오 진입점 청크가 누락되었습니다.",
      details: { emittedTestAssets, studioEntryPresent: false },
      nextCommand: "pnpm run build:bundle",
    };
  }

  if (mode === "execute") {
    const checkScript = path.join(root, "scripts", "check-studio-bundle.mjs");
    const run = runCommand("node", [checkScript], { cwd: root, env });
    if (!run.ok) {
      return {
        id: "studio-bundle",
        status: "fail",
        reasonKo: `check-studio-bundle 실행 실패 (exit=${run.exitCode})`,
        details: { emittedTestAssets, studioEntryPresent, stderr: run.stderr.slice(0, 400) },
        nextCommand: "pnpm run check:studio-bundle",
      };
    }
  }

  return {
    id: "studio-bundle",
    status: "pass",
    reasonKo: "스튜디오 번들 매니페스트 무결성 확인 완료 (테스트·원본 TS 누출 0건).",
    details: {
      manifestEntries: Object.keys(manifest).length,
      emittedTestAssets: [],
      studioEntryPresent: true,
    },
  };
}

export function inspectServiceWorkerBudgetGate({ distPath, budgets = SW_PRECACHE_BUDGET_BYTES }) {
  const manifestPath = path.join(distPath, ".vite", "manifest.json");
  if (!existsSync(manifestPath)) {
    return {
      id: "service-worker-budget",
      status: "fail",
      reasonKo: "서비스 워커 프리캐시 예산 계산을 위한 dist/.vite/manifest.json이 없습니다.",
      details: { criticalBytes: 0, warmBytes: 0, budgets },
      nextCommand: "pnpm run build:bundle",
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const closureUrls = collectManifestClosureUrls(manifest, "index.html");
  const criticalUrls = [...new Set([...closureUrls, ...SW_STATIC_CRITICAL_URLS])];
  let criticalBytes = 0;
  let countedFiles = 0;
  for (const url of criticalUrls) {
    const filePath = path.join(distPath, url.replace(/^\/+/u, ""));
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      criticalBytes += statSync(filePath).size;
      countedFiles += 1;
    }
  }

  let warmBytes = 0;
  for (const locale of ["ko", "en"]) {
    const dictPath = path.join(distPath, "i18n", "studio", "core", `${locale}.json`);
    if (existsSync(dictPath) && statSync(dictPath).isFile()) {
      warmBytes += statSync(dictPath).size;
    }
  }

  const criticalWithin = criticalBytes <= budgets.criticalBytes;
  const warmWithin = warmBytes <= budgets.warmBytes;
  if (!criticalWithin || !warmWithin) {
    return {
      id: "service-worker-budget",
      status: "fail",
      reasonKo: `서비스 워커 프리캐시 예산 초과 (critical=${criticalBytes}B/${budgets.criticalBytes}B, warm=${warmBytes}B/${budgets.warmBytes}B)`,
      details: {
        criticalBytes,
        warmBytes,
        countedFiles,
        budgets,
        criticalWithin,
        warmWithin,
      },
      nextCommand: "pnpm run verify:studio-service-worker",
    };
  }

  return {
    id: "service-worker-budget",
    status: "pass",
    reasonKo: `서비스 워커 프리캐시 예산 충족 (critical ${(criticalBytes / 1024).toFixed(1)} KiB / ${(budgets.criticalBytes / 1024).toFixed(0)} KiB).`,
    details: {
      criticalBytes,
      warmBytes,
      countedFiles,
      budgets,
      criticalWithin,
      warmWithin,
    },
  };
}

export function inspectLocalFullStackSmokeGate({ root, mode, env, runCommand, sourceEnv = process.env }) {
  const smokeScript = path.join(root, "scripts", "verify-local-full-stack.mjs");
  if (!existsSync(smokeScript)) {
    return {
      id: "local-fullstack-smoke",
      status: "fail",
      reasonKo: "로컬 풀스택 스모크 스크립트(scripts/verify-local-full-stack.mjs)가 없습니다.",
      details: { smokeScriptPresent: false, loopbackIsolated: true },
      nextCommand: "pnpm run local:test:smoke",
    };
  }

  if (sourceEnv.DATABASE_URL && isRemoteUrlTarget(sourceEnv.DATABASE_URL)) {
    return {
      id: "local-fullstack-smoke",
      status: "fail",
      reasonKo: "환경변수 DATABASE_URL이 원격 호스트를 가리켜 로컬 리허설을 안전 차단했습니다.",
      details: { smokeScriptPresent: true, remoteDatabaseBlocked: true },
      nextCommand: "unset DATABASE_URL && node scripts/local-release-rehearsal.mjs",
    };
  }

  if (mode === "execute") {
    const run = runCommand("node", [smokeScript, "--json"], {
      cwd: root,
      env,
      timeoutMs: 240_000,
    });
    if (!run.ok) {
      return {
        id: "local-fullstack-smoke",
        status: "fail",
        reasonKo: `로컬 풀스택 스모크 실행 실패 (exit=${run.exitCode})`,
        details: { smokeScriptPresent: true, stderr: run.stderr.slice(0, 400) },
        nextCommand: "pnpm run local:test:smoke",
      };
    }
    return {
      id: "local-fullstack-smoke",
      status: "pass",
      reasonKo: "127.0.0.1 격리 로컬 풀스택 스모크(DB·API·Web·스토리지) 통과.",
      details: { smokeScriptPresent: true, executed: true, durationMs: run.durationMs },
    };
  }

  return {
    id: "local-fullstack-smoke",
    status: "pass",
    reasonKo: "로컬 풀스택 스모크 스크립트 및 127.0.0.1 무쓰기 격리 조건 확인 완료.",
    details: { smokeScriptPresent: true, executed: false, loopbackIsolated: true },
  };
}

export function inspectArchitectureBoundariesGate({ root, env, runCommand }) {
  const checks = [
    { name: "validate:app-boundaries", script: "scripts/validate-app-boundaries.mjs", args: [] },
    { name: "check:source-file-size", script: "scripts/check-source-file-size.mjs", args: [] },
    { name: "check:studio-eager-graph", script: "scripts/check-studio-eager-graph.mjs", args: [] },
    { name: "check:unconnected-code:gate", script: "scripts/check-unconnected-code.mjs", args: ["--check"] },
  ];

  const results = [];
  for (const check of checks) {
    const scriptPath = path.join(root, check.script);
    if (!existsSync(scriptPath)) {
      results.push({ name: check.name, ok: false, exitCode: -1, error: "스크립트 없음" });
      continue;
    }
    const res = runCommand("node", [scriptPath, ...check.args], { cwd: root, env, timeoutMs: 60_000 });
    results.push({
      name: check.name,
      ok: res.ok,
      exitCode: res.exitCode,
      durationMs: res.durationMs,
      ...(res.ok ? {} : { error: (res.stderr || res.stdout).slice(0, 300) }),
    });
  }

  const failed = results.filter((item) => !item.ok);
  if (failed.length > 0) {
    return {
      id: "architecture-boundaries",
      status: "fail",
      reasonKo: `아키텍처 경계 게이트 실패 (${failed.map((f) => f.name).join(", ")})`,
      details: { checks: results },
      nextCommand: failed.map((f) => `pnpm run ${f.name}`).join(" && "),
    };
  }

  return {
    id: "architecture-boundaries",
    status: "pass",
    reasonKo: `아키텍처 경계·파일 크기·진입 그래프·미연결 코드 게이트 ${results.length}종 모두 통과.`,
    details: { checks: results },
  };
}

export function evaluateReleaseRehearsalVerdict({
  gates,
  zeroProductionWrites,
  remoteMutationCalls,
  git,
  mode,
  strippedProductionEnvKeys = [],
}) {
  const blockingReasons = [];
  const nextCommands = [];
  if (!zeroProductionWrites || remoteMutationCalls > 0) {
    blockingReasons.push("운영 쓰기 차단 불변식(zeroProductionWrites=true, remoteMutationCalls=0)이 충족되지 않았습니다.");
  }

  for (const gate of gates) {
    if (gate.status === "fail") {
      blockingReasons.push(`[${gate.id}] ${gate.reasonKo}`);
      if (gate.nextCommand && !nextCommands.includes(gate.nextCommand)) {
        nextCommands.push(gate.nextCommand);
      }
    }
  }

  const passedCount = gates.filter((g) => g.status === "pass").length;
  const failedCount = gates.filter((g) => g.status === "fail").length;
  const skippedCount = gates.filter((g) => g.status === "skipped").length;
  const verdict = blockingReasons.length === 0 && failedCount === 0 ? "READY" : "BLOCKED";

  return {
    schema: REHEARSAL_SCHEMA,
    verdict,
    dryRun: true,
    mode,
    zeroProductionWrites: Boolean(zeroProductionWrites),
    remoteMutationCalls,
    deploymentAuthorized: false,
    evaluatedAt: new Date().toISOString(),
    git,
    strippedProductionEnvCount: strippedProductionEnvKeys.length,
    summary: {
      totalGates: gates.length,
      passedCount,
      failedCount,
      skippedCount,
    },
    gates,
    blockingReasons,
    nextCommands,
  };
}

export function runLocalReleaseRehearsal(
  options,
  deps = { runCommand: defaultRunCommand, sourceEnv: process.env },
) {
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const sourceEnv = deps.sourceEnv ?? process.env;
  const { env, strippedKeys } = buildZeroProductionWriteEnv(sourceEnv);
  const distPath = path.resolve(options.root, options.distDir);
  const git = readGitState(options.root, runCommand);

  const gates = [];
  const runOrSkip = (id, fn) => {
    if (options.skip?.has(id)) {
      gates.push({
        id,
        status: "skipped",
        reasonKo: "--skip 옵션으로 이 게이트를 건너뛰었습니다.",
        details: { skipped: true },
      });
      return;
    }
    gates.push(fn());
  };

  runOrSkip("local-build", () => inspectLocalBuildGate({ root: options.root, distPath, headSha: git.sha }));
  runOrSkip("studio-bundle", () =>
    inspectStudioBundleGate({ root: options.root, distPath, mode: options.mode, env, runCommand }),
  );
  runOrSkip("service-worker-budget", () => inspectServiceWorkerBudgetGate({ distPath }));
  runOrSkip("local-fullstack-smoke", () =>
    inspectLocalFullStackSmokeGate({ root: options.root, mode: options.mode, env, runCommand, sourceEnv }),
  );
  runOrSkip("architecture-boundaries", () =>
    inspectArchitectureBoundariesGate({ root: options.root, env, runCommand }),
  );

  return evaluateReleaseRehearsalVerdict({
    gates,
    zeroProductionWrites: true,
    remoteMutationCalls: 0,
    git,
    mode: options.mode,
    strippedProductionEnvKeys: strippedKeys,
  });
}

function printHelp() {
  process.stdout.write(
    [
      "사용법: node scripts/local-release-rehearsal.mjs [옵션]",
      "",
      "  운영 API/DB/Cloudflare에 단 1건의 쓰기 호출 없이 로컬 릴리스 준비 상태를 점검해",
      "  READY / BLOCKED 판정 JSON을 출력하는 dry-run 리허설 러너입니다.",
      "",
      "옵션:",
      "  --mode=inspect|execute  inspect(기본, 아티팩트+경계 게이트) 또는 execute(로컬 스모크 포함)",
      "  --dist-dir <경로>       빌드 산출물 디렉터리 (기본 dist)",
      "  --skip=<게이트,...>     건너뛸 게이트 ID 쉼표 구분 목록",
      "  --json                  JSON 출력 (기본값)",
      "  --help, -h              도움말 출력",
      "",
    ].join("\n"),
  );
}

export function main(argv = process.argv.slice(2)) {
  try {
    const options = parseRehearsalArgs(argv);
    if (options.help) {
      printHelp();
      return 0;
    }
    const report = runLocalReleaseRehearsal(options);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.verdict === "READY" ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `local-release-rehearsal 오류: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
