#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
  CLOUDFLARE_R2_LARGE_ASSET_BUCKET,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
  cloudflareLargeAssetDescriptor,
  cloudflareR2MediaDescriptor,
} from "../deploy/cloudflare-static/src/large-static-assets";

import { isCloudflareAccountId, readLocalWranglerOAuthToken } from "./lib/cloudflare-local-oauth.mjs";

export interface R2LargeAssetUpload {
  readonly absolutePath: string;
  readonly key: string;
  readonly bytes: number;
  readonly contentType: string;
  readonly cacheControl: string;
}

/** R2 목록 API가 돌려주는 객체 상태. 단일 요청 업로드의 etag는 본문 MD5(소문자 hex)다. */
export interface R2RemoteObject {
  readonly size: number;
  readonly etag: string;
}

export interface R2UploadPlan {
  readonly uploads: readonly R2LargeAssetUpload[];
  readonly unchanged: readonly R2LargeAssetUpload[];
}

export interface R2Md5ComputationResult {
  readonly localMd5: Map<string, string>;
  readonly hashedCount: number;
  readonly cacheHits: number;
  readonly skippedHashCount: number;
}

export interface R2SyncOptions {
  readonly concurrency?: number;
  readonly hashConcurrency?: number;
  readonly hashCachePath?: string | null;
  readonly networkRetryBaseMs?: number;
}

interface LocalMd5CacheEntry {
  readonly size: number;
  readonly mtimeNs: string;
  readonly ctimeNs: string;
  readonly ino: string;
  readonly md5: string;
}

interface LocalMd5CacheDocument {
  readonly schemaVersion: 1;
  readonly entries: Record<string, LocalMd5CacheEntry>;
}

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
export const DEFAULT_UPLOAD_CONCURRENCY = 8;
const MAX_UPLOAD_CONCURRENCY = 8;
const SMALL_FILE_READ_BYTES = 1024 * 1024;
const STREAM_HIGH_WATER_MARK = 256 * 1024;
const DEFAULT_HASH_CONCURRENCY = Math.min(8, Math.max(4, availableParallelism()));
const MD5_HEX_PATTERN = /^[0-9a-f]{32}$/u;
const DEFAULT_NETWORK_RETRY_BASE_MS = 1_000;
const MAX_NETWORK_RETRY_DELAY_MS = 16_000;
/**
 * R2 REST API는 계정 전체에 5분당 1,200건 한도가 있고, 넘으면 다음 5분 동안 모든 API 호출이 429로 막힌다
 * (https://developers.cloudflare.com/r2/platform/limits/). 2026-10-23 첫 이관 때 동시 8개로 2,500건째에서
 * 막혔다. 한도의 3/4인 초당 3건만 쓰고 나머지는 wrangler 배포와 같은 계정의 다른 작업에 남긴다.
 */
const R2_REST_REQUESTS_PER_SECOND = 3;
const R2_RATE_LIMIT_BLOCK_MS = 5 * 60_000;
const R2_REQUEST_ATTEMPTS = 5;

export interface RequestPacer {
  /** 다음 요청 자리가 날 때까지 기다린다. */
  readonly wait: () => Promise<void>;
  /** 한도에 걸렸을 때 이후의 모든 요청을 이 시간만큼 미룬다. */
  readonly pause: (milliseconds: number) => void;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds));
}

export function normalizeEtag(etag: string): string {
  return etag.trim().replace(/^"|"$/gu, "").toLowerCase();
}

export function isMultipartEtag(etag: string): boolean {
  return normalizeEtag(etag).includes("-");
}

function clampConcurrency(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`R2 concurrency must be an integer between 1 and ${max}`);
  }
  return Math.min(value, max);
}

/** 동시 업로드들이 함께 쓰는 간격 조절기: 요청 시작을 초당 requestsPerSecond건 이하로 벌린다. */
export function createRequestPacer(requestsPerSecond: number): RequestPacer {
  const intervalMs = 1_000 / requestsPerSecond;
  let nextSlotAt = 0;
  return {
    async wait() {
      const now = Date.now();
      const slotAt = Math.max(now, nextSlotAt);
      nextSlotAt = slotAt + intervalMs;
      if (slotAt > now) await sleep(slotAt - now);
    },
    pause(milliseconds) {
      nextSlotAt = Math.max(nextSlotAt, Date.now() + milliseconds);
    },
  };
}

/**
 * 실패한 응답을 다시 보낼 때까지 기다릴 시간(ms). 429는 Cloudflare가 주는 `Retry-After`(초)를 따르고,
 * 없으면 문서상 차단 시간인 5분을 기다린다. 5xx는 짧게 물러난다. 그 밖의 실패는 다시 보내지 않는다(null).
 */
export function r2RetryDelayMs(status: number, retryAfter: string | null, attempt: number): number | null {
  if (status === 429) {
    const seconds = Number(retryAfter);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : R2_RATE_LIMIT_BLOCK_MS;
  }
  return status >= 500 ? 1_000 * attempt : null;
}

const requestPacer = createRequestPacer(R2_REST_REQUESTS_PER_SECOND);

/** 모든 Cloudflare API 호출이 같은 간격 조절기를 거치고, 한도 초과·일시 장애·네트워크 끊김은 기다렸다 다시 보낸다. */
async function cloudflareFetch(
  url: string,
  init: RequestInit,
  networkRetryBaseMs = DEFAULT_NETWORK_RETRY_BASE_MS,
): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    await requestPacer.wait();
    let response: Response;
    try {
      response = await fetch(url, { ...init, redirect: "error" });
    } catch (error) {
      if (attempt === R2_REQUEST_ATTEMPTS) throw error;
      const delay = Math.min(MAX_NETWORK_RETRY_DELAY_MS, networkRetryBaseMs * 2 ** (attempt - 1));
      console.log(
        `Cloudflare API network error: retrying in ${Math.max(1, Math.ceil(delay / 1_000))}s (${attempt}/${R2_REQUEST_ATTEMPTS})`,
      );
      if (delay > 0) await sleep(delay);
      continue;
    }
    const delay = response.ok
      ? null
      : r2RetryDelayMs(response.status, response.headers.get("retry-after"), attempt);
    if (delay === null || attempt === R2_REQUEST_ATTEMPTS) return response;
    await response.body?.cancel();
    console.log(`Cloudflare API ${response.status}: retrying in ${Math.ceil(delay / 1_000)}s (${attempt}/${R2_REQUEST_ATTEMPTS})`);
    if (response.status === 429) requestPacer.pause(delay);
    else await sleep(delay);
  }
}

function walkFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
function normalizedRelativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

/**
 * R2가 원본인 파일을 찾는다: 25 MiB를 넘어 명시 등록된 대형 에셋과, R2 미디어 이관 경로의
 * 바이너리 미디어(크기 무관). 등록되지 않은 25 MiB 초과 파일은 배포를 멈춘다.
 */
export function discoverR2LargeAssets(
  distDirectory = resolve(process.cwd(), "dist"),
): readonly R2LargeAssetUpload[] {
  if (!existsSync(distDirectory) || !statSync(distDirectory).isDirectory()) {
    throw new Error(`Cloudflare asset directory does not exist: ${distDirectory}`);
  }

  const uploads: R2LargeAssetUpload[] = [];
  for (const absolutePath of walkFiles(distDirectory)) {
    const key = normalizedRelativePath(distDirectory, absolutePath);
    const bytes = statSync(absolutePath).size;
    const pathname = `/${key}`;
    const media = cloudflareR2MediaDescriptor(pathname);
    if (bytes <= CLOUDFLARE_STATIC_MAX_FILE_BYTES && !media) continue;
    const descriptor = cloudflareLargeAssetDescriptor(pathname);
    if (!descriptor) {
      throw new Error(`Unreviewed file exceeds the Static Assets limit: ${key}`);
    }
    uploads.push({
      absolutePath,
      key,
      bytes,
      contentType: descriptor.contentType,
      cacheControl: descriptor.cacheControl ?? CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
    });
  }
  return uploads.sort((left, right) => left.key.localeCompare(right.key));
}

export async function fileMd5(path: string, knownBytes?: number): Promise<string> {
  const bytes = knownBytes ?? statSync(path).size;
  if (bytes <= SMALL_FILE_READ_BYTES) {
    const buffer = await readFile(path);
    return createHash("md5").update(buffer).digest("hex");
  }
  const hash = createHash("md5");
  for await (const chunk of createReadStream(path, { highWaterMark: STREAM_HIGH_WATER_MARK })) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function readLocalMd5Cache(cachePath: string | null): Map<string, LocalMd5CacheEntry> {
  const entries = new Map<string, LocalMd5CacheEntry>();
  if (!cachePath || !existsSync(cachePath)) return entries;
  try {
    const parsed = JSON.parse(readFileSync(cachePath, "utf8")) as Partial<LocalMd5CacheDocument>;
    if (parsed?.schemaVersion !== 1 || !parsed.entries || typeof parsed.entries !== "object") {
      return entries;
    }
    for (const [filePath, record] of Object.entries(parsed.entries)) {
      if (
        record
        && Number.isSafeInteger(record.size)
        && typeof record.mtimeNs === "string"
        && typeof record.ctimeNs === "string"
        && typeof record.ino === "string"
        && typeof record.md5 === "string"
        && MD5_HEX_PATTERN.test(record.md5)
      ) {
        entries.set(filePath, record);
      }
    }
  } catch {
    // 손상된 로컬 해시 캐시는 무시하고 실측 MD5로 폴백한다.
  }
  return entries;
}

function writeLocalMd5Cache(cachePath: string | null, entries: ReadonlyMap<string, LocalMd5CacheEntry>): void {
  if (!cachePath) return;
  const temporaryPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    const payload: LocalMd5CacheDocument = {
      schemaVersion: 1,
      entries: Object.fromEntries(entries),
    };
    writeFileSync(temporaryPath, `${JSON.stringify(payload)}\n`, "utf8");
    renameSync(temporaryPath, cachePath);
  } catch {
    rmSync(temporaryPath, { force: true });
  }
}

export async function runPool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency = DEFAULT_UPLOAD_CONCURRENCY,
): Promise<void> {
  if (items.length === 0) return;
  const width = Math.min(clampConcurrency(concurrency, DEFAULT_UPLOAD_CONCURRENCY, MAX_UPLOAD_CONCURRENCY), items.length);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item!);
    }
  }));
}

/**
 * 원격에 동일 키·동일 바이트·단일 ETag로 존재하는 후보만 병렬 MD5 계산한다.
 * 원격에 없거나 크기가 다르거나 멀티파트 ETag인 파일은 어차피 업로드 대상이므로 디스크 해싱을 생략한다.
 */
export async function computeCandidateMd5s(
  assets: readonly R2LargeAssetUpload[],
  remote: ReadonlyMap<string, R2RemoteObject>,
  options: { readonly hashConcurrency?: number; readonly hashCachePath?: string | null } = {},
): Promise<R2Md5ComputationResult> {
  const localMd5 = new Map<string, string>();
  const cachePath = options.hashCachePath ?? null;
  const cacheEntries = readLocalMd5Cache(cachePath);
  const nextCacheEntries = new Map<string, LocalMd5CacheEntry>();
  const toHash: Array<{
    readonly asset: R2LargeAssetUpload;
    readonly mtimeNs: string;
    readonly ctimeNs: string;
    readonly ino: string;
  }> = [];
  let cacheHits = 0;
  let skippedHashCount = 0;

  for (const asset of assets) {
    const existing = remote.get(asset.key);
    if (!existing || existing.size !== asset.bytes || isMultipartEtag(existing.etag)) {
      skippedHashCount += 1;
      continue;
    }
    const stat = statSync(asset.absolutePath, { bigint: true });
    const size = Number(stat.size);
    const mtimeNs = stat.mtimeNs.toString();
    const ctimeNs = stat.ctimeNs.toString();
    const ino = stat.ino.toString();
    const cached = cacheEntries.get(asset.absolutePath);
    if (
      cached
      && cached.size === size
      && cached.mtimeNs === mtimeNs
      && cached.ctimeNs === ctimeNs
      && cached.ino === ino
    ) {
      localMd5.set(asset.key, cached.md5);
      nextCacheEntries.set(asset.absolutePath, cached);
      cacheHits += 1;
    } else {
      toHash.push({ asset, mtimeNs, ctimeNs, ino });
    }
  }

  const hashConcurrency = clampConcurrency(
    options.hashConcurrency,
    DEFAULT_HASH_CONCURRENCY,
    MAX_UPLOAD_CONCURRENCY,
  );
  await runPool(toHash, async ({ asset, mtimeNs, ctimeNs, ino }) => {
    const md5 = await fileMd5(asset.absolutePath, asset.bytes);
    localMd5.set(asset.key, md5);
    nextCacheEntries.set(asset.absolutePath, { size: asset.bytes, mtimeNs, ctimeNs, ino, md5 });
  }, hashConcurrency);

  if (cachePath && (toHash.length > 0 || cacheHits > 0)) {
    writeLocalMd5Cache(cachePath, nextCacheEntries);
  }
  return { localMd5, hashedCount: toHash.length, cacheHits, skippedHashCount };
}

/** 크기와 MD5(=etag)가 같은 객체는 다시 올리지 않는다. 멀티파트 etag(`-N`)는 비교할 수 없어 다시 올린다. */
export function planR2Uploads(
  assets: readonly R2LargeAssetUpload[],
  localMd5: ReadonlyMap<string, string>,
  remote: ReadonlyMap<string, R2RemoteObject>,
): R2UploadPlan {
  const uploads: R2LargeAssetUpload[] = [];
  const unchanged: R2LargeAssetUpload[] = [];
  for (const asset of assets) {
    const existing = remote.get(asset.key);
    const remoteEtag = existing ? normalizeEtag(existing.etag) : "";
    const same = existing !== undefined
      && existing.size === asset.bytes
      && !remoteEtag.includes("-")
      && remoteEtag === localMd5.get(asset.key);
    (same ? unchanged : uploads).push(asset);
  }
  return { uploads, unchanged };
}

export function r2ObjectPutRequest(
  asset: R2LargeAssetUpload,
  accountId: string,
  token: string,
): { readonly url: string; readonly headers: Readonly<Record<string, string>> } {
  const key = asset.key.split("/").map(encodeURIComponent).join("/");
  return {
    url: `${CLOUDFLARE_API}/accounts/${accountId}/r2/buckets/${CLOUDFLARE_R2_LARGE_ASSET_BUCKET}/objects/${key}`,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": asset.contentType,
      "cache-control": asset.cacheControl,
      "content-disposition": "inline",
    },
  };
}

async function cloudflareJson(
  url: string,
  token: string,
  networkRetryBaseMs = DEFAULT_NETWORK_RETRY_BASE_MS,
): Promise<Record<string, unknown>> {
  const response = await cloudflareFetch(
    url,
    { headers: { authorization: `Bearer ${token}` } },
    networkRetryBaseMs,
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Cloudflare API ${response.status} for ${url.replace(/\?.*$/u, "")}`);
  }
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (body?.success !== true) throw new Error("Cloudflare API 응답을 확인할 수 없습니다.");
  return body;
}

async function resolveAccountId(token: string, networkRetryBaseMs = DEFAULT_NETWORK_RETRY_BASE_MS): Promise<string> {
  const configured = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (configured) return configured;
  const body = await cloudflareJson(`${CLOUDFLARE_API}/accounts?per_page=5`, token, networkRetryBaseMs);
  const accounts = body.result as Array<{ id: string }>;
  if (accounts.length !== 1) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required when the API token can see several accounts");
  }
  return accounts[0]!.id;
}

export async function listR2Objects(
  accountId: string,
  token: string,
  networkRetryBaseMs = DEFAULT_NETWORK_RETRY_BASE_MS,
): Promise<Map<string, R2RemoteObject>> {
  const objects = new Map<string, R2RemoteObject>();
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    const body = await cloudflareJson(
      `${CLOUDFLARE_API}/accounts/${accountId}/r2/buckets/${CLOUDFLARE_R2_LARGE_ASSET_BUCKET}/objects?${query}`,
      token,
      networkRetryBaseMs,
    );
    for (const object of body.result as Array<{ key: string; size: number | string; etag: string }>) {
      objects.set(object.key, { size: Number(object.size), etag: object.etag });
    }
    const info = body.result_info as { cursor?: string; is_truncated?: boolean } | undefined;
    cursor = info?.is_truncated ? info.cursor : undefined;
  } while (cursor);
  return objects;
}

async function uploadObject(
  asset: R2LargeAssetUpload,
  accountId: string,
  token: string,
  networkRetryBaseMs = DEFAULT_NETWORK_RETRY_BASE_MS,
): Promise<void> {
  const { url, headers } = r2ObjectPutRequest(asset, accountId, token);
  const body = await readFile(asset.absolutePath);
  const response = await cloudflareFetch(url, { method: "PUT", headers, body }, networkRetryBaseMs);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`R2 upload failed for ${asset.key}: HTTP ${response.status}`);
  }
}

function resolveDefaultHashCachePath(distDirectory: string): string | null {
  if (process.env.TOONSTUDIO_R2_HASH_CACHE === "0" || process.argv.includes("--no-hash-cache")) {
    return null;
  }
  const configured = process.env.TOONSTUDIO_R2_HASH_CACHE_PATH?.trim();
  if (configured) return resolve(process.cwd(), configured);
  const rel = relative(process.cwd(), resolve(distDirectory));
  if (rel.startsWith("..")) return null;
  return resolve(process.cwd(), "node_modules/.cache/toonstudio-r2-md5-cache.json");
}

export async function syncCloudflareR2Assets(
  mode: "dry-run" | "production",
  distDirectory = resolve(process.cwd(), "dist"),
  useLocalOAuth = false,
  options: R2SyncOptions = {},
): Promise<readonly R2LargeAssetUpload[]> {
  const startedAt = Date.now();
  const assets = discoverR2LargeAssets(distDirectory);
  const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  console.log(`R2 ${mode}: ${assets.length} R2-authority files (${totalBytes} bytes)`);
  if (mode === "dry-run") return assets;

  if (useLocalOAuth && !isCloudflareAccountId(process.env.CLOUDFLARE_ACCOUNT_ID)) {
    throw new Error("--wrangler-oauth로 동기화할 계정의 CLOUDFLARE_ACCOUNT_ID를 확인해 주세요.");
  }
  const token = useLocalOAuth ? readLocalWranglerOAuthToken() : process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required for the R2 sync");
  const networkRetryBaseMs = options.networkRetryBaseMs ?? DEFAULT_NETWORK_RETRY_BASE_MS;
  const uploadConcurrency = clampConcurrency(options.concurrency, DEFAULT_UPLOAD_CONCURRENCY, MAX_UPLOAD_CONCURRENCY);
  const accountId = await resolveAccountId(token, networkRetryBaseMs);
  const remote = await listR2Objects(accountId, token, networkRetryBaseMs);
  const hashCachePath = options.hashCachePath !== undefined
    ? options.hashCachePath
    : resolveDefaultHashCachePath(distDirectory);
  const hashResult = await computeCandidateMd5s(assets, remote, {
    hashConcurrency: options.hashConcurrency,
    hashCachePath,
  });
  const plan = planR2Uploads(assets, hashResult.localMd5, remote);
  const uploadBytes = plan.uploads.reduce((sum, asset) => sum + asset.bytes, 0);
  const minutes = Math.ceil(plan.uploads.length / R2_REST_REQUESTS_PER_SECOND / 60);
  console.log(
    `R2 production: ${plan.unchanged.length} unchanged, ${plan.uploads.length} to upload (${uploadBytes} bytes, `
      + `hashed=${hashResult.hashedCount}, cacheHits=${hashResult.cacheHits}, skippedHash=${hashResult.skippedHashCount}, `
      + `concurrency=${uploadConcurrency}, about ${minutes} min at ${R2_REST_REQUESTS_PER_SECOND} requests/s)`,
  );

  let done = 0;
  await runPool(plan.uploads, async (asset) => {
    await uploadObject(asset, accountId, token, networkRetryBaseMs);
    done += 1;
    if (done % 250 === 0 || done === plan.uploads.length) {
      console.log(`R2 production: uploaded ${done}/${plan.uploads.length}`);
    }
  }, uploadConcurrency);
  console.log(`R2 production: finished in ${((Date.now() - startedAt) / 1_000).toFixed(1)}s`);
  return plan.uploads;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes("--production")
    ? "production"
    : "dry-run";
  await syncCloudflareR2Assets(mode, undefined, process.argv.includes("--wrangler-oauth"));
}
