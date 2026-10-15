/**
 * 투고 패키지 — ZIP 조립.
 *
 * 흐름: 점검 다시 실행 → 배치 계획 → (선택) 표지 PDF → 표지·시놉시스·캐릭터·매니페스트 글 만들기 → 기존 ZIP 작성기
 * (`studio-package-archive`)로 묶기. 작성기가 경로 검증·중복 거부·CRC-32·진행·취소·크기 상한을 맡고, 이 모듈은
 * 상한을 앱 기준(`SUBMISSION_PACKAGE_LIMITS`)으로 더 낮춰 넘겨 메모리를 지킨다.
 *
 * 이미지는 사용자가 고른 `File` 그대로 Blob 항목으로 넘긴다. 작성기는 항목을 하나씩 읽어 CRC 를 계산하므로 한 번에
 * 메모리에 올라오는 이미지는 하나(최대 `maxFileBytes`)이고, 결과는 Blob 조각을 이어 붙인 ZIP Blob 이다. 어떤
 * 데이터도 서버로 보내지 않는다.
 */
import { createStudioDownloadFileName, appendStudioDownloadSuffix, studioDownloadVersionSuffix } from "../export/studio-download-file-name";
import {
  buildStudioPackageArchiveBlob,
  STUDIO_PACKAGE_ARCHIVE_LIMITS,
  StudioPackageArchiveError,
  type StudioPackageArchiveEntry,
  type StudioPackageArchiveLimits,
} from "../studio-package-archive";
import type { StudioCrc32ExecutionMode } from "../studio-crc32-worker-client";

import { isAbortError } from "./submission-package-abort";
import {
  buildSubmissionCharactersMarkdown,
  buildSubmissionCoverMarkdown,
  buildSubmissionSynopsisMarkdown,
  type SubmissionCoverInput,
} from "./submission-package-cover";
import {
  listSubmissionPackagePaths,
  planSubmissionPackageLayout,
  SUBMISSION_PACKAGE_CHARACTERS_PATH,
  SUBMISSION_PACKAGE_COVER_PATH,
  SUBMISSION_PACKAGE_COVER_PDF_PATH,
  SUBMISSION_PACKAGE_MANIFEST_PATH,
  SUBMISSION_PACKAGE_SYNOPSIS_PATH,
  type SubmissionPackageLayout,
} from "./submission-package-layout";
import { evaluateSubmissionPackage, submissionTargetWidth } from "./submission-package-preflight";
import { normalizeSingleLine } from "./submission-package-text";
import {
  SUBMISSION_PACKAGE_LIMITS,
  type SubmissionIssue,
  type SubmissionPackageDraft,
  type SubmissionPackageLimits,
  type SubmissionPackageLocale,
  type SubmissionPlatformSizeLimits,
  type SubmissionPreflightReport,
} from "./submission-package-types";

export const SUBMISSION_PACKAGE_MANIFEST_SCHEMA = "toonstudio.submission-package/v1" as const;

/** 표지·매니페스트·표지 PDF 가 차지할 여유. 이미지 합계 상한에 더해 작성기 상한을 정한다. */
const TEXT_ALLOWANCE_BYTES = 10_000_000;
/** 작성기의 파일 수 상한에 더할 텍스트 파일 수(표지·PDF·시놉시스·캐릭터·매니페스트). */
const TEXT_FILE_ALLOWANCE = 5;

export type SubmissionPackagePhase = "preparing" | "packing" | "finishing";

export interface SubmissionPackageProgress {
  readonly phase: SubmissionPackagePhase;
  readonly completedFiles: number;
  readonly totalFiles: number;
  readonly processedBytes: number;
  readonly totalBytes: number;
  readonly path: string | null;
}

export type SubmissionBuildErrorCode =
  /** 점검에서 막는 문제가 남아 있다. `issues` 에 목록이 있다. */
  | "invalid-draft"
  /** 사용자가 취소했다. */
  | "aborted"
  /** 앱이 정한 메모리·개수 상한을 넘었다. */
  | "limit"
  /** 고른 파일이 읽는 도중 바뀌었거나 읽을 수 없게 됐다(삭제·이동·크기 변경). 다시 고르면 된다. */
  | "source-changed"
  | "unexpected";

export class SubmissionPackageBuildError extends Error {
  readonly code: SubmissionBuildErrorCode;
  readonly issues: readonly SubmissionIssue[];
  /** 다시 시도하면 해결될 수 있는 오류인가(상한 초과·점검 실패는 먼저 고쳐야 한다). */
  readonly retryable: boolean;

  constructor(code: SubmissionBuildErrorCode, message: string, options: { issues?: readonly SubmissionIssue[]; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SubmissionPackageBuildError";
    this.code = code;
    this.issues = options.issues ?? [];
    this.retryable = code === "source-changed" || code === "unexpected" || code === "aborted";
  }
}

export interface SubmissionBuildWarning {
  readonly code: "cover-pdf-failed" | "crc32-worker-unavailable";
}

export interface SubmissionPackageManifest {
  readonly schema: typeof SUBMISSION_PACKAGE_MANIFEST_SCHEMA;
  readonly generator: { readonly name: "ToonStudio"; readonly feature: "submission-package" };
  readonly createdAt: string;
  readonly locale: SubmissionPackageLocale;
  readonly title: string;
  readonly author: string;
  readonly widthCheck: { readonly id: string; readonly width: number } | null;
  readonly totals: {
    readonly episodes: number;
    readonly pages: number;
    readonly imageBytes: number;
    readonly characterSheets: number;
  };
  readonly episodes: ReadonlyArray<{
    readonly number: number;
    readonly title: string;
    readonly directory: string;
    readonly pages: ReadonlyArray<{
      readonly path: string;
      readonly originalName: string;
      readonly mime: string;
      readonly width: number;
      readonly height: number;
      readonly bytes: number;
    }>;
  }>;
  readonly characters: ReadonlyArray<{ readonly name: string; readonly aliases: readonly string[] }>;
  readonly checks: {
    readonly errors: number;
    readonly warnings: number;
    readonly info: number;
    readonly issues: ReadonlyArray<Pick<SubmissionIssue, "code" | "severity" | "params">>;
  };
  /** 표지·시놉시스·캐릭터·표지 PDF 의 크기(이미지는 `episodes` 에 있다). 매니페스트 자신은 넣지 않는다. */
  readonly textFiles: ReadonlyArray<{ readonly path: string; readonly bytes: number }>;
}

export interface SubmissionPackageBuildResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly bytes: number;
  readonly fileCount: number;
  readonly manifest: SubmissionPackageManifest;
  readonly warnings: readonly SubmissionBuildWarning[];
}

export interface SubmissionPackageBuildOptions {
  readonly locale: SubmissionPackageLocale;
  /** 내보내기 순간의 시계. ZIP 의 수정 시각·표지 날짜·파일 이름이 같은 값을 쓴다. */
  readonly generatedAt: Date;
  readonly includeCoverPdf: boolean;
  readonly platform?: SubmissionPlatformSizeLimits | null;
  readonly limits?: SubmissionPackageLimits;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SubmissionPackageProgress) => void;
  /** 브라우저는 `worker`(기본). Worker 를 쓸 수 없으면 한 번 `direct-bounded` 로 다시 시도한다. */
  readonly crc32ExecutionMode?: StudioCrc32ExecutionMode;
  /** 표지 PDF 그리기. 주입하지 않으면 PDF 는 만들지 않는다(브라우저 캔버스가 필요하다). */
  readonly renderCoverPdf?: (input: SubmissionCoverInput, signal?: AbortSignal) => Promise<Uint8Array>;
}

const textEncoder = new TextEncoder();

function createAbort(): DOMException {
  return new DOMException("투고 패키지 만들기를 취소했어요.", "AbortError");
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw createAbort();
}

/** 어떤 실패든 화면이 `code` 로 안내를 고를 수 있는 `SubmissionPackageBuildError` 로 정리한다. */
export function toSubmissionBuildError(error: unknown): SubmissionPackageBuildError {
  if (error instanceof SubmissionPackageBuildError) return error;
  if (isAbortError(error)) return new SubmissionPackageBuildError("aborted", "투고 패키지 만들기를 취소했어요.", { cause: error });
  if (error instanceof StudioPackageArchiveError) {
    switch (error.code) {
      case "ARCHIVE_SIZE_LIMIT":
      case "ENTRY_COUNT_LIMIT":
      case "ENTRY_SIZE_LIMIT":
      case "TOTAL_SIZE_LIMIT":
      case "ZIP32_OVERFLOW":
        return new SubmissionPackageBuildError("limit", error.message, { cause: error });
      case "SOURCE_INVALID":
      case "SOURCE_SIZE_MISMATCH":
        return new SubmissionPackageBuildError("source-changed", error.message, { cause: error });
      default:
        return new SubmissionPackageBuildError("unexpected", error.message, { cause: error });
    }
  }
  const message = error instanceof Error ? error.message : "투고 패키지를 만드는 중 알 수 없는 오류가 났어요.";
  return new SubmissionPackageBuildError("unexpected", message, { cause: error });
}

/** `StudioCrc32WorkerError`: CRC 계산 Worker 를 만들 수 없는 환경(CSP·구형 브라우저·시험 환경). */
function isCrc32WorkerUnavailable(error: unknown): boolean {
  return error instanceof Error && error.name === "StudioCrc32WorkerError";
}

function archiveLimits(limits: SubmissionPackageLimits): Partial<StudioPackageArchiveLimits> {
  return {
    maxFiles: Math.min(limits.maxFiles + TEXT_FILE_ALLOWANCE, STUDIO_PACKAGE_ARCHIVE_LIMITS.maxFiles),
    maxEntryBytes: Math.min(limits.maxFileBytes, STUDIO_PACKAGE_ARCHIVE_LIMITS.maxEntryBytes),
    maxTotalBytes: Math.min(limits.maxTotalBytes + TEXT_ALLOWANCE_BYTES, STUDIO_PACKAGE_ARCHIVE_LIMITS.maxTotalBytes),
  };
}

function buildManifest(
  input: SubmissionCoverInput,
  layout: SubmissionPackageLayout,
  report: SubmissionPreflightReport,
  textFiles: SubmissionPackageManifest["textFiles"],
): SubmissionPackageManifest {
  const { draft } = input;
  const standard = submissionTargetWidth(draft.targetWidth);
  return {
    schema: SUBMISSION_PACKAGE_MANIFEST_SCHEMA,
    generator: { name: "ToonStudio", feature: "submission-package" },
    createdAt: input.generatedAt.toISOString(),
    locale: input.locale,
    title: normalizeSingleLine(draft.title),
    author: normalizeSingleLine(draft.authorName),
    widthCheck: standard ? { id: standard.id, width: standard.width } : null,
    totals: {
      episodes: layout.episodes.length,
      pages: layout.pageCount,
      imageBytes: report.totalBytes,
      characterSheets: draft.characters.length,
    },
    episodes: layout.episodes.map((episode) => {
      const source = draft.episodes.find((entry) => entry.id === episode.episodeId);
      return {
        number: episode.number,
        title: normalizeSingleLine(source?.title ?? ""),
        directory: episode.directory,
        pages: episode.pages.map((page) => ({
          path: page.path,
          originalName: normalizeSingleLine(page.originalName),
          mime: page.mime,
          width: page.width,
          height: page.height,
          bytes: page.bytes,
        })),
      };
    }),
    characters: draft.characters.map((sheet) => ({ name: sheet.name, aliases: sheet.aliases })),
    checks: {
      errors: report.errorCount,
      warnings: report.warningCount,
      info: report.infoCount,
      issues: report.issues.map((issue) => ({ code: issue.code, severity: issue.severity, params: issue.params })),
    },
    textFiles,
  };
}

/**
 * ZIP 작성기는 `instanceof Uint8Array` 로 입력을 가린다. `TextEncoder`·PDF 작성기가 다른 전역(iframe, jsdom 같은
 * 시험 환경)에서 온 배열을 돌려주면 내용이 맞아도 거절되므로, 그럴 때만 현재 전역의 배열로 한 번 복사한다.
 */
function currentRealmBytes(bytes: Uint8Array): Uint8Array {
  return bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
}

function textEntry(path: string, content: string): StudioPackageArchiveEntry {
  return { path, data: currentRealmBytes(textEncoder.encode(content)) };
}

/**
 * 투고 패키지 ZIP 을 만든다. 점검에서 막는 문제가 남아 있으면 `invalid-draft` 로 거절하고, 취소는 `aborted`,
 * 나머지 실패도 모두 `SubmissionPackageBuildError` 로 정리해 던진다(화면은 `code` 로 안내와 다시 시도를 정한다).
 */
export async function buildSubmissionPackage(
  draft: SubmissionPackageDraft,
  options: SubmissionPackageBuildOptions,
): Promise<SubmissionPackageBuildResult> {
  try {
    return await buildSubmissionPackageUnchecked(draft, options);
  } catch (error) {
    throw toSubmissionBuildError(error);
  }
}

async function buildSubmissionPackageUnchecked(
  draft: SubmissionPackageDraft,
  options: SubmissionPackageBuildOptions,
): Promise<SubmissionPackageBuildResult> {
  const { signal } = options;
  const limits = options.limits ?? SUBMISSION_PACKAGE_LIMITS;
  throwIfAborted(signal);
  if (Number.isNaN(options.generatedAt.getTime())) {
    throw new SubmissionPackageBuildError("unexpected", "만든 시각이 올바르지 않아요.");
  }

  // 화면의 점검 결과는 파일을 고른 시점의 값이다. 만들기 직전에 같은 규칙으로 다시 평가해 낡은 결과로 만들지 않는다.
  const report = evaluateSubmissionPackage({ draft, platform: options.platform ?? null, limits });
  if (!report.canBuild) {
    throw new SubmissionPackageBuildError("invalid-draft", "점검에서 막는 문제가 남아 있어요.", {
      issues: report.issues.filter((issue) => issue.severity === "error"),
    });
  }

  const warnings: SubmissionBuildWarning[] = [];
  const emit = (progress: SubmissionPackageProgress): void => options.onProgress?.(progress);
  emit({ phase: "preparing", completedFiles: 0, totalFiles: 0, processedBytes: 0, totalBytes: report.totalBytes, path: null });

  const plannedLayout = planSubmissionPackageLayout(draft, { includeCoverPdf: options.includeCoverPdf });
  const baseInput: SubmissionCoverInput = { draft, report, layout: plannedLayout, locale: options.locale, generatedAt: options.generatedAt };

  let coverPdf: Uint8Array | null = null;
  if (options.includeCoverPdf) {
    if (options.renderCoverPdf) {
      try {
        coverPdf = currentRealmBytes(await options.renderCoverPdf(baseInput, signal));
      } catch (error) {
        if (isAbortError(error)) throw error;
        warnings.push({ code: "cover-pdf-failed" });
      }
      throwIfAborted(signal);
    } else {
      warnings.push({ code: "cover-pdf-failed" });
    }
  }
  // PDF 를 못 만들었으면 표지의 "묶음 구성"에서도 빼 실제 파일과 어긋나지 않게 한다.
  const layout: SubmissionPackageLayout = coverPdf ? plannedLayout : { ...plannedLayout, coverPdf: false };
  const input: SubmissionCoverInput = { ...baseInput, layout };

  const textEntries: StudioPackageArchiveEntry[] = [
    textEntry(SUBMISSION_PACKAGE_COVER_PATH, buildSubmissionCoverMarkdown(input)),
    textEntry(SUBMISSION_PACKAGE_SYNOPSIS_PATH, buildSubmissionSynopsisMarkdown(input)),
    textEntry(SUBMISSION_PACKAGE_CHARACTERS_PATH, buildSubmissionCharactersMarkdown(input)),
  ];
  if (coverPdf) textEntries.splice(1, 0, { path: SUBMISSION_PACKAGE_COVER_PDF_PATH, data: coverPdf });
  const textFiles = textEntries.map((entry) => ({ path: entry.path, bytes: textByteLength(entry) }));
  const manifest = buildManifest(input, layout, report, textFiles);
  const manifestEntry = textEntry(SUBMISSION_PACKAGE_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  const pagesById = new Map(draft.episodes.flatMap((episode) => episode.pages.map((page) => [page.id, page] as const)));
  const imageEntries: StudioPackageArchiveEntry[] = layout.episodes.flatMap((episode) =>
    episode.pages.map((page) => {
      const source = pagesById.get(page.pageId);
      if (!source) throw new SubmissionPackageBuildError("unexpected", "배치 계획의 이미지를 찾지 못했어요.");
      return { path: page.path, data: source.blob };
    }),
  );
  const entries = [...textEntries, manifestEntry, ...imageEntries];
  // 표지의 "묶음 구성" 목록과 실제 ZIP 항목이 같아야 한다(어긋나면 코드 버그다).
  const planned = new Set(listSubmissionPackagePaths(layout));
  if (entries.length !== planned.size || entries.some((entry) => !planned.has(entry.path))) {
    throw new SubmissionPackageBuildError("unexpected", "묶음 구성 계획과 실제 항목이 달라요.");
  }

  const archive = async (mode: StudioCrc32ExecutionMode): Promise<Blob> =>
    buildStudioPackageArchiveBlob(entries, {
      modifiedAt: options.generatedAt,
      limits: archiveLimits(limits),
      mimeType: "application/zip",
      signal,
      crc32ExecutionMode: mode,
      onProgress: (progress) =>
        emit({
          phase: "packing",
          completedFiles: progress.completedFiles,
          totalFiles: progress.totalFiles,
          processedBytes: progress.processedBytes,
          totalBytes: progress.totalBytes,
          path: progress.path,
        }),
    });

  const requestedMode = options.crc32ExecutionMode ?? "worker";
  let blob: Blob;
  try {
    blob = await archive(requestedMode);
  } catch (error) {
    if (requestedMode === "worker" && isCrc32WorkerUnavailable(error)) {
      // 메인 스레드에서 조각 단위로 계산한다. 느릴 수 있지만 같은 결과를 낸다.
      warnings.push({ code: "crc32-worker-unavailable" });
      throwIfAborted(signal);
      blob = await archive("direct-bounded");
    } else {
      throw error;
    }
  }
  throwIfAborted(signal);
  emit({ phase: "finishing", completedFiles: entries.length, totalFiles: entries.length, processedBytes: blob.size, totalBytes: blob.size, path: null });

  const fileName = createStudioDownloadFileName({
    title: draft.title,
    fallbackTitle: "toonstudio",
    suffix: appendStudioDownloadSuffix("submission", studioDownloadVersionSuffix({ exportedAt: options.generatedAt })),
    extension: "zip",
  });
  return { blob, fileName, bytes: blob.size, fileCount: entries.length, manifest, warnings };
}

function textByteLength(entry: StudioPackageArchiveEntry): number {
  const { data } = entry;
  if (data instanceof Uint8Array) return data.byteLength;
  if (data instanceof ArrayBuffer) return data.byteLength;
  return data.size;
}
