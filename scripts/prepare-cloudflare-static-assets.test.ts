import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";

import { afterEach, describe, expect, it } from "vitest";

import {
  CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS,
  CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS,
  CLOUDFLARE_STATIC_MAX_FILE_BYTES,
} from "../deploy/cloudflare-static/src/large-static-assets";

import { prepareCloudflareStaticAssets } from "./prepare-cloudflare-static-assets.mts";

const temporaryDirectories: string[] = [];

function temporaryDist(): string {
  const directory = mkdtempSync(join(tmpdir(), "toonstudio-cf-assets-"));
  temporaryDirectories.push(directory);
  return directory;
}
function sparseFile(path: string, bytes: number): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "");
  truncateSync(path, bytes);
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("Cloudflare static large asset preparation", () => {
  it("creates bounded Brotli and gzip sidecars for reviewed large assets", async () => {
    const dist = temporaryDist();
    const relativePath = "assets/opencascade.wasm-testbuild.wasm";
    const originalBytes = CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1;
    sparseFile(join(dist, relativePath), originalBytes);

    await expect(prepareCloudflareStaticAssets(dist)).resolves.toEqual([
      relativePath,
    ]);
    const brotliPath = join(dist, `${relativePath}.br`);
    const gzipPath = join(dist, `${relativePath}.gz`);
    expect(statSync(brotliPath).size).toBeLessThanOrEqual(
      CLOUDFLARE_STATIC_MAX_FILE_BYTES,
    );
    expect(statSync(gzipPath).size).toBeLessThanOrEqual(
      CLOUDFLARE_STATIC_MAX_FILE_BYTES,
    );
    expect(brotliDecompressSync(readFileSync(brotliPath)).length).toBe(
      originalBytes,
    );
    expect(gunzipSync(readFileSync(gzipPath)).length).toBe(originalBytes);
    expect(readFileSync(join(dist, ".assetsignore"), "utf8")).toBe(
      `${[...CLOUDFLARE_OVERSIZED_ASSET_IGNORE_PATTERNS, ...CLOUDFLARE_R2_MEDIA_IGNORE_PATTERNS].join("\n")}\n`,
    );
  });

  it("keeps the reviewed product tour video R2-only without static sidecars", async () => {
    const dist = temporaryDist();
    const relativePath = "brand/toonstudio-product-tour.mp4";
    sparseFile(
      join(dist, relativePath),
      CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1,
    );

    await expect(prepareCloudflareStaticAssets(dist)).resolves.toEqual([
      relativePath,
    ]);
    expect(existsSync(join(dist, `${relativePath}.br`))).toBe(false);
    expect(existsSync(join(dist, `${relativePath}.gz`))).toBe(false);
    expect(readFileSync(join(dist, ".assetsignore"), "utf8")).toContain(
      `${relativePath}\n`,
    );
  });

  it("fails closed when a new unreviewed file exceeds the platform limit", async () => {
    const dist = temporaryDist();
    sparseFile(
      join(dist, "assets/unreviewed-model.glb"),
      CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1,
    );

    await expect(prepareCloudflareStaticAssets(dist)).rejects.toThrow(
      /unsupported files above 25 MiB/u,
    );
  });

  it("reuses content-addressed compressed sidecars on cache hit and ignores oversized cache entries", async () => {
    const distA = temporaryDist();
    const distB = temporaryDist();
    const cacheDir = temporaryDist();
    const relativePath = "assets/opencascade.wasm-cachetest.wasm";
    const originalBytes = CLOUDFLARE_STATIC_MAX_FILE_BYTES + 1;
    sparseFile(join(distA, relativePath), originalBytes);
    sparseFile(join(distB, relativePath), originalBytes);

    await prepareCloudflareStaticAssets(distA, { cacheDir, concurrency: 2 });
    const cachedFiles = readdirSync(cacheDir).sort();
    expect(cachedFiles).toHaveLength(2);
    expect(cachedFiles.some((name) => name.endsWith(".br.q9"))).toBe(true);
    expect(cachedFiles.some((name) => name.endsWith(".gzip.q9"))).toBe(true);

    // distB는 동일 SHA-256 원본이라 캐시에서 즉시 복사되고 복원 결과가 비트 동일하다.
    await prepareCloudflareStaticAssets(distB, { cacheDir, concurrency: 2 });
    expect(readFileSync(join(distB, `${relativePath}.br`))).toEqual(
      readFileSync(join(distA, `${relativePath}.br`)),
    );
    expect(readFileSync(join(distB, `${relativePath}.gz`))).toEqual(
      readFileSync(join(distA, `${relativePath}.gz`)),
    );

    // 25 MiB 초과로 손상된 캐시 파일은 무시하고 안전하게 재압축한다(fail-closed).
    const brCache = join(cacheDir, cachedFiles.find((name) => name.endsWith(".br.q9"))!);
    truncateSync(brCache, CLOUDFLARE_STATIC_MAX_FILE_BYTES + 10);
    const distC = temporaryDist();
    sparseFile(join(distC, relativePath), originalBytes);
    await prepareCloudflareStaticAssets(distC, { cacheDir, concurrency: 2 });
    expect(statSync(join(distC, `${relativePath}.br`)).size).toBeLessThanOrEqual(
      CLOUDFLARE_STATIC_MAX_FILE_BYTES,
    );
    expect(brotliDecompressSync(readFileSync(join(distC, `${relativePath}.br`))).length).toBe(
      originalBytes,
    );
  });
});
