#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { availableParallelism } from "node:os";
import { relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import {
  constants as zlibConstants,
  createBrotliCompress,
  createGzip,
} from "node:zlib";

import {
  CLOUDFLARE_LARGE_ASSET_ENCODINGS,
  CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS,
  CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
  cloudflareLargeAssetSidecarPath,
  isCloudflareOversizedAssetPath,
  supportsCloudflareStaticSidecar,
  type CloudflareLargeAssetEncoding,
} from "../deploy/cloudflare-static/src/large-static-assets";

export interface PrepareStaticAssetsOptions {
  readonly cacheDir?: string | null;
  readonly concurrency?: number;
}

const DEFAULT_COMPRESSION_CONCURRENCY = Math.min(4, Math.max(2, availableParallelism()));

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

async function fileSha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { highWaterMark: 256 * 1024 })) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

function resolveDefaultSidecarCacheDir(distDirectory: string): string | null {
  if (process.env.TOONSTUDIO_SIDECAR_CACHE === "0" || process.argv.includes("--no-cache")) {
    return null;
  }
  const rel = relative(process.cwd(), resolve(distDirectory));
  if (rel.startsWith("..")) return null;
  return resolve(process.cwd(), "node_modules/.cache/toonstudio-cf-sidecars");
}

function compressor(
  encoding: CloudflareLargeAssetEncoding,
  sourceBytes: number,
) {
  if (encoding === "br") {
    return createBrotliCompress({
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 9,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: sourceBytes,
      },
    });
  }
  return createGzip({ level: 9 });
}

async function writeCompressedSidecar(
  sourcePath: string,
  destinationPath: string,
  encoding: CloudflareLargeAssetEncoding,
  sourceBytes: number,
  cacheEntryPath: string | null,
): Promise<{ readonly compressedBytes: number; readonly cacheHit: boolean }> {
  const temporaryPath = `${destinationPath}.tmp-${process.pid}-${encoding}`;
  rmSync(temporaryPath, { force: true });
  try {
    if (cacheEntryPath && existsSync(cacheEntryPath)) {
      try {
        const cachedStat = statSync(cacheEntryPath);
        if (
          cachedStat.isFile()
          && cachedStat.size > 0
          && cachedStat.size <= CLOUDFLARE_STATIC_MAX_FILE_BYTES
        ) {
          copyFileSync(cacheEntryPath, temporaryPath);
          rmSync(destinationPath, { force: true });
          renameSync(temporaryPath, destinationPath);
          return { compressedBytes: cachedStat.size, cacheHit: true };
        }
      } catch {
        // 캐시 읽기에 실패하면 원본을 직접 압축한다.
      }
    }

    await pipeline(
      createReadStream(sourcePath, { highWaterMark: 256 * 1024 }),
      compressor(encoding, sourceBytes),
      createWriteStream(temporaryPath),
    );
    const compressedBytes = statSync(temporaryPath).size;
    if (compressedBytes > CLOUDFLARE_STATIC_MAX_FILE_BYTES) {
      throw new Error(
        `${encoding} sidecar still exceeds 25 MiB: ${destinationPath} (${compressedBytes} bytes)`,
      );
    }
    rmSync(destinationPath, { force: true });
    renameSync(temporaryPath, destinationPath);

    if (cacheEntryPath) {
      const cacheTemp = `${cacheEntryPath}.tmp-${process.pid}-${Date.now()}`;
      try {
        mkdirSync(resolve(cacheEntryPath, ".."), { recursive: true });
        copyFileSync(destinationPath, cacheTemp);
        renameSync(cacheTemp, cacheEntryPath);
      } catch {
        rmSync(cacheTemp, { force: true });
      }
    }
    return { compressedBytes, cacheHit: false };
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

async function runBoundedPool<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
  concurrency: number,
): Promise<void> {
  if (items.length === 0) return;
  const width = Math.min(Math.max(1, concurrency), items.length);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await worker(item!);
    }
  }));
}

export async function prepareCloudflareStaticAssets(
  distDirectory = resolve(process.cwd(), "dist"),
  options: PrepareStaticAssetsOptions = {},
): Promise<readonly string[]> {
  if (!existsSync(distDirectory) || !statSync(distDirectory).isDirectory()) {
    throw new Error(`Cloudflare asset directory does not exist: ${distDirectory}`);
  }

  const oversizedFiles = walkFiles(distDirectory)
    .map((path) => ({
      path,
      relativePath: normalizedRelativePath(distDirectory, path),
      bytes: statSync(path).size,
    }))
    .filter(({ bytes }) => bytes > CLOUDFLARE_STATIC_MAX_FILE_BYTES);

  const unsupported = oversizedFiles.filter(({ relativePath }) =>
    !isCloudflareOversizedAssetPath(`/${relativePath}`));
  if (unsupported.length > 0) {
    throw new Error(
      `Cloudflare Static Assets has unsupported files above 25 MiB:\n${unsupported
        .map(({ relativePath, bytes }) =>
          ` - ${relativePath} (${bytes} bytes)`)
        .join("\n")}`,
    );
  }

  const cacheDir = options.cacheDir !== undefined
    ? options.cacheDir
    : resolveDefaultSidecarCacheDir(distDirectory);
  const concurrency = options.concurrency ?? DEFAULT_COMPRESSION_CONCURRENCY;

  const sidecarTargets = oversizedFiles.filter((file) =>
    supportsCloudflareStaticSidecar(`/${file.relativePath}`));
  const shaByPath = new Map<string, string>();
  if (cacheDir && sidecarTargets.length > 0) {
    await runBoundedPool(sidecarTargets, async (file) => {
      shaByPath.set(file.path, await fileSha256(file.path));
    }, concurrency);
  }

  const jobs = sidecarTargets.flatMap((file) =>
    CLOUDFLARE_LARGE_ASSET_ENCODINGS.map((encoding) => {
      const sidecarRelativePath = cloudflareLargeAssetSidecarPath(
        `/${file.relativePath}`,
        encoding,
      ).slice(1);
      const sourceSha = shaByPath.get(file.path);
      return {
        file,
        encoding,
        sidecarRelativePath,
        sidecarPath: resolve(distDirectory, sidecarRelativePath),
        cacheEntryPath: cacheDir && sourceSha
          ? resolve(cacheDir, `${sourceSha}.${encoding}.q9`)
          : null,
      };
    }));

  await runBoundedPool(jobs, async (job) => {
    const { compressedBytes, cacheHit } = await writeCompressedSidecar(
      job.file.path,
      job.sidecarPath,
      job.encoding,
      job.file.bytes,
      job.cacheEntryPath,
    );
    console.log(
      `Cloudflare compressed large asset${cacheHit ? " (cache hit)" : ""}: ${job.sidecarRelativePath} (${compressedBytes} bytes from ${job.file.bytes})`,
    );
  }, concurrency);

  // R2 미디어 이관 패턴도 Static Assets 업로드에서 뺀다. 배포 스크립트는 R2 동기화가 끝난 뒤에만
  // Worker를 올리므로, 이 파일이 쓰여도 R2에 없는 미디어가 운영에 나가는 순서는 생기지 않는다.
  const ignorePath = resolve(distDirectory, ".assetsignore");
  writeFileSync(
    ignorePath,
    `${[...CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS, ...CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS].join("\n")}\n`,
    "utf8",
  );
  console.log(`Wrote ${ignorePath}`);
  return oversizedFiles.map(({ relativePath }) => relativePath);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  await prepareCloudflareStaticAssets();
}
