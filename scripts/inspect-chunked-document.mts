/**
 * 청크형 SQLite 문서(.clip) 가져오기 요약 CLI.
 *
 * 사용자가 소유한 실제 샘플로 `importChunkedSqliteDocument`가 따른 제3자 명세의 가정(캔버스 크기 환산, 레이어 트리, 위치 계산, 픽셀 디코드)을
 * 검증하기 위한 도구다. 가져오기를 실행하고 **집계만** 출력한다: 레이어 종류별 개수, 합성 모드·잠금·표시 비트의 분포, 위치 오프셋 관계,
 * 픽셀을 읽은 레이어 수와 그 범위가 캔버스와 맞는지, 저장된 블록을 실제로 푼 레이어 수(전부 0이면 외부 ID 대조 가정을 의심한다), 접히기 전의
 * 진단 코드별 건수. 레이어 이름, UUID, 픽셀 값, 미리보기 바이트, 경로는 출력하지 않고
 * 파일은 SHA-256과 파일명(경로 제외)으로만 식별한다. 출력은 샘플 파일을 공유하지 않고도 가설 검증 결과를 공유할 수 있게 하려는 것이다.
 *
 * 컨테이너 수준(청크 목록, SQLite 스키마)은 `inspect-chunked-container.mts`가 다룬다. 이 도구는 SQLite를 `node:sqlite`로 읽으므로
 * 테스트 보조 모듈 `tests/corpus/formats/node-sqlite-clip-reader.ts`를 쓴다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/inspect-chunked-document.mts [--json] <파일>...
 *
 * 종료 코드: 0 정상, 1 파일 읽기 실패, 2 사용법 오류, 3 가져오기 실패(읽은 파일 중 하나라도).
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { pathToFileURL } from "node:url";

import { ClipDocumentError, importChunkedSqliteDocument } from "../packages/studio-format-gateway/src/chunked-sqlite-document.ts";
import { openNodeSqlite } from "../tests/corpus/formats/node-sqlite-clip-reader.ts";

import type { ClipDocumentImportResult, ClipSqliteOpener } from "../packages/studio-format-gateway/src/chunked-sqlite-document.ts";

const MAX_ERROR_CHARACTERS = 200;
const PNG_SIGNATURE_BYTES = 8;
const ASPECT_TOLERANCE = 0.01;

export type Counts = Readonly<Record<string, number>>;

export interface ChunkedDocumentSummary {
  readonly canvas: {
    readonly unit: string | null;
    readonly unitCode: number;
    readonly widthValue: number;
    readonly heightValue: number;
    readonly resolution: number | null;
    readonly width: number;
    readonly height: number;
    readonly sizeSource: string;
    readonly defaultColorType: number | null;
    readonly channelBytes: number | null;
  };
  readonly layerCount: number;
  readonly kinds: Counts;
  readonly composite: Counts;
  readonly visibility: Counts;
  readonly lock: Counts;
  readonly folderFlags: Counts;
  readonly drawToRenderType: Counts;
  readonly opacityRaw: { readonly min: number; readonly max: number } | null;
  readonly clipToBelow: number;
  readonly placement: {
    /** 렌더 오프셋이 레이어 오프셋의 부호 반대(S1: 많은 레이어에서 그렇다고 적음)라서 픽셀 원점이 (0, 0)인 레이어. */
    readonly renderNegatesLayerOffset: number;
    readonly bothZero: number;
    readonly other: number;
  };
  readonly pixels: {
    readonly withPixels: number;
    readonly colorModes: Counts;
    readonly extentEqualsCanvas: number;
    readonly extentInsideCanvas: number;
    readonly extentOutsideCanvas: number;
    /** 압축 블록을 하나 이상 풀어 채운 레이어 수. */
    readonly layersWithStoredBlocks: number;
    /** 픽셀을 읽었지만 저장된 블록이 하나도 없어 전체가 초기 색인 레이어 수. 모든 레이어가 여기에 들면 외부 ID 대조를 의심한다. */
    readonly layersAllInitial: number;
    readonly storedBlocksTotal: number;
  };
  readonly masks: { readonly total: number; readonly enabled: number; readonly withValues: number; readonly withStoredBlocks: number; readonly defaultValues: Counts };
  readonly preview: null | { readonly bytes: number; readonly width: number | null; readonly height: number | null; readonly aspectMatchesCanvas: boolean | null };
  readonly warnings: Counts;
  readonly unsupported: Counts;
  /** 진단 코드마다 첫 메시지 하나. 메시지에는 레이어 이름을 넣지 않는다(이름은 `path`에만 들어가며 출력하지 않는다). */
  readonly exampleMessages: Readonly<Record<string, string>>;
}

export type ChunkedDocumentReport =
  | { readonly ok: true; readonly byteLength: number; readonly sha256: string; readonly summary: ChunkedDocumentSummary }
  | { readonly ok: false; readonly code: string; readonly message: string };

function tally(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function sortedCounts(counts: Record<string, number>): Counts {
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, "en", { numeric: true })));
}

function pngSize(png: Uint8Array): { width: number; height: number } | null {
  if (png.byteLength < 24) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const width = view.getUint32(PNG_SIGNATURE_BYTES + 8, false);
  const height = view.getUint32(PNG_SIGNATURE_BYTES + 12, false);
  return width > 0 && height > 0 ? { width, height } : null;
}

/** 가져오기 결과를 집계한다. 이름·UUID·픽셀·바이트는 담지 않는다. */
export function summarizeChunkedDocument(result: ClipDocumentImportResult): ChunkedDocumentSummary {
  const kinds: Record<string, number> = {};
  const composite: Record<string, number> = {};
  const visibility: Record<string, number> = {};
  const lock: Record<string, number> = {};
  const folderFlags: Record<string, number> = {};
  const drawToRenderType: Record<string, number> = {};
  const colorModes: Record<string, number> = {};
  const maskDefaults: Record<string, number> = {};
  let opacityRaw: { min: number; max: number } | null = null;
  let clipToBelow = 0;
  const placement = { renderNegatesLayerOffset: 0, bothZero: 0, other: 0 };
  const pixels = { withPixels: 0, extentEqualsCanvas: 0, extentInsideCanvas: 0, extentOutsideCanvas: 0, layersWithStoredBlocks: 0, layersAllInitial: 0, storedBlocksTotal: 0 };
  const masks = { total: 0, enabled: 0, withValues: 0, withStoredBlocks: 0 };
  const { canvas } = result;

  for (const layer of result.layers) {
    tally(kinds, layer.kind);
    tally(composite, `${layer.compositeRaw}=${layer.compositeMode ?? "?"}`);
    tally(visibility, String(layer.visibilityRaw));
    tally(lock, String(layer.lockRaw));
    tally(folderFlags, String(layer.folderFlags));
    tally(drawToRenderType, String(layer.placement.drawToRenderOffscreenType));
    opacityRaw = opacityRaw === null ? { min: layer.opacityRaw, max: layer.opacityRaw } : { min: Math.min(opacityRaw.min, layer.opacityRaw), max: Math.max(opacityRaw.max, layer.opacityRaw) };
    if (layer.clipToBelow) clipToBelow += 1;

    const { layerOffsetX, layerOffsetY, renderOffsetX, renderOffsetY } = layer.placement;
    if (layerOffsetX === 0 && layerOffsetY === 0 && renderOffsetX === 0 && renderOffsetY === 0) placement.bothZero += 1;
    else if (layerOffsetX + renderOffsetX === 0 && layerOffsetY + renderOffsetY === 0) placement.renderNegatesLayerOffset += 1;
    else placement.other += 1;

    if (layer.pixels !== null && layer.extent !== null) {
      pixels.withPixels += 1;
      tally(colorModes, layer.colorMode ?? "?");
      const { x, y, width, height } = layer.extent;
      if (x === 0 && y === 0 && width === canvas.width && height === canvas.height) pixels.extentEqualsCanvas += 1;
      else if (x >= 0 && y >= 0 && x + width <= canvas.width && y + height <= canvas.height) pixels.extentInsideCanvas += 1;
      else pixels.extentOutsideCanvas += 1;
      const stored = layer.storedBlocks ?? 0;
      if (stored > 0) pixels.layersWithStoredBlocks += 1;
      else pixels.layersAllInitial += 1;
      pixels.storedBlocksTotal += stored;
    }
    if (layer.mask !== null) {
      masks.total += 1;
      if (layer.mask.enabled) masks.enabled += 1;
      if (layer.mask.values !== null) masks.withValues += 1;
      if (layer.mask.storedBlocks > 0) masks.withStoredBlocks += 1;
      tally(maskDefaults, String(layer.mask.defaultValue));
    }
  }

  // 건수는 접히기 전의 총계(`diagnosticCounts`)를 쓴다. 목록은 코드당 50건에서 접히므로 목록을 세면 레이어가 수천 개인 문서에서 50에 포화한다.
  const warnings: Record<string, number> = { ...result.diagnosticCounts.warnings };
  const unsupported: Record<string, number> = { ...result.diagnosticCounts.unsupported };
  const exampleMessages: Record<string, string> = {};
  for (const issue of [...result.warnings, ...result.unsupported]) {
    if (issue.code in warnings || issue.code in unsupported) exampleMessages[issue.code] ??= issue.message;
  }

  let preview: ChunkedDocumentSummary["preview"] = null;
  if (result.previewPng !== null) {
    const size = pngSize(result.previewPng);
    const aspect = size === null ? null : Math.abs(size.width / size.height - canvas.width / canvas.height) / (canvas.width / canvas.height) <= ASPECT_TOLERANCE;
    preview = { bytes: result.previewPng.byteLength, width: size?.width ?? null, height: size?.height ?? null, aspectMatchesCanvas: aspect };
  }

  return {
    canvas: {
      unit: canvas.unit,
      unitCode: canvas.unitCode,
      widthValue: canvas.widthValue,
      heightValue: canvas.heightValue,
      resolution: canvas.resolution,
      width: canvas.width,
      height: canvas.height,
      sizeSource: canvas.sizeSource,
      defaultColorType: canvas.defaultColorType,
      channelBytes: canvas.channelBytes,
    },
    layerCount: result.layers.length,
    kinds: sortedCounts(kinds),
    composite: sortedCounts(composite),
    visibility: sortedCounts(visibility),
    lock: sortedCounts(lock),
    folderFlags: sortedCounts(folderFlags),
    drawToRenderType: sortedCounts(drawToRenderType),
    opacityRaw,
    clipToBelow,
    placement,
    pixels: { withPixels: pixels.withPixels, colorModes: sortedCounts(colorModes), extentEqualsCanvas: pixels.extentEqualsCanvas, extentInsideCanvas: pixels.extentInsideCanvas, extentOutsideCanvas: pixels.extentOutsideCanvas, layersWithStoredBlocks: pixels.layersWithStoredBlocks, layersAllInitial: pixels.layersAllInitial, storedBlocksTotal: pixels.storedBlocksTotal },
    masks: { ...masks, defaultValues: sortedCounts(maskDefaults) },
    preview,
    warnings: sortedCounts(warnings),
    unsupported: sortedCounts(unsupported),
    exampleMessages,
  };
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_CHARACTERS ? `${message.slice(0, MAX_ERROR_CHARACTERS)}…` : message;
}

/** 파일을 가져와 요약한다. 가져오기 실패는 던지지 않고 `ok: false`로 돌려준다. */
export async function describeChunkedDocument(bytes: Uint8Array, openSqlite: ClipSqliteOpener = openNodeSqlite): Promise<ChunkedDocumentReport> {
  try {
    const result = await importChunkedSqliteDocument(bytes, { openSqlite });
    return { ok: true, byteLength: bytes.byteLength, sha256: result.source.sha256, summary: summarizeChunkedDocument(result) };
  } catch (error) {
    if (error instanceof ClipDocumentError) return { ok: false, code: error.code, message: describeError(error) };
    throw error;
  }
}

function countsText(counts: Counts): string {
  const entries = Object.entries(counts);
  return entries.length === 0 ? "(없음)" : entries.map(([key, count]) => `${key}×${count}`).join(" ");
}

export function formatDocumentReportText(fileName: string, report: ChunkedDocumentReport): string {
  if (!report.ok) return `== ${fileName}\n가져오기 실패 [${report.code}]: ${report.message}`;
  const { summary, byteLength, sha256 } = report;
  const canvas = summary.canvas;
  const lines: string[] = [];
  lines.push(`== ${fileName} (${byteLength.toLocaleString("en-US")} bytes, sha256 ${sha256})`);
  lines.push(
    `canvas: unit=${canvas.unit ?? "?"}(${canvas.unitCode}) value=${canvas.widthValue}x${canvas.heightValue} dpi=${canvas.resolution ?? "없음"} -> ${canvas.width}x${canvas.height}px (${canvas.sizeSource}) colorType=${String(canvas.defaultColorType)} channelBytes=${String(canvas.channelBytes)}`,
  );
  lines.push(`layers: ${summary.layerCount} kinds: ${countsText(summary.kinds)}`);
  lines.push(`composite: ${countsText(summary.composite)}`);
  lines.push(`visibility: ${countsText(summary.visibility)} lock: ${countsText(summary.lock)} folderFlags: ${countsText(summary.folderFlags)}`);
  lines.push(
    `opacityRaw: ${summary.opacityRaw === null ? "(없음)" : `${summary.opacityRaw.min}..${summary.opacityRaw.max}`} clipToBelow: ${summary.clipToBelow} drawToRenderType: ${countsText(summary.drawToRenderType)}`,
  );
  lines.push(`placement: renderNegatesLayerOffset=${summary.placement.renderNegatesLayerOffset} bothZero=${summary.placement.bothZero} other=${summary.placement.other}`);
  lines.push(
    `pixels: ${summary.pixels.withPixels} layers (${countsText(summary.pixels.colorModes)}) extent: equalsCanvas=${summary.pixels.extentEqualsCanvas} insideCanvas=${summary.pixels.extentInsideCanvas} outsideCanvas=${summary.pixels.extentOutsideCanvas}`,
  );
  lines.push(`storedBlocks: layersWithStoredBlocks=${summary.pixels.layersWithStoredBlocks} layersAllInitial=${summary.pixels.layersAllInitial} totalBlocks=${summary.pixels.storedBlocksTotal}`);
  lines.push(`masks: total=${summary.masks.total} enabled=${summary.masks.enabled} withValues=${summary.masks.withValues} withStoredBlocks=${summary.masks.withStoredBlocks} defaults: ${countsText(summary.masks.defaultValues)}`);
  lines.push(
    summary.preview === null
      ? "preview: (없음)"
      : `preview: ${summary.preview.bytes.toLocaleString("en-US")} bytes ${String(summary.preview.width)}x${String(summary.preview.height)} aspectMatchesCanvas=${String(summary.preview.aspectMatchesCanvas)}`,
  );
  lines.push(`warnings: ${countsText(summary.warnings)}`);
  lines.push(`unsupported: ${countsText(summary.unsupported)}`);
  for (const [code, message] of Object.entries(summary.exampleMessages)) lines.push(`  - ${code}: ${message}`);
  return lines.join("\n");
}

const USAGE = [
  "사용법: pnpm exec tsx scripts/inspect-chunked-document.mts [--json] <파일>...",
  "",
  "  --json   집계 보고서를 JSON 배열로 출력한다.",
  "",
  "레이어 종류·합성 모드·오프셋 관계·디코드 범위 같은 집계만 출력한다. 레이어 이름, UUID, 픽셀 값, 미리보기 바이트는",
  "출력하지 않는다. 사용자가 소유하거나 사용 허락을 받은 파일만 검사하고, 샘플을 저장소에 커밋하지 않는다.",
].join("\n");

export interface DocumentCliDeps {
  readonly readFile: (path: string) => Uint8Array;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly openSqlite: ClipSqliteOpener;
}

const DEFAULT_DEPS: DocumentCliDeps = {
  readFile: (path) => readFileSync(path),
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
  openSqlite: openNodeSqlite,
};

/** 종료 코드: 0 정상, 1 파일 읽기 실패, 2 사용법 오류, 3 가져오기 실패. */
export async function runDocumentInspectCli(argv: readonly string[], deps: DocumentCliDeps = DEFAULT_DEPS): Promise<number> {
  let json = false;
  const files: string[] = [];
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg === "--help" || arg === "-h") {
      deps.stdout(`${USAGE}\n`);
      return 0;
    } else if (arg.startsWith("--")) {
      deps.stderr(`알 수 없는 옵션: ${arg}\n${USAGE}\n`);
      return 2;
    } else files.push(arg);
  }
  if (files.length === 0) {
    deps.stderr(`검사할 파일이 없습니다.\n${USAGE}\n`);
    return 2;
  }

  let exitCode = 0;
  const reports: Array<{ file: string; report: ChunkedDocumentReport }> = [];
  for (const filePath of files) {
    let bytes: Uint8Array;
    try {
      bytes = deps.readFile(filePath);
    } catch (error) {
      deps.stderr(`${basename(filePath)}: 읽기 실패: ${describeError(error)}\n`);
      exitCode = 1;
      continue;
    }
    const report = await describeChunkedDocument(bytes, deps.openSqlite);
    if (!report.ok && exitCode === 0) exitCode = 3;
    reports.push({ file: basename(filePath), report });
  }

  if (json) deps.stdout(`${JSON.stringify(reports, null, 2)}\n`);
  else for (const { file, report } of reports) deps.stdout(`${formatDocumentReportText(file, report)}\n`);
  return exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runDocumentInspectCli(process.argv.slice(2));
}
