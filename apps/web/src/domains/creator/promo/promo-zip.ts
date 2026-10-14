/**
 * Promo export ZIP — DEFLATE-compressed writer/reader backed by fflate (MIT).
 *
 * Replaces the hand-rolled STORE (uncompressed) writer: text sources and JSON
 * shrink with DEFLATE, already-compressed media is stored without a second
 * compression pass, and the old 100-file / 100MB ceilings are raised to
 * PROMO_ZIP_MAX_FILES / PROMO_ZIP_MAX_TOTAL_BYTES so large exports fit.
 *
 * Boundary: this module serves promo / Remotion-kit export files only. The
 * project archive format (studio-project-archive.ts — its own STORE writer
 * and strict reader) is a separate, intentionally frozen format and is not
 * routed through here.
 */
import { unzipSync, zipSync } from "fflate";

import type { Zippable } from "fflate";

/** Raised from the hand-rolled writer's 100-file ceiling. */
export const PROMO_ZIP_MAX_FILES = 2_000;
/** Raised from the hand-rolled writer's 100MB ceiling (uncompressed total). */
export const PROMO_ZIP_MAX_TOTAL_BYTES = 500_000_000;

/** Fixed timestamp so identical inputs produce identical archive bytes. */
const ZIP_FIXED_MTIME = new Date(Date.UTC(2000, 0, 1));

/** Extensions that are already compressed; DEFLATE would only burn CPU. */
const STORE_ONLY_EXTENSION = /\.(?:png|jpe?g|webp|avif|gif|mp4|webm|mp3|ogg|opus|zip|woff2)$/iu;

const crc32Table = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function promoCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (crc32Table[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function assertSafeZipPath(path: string): void {
  if (!/^[A-Za-z0-9_./-]+$/u.test(path) || path.startsWith("/") || path.split("/").includes("..")) {
    throw new Error("안전하지 않은 ZIP 경로예요.");
  }
}

export function promoZip(files: Readonly<Record<string, string | Uint8Array>>): Uint8Array {
  const encoder = new TextEncoder();
  const paths = Object.keys(files);
  if (paths.length > PROMO_ZIP_MAX_FILES) throw new Error("ZIP 파일 수가 너무 많아요.");
  const zippable: Zippable = {};
  let totalBytes = 0;
  for (const path of paths) {
    assertSafeZipPath(path);
    const value = files[path];
    const data = typeof value === "string" ? encoder.encode(value) : value;
    totalBytes += data.byteLength;
    if (totalBytes > PROMO_ZIP_MAX_TOTAL_BYTES) throw new Error("프로젝트가 500MB를 초과했어요.");
    zippable[path] = [data, { level: STORE_ONLY_EXTENSION.test(path) ? 0 : 6, mtime: ZIP_FIXED_MTIME }];
  }
  return zipSync(zippable);
}

export function promoUnzip(bytes: Uint8Array): Record<string, Uint8Array> {
  let entryCount = 0;
  let totalBytes = 0;
  return unzipSync(bytes, {
    filter(file) {
      if (file.name.endsWith("/")) return false;
      assertSafeZipPath(file.name);
      entryCount += 1;
      if (entryCount > PROMO_ZIP_MAX_FILES) throw new Error("ZIP 파일 수가 너무 많아요.");
      totalBytes += file.originalSize;
      if (totalBytes > PROMO_ZIP_MAX_TOTAL_BYTES) throw new Error("ZIP 해제 크기가 500MB를 초과했어요.");
      return true;
    },
  });
}
