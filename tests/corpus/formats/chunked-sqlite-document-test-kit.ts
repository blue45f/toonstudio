/**
 * 테스트 보조: `.clip` 문서 가져오기 시험이 함께 쓰는 작은 함수들. 합성 문서를 만들어 가져오고 결과를 비교하기 쉬운 모양으로 바꾼다.
 */

import { importChunkedSqliteDocument, ClipDocumentError, type ClipDocumentErrorCode, type ClipDocumentImportOptions, type ClipDocumentImportResult, type ClipLayer } from "../../../packages/studio-format-gateway/src/chunked-sqlite-document";

import { buildClipDocument, type FixtureDocumentSpec, type FixtureLayer, type FixtureOffscreenRef } from "./chunked-sqlite-document-fixtures";
import { openNodeSqlite } from "./node-sqlite-clip-reader";

import type { FormatIssue } from "../../../packages/studio-format-gateway/src/format-common";

export function sameBytes(left: Uint8Array | null, right: Uint8Array): boolean {
  return left !== null && Buffer.compare(Buffer.from(left.buffer, left.byteOffset, left.byteLength), Buffer.from(right.buffer, right.byteOffset, right.byteLength)) === 0;
}

export function codes(issues: readonly FormatIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

export async function importSpec(spec: FixtureDocumentSpec, options: Partial<ClipDocumentImportOptions> = {}): Promise<ClipDocumentImportResult> {
  return importChunkedSqliteDocument(buildClipDocument(spec).bytes, { openSqlite: openNodeSqlite, ...options });
}

export async function codeOf(action: () => Promise<unknown>): Promise<ClipDocumentErrorCode | "other" | "none"> {
  try {
    await action();
    return "none";
  } catch (error) {
    return error instanceof ClipDocumentError ? error.code : "other";
  }
}

/** 던진 `ClipDocumentError`를 돌려준다. 던지지 않거나 다른 오류면 시험이 실패한다. */
export async function failureOf(action: () => Promise<unknown>): Promise<ClipDocumentError> {
  try {
    await action();
  } catch (error) {
    if (error instanceof ClipDocumentError) return error;
    throw error;
  }
  throw new Error("오류가 나야 한다");
}

export function layerNamed(result: ClipDocumentImportResult, name: string): ClipLayer {
  const found = result.layers.find((layer) => layer.name === name);
  if (found === undefined) throw new Error(`레이어 ${name}가 없다: ${result.layers.map((layer) => layer.name).join(", ")}`);
  return found;
}

/** 비교하기 쉬운 알려진 픽셀 함수. */
export const pattern = (x: number, y: number): readonly [number, number, number, number] => [x & 255, (y * 3) & 255, (x * 7 + y * 13) & 255, 255 - ((x + y) & 63)];

export function rasterLayer(id: number, name: string, width: number, height: number, extra: Partial<FixtureLayer> = {}): FixtureLayer {
  return { id, name, raster: { width, height, kind: "rgba", pixelAt: pattern }, ...extra };
}

/** 알파 한 평면(8비트) 마스크 오프스크린. 값은 위치에서 정해져 비교하기 쉽다. */
export const maskOf = (width: number, height: number, extra: Partial<FixtureOffscreenRef> = {}): FixtureOffscreenRef => ({
  width,
  height,
  kind: "mask8",
  pixelAt: (x, y) => [(x * 11 + y * 5) & 255],
  ...extra,
});
