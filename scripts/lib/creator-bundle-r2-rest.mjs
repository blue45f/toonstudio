/** 기존 R2 REST namespace만 사용한다. 재시도·삭제·고정 인덱스 PUT 경로는 제공하지 않는다. */
import { createHash } from "node:crypto";
import { BUNDLE_V2_BUCKET, BUNDLE_V2_GLB_CACHE_CONTROL, BUNDLE_V2_INDEX_KEY, BUNDLE_V2_KEY_PREFIX } from "../plan-creator-bundle-deploy.mjs";

export class BundleR2TransferError extends Error {
  constructor(code, message) { super(message); this.name = "BundleR2TransferError"; this.code = code; }
}
export function transferFail(code, message) { throw new BundleR2TransferError(code, message); }
const API = "https://api.cloudflare.com/client/v4";
const GLB_KEY = /^assets\/studio\/bundle-v2\/[a-f0-9]{64}\.glb$/u;
const COMPLETION_KEY = /^assets\/studio\/bundle-v2\/release-index\/([a-f0-9]{64})\.json$/u;
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const validToken = (value) => typeof value === "string" && value && value === value.trim() && !/[\r\n]/u.test(value);
function completionObject(object) {
  if (!object || !positive(object.bytes) || object.bytes > 1024 * 1024 || typeof object.sha256 !== "string"
    || COMPLETION_KEY.exec(object.key)?.[1] !== object.sha256) transferFail("COMPLETION_KEY", "검증된 완료 index의 정확한 SHA key·바이트가 필요합니다.");
}
function completionJson(body) {
  let value;
  const text = body.toString("utf8");
  try { value = JSON.parse(text); } catch { transferFail("COMPLETION_JSON", "완료 표식은 검증된 UTF-8 index JSON 원문이어야 합니다."); }
  const keys = ["schema", "version", "files", "bytes", "packs", "objects", "objectBytes", "keyScheme", "sourceManifestGeneratedAt", "catalogSha256"];
  if (!Buffer.from(text).equals(body) || !value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).length !== keys.length || !keys.every((key) => Object.hasOwn(value, key))
    || value.schema !== "toonstudio.bundle-v2-deploy-index.v1" || value.version !== 1 || value.keyScheme !== "sha256"
    || !/^[a-f0-9]{64}$/u.test(value.catalogSha256) || !["files", "bytes", "packs", "objects", "objectBytes"].every((key) => positive(value[key]))
    || value.objects > value.files || value.objectBytes > value.bytes
    || !(value.sourceManifestGeneratedAt === null || (typeof value.sourceManifestGeneratedAt === "string" && Number.isFinite(Date.parse(value.sourceManifestGeneratedAt))))) {
    transferFail("COMPLETION_JSON", "완료 index의 스키마·전체 통계·catalog SHA가 올바르지 않습니다.");
  }
}

async function boundedBody(response, maximum, signal) {
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maximum)) transferFail("RESPONSE_TOO_LARGE", "원격 본문의 크기가 예상 상한과 다릅니다. 원격 상태를 별도로 조사하세요.");
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader(), chunks = [];
  let count = 0, onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new BundleR2TransferError("REQUEST_TIMEOUT", "R2 요청 시간이 초과됐습니다. 요청을 다시 보내지 않고 실행을 중단합니다."));
    if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    for (;;) {
      const item = await Promise.race([reader.read(), aborted]);
      if (item.done) break;
      count += item.value.byteLength;
      if (count > maximum) transferFail("RESPONSE_TOO_LARGE", "원격 본문이 예상 상한을 넘었습니다. 원격 상태를 별도로 조사하세요.");
      chunks.push(Buffer.from(item.value));
    }
    return Buffer.concat(chunks, count);
  } finally {
    signal.removeEventListener("abort", onAbort);
    void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* 취소 중인 reader는 이후 재사용하지 않는다. */ }
  }
}

/**
 * 자격증명은 closure에만 두며 요청 오류 원문·헤더·본문을 외부에 내보내지 않는다.
 * credentialProvider는 token과 상호 배타적이다. 각 아직 보내지 않은 요청 직전에
 * ({accountId, signal, minimumValidityMs})를 받고 {kind:"api_token"|"oauth", token, validUntil?:UTC밀리초}를 반환한다.
 * validUntil은 제공자가 실제 확인한 값일 때만 전달한다. 생략한 정상 OAuth는 받지만 잔여 수명 미검증으로 기록한다.
 * 만료 metadata가 없는 CLI 출력으로 수명을 만들어내지 않는다.
 * provider 실패 뒤 HTTP 전송·인증 갱신 재시도는 하지 않는다. 기존 token 경로는 수명 확인을 주장하지 않는다.
 */
export function createBundleR2Rest({ accountId, token, fetcher = globalThis.fetch, requestTimeoutMs = 30_000,
  intervalMs = 500, now = Date.now, sleep = wait, signal, maximumRequests = 100_000, credentialProvider }) {
  if (!/^[a-f0-9]{32}$/u.test(accountId)
    || !(credentialProvider === undefined ? validToken(token) : token === undefined && typeof credentialProvider === "function")
    || !positive(maximumRequests) || maximumRequests > 100_000
    || !positive(requestTimeoutMs) || requestTimeoutMs > 30_000 || !positive(intervalMs) || intervalMs < 334) {
    transferFail("AUTH_CONFIGURATION", "기존 인증 저장소에서 유효한 계정·인증을 공급하고 요청 간격을 확인하세요. 토큰을 인자로 전달하지 마세요.");
  }
  const base = `${API}/accounts/${accountId}/r2/buckets/${BUNDLE_V2_BUCKET}/objects`;
  let nextRequestAt = 0, active = false, stopped = false, requestsStarted = 0, credentialProviderCalls = 0;
  let minimumValidityVerified = credentialProvider !== undefined;
  const credentialKinds = new Set();
  async function request(url, method, { body, maximum, allow404 = false, completion = false } = {}) {
    if (stopped) transferFail("ADAPTER_STOPPED", "첫 실패 뒤 이 adapter는 다음 요청을 보내지 않습니다. 기존 journal과 원격 상태를 별도 검토하세요.");
    if (active) transferFail("CONCURRENT_REQUEST", "이 R2 adapter는 요청을 순차 실행해야 합니다.");
    active = true;
    let timer, response, onRunAbort, sent = false;
    try {
      if (requestsStarted >= maximumRequests) transferFail("REQUEST_BUDGET", "명시한 요청 수 상한에 도달했습니다. 다음 요청이나 자동 재시도를 시작하지 않습니다.");
      const delay = Math.max(0, nextRequestAt - now());
      if (delay) await sleep(delay);
      const controller = new AbortController();
      onRunAbort = () => controller.abort();
      if (signal?.aborted) transferFail("RUN_TIMEOUT", "전체 실행 시간이 끝났습니다. 요청을 새로 시작하지 않습니다.");
      signal?.addEventListener("abort", onRunAbort, { once: true });
      timer = setTimeout(() => controller.abort(), requestTimeoutMs); timer.unref?.();
      let authorization = token;
      if (credentialProvider) {
        let abortCredential;
        const credentialTimeout = new BundleR2TransferError("CREDENTIAL_TIMEOUT", "요청 전 인증 준비 시간이 초과됐습니다. HTTP 전송 없이 중단합니다.");
        const aborted = new Promise((_, reject) => {
          abortCredential = () => reject(credentialTimeout);
          controller.signal.addEventListener("abort", abortCredential, { once: true });
        });
        try {
          credentialProviderCalls += 1;
          let credential;
          try {
            const value = await Promise.race([Promise.resolve().then(() => credentialProvider(Object.freeze({
              accountId, signal: controller.signal, minimumValidityMs: requestTimeoutMs + 5000,
            }))), aborted]);
            const fields = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort().join("|") : "";
            if (["kind|token", "kind|token|validUntil"].includes(fields)
              && ["api_token", "oauth"].includes(value.kind) && validToken(value.token)
              && (!Object.hasOwn(value, "validUntil") || (Number.isSafeInteger(value.validUntil) && value.validUntil >= now() + requestTimeoutMs + 5000))) {
              credential = { kind: value.kind, token: value.token, validityKnown: Object.hasOwn(value, "validUntil") };
            }
          } catch (error) {
            if (error === credentialTimeout) throw error;
            transferFail("CREDENTIAL_PREPARATION_FAILED", "요청 전 인증 준비가 실패했습니다. 제공자의 오류 원문을 출력하거나 HTTP를 재전송하지 않습니다.");
          }
          if (!credential) transferFail("CREDENTIAL_CONTRACT", "요청 전 인증의 종류·확인한 만료 시각·최소 유효 기간이 올바르지 않습니다.");
          credentialKinds.add(credential.kind);
          if (!credential.validityKnown) minimumValidityVerified = false;
          authorization = credential.token;
        } finally { controller.signal.removeEventListener("abort", abortCredential); }
      }
      if (controller.signal.aborted) transferFail("REQUEST_TIMEOUT", "요청 전에 시간이 끝났습니다. HTTP 전송 없이 중단합니다.");
      nextRequestAt = now() + intervalMs;
      requestsStarted += 1;
      sent = true;
      response = await fetcher(url, { method, redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { authorization: `Bearer ${authorization}`, ...(method === "PUT" ? {
          "content-type": completion ? "application/json; charset=utf-8" : "model/gltf-binary", "cache-control": BUNDLE_V2_GLB_CACHE_CONTROL, "content-disposition": "inline",
        } : {}) }, ...(body === undefined ? {} : { body }) });
      if (allow404 && response.status === 404) { void response.body?.cancel().catch(() => undefined); return null; }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        transferFail(method === "PUT" ? "PUT_REJECTED" : "HTTP_REJECTED", "R2 요청이 거절됐습니다. 응답 본문을 출력하거나 자동 재시도하지 않습니다.");
      }
      return await boundedBody(response, maximum, controller.signal);
    } catch (error) {
      stopped = true;
      if (error instanceof BundleR2TransferError && (method !== "PUT" || !sent)) throw error;
      transferFail(method === "PUT" && sent ? "PUT_OUTCOME_UNCERTAIN" : "TRANSPORT_FAILED",
        method === "PUT" && sent ? "PUT 처리 여부가 불명확합니다. 다시 보내지 말고 원격 본문을 별도 확인하세요." : "R2 통신 또는 요청 전 인증 준비가 실패했습니다. 비밀값을 출력하지 않고 중단합니다.");
    } finally { clearTimeout(timer); if (onRunAbort) signal?.removeEventListener("abort", onRunAbort); active = false; }
  }
  function objectUrl(key, allowLegacy = false) {
    if (!GLB_KEY.test(key) && !(allowLegacy && key === BUNDLE_V2_INDEX_KEY)) transferFail("KEY_REFUSED", "이 경로는 내용 주소 GLB만 처리합니다. 인덱스·다른 namespace에는 쓸 수 없습니다.");
    return base + "/" + key.split("/").map(encodeURIComponent).join("/");
  }
  const completionUrl = (object) => { completionObject(object); return base + "/" + object.key.split("/").map(encodeURIComponent).join("/"); };
  function acknowledge(result) {
    if (result.length) {
      let json; try { json = JSON.parse(result.toString("utf8")); } catch { stopped = true; transferFail("PUT_ACK_FORMAT", "PUT 확인 응답을 해석할 수 없습니다. 재전송하지 말고 원격 객체를 별도 확인하세요."); }
      if (json?.success !== true) { stopped = true; transferFail("PUT_ACK_REJECTED", "PUT 성공 확인이 없습니다. 재전송하지 말고 원격 객체를 별도 확인하세요."); }
    }
  }
  return Object.freeze({
    requestPolicy: Object.freeze({ intervalMs, requestTimeoutMs, maximumRequests }),
    getRequestStats: () => Object.freeze({ requestsStarted, maximumRequests, credentialProviderCalls,
      credentialKinds: Object.freeze([...credentialKinds]), minimumValidityVerified: minimumValidityVerified && requestsStarted > 0 }),
    async listPage(cursor) {
      if (cursor !== undefined && (typeof cursor !== "string" || !cursor || cursor.length > 4096 || /[\r\n]/u.test(cursor))) transferFail("CURSOR_INVALID", "R2 목록 cursor가 올바르지 않습니다. 새 목록 조회로 확인하세요.");
      const query = new URLSearchParams({ per_page: "1000", prefix: BUNDLE_V2_KEY_PREFIX });
      if (cursor !== undefined) query.set("cursor", cursor);
      const bytes = await request(base + "?" + query, "GET", { maximum: 8 * 1024 * 1024 });
      let value; try { value = JSON.parse(bytes.toString("utf8")); } catch { transferFail("LIST_FORMAT", "R2 목록 응답 형식이 다릅니다. 원문을 출력하지 않고 중단합니다."); }
      if (value?.success !== true || !Array.isArray(value.result)
        || (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length !== 0))) transferFail("LIST_FORMAT", "R2 목록이 전체 성공한 응답이 아닙니다. 원문을 출력하지 않고 중단합니다.");
      const info = value.result_info;
      if (info !== undefined && (info === null || typeof info !== "object" || Array.isArray(info))) transferFail("LIST_FORMAT", "R2 목록 pagination 정보의 형식이 다릅니다.");
      if ((info?.is_truncated !== undefined && typeof info.is_truncated !== "boolean")
        || (info?.cursor !== undefined && (typeof info.cursor !== "string" || info.cursor.length > 4096 || /[\r\n]/u.test(info.cursor)))) transferFail("LIST_FORMAT", "R2 목록 marker·cursor의 형식이 다릅니다.");
      return { objects: value.result, truncated: info?.is_truncated, cursor: info?.cursor };
    },
    getObject(object) {
      if (!positive(object.bytes)) transferFail("OBJECT_SIZE", "검증된 객체 바이트가 필요합니다.");
      return request(objectUrl(object.key), "GET", { maximum: object.bytes, allow404: true });
    },
    async putObject(object, body) {
      const url = objectUrl(object.key);
      if (!Buffer.isBuffer(body) || body.length !== object.bytes || createHash("sha256").update(body).digest("hex") !== object.sha256
        || object.key !== `${BUNDLE_V2_KEY_PREFIX}${object.sha256}.glb`) transferFail("PUT_BODY", "검증된 원본 GLB 바이트만 올릴 수 있습니다.");
      const result = await request(url, "PUT", { body, maximum: 128 * 1024 });
      acknowledge(result);
    },
    async readCompletion(object) { return request(completionUrl(object), "GET", { maximum: object.bytes, allow404: true }); },
    async putCompletion(object, body) {
      const url = completionUrl(object);
      if (!Buffer.isBuffer(body) || body.length !== object.bytes || createHash("sha256").update(body).digest("hex") !== object.sha256) transferFail("COMPLETION_BODY", "정적 index와 동일한 원문 바이트·SHA만 완료 표식으로 올릴 수 있습니다.");
      completionJson(body);
      acknowledge(await request(url, "PUT", { body, maximum: 128 * 1024, completion: true }));
    },
    readLegacyIndex() { return request(objectUrl(BUNDLE_V2_INDEX_KEY, true), "GET", { maximum: 1024 * 1024, allow404: true }); },
  });
}
