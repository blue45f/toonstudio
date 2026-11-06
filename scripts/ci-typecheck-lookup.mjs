import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = "https://api.github.com";
const WORKFLOW = ".github/workflows/ci.yml";
const JOB = "Core preflight and application typecheck";
const ZIP_LIMIT = 32 * 1024;
const RECEIPT_LIMIT = 16 * 1024;
const MISS_REASONS = new Set(["invalid-context", "response-too-large", "invalid-response",
  "not-found", "http-error", "unsafe-redirect", "invalid-receipt", "timeout"]);
const positiveId = (value) => Number.isSafeInteger(value) && value > 0;
const sha = (value) => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const failure = (reason) => Object.assign(new Error(reason), { reason });

function context(env, readEventImpl) {
  const repository = env.GITHUB_REPOSITORY;
  const event = env.GITHUB_EVENT_NAME;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")
    || !["pull_request", "push", "workflow_dispatch", "merge_group"].includes(event)
    || !env.GITHUB_TOKEN || (env.GITHUB_API_URL ?? API).replace(/\/$/, "") !== API) {
    throw failure("invalid-context");
  }
  let headSha = env.GITHUB_SHA;
  if (event === "pull_request") {
    const payload = JSON.parse(readEventImpl(env.GITHUB_EVENT_PATH));
    if (payload.repository?.full_name !== repository
      || payload.pull_request?.head?.repo?.full_name !== repository) throw failure("invalid-context");
    headSha = payload.pull_request.head.sha;
  }
  if (!sha(headSha) || !sha(env.GITHUB_SHA) || !env.GITHUB_REF) throw failure("invalid-context");
  return { repository, event, headSha };
}

async function boundedBody(response, limit, signal) {
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel();
    throw failure("response-too-large");
  }
  if (!response.body) throw failure("invalid-response");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw failure("response-too-large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

/** ZIP 내부의 고정 JSON 하나만 stdout으로 읽고 임시 디렉터리를 항상 제거한다. */
export function extractReceipt(buffer, { timeoutMs = 3000, execImpl = execFileSync } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length > ZIP_LIMIT) throw failure("response-too-large");
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-typecheck-receipt-"));
  try {
    const archive = join(directory, "receipt.zip");
    writeFileSync(archive, buffer, { mode: 0o600 });
    const text = execImpl("unzip", ["-p", archive, "receipt.json"], {
      encoding: "utf8", timeout: Math.max(1, Math.min(3000, timeoutMs)),
      maxBuffer: RECEIPT_LIMIT, stdio: ["ignore", "pipe", "pipe"],
    });
    if (Buffer.byteLength(text) > RECEIPT_LIMIT) throw failure("response-too-large");
    return JSON.parse(text);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** 조회 실패는 검사 생략 권한이 아니므로 null을 반환해 호출자가 전체 검사를 실행하게 한다. */
export async function findReceipt({ env = process.env, fetchImpl = globalThis.fetch,
  extractImpl = extractReceipt, readEventImpl = (path) => readFileSync(path, "utf8"),
  timeoutMs = 10000, onMiss = () => {} } = {}) {
  const budget = Math.max(1, Math.min(10000, Number.isFinite(timeoutMs) ? timeoutMs : 10000));
  const deadline = Date.now() + budget;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), budget);
  const signal = controller.signal;
  let lastReason = "not-found";
  try {
    const { repository, event, headSha } = context(env, readEventImpl);
    const prefix = `${API}/repos/${repository}`;
    const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    const request = async (url, authenticated = true) => {
      signal.throwIfAborted();
      return fetchImpl(url, { method: "GET", headers: authenticated ? headers : {}, signal, redirect: "manual" });
    };
    const json = async (url) => {
      const response = await request(url);
      if (!response.ok) throw failure("http-error");
      return JSON.parse((await boundedBody(response, 1024 * 1024, signal)).toString("utf8"));
    };
    const runs = await json(`${prefix}/actions/workflows/ci.yml/runs?head_sha=${headSha}&event=${event}&per_page=2`);
    if (!Array.isArray(runs.workflow_runs)) throw failure("invalid-response");
    for (const run of runs.workflow_runs.slice(0, 2)) {
      if (!positiveId(run.id) || !positiveId(run.run_attempt) || run.path !== WORKFLOW
        || run.head_sha !== headSha || run.event !== event || run.repository?.full_name !== repository) continue;
      const jobs = await json(`${prefix}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`);
      if (!Array.isArray(jobs.jobs)) throw failure("invalid-response");
      const job = jobs.jobs.find((candidate) => candidate.name === JOB && positiveId(candidate.id)
        && candidate.status === "completed" && candidate.conclusion === "success"
        && candidate.run_attempt === run.run_attempt && candidate.run_id === run.id
        && candidate.head_sha === headSha);
      if (!job) continue;
      const artifacts = await json(`${prefix}/actions/runs/${run.id}/artifacts?per_page=100`);
      if (!Array.isArray(artifacts.artifacts)) throw failure("invalid-response");
      const artifact = artifacts.artifacts.find((candidate) => positiveId(candidate.id)
        && candidate.name === `core-typecheck-${run.id}-${run.run_attempt}`
        && candidate.expired === false && Number.isSafeInteger(candidate.size_in_bytes)
        && candidate.size_in_bytes > 0 && candidate.size_in_bytes <= ZIP_LIMIT);
      if (!artifact) continue;
      let response = await request(`${prefix}/actions/artifacts/${artifact.id}/zip`);
      if (response.status === 302) {
        const location = new URL(response.headers.get("location"));
        if (location.protocol !== "https:" || location.username || location.password
          || location.hostname === "api.github.com") throw failure("unsafe-redirect");
        response = await request(location.href, false);
      }
      if (!response.ok) throw failure("http-error");
      const buffer = await boundedBody(response, ZIP_LIMIT, signal);
      signal.throwIfAborted();
      const receipt = await extractImpl(buffer, { timeoutMs: Math.max(1, deadline - Date.now()) });
      if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) throw failure("invalid-receipt");
      signal.throwIfAborted();
      if (Date.now() >= deadline) throw failure("timeout");
      return { receipt, producer: { runId: run.id, runAttempt: run.run_attempt, jobId: job.id,
        conclusion: "success", jobName: JOB, path: WORKFLOW, event, headSha } };
    }
  } catch (error) {
    lastReason = signal.aborted ? "timeout"
      : MISS_REASONS.has(error?.reason) ? error.reason : "invalid-response";
  } finally {
    clearTimeout(timer);
  }
  onMiss(lastReason);
  return null;
}
