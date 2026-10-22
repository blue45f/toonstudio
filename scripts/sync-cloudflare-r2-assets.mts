#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CLOUDFLARE_LARGE_ASSET_CACHE_CONTROL,
  CLOUDFLARE_R2_LARGE_ASSET_BUCKET,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
  cloudflareLargeAssetDescriptor,
  cloudflareR2MediaDescriptor,
} from "../deploy/cloudflare-static/src/large-static-assets";

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

const CLOUDFLARE_API = "https://api.cloudflare.com/client/v4";
const UPLOAD_CONCURRENCY = 8;
const UPLOAD_ATTEMPTS = 3;

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

export async function fileMd5(path: string): Promise<string> {
  const hash = createHash("md5");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
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
    const same = existing !== undefined
      && existing.size === asset.bytes
      && existing.etag.toLowerCase() === localMd5.get(asset.key);
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

async function cloudflareJson(url: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok || body.success !== true) {
    throw new Error(`Cloudflare API ${response.status} for ${url.replace(/\?.*$/u, "")}: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body;
}

async function resolveAccountId(token: string): Promise<string> {
  const configured = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  if (configured) return configured;
  const body = await cloudflareJson(`${CLOUDFLARE_API}/accounts?per_page=5`, token);
  const accounts = body.result as Array<{ id: string }>;
  if (accounts.length !== 1) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required when the API token can see several accounts");
  }
  return accounts[0]!.id;
}

export async function listR2Objects(
  accountId: string,
  token: string,
): Promise<Map<string, R2RemoteObject>> {
  const objects = new Map<string, R2RemoteObject>();
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ per_page: "1000" });
    if (cursor) query.set("cursor", cursor);
    const body = await cloudflareJson(
      `${CLOUDFLARE_API}/accounts/${accountId}/r2/buckets/${CLOUDFLARE_R2_LARGE_ASSET_BUCKET}/objects?${query}`,
      token,
    );
    for (const object of body.result as Array<{ key: string; size: number | string; etag: string }>) {
      objects.set(object.key, { size: Number(object.size), etag: object.etag });
    }
    const info = body.result_info as { cursor?: string; is_truncated?: boolean } | undefined;
    cursor = info?.is_truncated ? info.cursor : undefined;
  } while (cursor);
  return objects;
}

async function uploadWithRetry(asset: R2LargeAssetUpload, accountId: string, token: string): Promise<void> {
  const { url, headers } = r2ObjectPutRequest(asset, accountId, token);
  for (let attempt = 1; attempt <= UPLOAD_ATTEMPTS; attempt += 1) {
    const response = await fetch(url, { method: "PUT", headers, body: readFileSync(asset.absolutePath) });
    if (response.ok) return;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === UPLOAD_ATTEMPTS) {
      throw new Error(`R2 upload failed for ${asset.key}: HTTP ${response.status} ${await response.text()}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000 * attempt));
  }
}

async function runPool<T>(items: readonly T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item!);
    }
  }));
}

export async function syncCloudflareR2Assets(
  mode: "dry-run" | "production",
  distDirectory = resolve(process.cwd(), "dist"),
): Promise<readonly R2LargeAssetUpload[]> {
  const assets = discoverR2LargeAssets(distDirectory);
  const totalBytes = assets.reduce((sum, asset) => sum + asset.bytes, 0);
  console.log(`R2 ${mode}: ${assets.length} R2-authority files (${totalBytes} bytes)`);
  if (mode === "dry-run") return assets;

  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is required for the R2 sync");
  const accountId = await resolveAccountId(token);
  const remote = await listR2Objects(accountId, token);
  const localMd5 = new Map<string, string>();
  for (const asset of assets) localMd5.set(asset.key, await fileMd5(asset.absolutePath));
  const plan = planR2Uploads(assets, localMd5, remote);
  const uploadBytes = plan.uploads.reduce((sum, asset) => sum + asset.bytes, 0);
  console.log(`R2 production: ${plan.unchanged.length} unchanged, ${plan.uploads.length} to upload (${uploadBytes} bytes)`);

  let done = 0;
  await runPool(plan.uploads, async (asset) => {
    await uploadWithRetry(asset, accountId, token);
    done += 1;
    if (done % 250 === 0 || done === plan.uploads.length) {
      console.log(`R2 production: uploaded ${done}/${plan.uploads.length}`);
    }
  });
  return plan.uploads;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  const mode = process.argv.includes("--production")
    ? "production"
    : "dry-run";
  await syncCloudflareR2Assets(mode);
}
