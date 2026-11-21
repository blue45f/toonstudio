#!/usr/bin/env node

/**
 * 로컬 S3/R2 호환 HTTP 오브젝트 스토리지 에뮬레이터 (`127.0.0.1` loopback 전용).
 *
 * 안전 규칙 (FAIL-CLOSED · 외부 의존성 0개):
 * - 순수 Node `node:http` + `node:fs` + `node:crypto`로만 동작한다.
 * - `127.0.0.1` 루프백 바인딩만 허용하며 원격 호스트·운영 R2/S3 호출이 0건이다.
 * - 원시 URL과 파일시스템 `resolve` 양쪽에서 경로 탐색(`..`, `%2e%2e`, `\`, 제어문자)을 이중 차단한다.
 * - 단일 객체(`maxObjectBytes`)와 전체 누적 용량(`maxTotalBytes`) 상한을 강제하고, 종료 시 임시 디렉터리를 100% 삭제한다.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync,
  renameSync, rmSync, unlinkSync, writeFileSync,
} from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve, sep } from "node:path";

export const LOCAL_OBJECT_STORAGE_HOST = "127.0.0.1";
export const LOCAL_OBJECT_STORAGE_DEFAULT_PORT = 59000;
export const LOCAL_OBJECT_STORAGE_DEFAULT_MAX_OBJECT_BYTES = 16 * 1024 * 1024;
export const LOCAL_OBJECT_STORAGE_DEFAULT_MAX_TOTAL_BYTES = 128 * 1024 * 1024;

const BUCKET_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,61}[a-z0-9])?$/u;
const CONTENT_TYPE_BY_EXTENSION = Object.freeze({
  ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf", ".glb": "model/gltf-binary", ".vrm": "model/gltf-binary",
  ".psd": "image/vnd.adobe.photoshop", ".clip": "application/octet-stream",
});

export function objectStorageBaseUrl(port = LOCAL_OBJECT_STORAGE_DEFAULT_PORT) {
  return `http://${LOCAL_OBJECT_STORAGE_HOST}:${port}`;
}

export function objectStorageHealthUrl(port = LOCAL_OBJECT_STORAGE_DEFAULT_PORT) {
  return `${objectStorageBaseUrl(port)}/health`;
}

export function assertLoopbackStorageHost(host) {
  if (host !== LOCAL_OBJECT_STORAGE_HOST) {
    throw new Error(`FAIL-CLOSED: 로컬 오브젝트 스토리지 에뮬레이터는 ${LOCAL_OBJECT_STORAGE_HOST} 루프백 바인딩만 허용합니다 (지정값: ${String(host)}).`);
  }
}

function hasControlCharacters(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function validateBucketName(bucket) {
  if (typeof bucket !== "string" || !BUCKET_NAME_PATTERN.test(bucket) || bucket.includes("..")) {
    return { ok: false, error: "invalid_bucket_name" };
  }
  return { ok: true, bucket };
}

/** `new URL()` 정규화 이전에 원시 HTTP 요청 경로를 검사해 `..` / `%2e%2e` / `\` 경로 탈출을 차단한다. */
export function parseRawObjectRequest(rawUrl) {
  const raw = typeof rawUrl === "string" ? rawUrl : "";
  if (!raw.startsWith("/") || hasControlCharacters(raw)) return { ok: false, status: 400, error: "invalid_object_path" };

  const queryIndex = raw.indexOf("?");
  const rawPath = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw;
  const rawQuery = queryIndex >= 0 ? raw.slice(queryIndex + 1) : "";
  if (rawPath === "/health") return { ok: true, route: "health" };
  if (rawPath.includes("\\") || /%5c/iu.test(rawPath) || /%00/iu.test(rawPath)) {
    return { ok: false, status: 400, error: "invalid_object_path" };
  }
  if (!rawPath.startsWith("/objects/")) return { ok: false, status: 404, error: "route_not_found" };

  const remainder = rawPath.slice("/objects/".length);
  if (!remainder) return { ok: false, status: 400, error: "invalid_bucket_name" };

  const rawParts = remainder.split("/");
  let decodedBucket;
  try { decodedBucket = decodeURIComponent(rawParts[0]); } catch { return { ok: false, status: 400, error: "invalid_uri_encoding" }; }
  const bucketCheck = validateBucketName(decodedBucket);
  if (!bucketCheck.ok) return { ok: false, status: 400, error: bucketCheck.error };

  if (rawParts.length === 1 || (rawParts.length === 2 && rawParts[1] === "")) {
    const prefix = new URLSearchParams(rawQuery).get("prefix") ?? "";
    if (prefix.includes("..") || prefix.includes("\\") || prefix.startsWith("/") || hasControlCharacters(prefix)) {
      return { ok: false, status: 400, error: "invalid_prefix" };
    }
    return { ok: true, route: "list", bucket: decodedBucket, prefix };
  }

  const keySegments = [];
  for (const segment of rawParts.slice(1)) {
    if (!segment) return { ok: false, status: 400, error: "invalid_object_path" };
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { return { ok: false, status: 400, error: "invalid_uri_encoding" }; }
    if (
      !decoded || decoded === "." || decoded === ".."
      || decoded.includes("/") || decoded.includes("\\") || decoded.includes("..") || hasControlCharacters(decoded)
    ) {
      return { ok: false, status: 400, error: "invalid_object_path" };
    }
    keySegments.push(decoded);
  }
  const key = keySegments.join("/");
  if (key.length > 1024) return { ok: false, status: 400, error: "object_key_too_long" };
  return { ok: true, route: "object", bucket: decodedBucket, key, keySegments };
}

export function resolveConfinedPath(baseDir, segments) {
  const normalizedBase = resolve(baseDir);
  const candidate = resolve(normalizedBase, ...segments);
  if (candidate !== normalizedBase && !candidate.startsWith(`${normalizedBase}${sep}`)) {
    throw new Error("경로 탐색 시도가 감지되어 차단되었습니다.");
  }
  return candidate;
}

function inferContentType(key, headerValue) {
  if (typeof headerValue === "string") {
    const trimmed = headerValue.trim();
    if (trimmed.length > 0 && trimmed.length <= 160 && !hasControlCharacters(trimmed)) return trimmed;
  }
  return CONTENT_TYPE_BY_EXTENSION[extname(key).toLowerCase()] ?? "application/octet-stream";
}

function sendJson(res, status, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function pruneEmptyParents(startDir, stopDir) {
  let current = resolve(startDir);
  const boundary = resolve(stopDir);
  while (current !== boundary && current.startsWith(`${boundary}${sep}`)) {
    try {
      if (readdirSync(current).length > 0) break;
      rmSync(current, { recursive: false, force: true });
    } catch { break; }
    current = dirname(current);
  }
}

function readBoundedBody(req, { maxObjectBytes, maxTotalBytes, projectedBaseBytes }) {
  return new Promise((resolvePromise) => {
    const contentLengthHeader = req.headers["content-length"];
    if (contentLengthHeader !== undefined) {
      const declared = Number(contentLengthHeader);
      if (!Number.isFinite(declared) || declared < 0 || !Number.isInteger(declared)) {
        resolvePromise({ ok: false, status: 400, error: "invalid_content_length" });
        return;
      }
      if (declared > maxObjectBytes) { resolvePromise({ ok: false, status: 413, error: "object_size_limit_exceeded" }); return; }
      if (projectedBaseBytes + declared > maxTotalBytes) { resolvePromise({ ok: false, status: 413, error: "storage_quota_exceeded" }); return; }
    }
    const chunks = [];
    let received = 0;
    let settled = false;
    const finish = (outcome) => { if (!settled) { settled = true; resolvePromise(outcome); } };
    req.on("data", (chunk) => {
      if (settled) return;
      received += chunk.length;
      if (received > maxObjectBytes) { finish({ ok: false, status: 413, error: "object_size_limit_exceeded" }); req.resume(); return; }
      if (projectedBaseBytes + received > maxTotalBytes) { finish({ ok: false, status: 413, error: "storage_quota_exceeded" }); req.resume(); return; }
      chunks.push(chunk);
    });
    req.on("end", () => finish({ ok: true, buffer: Buffer.concat(chunks, received) }));
    req.on("error", (error) => finish({ ok: false, status: 400, error: error instanceof Error ? error.message : "stream_error" }));
  });
}

function loadExistingMetadataIndex(metaRoot) {
  const index = new Map();
  let totalBytes = 0;
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          const parsed = JSON.parse(readFileSync(fullPath, "utf8"));
          if (parsed && typeof parsed.bucket === "string" && typeof parsed.key === "string" && Number.isInteger(parsed.size)) {
            index.set(`${parsed.bucket}/${parsed.key}`, parsed);
            totalBytes += parsed.size;
          }
        } catch { /* 손상된 메타 파일 무시 */ }
      }
    }
  };
  walk(metaRoot);
  return { index, totalBytes };
}

export async function startLocalObjectStorageEmulator({
  host = LOCAL_OBJECT_STORAGE_HOST,
  port = LOCAL_OBJECT_STORAGE_DEFAULT_PORT,
  rootDir = null,
  cleanupOnClose = true,
  maxObjectBytes = LOCAL_OBJECT_STORAGE_DEFAULT_MAX_OBJECT_BYTES,
  maxTotalBytes = LOCAL_OBJECT_STORAGE_DEFAULT_MAX_TOTAL_BYTES,
} = {}) {
  assertLoopbackStorageHost(host);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`유효하지 않은 오브젝트 스토리지 포트입니다: ${String(port)}`);
  if (!Number.isInteger(maxObjectBytes) || maxObjectBytes < 1) throw new Error("maxObjectBytes는 1 이상의 정수여야 합니다.");
  if (!Number.isInteger(maxTotalBytes) || maxTotalBytes < maxObjectBytes) throw new Error("maxTotalBytes는 maxObjectBytes 이상의 정수여야 합니다.");

  const storageRoot = rootDir ? resolve(rootDir) : mkdtempSync(join(tmpdir(), "ts-obj-"));
  const dataRoot = join(storageRoot, "data");
  const metaRoot = join(storageRoot, "meta");
  const stagingRoot = join(storageRoot, "tmp");
  mkdirSync(dataRoot, { recursive: true });
  mkdirSync(metaRoot, { recursive: true });
  mkdirSync(stagingRoot, { recursive: true });

  const loaded = loadExistingMetadataIndex(metaRoot);
  const objectIndex = loaded.index;
  let totalBytes = loaded.totalBytes;
  let boundPort = port;

  const server = createServer(async (req, res) => {
    try {
      const method = (req.method ?? "GET").toUpperCase();
      const parsed = parseRawObjectRequest(req.url ?? "/");
      if (!parsed.ok) { sendJson(res, parsed.status, { ok: false, error: parsed.error }); return; }

      if (parsed.route === "health") {
        if (method !== "GET" && method !== "HEAD") { sendJson(res, 405, { ok: false, error: "method_not_allowed" }); return; }
        const buckets = new Set([...objectIndex.values()].map((meta) => meta.bucket));
        if (method === "HEAD") { res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(); return; }
        sendJson(res, 200, {
          ok: true, status: "ok", host, port: boundPort, maxObjectBytes, maxTotalBytes,
          objectCount: objectIndex.size, totalBytes, bucketCount: buckets.size,
        });
        return;
      }

      if (parsed.route === "list") {
        if (method !== "GET") { sendJson(res, 405, { ok: false, error: "method_not_allowed" }); return; }
        const objects = [];
        let bucketBytes = 0;
        for (const meta of objectIndex.values()) {
          if (meta.bucket !== parsed.bucket) continue;
          if (parsed.prefix && !meta.key.startsWith(parsed.prefix)) continue;
          objects.push(meta);
          bucketBytes += meta.size;
        }
        objects.sort((left, right) => left.key.localeCompare(right.key, "en"));
        sendJson(res, 200, { ok: true, bucket: parsed.bucket, prefix: parsed.prefix, count: objects.length, totalBytes: bucketBytes, objects });
        return;
      }

      const indexKey = `${parsed.bucket}/${parsed.key}`;
      const bucketDataDir = resolveConfinedPath(dataRoot, [parsed.bucket]);
      const bucketMetaDir = resolveConfinedPath(metaRoot, [parsed.bucket]);
      const objectDataPath = resolveConfinedPath(bucketDataDir, parsed.keySegments);
      const objectMetaPath = resolveConfinedPath(bucketMetaDir, [...parsed.keySegments.slice(0, -1), `${parsed.keySegments.at(-1)}.json`]);

      if (method === "PUT") {
        const existing = objectIndex.get(indexKey);
        const projectedBaseBytes = totalBytes - (existing?.size ?? 0);
        const readResult = await readBoundedBody(req, { maxObjectBytes, maxTotalBytes, projectedBaseBytes });
        if (!readResult.ok) {
          sendJson(res, readResult.status, { ok: false, error: readResult.error, maxObjectBytes, maxTotalBytes });
          return;
        }
        const buffer = readResult.buffer;
        const sha256 = createHash("sha256").update(buffer).digest("hex");
        const etag = `"${sha256}"`;
        const meta = {
          bucket: parsed.bucket, key: parsed.key, size: buffer.length, sha256, etag,
          contentType: inferContentType(parsed.key, req.headers["content-type"]),
          updatedAt: new Date().toISOString(),
        };
        mkdirSync(dirname(objectDataPath), { recursive: true });
        mkdirSync(dirname(objectMetaPath), { recursive: true });
        const tempDataPath = join(stagingRoot, `obj-${randomUUID()}.bin`);
        const tempMetaPath = join(stagingRoot, `meta-${randomUUID()}.json`);
        try {
          writeFileSync(tempDataPath, buffer);
          writeFileSync(tempMetaPath, `${JSON.stringify(meta)}\n`, "utf8");
          renameSync(tempDataPath, objectDataPath);
          renameSync(tempMetaPath, objectMetaPath);
        } catch (writeError) {
          rmSync(tempDataPath, { force: true });
          rmSync(tempMetaPath, { force: true });
          throw writeError;
        }
        totalBytes = projectedBaseBytes + buffer.length;
        objectIndex.set(indexKey, meta);
        sendJson(res, 200, { ok: true, ...meta }, { ETag: etag, "X-Content-SHA256": sha256 });
        return;
      }

      if (method === "GET" || method === "HEAD") {
        const meta = objectIndex.get(indexKey);
        if (!meta || !existsSync(objectDataPath)) {
          if (method === "HEAD") { res.writeHead(404, { "Cache-Control": "no-store" }); res.end(); return; }
          sendJson(res, 404, { ok: false, error: "object_not_found", bucket: parsed.bucket, key: parsed.key });
          return;
        }
        const headers = {
          "Content-Type": meta.contentType, "Content-Length": String(meta.size),
          ETag: meta.etag, "X-Content-SHA256": meta.sha256,
          "Last-Modified": new Date(meta.updatedAt).toUTCString(), "Cache-Control": "no-store",
        };
        if (req.headers["if-none-match"] === meta.etag) { res.writeHead(304, headers); res.end(); return; }
        if (method === "HEAD") { res.writeHead(200, headers); res.end(); return; }
        res.writeHead(200, headers);
        res.end(readFileSync(objectDataPath));
        return;
      }

      if (method === "DELETE") {
        const existing = objectIndex.get(indexKey);
        if (!existing) { sendJson(res, 200, { ok: true, deleted: false, bucket: parsed.bucket, key: parsed.key }); return; }
        if (existsSync(objectDataPath)) unlinkSync(objectDataPath);
        if (existsSync(objectMetaPath)) unlinkSync(objectMetaPath);
        pruneEmptyParents(dirname(objectDataPath), dataRoot);
        pruneEmptyParents(dirname(objectMetaPath), metaRoot);
        totalBytes = Math.max(0, totalBytes - existing.size);
        objectIndex.delete(indexKey);
        sendJson(res, 200, { ok: true, deleted: true, bucket: parsed.bucket, key: parsed.key });
        return;
      }

      sendJson(res, 405, { ok: false, error: "method_not_allowed" });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: "internal_storage_error", detail });
      else res.end();
    }
  });

  await new Promise((resolveListen, rejectListen) => {
    const onError = (error) => {
      server.removeListener("listening", onListening);
      if (cleanupOnClose) rmSync(storageRoot, { recursive: true, force: true });
      rejectListen(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      const address = server.address();
      boundPort = typeof address === "object" && address ? address.port : port;
      resolveListen();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });

  let closed = false;
  const close = async () => {
    if (closed) return { closed: true, storageRemoved: cleanupOnClose ? !existsSync(storageRoot) : false, storageRoot };
    closed = true;
    server.closeAllConnections?.();
    await new Promise((resolveClose) => server.close(() => resolveClose()));
    if (cleanupOnClose) rmSync(storageRoot, { recursive: true, force: true });
    return { closed: true, storageRemoved: cleanupOnClose ? !existsSync(storageRoot) : false, storageRoot };
  };

  return {
    host, port: boundPort, baseUrl: objectStorageBaseUrl(boundPort), healthUrl: objectStorageHealthUrl(boundPort),
    storageRoot, maxObjectBytes, maxTotalBytes, close,
  };
}

/** 스모크·통합 검증용 바이너리 원고 왕복 검증(PUT → SHA-256 ETag → HEAD → LIST → GET 바이트 일치 → 경로 탐색 차단 → DELETE → 404). */
export async function verifyLocalObjectStorageRoundTrip(
  baseUrl,
  { bucket = "studio-manuscripts", key = "episodes/studio-ep-1/cut-001.png", contentType = "image/png" } = {},
) {
  const normalizedBase = String(baseUrl).replace(/\/+$/u, "");
  const parsedBase = new URL(normalizedBase);
  assertLoopbackStorageHost(parsedBase.hostname);

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const samplePayload = Buffer.concat([
    pngSignature,
    Buffer.from("TOONSTUDIO-LOCAL-SMOKE-CUT-SLICE-EP1-CUT001-BINARY-CHECK", "utf8"),
    Buffer.alloc(2048, 0x5a),
  ]);
  const expectedSha256 = createHash("sha256").update(samplePayload).digest("hex");
  const expectedEtag = `"${expectedSha256}"`;
  const objectUrl = `${normalizedBase}/objects/${bucket}/${key}`;

  const healthRes = await fetch(`${normalizedBase}/health`);
  const healthBody = await healthRes.json();
  if (healthRes.status !== 200 || healthBody?.ok !== true) throw new Error(`오브젝트 스토리지 /health 실패: status=${healthRes.status}`);

  const portNumber = Number(parsedBase.port || (parsedBase.protocol === "https:" ? 443 : 80));
  const probeRawStatus = (rawPath) => new Promise((resolveProbe, rejectProbe) => {
    const probeReq = httpRequest(
      { hostname: parsedBase.hostname, port: portNumber, method: "PUT", path: rawPath, headers: { "Content-Type": "application/octet-stream", "Content-Length": "7" } },
      (probeRes) => { probeRes.resume(); probeRes.once("end", () => resolveProbe(probeRes.statusCode ?? 0)); },
    );
    probeReq.once("error", rejectProbe);
    probeReq.end(Buffer.from("blocked"));
  });
  for (const badPath of [`/objects/${bucket}/../../escape.bin`, `/objects/${bucket}/%2e%2e/escape.bin`]) {
    const status = await probeRawStatus(badPath);
    if (status !== 400) throw new Error(`경로 탐색 차단이 동작하지 않았습니다(${badPath}): 기대 400, 실제 ${status}`);
  }

  const putRes = await fetch(objectUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: samplePayload });
  const putBody = await putRes.json();
  if (putRes.status !== 200 || putBody?.ok !== true || putBody?.sha256 !== expectedSha256 || putRes.headers.get("etag") !== expectedEtag) {
    throw new Error(`오브젝트 PUT 검증 실패: status=${putRes.status}, sha256=${String(putBody?.sha256)}`);
  }

  const headRes = await fetch(objectUrl, { method: "HEAD" });
  if (
    headRes.status !== 200 || headRes.headers.get("etag") !== expectedEtag
    || headRes.headers.get("content-type") !== contentType || Number(headRes.headers.get("content-length")) !== samplePayload.length
  ) {
    throw new Error(`오브젝트 HEAD 검증 실패: status=${headRes.status}`);
  }

  const listRes = await fetch(`${normalizedBase}/objects/${bucket}?prefix=${encodeURIComponent("episodes/studio-ep-1/")}`);
  const listBody = await listRes.json();
  const listed = Array.isArray(listBody?.objects) ? listBody.objects.find((item) => item?.key === key) : null;
  if (listRes.status !== 200 || !listed || listed.sha256 !== expectedSha256) {
    throw new Error(`오브젝트 LIST 검증 실패: status=${listRes.status}, count=${String(listBody?.count)}`);
  }

  const getRes = await fetch(objectUrl);
  const downloaded = Buffer.from(await getRes.arrayBuffer());
  const downloadedSha256 = createHash("sha256").update(downloaded).digest("hex");
  if (getRes.status !== 200 || getRes.headers.get("content-type") !== contentType || !downloaded.equals(samplePayload) || downloadedSha256 !== expectedSha256) {
    throw new Error(`오브젝트 GET 바이트 일치 검증 실패: status=${getRes.status}, bytes=${downloaded.length}`);
  }

  const deleteRes = await fetch(objectUrl, { method: "DELETE" });
  const deleteBody = await deleteRes.json();
  if (deleteRes.status !== 200 || deleteBody?.deleted !== true) throw new Error(`오브젝트 DELETE 실패: status=${deleteRes.status}`);
  const afterDeleteRes = await fetch(objectUrl);
  if (afterDeleteRes.status !== 404) throw new Error(`삭제 후 GET이 404를 반환하지 않았습니다: status=${afterDeleteRes.status}`);

  return {
    ok: true, endpoint: normalizedBase, bucket, key, contentType,
    bytesVerified: samplePayload.length, sha256: expectedSha256, etag: expectedEtag,
    traversalBlocked: true, listCountBeforeDelete: listBody.count, deletedVerified: true,
  };
}

export function parseObjectStorageCliArgs(argv) {
  const options = {
    help: false, json: false, port: LOCAL_OBJECT_STORAGE_DEFAULT_PORT,
    maxObjectBytes: LOCAL_OBJECT_STORAGE_DEFAULT_MAX_OBJECT_BYTES,
    maxTotalBytes: LOCAL_OBJECT_STORAGE_DEFAULT_MAX_TOTAL_BYTES,
  };
  const parsePositiveInt = (rawValue, label, min, max) => {
    const parsed = Number(rawValue);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${label} 뒤에 ${min}-${max} 정수를 지정하세요.`);
    return parsed;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--port") { options.port = parsePositiveInt(argv[index + 1], "--port", 0, 65535); index += 1; }
    else if (arg.startsWith("--port=")) options.port = parsePositiveInt(arg.slice("--port=".length), "--port=", 0, 65535);
    else if (arg === "--max-object-bytes") { options.maxObjectBytes = parsePositiveInt(argv[index + 1], "--max-object-bytes", 1024, 512 * 1024 * 1024); index += 1; }
    else if (arg.startsWith("--max-object-bytes=")) options.maxObjectBytes = parsePositiveInt(arg.slice("--max-object-bytes=".length), "--max-object-bytes=", 1024, 512 * 1024 * 1024);
    else if (arg === "--max-total-bytes") { options.maxTotalBytes = parsePositiveInt(argv[index + 1], "--max-total-bytes", 1024, 2 * 1024 * 1024 * 1024); index += 1; }
    else if (arg.startsWith("--max-total-bytes=")) options.maxTotalBytes = parsePositiveInt(arg.slice("--max-total-bytes=".length), "--max-total-bytes=", 1024, 2 * 1024 * 1024 * 1024);
    else throw new Error(`알 수 없는 인자: ${arg} (--help 참조)`);
  }
  return options;
}

function printCliHelp() {
  process.stdout.write([
    "사용법: node scripts/local-object-storage-emulator.mjs [옵션]", "",
    "  127.0.0.1 루프백 전용 로컬 S3/R2 호환 HTTP 오브젝트 스토리지 에뮬레이터를 기동한다.",
    "  종료(SIGINT/SIGTERM) 시 임시 저장 디렉터리를 100% 자동 삭제한다.", "",
    "옵션:",
    "  --port N               수신 포트 (기본 59000, 0 지정 시 동적 할당)",
    "  --max-object-bytes N   단일 객체 용량 상한(바이트, 기본 16777216)",
    "  --max-total-bytes N    전체 누적 용량 상한(바이트, 기본 134217728)",
    "  --json                 기동 요약을 JSON으로 stdout 출력",
    "  --help, -h             이 도움말", "",
  ].join("\n"));
}

async function runCli(argv) {
  const options = parseObjectStorageCliArgs(argv);
  if (options.help) { printCliHelp(); return 0; }
  const instance = await startLocalObjectStorageEmulator({
    port: options.port, maxObjectBytes: options.maxObjectBytes, maxTotalBytes: options.maxTotalBytes, cleanupOnClose: true,
  });
  const summary = {
    ok: true, host: instance.host, port: instance.port, baseUrl: instance.baseUrl,
    healthUrl: instance.healthUrl, maxObjectBytes: instance.maxObjectBytes, maxTotalBytes: instance.maxTotalBytes,
  };
  if (options.json) process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  else process.stdout.write(`[storage] 로컬 오브젝트 스토리지 에뮬레이터 기동 완료: ${instance.baseUrl} (Ctrl+C로 종료·임시 디렉터리 자동 정리)\n`);
  const handleSignal = () => { instance.close().finally(() => process.exit(0)); };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  await new Promise(() => undefined);
  return 0;
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (invokedDirectly) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => { process.stderr.write(`[storage] 실패: ${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); },
  );
}
