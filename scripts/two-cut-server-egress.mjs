// 로컬 QA API 전용 --import. 승인은 two-cut-server-approval.mts, 기동은 two-cut-local-api.mjs 참조.
import { createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { channel } from "node:diagnostics_channel";
import { constants, closeSync, fstatSync, fsyncSync, lstatSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { request } from "node:https";
import { join } from "node:path";

export const endpoint = "https://api.openai.com/v1/chat/completions";
export const directory = `/private/tmp/toonstudio-two-cut-server-${process.getuid()}`;
const maxOutputTokens = 1400;
const maxRequestBytes = 65_536;
const framingTokens = 1024;
const snapshots = new Map([
  ["gpt-4o-mini", "gpt-4o-mini-2024-07-18"],
  ["gpt-4.1-mini", "gpt-4.1-mini-2025-04-14"],
]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
// 승인 없는 상태에서 실제 앱 경로가 경계에 도달했는지 확인하는 프로세스 내부 채널.
export const deniedPlan = channel("toonstudio.qa.two-cut.denied-plan");
const failure = () => new Error("로컬 QA 송신 차단. 단계 승인과 비공개 QA 기록을 확인하세요.");
function check(condition) { if (!condition) throw failure(); }

export function keyBinding(key, org, project) {
  check(typeof key === "string" && /^\S{1,512}$/u.test(key));
  check(/^org-[A-Za-z0-9_-]{4,80}$/u.test(org) && /^proj_[A-Za-z0-9_-]{4,80}$/u.test(project));
  return scryptSync(key, `toonstudio-two-cut-S1:${org}:${project}`, 32).toString("hex");
}

export function inspectBody(body, model) {
  check(snapshots.has(model) && typeof body === "string" && Buffer.byteLength(body) <= maxRequestBytes);
  const data = JSON.parse(body);
  check(data.model === model && data.max_completion_tokens === maxOutputTokens && data.store === false);
  check(Object.keys(data).sort().join(",") === "max_completion_tokens,messages,model,response_format,store,temperature");
  check(data.response_format?.type === "json_schema" && data.response_format.json_schema?.strict === true
    && data.response_format.json_schema.name === "toonstudio_script_to_cuts");
  const inputTokenLimit = Buffer.byteLength(body) + framingTokens;
  // 100만 토큰당 입력 $1, 출력 $2 상한. root가 해당 모델의 현 단가·크레딧 적격성을 확인한다.
  return { model, responseModel: snapshots.get(model), bodySha256: sha256(body), inputTokenLimit,
    reserveMicroUsd: inputTokenLimit + 2 * data.max_completion_tokens };
}

export function verifyApproval(gate, now = Date.now()) {
  check(gate?.decision === "root-verified-promo-only" && gate.phase === "S1" && gate.endpoint === endpoint);
  check(snapshots.has(gate.model) && gate.responseModel === snapshots.get(gate.model)
    && typeof gate.bodySha256 === "string" && /^[a-f0-9]{64}$/u.test(gate.bodySha256));
  check(Number.isSafeInteger(gate.inputTokenLimit) && gate.inputTokenLimit > framingTokens
    && gate.inputTokenLimit <= maxRequestBytes + framingTokens
    && gate.reserveMicroUsd === gate.inputTokenLimit + 2 * maxOutputTokens);
  check(Number.isSafeInteger(gate.creditMicroUsd) && gate.creditMicroUsd >= gate.reserveMicroUsd);
  check(Number.isSafeInteger(gate.verifiedAt) && Number.isSafeInteger(gate.expiresAt)
    && gate.verifiedAt <= now && now < gate.expiresAt && gate.expiresAt - gate.verifiedAt <= 900_000);
  check(Number.isSafeInteger(gate.creditExpiresAt) && gate.creditExpiresAt >= gate.expiresAt);
  check(typeof gate.keyBinding === "string" && /^[a-f0-9]{64}$/u.test(gate.keyBinding));
}

export function checkDirectory(dir) {
  const stat = lstatSync(dir);
  check(stat.isDirectory() && stat.uid === process.getuid() && (stat.mode & 0o777) === 0o700);
}

export function readApproval(dir) {
  checkDirectory(dir);
  const fd = openSync(join(dir, "S1.json"), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    check(stat.isFile() && stat.nlink === 1 && stat.uid === process.getuid()
      && (stat.mode & 0o777) === 0o600 && stat.size <= 4096);
    const gate = JSON.parse(readFileSync(fd, "utf8"));
    verifyApproval(gate);
    return gate;
  } finally { closeSync(fd); }
}

export function verifyRequest(gate, body, headers, model) {
  const plan = inspectBody(body, model);
  verifyApproval(gate);
  check(Object.entries(plan).every(([key, value]) => gate[key] === value));
  const h = new Headers(headers);
  check([...h.keys()].join(",") === "authorization,content-type,openai-organization,openai-project");
  check(h.get("content-type") === "application/json");
  const bearer = /^Bearer (\S+)$/u.exec(h.get("authorization"));
  check(bearer && timingSafeEqual(Buffer.from(keyBinding(bearer[1], h.get("openai-organization"),
    h.get("openai-project")), "hex"), Buffer.from(gate.keyBinding, "hex")));
  return Object.fromEntries(h);
}

function append(fd, row) {
  writeFileSync(fd, JSON.stringify(row) + "\n");
  fsyncSync(fd);
}

// 이 로그 자체가 영구 소비 표식이다. 프로세스가 죽어도 reserved 행은 재시도 권한이 아니다.
export function reserve(dir, plan) {
  checkDirectory(dir);
  const fd = openSync(join(dir, "S1.spent.jsonl"), "wx", 0o600);
  try {
    append(fd, { status: "reserved", model: plan.model, reserveMicroUsd: plan.reserveMicroUsd });
    const parent = openSync(dir, "r");
    try { fsyncSync(parent); } finally { closeSync(parent); }
    return fd;
  } catch (error) { closeSync(fd); throw error; }
}

export function readUsage(data, gate) {
  const { prompt_tokens, completion_tokens, total_tokens } = data?.usage ?? {};
  check([prompt_tokens, completion_tokens, total_tokens].every(Number.isSafeInteger));
  check(prompt_tokens > 0 && prompt_tokens <= gate.inputTokenLimit && completion_tokens >= 0
    && completion_tokens <= maxOutputTokens && total_tokens === prompt_tokens + completion_tokens);
  return { prompt_tokens, completion_tokens, total_tokens };
}

export async function readBoundedBody(stream) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of stream) {
    bytes += chunk.length;
    check(bytes <= 65_536);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function sendOnce(gate, body, headers, callerSignal) {
  const fd = reserve(directory, gate);
  const row = { status: "incomplete", httpStatus: null, requestId: null, selectedModel: null, usage: null };
  try {
    const remaining = gate.expiresAt - Date.now();
    check(remaining > 0 && !callerSignal?.aborted);
    const deadline = AbortSignal.timeout(Math.min(30_000, remaining));
    const signal = callerSignal ? AbortSignal.any([deadline, callerSignal]) : deadline;
    // 전용 HTTP/1.1 연결 한 번. 재사용 소켓, 자동 redirect, SDK 재시도 경로를 사용하지 않는다.
    const res = await new Promise((resolve, reject) => {
      const req = request(endpoint, { method: "POST", headers, agent: false, signal, rejectUnauthorized: true }, resolve);
      req.on("error", reject);
      req.end(body);
    });
    try {
      row.httpStatus = res.statusCode;
      const id = res.headers["x-request-id"];
      if (typeof id === "string" && /^(?:req_[a-zA-Z0-9_-]{1,120}|[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/u.test(id)) row.requestId = id;
      check(row.httpStatus === 200 && row.requestId);
      const payload = await readBoundedBody(res);
      const data = JSON.parse(payload.toString("utf8"));
      if (snapshots.has(data.model) || [...snapshots.values()].includes(data.model)) row.selectedModel = data.model;
      row.usage = readUsage(data, gate);
      check(row.selectedModel === gate.responseModel);
      row.status = "received";
      return new Response(payload, { headers: { "content-type": "application/json" } });
    } finally { res.destroy(); }
  } finally {
    try { append(fd, row); } finally { closeSync(fd); }
  }
}

const localFetch = globalThis.fetch;
const phase = process.env.TWO_CUT_QA_PHASE;
async function guardedFetch(input, init = {}) {
  try {
    const address = typeof input === "string" ? input : input instanceof URL ? input.href : null;
    check(address);
    const url = new URL(address);
    // 로컬 프록시·Ollama로 우회하는 POST도 막는다. 서버 내부 fetch에는 상태 조회만 필요하다.
    if (url.origin === "http://127.0.0.1:4101") {
      check(!url.username && !url.password && !url.search && !url.hash
        && ["/api/health/live", "/api/health/ready"].includes(url.pathname)
        && (init.method ?? "GET") === "GET");
      return await localFetch(url.href, { signal: init.signal, redirect: "error" });
    }
    if (phase !== "S1" && address === endpoint && init.method === "POST") {
      if (deniedPlan.hasSubscribers) deniedPlan.publish(inspectBody(init.body, JSON.parse(init.body).model));
      if (phase === "--deny") process.stderr.write("QA: OpenAI POST가 서버 fetch 경계에서 차단됐습니다.\n");
      throw failure();
    }
    check(phase === "S1" && process.env.NODE_ENV === "test" && process.env.API_LOCAL_ENV_FILE_ENABLED === "false"
      && process.env.NEST_API_HOST === "127.0.0.1" && address === endpoint && init.method === "POST");
    check(Object.keys(init).every(key => ["method", "headers", "body", "signal"].includes(key)));
    const gate = readApproval(directory);
    const body = init.body;
    const headers = verifyRequest(gate, body, init.headers, process.env.OPENAI_MODEL);
    return await sendOnce(gate, body, headers, init.signal);
  } catch { throw failure(); }
}
Object.defineProperty(globalThis, "fetch", { value: guardedFetch, writable: false, configurable: false });
