import {
  BRUSH_SOURCE_ARCHIVE_MAX_BYTES,
  BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS,
  createStudioBrushOriginalSource,
  requireStudioBrushOriginalSource,
} from "./studio-brush-original-source";
/**
 * Brush pack import router — one entry point for every brush file the studio
 * can turn into a drawable brush (`.myb`, `.kpp`, `.sut`, `.sutg`, `.bundle`,
 * `.brushset`, `.json`; `.abr` keeps its dedicated worker lane).
 *
 * Heavy archive parsers (`krita-bundle`, `procreate-brushset`) are dynamically
 * imported so the Studio eager graph stays at +0B.
 */

import {
  importCspToolFile,
  CspToolFileError,
  type CspSutSqliteReader,
  type CspToolFileImportResult,
} from "../../../../../../packages/studio-format-gateway/src/csp-sut";
import { parseKppPreset, KppParseError } from "../../../../../../packages/studio-format-gateway/src/kpp";
import type {
  KritaBundleImportOptions,
  KritaBundleImportResult,
} from "../../../../../../packages/studio-format-gateway/src/krita-bundle";
import { importMybBrush, MybParseError } from "../../../../../../packages/studio-format-gateway/src/myb";
import type {
  ProcreateBrushsetImportOptions,
  ProcreateBrushsetImportResult,
} from "../../../../../../packages/studio-format-gateway/src/procreate-brushset";

import {
  createBrush,
  sanitizeBrushSnapshot,
  importBrushFromJson,
} from "./studio-brush-library";
import {
  STUDIO_BRUSH_PROGRAM_MAX_BYTES,
  STUDIO_EXTERNAL_BRUSH_PACK_MAX_BYTES,
} from "./studio-brush-pack-format";
import {
  StudioBrushPackPreserveOnlyError,
  StudioBrushProgramImportError,
  packWarning,
  passthroughWarning,
  withWarningPrefix,
  type StudioBrushPackCommitResult,
  type StudioBrushPackImportResult,
  type StudioBrushPackRights,
  type StudioBrushPackWarning,
} from "./studio-brush-pack-import-types";
import {
  studioBrushSnapshotFromProgram,
} from "./studio-brush-pack-snapshot-lower";
// 집계자 예외 (A4 D4 R14): 이 파일의 생산자 방출은 전부 코드지만,
// studioBrushPackImportNotes는 표시 문구를 조립하는 요약 함수라 이 경계에서만
// 리졸버를 부른다 — animatic load/save의 문자열 집계 경계와 같은 예외다.
import { resolveStudioBrushPackWarning } from "../status-i18n/studio-producer-error-i18n-brush";

import type { BrushLibraryRepositoryPort } from "./studio-brush-library-repository";
import type { StudioBrushPackFormat } from "./studio-brush-pack-format";
import type { FormatIssue } from "../../../../../../packages/studio-format-gateway/src/format-common";

export {
  STUDIO_BRUSH_PACK_ACCEPT,
  STUDIO_BRUSH_PROGRAM_MAX_BYTES,
  STUDIO_EXTERNAL_BRUSH_PACK_MAX_BYTES,
  studioBrushPackFormatOf,
  type StudioBrushPackFormat,
} from "./studio-brush-pack-format";

export {
  KRITA_REFERENCE_MAX_DIAMETER_PX,
  MYPAINT_LOG_RADIUS_SCALE,
  MAX_STROKE_WIDTH as STUDIO_BRUSH_PACK_MAX_STROKE_WIDTH,
  fitCubicBezierToNormalizedLut,
  studioBrushSnapshotFromProgram,
  type StudioBrushProgramSnapshotResult,
  type StudioBrushSnapshotLowerOptions,
} from "./studio-brush-pack-snapshot-lower";

export {
  StudioBrushPackPreserveOnlyError,
  StudioBrushProgramImportError,
  type StudioBrushPackCandidate,
  type StudioBrushPackCommitResult,
  type StudioBrushPackErrorCode,
  type StudioBrushPackImportResult,
  type StudioBrushPackPreservation,
  type StudioBrushPackRights,
  type StudioBrushPackWarning,
  type StudioBrushPackWarningCode,
  type StudioBrushProgramImportFormat,
} from "./studio-brush-pack-import-types";

// ---------------------------------------------------------------------------
// File lanes
// ---------------------------------------------------------------------------

function presetDisplayName(rawName: string, fileName: string): string {
  const trimmed = rawName.trim();
  if (trimmed) return trimmed;
  const stem = fileName.replace(/\.[^.]+$/u, "").trim();
  return stem || "가져온 브러시";
}

function issueText(issue: FormatIssue): string {
  return `${issue.path ? `${issue.path}: ` : ""}${issue.message} [${issue.code}]`;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function cspRights(result: CspToolFileImportResult): StudioBrushPackRights {
  return {
    authors: result.rights.authors,
    licenses: result.rights.licenses,
    websites: result.rights.websites,
    emails: result.rights.emails,
    tags: [],
  };
}

function kritaRights(result: KritaBundleImportResult): StudioBrushPackRights {
  return {
    authors: uniqueStrings([
      result.rights.author ?? "",
      result.rights.creator ?? "",
      result.rights.initialCreator ?? "",
    ]),
    licenses: uniqueStrings([result.rights.license ?? ""]),
    websites: uniqueStrings([result.rights.website ?? ""]),
    emails: uniqueStrings([result.rights.email ?? ""]),
    tags: result.rights.tags,
  };
}

/** Verified clean-room SUT/SUTG subset + auto-linked Material PNG tips → drawable Studio snapshots. */
export async function importStudioCspToolBytes(
  bytes: Uint8Array,
  fileName: string,
  kind: "sut" | "sutg",
  sqliteReader?: CspSutSqliteReader,
  signal?: AbortSignal,
): Promise<StudioBrushPackImportResult> {
  let parsed: CspToolFileImportResult;
  try {
    parsed = await importCspToolFile(bytes, { kind, sqliteReader, signal });
  } catch (cause) {
    if (cause instanceof CspToolFileError) {
      throw new StudioBrushProgramImportError(
        "cspReadFailed",
        kind,
        { kind: kind.toUpperCase(), detail: ` ${cause.message}`, causeCode: `csp:${cause.code}` },
        { cause },
      );
    }
    throw cause;
  }
  const assetsById = new Map(parsed.assets.map((asset) => [asset.id, asset]));
  const mapped = parsed.programs.map((program) => {
    const cspFeatures = parsed.programFeatures?.[program.id];
    const assetId = program.tip.imageAssetId ?? cspFeatures?.linkedAssetId;
    const linkedAsset = assetId ? assetsById.get(assetId) : undefined;
    return {
      program,
      mapped: studioBrushSnapshotFromProgram(program, {
        cspFeatures,
        tipPngBase64: linkedAsset?.base64 ?? null,
      }),
    };
  });
  return {
    format: kind,
    brushes: mapped.map(({ program, mapped: lowered }) => ({
      name: presetDisplayName(program.name, fileName),
      snapshot: {
        ...lowered.snapshot,
        sourcePresetName: presetDisplayName(program.name, fileName),
      },
    })),
    unmapped: mapped.flatMap(({ program, mapped: lowered }) =>
      lowered.unmapped.map((field) => `${program.name}:${field}`)),
    warnings: [
      ...parsed.warnings.map((issue) => passthroughWarning(issueText(issue))),
      ...mapped.flatMap(({ program, mapped: lowered }) =>
        lowered.warnings.map((warning) => withWarningPrefix(warning, program.name))),
    ],
    unsupported: parsed.unsupported,
    rights: cspRights(parsed),
    preservation: {
      status: parsed.supportLevel,
      sourceFormat: parsed.sourcePayload.format,
      originalBytesUnmodified: true,
      sourcePayloadAvailable: parsed.sourcePayload.base64.length > 0,
    },
  };
}

/** Procreate `.brushset` ZIP + `brushset.plist` + `Brush.archive` → drawable Studio snapshots. */
export async function importStudioProcreateBrushsetBytes(
  bytes: Uint8Array,
  fileName: string,
  options: ProcreateBrushsetImportOptions = {},
): Promise<StudioBrushPackImportResult> {
  if (options.signal?.aborted) throw new StudioBrushProgramImportError("cancelled", "brushset");
  const { importProcreateBrushset, ProcreateBrushsetError } = await import(
    "../../../../../../packages/studio-format-gateway/src/procreate-brushset"
  );
  if (options.signal?.aborted) throw new StudioBrushProgramImportError("cancelled", "brushset");
  let parsed: ProcreateBrushsetImportResult;
  try {
    parsed = importProcreateBrushset(bytes, options);
  } catch (cause) {
    if (cause instanceof ProcreateBrushsetError) {
      throw new StudioBrushProgramImportError(
        cause.code === "aborted" ? "cancelled" : "bundleReadFailed",
        "brushset",
        { detail: ` ${cause.message}`, causeCode: `brushset:${cause.code}` },
        { cause },
      );
    }
    throw cause;
  }
  const mapped = parsed.brushes.map((entry) => ({
    entry,
    mapped: studioBrushSnapshotFromProgram(entry.program, {
      procreateFeatures: entry.features,
      tipPyramid: entry.features.tipPyramid,
    }),
  }));
  return {
    format: "brushset",
    brushes: mapped.map(({ entry, mapped: lowered }) => ({
      name: presetDisplayName(entry.name, fileName),
      snapshot: {
        ...lowered.snapshot,
        sourcePresetName: presetDisplayName(entry.name, fileName),
      },
      sourcePath: entry.folder || "Brush.archive",
    })),
    unmapped: mapped.flatMap(({ entry, mapped: lowered }) =>
      lowered.unmapped.map((field) => `${entry.name}:${field}`)),
    warnings: [
      ...parsed.warnings.map((issue) => passthroughWarning(issueText(issue))),
      ...mapped.flatMap(({ entry, mapped: lowered }) =>
        lowered.warnings.map((warning) => withWarningPrefix(warning, entry.name))),
    ],
    unsupported: parsed.unsupported,
    rights: {
      authors: parsed.authors,
      licenses: [],
      websites: [],
      emails: [],
      tags: [],
    },
    preservation: {
      status: parsed.brushes.length > 0 ? "structured-partial" : "preserve-only",
      sourceFormat: parsed.sourcePayload.format,
      originalBytesUnmodified: true,
      sourcePayloadAvailable: parsed.sourcePayload.base64.length > 0,
    },
  };
}

/** Krita `.bundle` KPP/MYB resources → one candidate per verified program. */
export async function importStudioKritaBundleBytes(
  bytes: Uint8Array,
  options: KritaBundleImportOptions = {},
): Promise<StudioBrushPackImportResult> {
  // Archive decoding is needed only after an explicit file-import request, not on editor entry.
  if (options.signal?.aborted) throw new StudioBrushProgramImportError("cancelled", "bundle");
  const { importKritaBundle: parseBundle, KritaBundleError } = await import("../../../../../../packages/studio-format-gateway/src/krita-bundle");
  if (options.signal?.aborted) throw new StudioBrushProgramImportError("cancelled", "bundle");
  let parsed: KritaBundleImportResult;
  try {
    parsed = await parseBundle(bytes, options);
  } catch (cause) {
    if (cause instanceof KritaBundleError) {
      throw new StudioBrushProgramImportError(
        "bundleReadFailed",
        "bundle",
        { detail: ` ${cause.message}`, causeCode: `bundle:${cause.code}` },
        { cause },
      );
    }
    throw cause;
  }
  const mapped = parsed.brushes.map((brush) => ({
    brush,
    mapped: studioBrushSnapshotFromProgram(brush.program),
  }));
  return {
    format: "bundle",
    brushes: mapped.map(({ brush, mapped: lowered }) => ({
      name: presetDisplayName(brush.program.name, brush.path),
      snapshot: {
        ...lowered.snapshot,
        sourcePresetName: presetDisplayName(brush.program.name, brush.path),
      },
      sourcePath: brush.path,
      tags: brush.tags,
    })),
    unmapped: mapped.flatMap(({ brush, mapped: lowered }) =>
      lowered.unmapped.map((field) => `${brush.path}:${field}`)),
    warnings: [
      ...parsed.warnings.map((issue) => passthroughWarning(issueText(issue))),
      ...mapped.flatMap(({ brush, mapped: lowered }) =>
        lowered.warnings.map((warning) => withWarningPrefix(warning, brush.path))),
    ],
    unsupported: parsed.unsupported,
    rights: kritaRights(parsed),
    preservation: {
      status: parsed.brushes.length > 0 ? "structured-partial" : "preserve-only",
      sourceFormat: parsed.sourcePayload.format,
      originalBytesUnmodified: true,
      sourcePayloadAvailable: parsed.sourcePayload.base64.length > 0,
    },
  };
}

/** libmypaint `.myb` v3 → one drawable brush. */
export function importStudioMybBytes(
  bytes: Uint8Array,
  fileName: string,
): StudioBrushPackImportResult {
  if (!bytes.byteLength || bytes.byteLength > STUDIO_BRUSH_PROGRAM_MAX_BYTES) {
    throw new StudioBrushProgramImportError("sourceTooLarge", "myb");
  }
  const presetId = `myb:${fileName}`;
  let parsed;
  try {
    parsed = importMybBrush(bytes, presetId, presetDisplayName("", fileName));
  } catch (error) {
    if (error instanceof MybParseError) {
      throw new StudioBrushProgramImportError(
        "mybReadFailed",
        "myb",
        { detail: ` ${error.message}`, causeCode: `myb:${error.code}` },
        { cause: error },
      );
    }
    throw error;
  }
  const name = presetDisplayName(
    parsed.document.description ?? parsed.document.comment ?? "",
    fileName,
  );
  const mapped = studioBrushSnapshotFromProgram(parsed.preset);
  return {
    format: "myb",
    brushes: [
      {
        name,
        originalSource: createStudioBrushOriginalSource(bytes, fileName, "myb"),
        snapshot: { ...mapped.snapshot, sourcePresetName: name },
      },
    ],
    unmapped: [
      ...mapped.unmapped,
      ...parsed.unmappedSettings.map((setting) => `myb:${setting}`),
    ].sort(),
    warnings: mapped.warnings,
  };
}

/** Krita `.kpp` → one drawable brush, or a loud refusal. */
export function importStudioKppBytes(
  bytes: Uint8Array,
  fileName: string,
): StudioBrushPackImportResult {
  if (!bytes.byteLength || bytes.byteLength > STUDIO_BRUSH_PROGRAM_MAX_BYTES) {
    throw new StudioBrushProgramImportError("sourceTooLarge", "kpp");
  }
  let parsed;
  try {
    parsed = parseKppPreset(bytes);
  } catch (error) {
    if (error instanceof KppParseError) {
      throw new StudioBrushProgramImportError(
        "kppReadFailed",
        "kpp",
        { detail: ` ${error.message}`, causeCode: `kpp:${error.code}` },
        { cause: error },
      );
    }
    throw error;
  }
  const name = presetDisplayName(parsed.presetName, fileName);
  const mapped = studioBrushSnapshotFromProgram(parsed.program);
  const warnings: StudioBrushPackWarning[] = [
    ...mapped.warnings,
    ...parsed.warnings.map((text) => passthroughWarning(text)),
  ];
  if (parsed.program.providerPreference.length === 0) {
    warnings.push(packWarning("warn.kppEngineFallback"));
  }
  return {
    format: "kpp",
    brushes: [
      {
        name,
        snapshot: { ...mapped.snapshot, sourcePresetName: name },
        originalSource: createStudioBrushOriginalSource(bytes, fileName, "kpp"),
      },
    ],
    unmapped: [
      ...mapped.unmapped,
      ...parsed.unmapped.map((entry) => `kpp:${entry}`),
    ].sort(),
    warnings,
  };
}

/** App-private `.json` — reuses the existing validator, reported in one shape. */
export function importStudioBrushJsonText(
  text: string,
  fileName: string,
): StudioBrushPackImportResult {
  if (
    text.length > BRUSH_SOURCE_ARCHIVE_MAX_CHARACTERS ||
    new TextEncoder().encode(text).byteLength > BRUSH_SOURCE_ARCHIVE_MAX_BYTES
  ) {
    throw new StudioBrushProgramImportError("jsonTooLarge", "json");
  }
  const fallbackName = fileName.replace(/\.json$/iu, "");
  const { brush, adjustedFields } = importBrushFromJson(text, fallbackName);
  return {
    format: "json",
    brushes: [
      {
        name: brush.name,
        snapshot: sanitizeBrushSnapshot(brush).snapshot,
        ...(brush.originalSource ? { originalSource: brush.originalSource } : {}),
      },
    ],
    unmapped: [],
    warnings:
      adjustedFields.length > 0
        ? [packWarning("warn.valuesAdjusted", { fields: adjustedFields.join(", ") })]
        : [],
  };
}

export interface StudioBrushProgramFileOptions {
  readonly signal?: AbortSignal;
  readonly cspSqliteReader?: CspSutSqliteReader;
  readonly kritaBundleOptions?: KritaBundleImportOptions;
  readonly procreateOptions?: ProcreateBrushsetImportOptions;
}

/** Reads every engine-neutral program lane; ABR/JSON retain their dedicated owners. */
export async function importStudioBrushProgramFile(
  file: File,
  format: "myb" | "kpp" | "sut" | "sutg" | "bundle" | "brushset",
  options: StudioBrushProgramFileOptions = {},
): Promise<StudioBrushPackImportResult> {
  const maximumBytes =
    format === "sut" || format === "sutg" || format === "bundle" || format === "brushset"
      ? STUDIO_EXTERNAL_BRUSH_PACK_MAX_BYTES
      : STUDIO_BRUSH_PROGRAM_MAX_BYTES;
  if (file.size > maximumBytes) {
    throw new StudioBrushProgramImportError(
      "fileTooLarge",
      format,
      { maxMb: String(Math.round(maximumBytes / 1_000_000)) },
    );
  }
  if (options.signal?.aborted) {
    throw new StudioBrushProgramImportError("cancelled", format);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (options.signal?.aborted) {
    throw new StudioBrushProgramImportError("cancelled", format);
  }
  if (format === "myb") return importStudioMybBytes(bytes, file.name);
  if (format === "kpp") return importStudioKppBytes(bytes, file.name);
  if (format === "bundle") {
    return importStudioKritaBundleBytes(bytes, {
      ...options.kritaBundleOptions,
      signal: options.signal,
    });
  }
  if (format === "brushset") {
    return importStudioProcreateBrushsetBytes(bytes, file.name, {
      ...options.procreateOptions,
      signal: options.signal,
    });
  }
  const sqliteReader =
    options.cspSqliteReader ??
    (await import("../studio-csp-sut-sqlite-reader-client")).createBrowserCspSutSqliteReader();
  return importStudioCspToolBytes(bytes, file.name, format, sqliteReader, options.signal);
}

export function studioBrushPackFormatLabel(format: StudioBrushPackFormat): string {
  switch (format) {
    case "myb": return "libmypaint";
    case "kpp": return "Krita";
    case "bundle": return "Krita 번들";
    case "brushset": return "Procreate 브러시셋";
    case "sut": return "Clip Studio SUT";
    case "sutg": return "Clip Studio SUTG";
    case "abr": return "Photoshop ABR";
    case "json": return "Studio JSON";
  }
}

function displayList(label: string, values: readonly string[]): string | null {
  if (values.length === 0) return null;
  const shown = values.slice(0, 4);
  const remainder = values.length - shown.length;
  return `${label}: ${shown.join(", ")}${remainder > 0 ? ` 외 ${remainder}개` : ""}.`;
}

/** Compact but explicit UI ledger for approximations, unsupported fields and rights. */
export function studioBrushPackImportNotes(result: StudioBrushPackImportResult): string[] {
  const notes = result.warnings.map((warning) => resolveStudioBrushPackWarning(warning));
  const unmapped = displayList("옮기지 못한 전용 설정", result.unmapped);
  if (unmapped) notes.push(unmapped);
  const unsupported = result.unsupported ?? [];
  const unsupportedSummary = displayList(
    `미지원 항목 ${unsupported.length}개`,
    unsupported.map(issueText),
  );
  if (unsupportedSummary) notes.push(unsupportedSummary);
  const rights = result.rights;
  if (rights) {
    const parts = [
      displayList("제작자", rights.authors),
      displayList("라이선스", rights.licenses),
      displayList("웹사이트", rights.websites),
      displayList("연락처", rights.emails),
      displayList("태그", rights.tags),
    ].filter((value): value is string => value !== null);
    if (parts.length > 0) notes.push(`권리 정보 — ${parts.join(" ")}`);
  }
  if (result.preservation?.originalBytesUnmodified) {
    notes.push("원본 파일 바이트는 수정하지 않았어요.");
  }
  return uniqueStrings(notes);
}

/** Sole commit boundary for MYB/KPP/SUT/SUTG/Krita bundle/Procreate brushset programs. */
export async function commitStudioBrushPackImport(
  result: StudioBrushPackImportResult,
  repository: BrushLibraryRepositoryPort,
): Promise<StudioBrushPackCommitResult> {
  if (result.brushes.length === 0) throw new StudioBrushPackPreserveOnlyError(result);
  const materialized = result.brushes.map((candidate) => ({
    ...createBrush(candidate.name, candidate.snapshot),
    ...(Object.hasOwn(candidate, "originalSource")
      ? { originalSource: requireStudioBrushOriginalSource(candidate.originalSource) }
      : {}),
  }));
  const saved = await repository.putMany(materialized);
  return { result, materialized, saved };
}

export async function importAndCommitStudioBrushProgramFile(
  file: File,
  format: "myb" | "kpp" | "sut" | "sutg" | "bundle" | "brushset",
  repository: BrushLibraryRepositoryPort,
  options: StudioBrushProgramFileOptions = {},
): Promise<StudioBrushPackCommitResult> {
  const result = await importStudioBrushProgramFile(file, format, options);
  return commitStudioBrushPackImport(result, repository);
}
