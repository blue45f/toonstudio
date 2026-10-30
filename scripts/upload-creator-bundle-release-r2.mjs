#!/usr/bin/env node
/** 전체 GLB를 확인하고 같은 정적 index 원문을 마지막 R2 완료 객체로 게시한다. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/repo-paths.mjs";
import { BundleR2TransferError, createBundleR2Rest, transferFail } from "./lib/creator-bundle-r2-rest.mjs";
import { estimateBundleR2RequestBudget, prepareBundleR2Release, runBundleR2Release } from "./lib/creator-bundle-r2-release.mjs";
import { acquireBundleR2Attempt, authorizeBundleR2Production } from "./lib/creator-bundle-r2-release-gates.mjs";

export function parseBundleR2ReleaseArgs(argv) {
  const values = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (values.has(flag)) transferFail("ARGUMENTS", "중복 인자는 받지 않습니다. --help를 확인하세요.");
    if (["--check", "--remote-check", "--production", "--help"].includes(flag)) { values.set(flag, true); continue; }
    if (!["--asset-root", "--release-root", "--pack-rights", "--approved-sha", "--maximum-seconds", "--request-budget"].includes(flag)
      || !argv[i + 1] || argv[i + 1].startsWith("--")) transferFail("ARGUMENTS", "지원하지 않거나 값이 없는 인자입니다. 비밀값을 인자로 보내지 말고 --help를 확인하세요.");
    values.set(flag, argv[++i]);
  }
  if (values.get("--help")) return { help: true };
  const modes = ["--check", "--remote-check", "--production"].filter((flag) => values.has(flag));
  if (modes.length !== 1 || !values.get("--asset-root")) transferFail("ARGUMENTS", "--asset-root와 명시적인 모드 하나가 필요합니다. --help를 확인하세요.");
  const production = modes[0] === "--production", seconds = Number(values.get("--maximum-seconds") ?? "7200");
  const requestBudget = Number(values.get("--request-budget") ?? "100000");
  if (!Number.isSafeInteger(seconds) || seconds < 60 || seconds > 21_600) transferFail("ARGUMENTS", "전체 실행 상한은 60~21600초의 정수여야 합니다.");
  if (!Number.isSafeInteger(requestBudget) || requestBudget <= 0 || requestBudget > 100_000) transferFail("ARGUMENTS", "요청 수 예산은 1~100000의 정수여야 합니다.");
  if (production && (!values.has("--maximum-seconds") || !values.has("--request-budget"))) transferFail("ARGUMENTS", "운영은 --remote-check 계획을 검토한 뒤 --maximum-seconds와 --request-budget을 모두 명시해야 합니다. 기본 제한을 조용히 늘리지 않습니다.");
  if (production && (!/^[a-f0-9]{40}$/u.test(values.get("--approved-sha")) || values.has("--release-root") || values.has("--pack-rights"))) transferFail("ARGUMENTS", "운영은 정확한 --approved-sha와 현재 저장소의 고정 release·원장만 사용합니다.");
  return { mode: modes[0].slice(2), production, assetRoot: resolve(values.get("--asset-root")),
    releaseRoot: resolve(values.get("--release-root") ?? REPO_ROOT), ledgerPath: resolve(values.get("--pack-rights") ?? resolve(REPO_ROOT, "config/creator-bundle-pack-rights.json")),
    approvedSha: values.get("--approved-sha"), maximumDurationMs: seconds * 1000, requestBudget };
}

export async function runBundleR2ReleaseCli(argv, { environment = process.env, credentialProvider, log = (value) => console.log(JSON.stringify(value)) } = {}) {
  const options = parseBundleR2ReleaseArgs(argv);
  if (options.help) return "사용법: --asset-root <private GLB 입력> (--check | --remote-check | --production --approved-sha <main 40자리 SHA> --maximum-seconds <초> --request-budget <요청수>)\n읽기 모드만 --release-root <private publisher release>와 --pack-rights <원장>를 지정할 수 있습니다.\n--check는 네트워크 0, --remote-check는 전체 원격 SHA와 실제 productionBudget을 읽기만 합니다. 시간 계획은 전송 완료 보증이 아닙니다.\n토큰은 기존 CLOUDFLARE_API_TOKEN 메모리 환경 또는 명시 주입한 credentialProvider 함수 하나만 공급합니다. CLI·로그·journal에는 값과 hash를 넣지 않습니다.\n운영은 누락 GLB를 확인한 뒤 동일 index 원문을 release-index/<SHA>.json에 마지막 한 번 씁니다. legacy index·정적 release·descriptor·Worker는 게시하지 않습니다.";
  const gate = options.production ? authorizeBundleR2Production({ approvedSha: options.approvedSha, environment }) : null;
  const context = prepareBundleR2Release(options);
  if (options.mode === "check") return { mode: "check", ...context.summary, ...context.identity, completion: { ...context.completion, uploaded: 0, remoteState: "not-inspected" },
    productionBudgetEstimate: estimateBundleR2RequestBudget({ objects: context.summary.objects, missing: context.summary.objects,
      pages: 1, production: true, completionPresent: false }),
    estimateAssumption: "모든 객체 누락·목록 1페이지 가정이며 실제 원격 계획이 아닙니다", networkRequests: 0, productionWrites: 0 };
  const controller = new AbortController();
  const rest = createBundleR2Rest({ accountId: environment.CLOUDFLARE_ACCOUNT_ID, token: environment.CLOUDFLARE_API_TOKEN,
    credentialProvider, signal: controller.signal, maximumRequests: options.requestBudget });
  const journal = gate ? acquireBundleR2Attempt(gate, context.identity) : null;
  const timer = setTimeout(() => controller.abort(), options.maximumDurationMs); timer.unref?.();
  try {
    const result = await runBundleR2Release(context, { rest, production: options.production, maximumDurationMs: options.maximumDurationMs,
      requestBudget: options.requestBudget,
      assertWriteAuthority: gate ? async () => { gate.assertRemoteMain(); } : undefined,
      onEvent: async (event) => {
        journal?.append(event);
        if (["budget-planned", "remote-verified", "completion-put-verified"].includes(event.phase)
          || (event.phase === "put-verified" && (event.uploaded % 100 === 0 || event.uploaded === event.total))) log(event);
      },
    });
    if (gate) gate.assertRemoteMain();
    journal?.append({ phase: "completed", result });
    return { mode: options.mode, approvedSha: gate?.approvedSha ?? null, ...result, requestStats: rest.getRequestStats(), receipt: journal?.path ?? null };
  } catch (error) {
    journal?.append({ phase: "failed", code: error instanceof BundleR2TransferError ? error.code : "UNCLASSIFIED_FAILURE",
      requestStats: rest.getRequestStats(), automaticRetry: false,
      instruction: "put-started에는 요청 전 인증 준비도 포함됩니다. 실제 requestsStarted와 원격 본문을 별도 확인하세요." });
    throw error;
  } finally { clearTimeout(timer); journal?.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = await runBundleR2ReleaseCli(process.argv.slice(2)); console.log(typeof result === "string" ? result : JSON.stringify(result)); }
  catch (error) {
    const code = error instanceof BundleR2TransferError ? error.code : "LOCAL_OR_VALIDATION_FAILURE";
    console.error(JSON.stringify({ status: "failed", code, message: "실행을 중단했습니다. 원장·로컬 입력·기존 실행 기록을 검토하고 자동 재시도하지 마세요. 비밀값·provider 응답 원문은 출력하지 않습니다." }));
    process.exitCode = 2;
  }
}
