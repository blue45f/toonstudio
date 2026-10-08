/**
 * 키트 프리뷰 CLI 출력 보조(순수, leaf).
 *
 * `scripts/kit-preview.mjs`(Node)가 이 파일을 **그대로 import**한다(Node의 TypeScript 타입 제거 실행). `cli-args.ts`와 같은 이유로
 * 다른 로컬 모듈을 런타임 import하지 않는다 — 형제 모듈은 `import type`(실행 시 제거됨)로만 참조하고, 필요한 값은 인자로 받는다.
 *
 * 하는 일: 출력 파일 이름·렌더 작업 순서, 접촉 시트(`montage`) 인자, 브라우저 콘솔 이벤트 분류, 종료 코드 결정,
 * stdout/`<접두>__summary.json`의 최종 보고서 조립. 시계·파일·프로세스에는 접근하지 않는다(호출자가 값을 넘긴다).
 */
import type { KitPreviewRequest, KitPreviewShading, KitPreviewToonOverrides, KitPreviewViewId } from "./cli-args";
import type { KitPreviewRuntimeReport, KitPreviewSourceInfo } from "./protocol";
import type { StaticReport } from "./summary";
import type { PreviewWarning } from "./warnings";

export const KIT_PREVIEW_CLI_REPORT_SCHEMA = "toonstudio.kit-preview/1";

/** 종료 코드: 0 성공 · 1 인자 오류 · 2 브라우저/의존성 없음 · 3 에셋 오류(조인트 불일치 등) · 4 렌더 실패 */
export const KIT_PREVIEW_EXIT = { ok: 0, usage: 1, environment: 2, asset: 3, render: 4 } as const;
export type KitPreviewExitCode = (typeof KIT_PREVIEW_EXIT)[keyof typeof KIT_PREVIEW_EXIT];

// ---------------------------------------------------------------- 이름·작업 순서

/** 파일 이름에 안전한 토큰(영문·숫자·`.`·`_`·`-`만, 나머지는 `-`). 비면 `kit`. */
export function sanitizeFileToken(text: string): string {
  const cleaned = text
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/-{2,}/gu, "-")
    .replace(/^[-.]+|[-.]+$/gu, "");
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "kit";
}

/** 경로의 마지막 조각(Windows 구분자도 처리) */
export function baseNameOf(filePath: string): string {
  const parts = filePath.split(/[\\/]/u).filter((part) => part.length > 0);
  return parts[parts.length - 1] ?? filePath;
}

/** `--name`이 없을 때 쓰는 출력 접두: 베이스 GLB 파일 이름(확장자 제외) */
export function defaultOutputPrefix(baseGlbPath: string): string {
  return sanitizeFileToken(baseNameOf(baseGlbPath).replace(/\.(?:glb|gltf)$/iu, ""));
}

export function outputFileName(prefix: string, view: KitPreviewViewId, shading: KitPreviewShading): string {
  return `${prefix}__${view}__${shading}.png`;
}

export function contactSheetFileName(prefix: string): string {
  return `${prefix}__sheet.png`;
}

export interface RenderJob {
  readonly view: KitPreviewViewId;
  readonly shading: KitPreviewShading;
  readonly fileName: string;
}

/**
 * 렌더 순서: 셰이딩이 바깥 루프다. 셰이딩을 바꿀 때마다 셰이더 변종을 새로 컴파일하므로(소프트웨어 렌더러는 PBR 한 변종에 수 초)
 * 같은 셰이딩의 뷰를 연달아 그려야 컴파일 대기가 셰이딩당 한 번으로 끝난다.
 */
export function planRenderJobs(prefix: string, views: readonly KitPreviewViewId[], shadings: readonly KitPreviewShading[]): RenderJob[] {
  return shadings.flatMap((shading) => views.map((view) => ({ view, shading, fileName: outputFileName(prefix, view, shading) })));
}

// ---------------------------------------------------------------- 접촉 시트

export interface MontageEntry {
  readonly file: string;
  readonly label: string;
}

export interface MontageOptions {
  readonly tile: number;
  /** 한 줄 칸 수(0이면 항목 수에 맞춰 4 이하) */
  readonly columns: number;
  /** `#rrggbb` */
  readonly background: string;
  readonly outFile: string;
  /** 라벨 글꼴 파일(없으면 ImageMagick 기본) */
  readonly fontPath: string | null;
}

/** 접촉 시트 칸의 이미지 둘레 여백(px) */
const CONTACT_SHEET_GAP = 2;

/** 접촉 시트 한 줄 칸 수: 가로 ≤ 4칸이면 tile 256에서 1024px 이내라 눈으로 확인하기 좋다. */
export function contactSheetColumns(count: number, requested = 0): number {
  if (requested > 0) return Math.min(requested, Math.max(1, count));
  return Math.max(1, Math.min(4, count));
}

/** ImageMagick `montage` 인자 배열(셸을 거치지 않으므로 인용이 필요 없다). 항목 순서가 칸 순서다. */
export function buildMontageArgs(entries: readonly MontageEntry[], options: MontageOptions): string[] {
  const columns = contactSheetColumns(entries.length, options.columns);
  const args: string[] = ["-background", options.background, "-fill", "#c8c8d0"];
  if (options.fontPath) args.push("-font", options.fontPath);
  args.push("-pointsize", String(Math.max(10, Math.round(options.tile / 18))));
  for (const entry of entries) args.push("-label", entry.label, entry.file);
  // 칸 하나가 정확히 tile px(이미지 + 좌우 여백)라 4칸 × 256 = 1024px — 이미지 뷰어(Read 도구)가 줄이지 않고 보여 준다.
  const inner = Math.max(16, options.tile - 2 * CONTACT_SHEET_GAP);
  args.push("-tile", `${columns}x`, "-geometry", `${inner}x${inner}+${CONTACT_SHEET_GAP}+${CONTACT_SHEET_GAP}`, "-depth", "8", options.outFile);
  return args;
}

// ---------------------------------------------------------------- 브라우저 이벤트

export type BrowserEvent =
  | { readonly kind: "console"; readonly level: string; readonly text: string }
  | { readonly kind: "pageerror"; readonly text: string }
  | { readonly kind: "requestfailed"; readonly url: string; readonly reason: string }
  | { readonly kind: "http"; readonly status: number; readonly url: string };

/** 성능 힌트·개발 서버 안내 같은 소음 */
const NOISE_PATTERNS: readonly RegExp[] = [/\[vite\]/u, /GPU stall due to ReadPixels/u, /Download the React DevTools/u, /Automatic fallback to software WebGL/u, /GL Driver Message \(OpenGL, Performance/u];

const TEXTURE_UPLOAD_PATTERN = /texImage2D|texSubImage2D|compressedTexImage|bad image data|glGenerateMipmap|Texture format does not support/u;

function oneLine(text: string, limit = 280): string {
  const flat = text.replace(/\s+/gu, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** 브라우저 이벤트 하나를 경고로 바꾼다. 소음이면 null. */
export function classifyBrowserEvent(event: BrowserEvent): PreviewWarning | null {
  switch (event.kind) {
    case "console": {
      if (event.level !== "error" && event.level !== "warning") return null;
      if (NOISE_PATTERNS.some((pattern) => pattern.test(event.text))) return null;
      // 손상되거나 지원하지 않는 텍스처 이미지는 Babylon이 예외 없이 흰 텍스처로 그리고 WebGL 콘솔 경고만 남긴다 — 눈에 띄게 따로 분류한다.
      if (TEXTURE_UPLOAD_PATTERN.test(event.text)) return { code: "texture-upload-warning", severity: "warn", source: "browser", messageKo: `텍스처 업로드 경고(손상되었거나 지원하지 않는 이미지일 수 있습니다): ${oneLine(event.text)}` };
      const isError = event.level === "error";
      return { code: isError ? "browser-console-error" : "browser-console-warning", severity: isError ? "warn" : "info", source: "browser", messageKo: `브라우저 콘솔 ${isError ? "오류" : "경고"}: ${oneLine(event.text)}` };
    }
    case "pageerror":
      return { code: "browser-page-error", severity: "error", source: "browser", messageKo: `페이지 스크립트 오류: ${oneLine(event.text)}` };
    case "requestfailed":
      // 개발 서버가 갱신하며 취소한 요청은 소음이다.
      if (/ERR_ABORTED/u.test(event.reason)) return null;
      return { code: "browser-request-failed", severity: "warn", source: "browser", messageKo: `요청 실패(${oneLine(event.reason, 80)}): ${oneLine(event.url, 160)}` };
    case "http":
      if (event.status < 400) return null;
      return { code: "browser-http-error", severity: "warn", source: "browser", messageKo: `HTTP ${event.status}: ${oneLine(event.url, 160)}` };
  }
}

// ---------------------------------------------------------------- 렌더 기록·타이밍

export type RenderStatus = "ok" | "skipped" | "failed";

export interface RenderRecord {
  readonly view: KitPreviewViewId;
  readonly shading: KitPreviewShading;
  readonly status: RenderStatus;
  /** 출력 폴더 기준 파일 이름(성공했을 때만) */
  readonly file: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly coverage: number | null;
  readonly readyMs: number | null;
  readonly renderMs: number | null;
  /** `render()` 호출 전체(왕복·PNG 전송 포함) 벽시계 시간 */
  readonly wallMs: number;
  readonly notes: readonly string[];
  readonly code: string | null;
  readonly reasonKo: string | null;
  readonly hud: { readonly drawCalls: number; readonly activeMeshes: number; readonly triangles: number } | null;
}

export interface TimingSummary {
  /** 엔진 생성·병합·소스 로드·플랜 적용까지(`load()` 왕복) */
  readonly loadSec: number;
  /** 성공한 렌더의 평균 벽시계 시간(셰이더 컴파일 대기 포함) */
  readonly perViewSec: number;
  readonly medianViewSec: number;
  readonly maxViewSec: number;
  /** 각 셰이딩의 첫 렌더(셰이더 컴파일 포함)와 이후 렌더의 평균 */
  readonly byShading: Readonly<Record<string, { readonly firstSec: number; readonly restAvgSec: number | null; readonly count: number }>>;
  readonly totalSec: number;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function summarizeTimings(records: readonly RenderRecord[], loadMs: number, totalMs: number): TimingSummary {
  const ok = records.filter((record) => record.status === "ok");
  const walls = ok.map((record) => record.wallMs / 1000);
  const sorted = [...walls].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length === 0 ? 0 : sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  const byShading: Record<string, { firstSec: number; restAvgSec: number | null; count: number }> = {};
  for (const record of ok) {
    const entry = byShading[record.shading];
    if (!entry) byShading[record.shading] = { firstSec: round3(record.wallMs / 1000), restAvgSec: null, count: 1 };
    else entry.count += 1;
  }
  for (const shading of Object.keys(byShading)) {
    const entry = byShading[shading];
    if (!entry) continue;
    const rest = ok.filter((record) => record.shading === shading).slice(1);
    entry.restAvgSec = rest.length === 0 ? null : round3(mean(rest.map((record) => record.wallMs / 1000)));
  }
  return { loadSec: round3(loadMs / 1000), perViewSec: round3(mean(walls)), medianViewSec: round3(median), maxViewSec: round3(sorted[sorted.length - 1] ?? 0), byShading, totalSec: round3(totalMs / 1000) };
}

// ---------------------------------------------------------------- 최종 보고서

export interface InputFileInfo {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface FailureInfo {
  readonly stage: "arguments" | "environment" | "fetch" | "prepare" | "engine" | "load" | "render";
  readonly code: string;
  readonly reasonKo: string;
}

export interface EnvironmentInfo {
  readonly node: string;
  readonly playwright: string | null;
  readonly chromium: string | null;
  readonly chromiumPath: string | null;
  readonly renderer: string;
  readonly devServer: string;
}

export interface ReportInput {
  readonly generatedAt: string;
  readonly request: KitPreviewRequest;
  readonly inputFiles: readonly InputFileInfo[];
  readonly environment: EnvironmentInfo;
  readonly outDir: string;
  readonly staticReport: StaticReport | null;
  /** 소스 경로 판정(판정 전에 실패했으면 null) */
  readonly source: KitPreviewSourceInfo | null;
  readonly runtime: KitPreviewRuntimeReport | null;
  readonly renders: readonly RenderRecord[];
  readonly contactSheets: readonly string[];
  readonly warnings: readonly PreviewWarning[];
  readonly failure: FailureInfo | null;
  readonly loadMs: number;
  readonly totalMs: number;
}

export interface KitPreviewCliReport {
  readonly schema: typeof KIT_PREVIEW_CLI_REPORT_SCHEMA;
  readonly ok: boolean;
  readonly exitCode: KitPreviewExitCode;
  readonly generatedAt: string;
  readonly failure: FailureInfo | null;
  /** 어느 소스 경로로 렌더했는지: "kit" = 엔진 키트 소스 · "package" = 기존 병합 경로 · null = 판정 전 실패 */
  readonly sourceKind: "kit" | "package" | null;
  readonly sourceKindReasonKo: string | null;
  readonly request: {
    readonly glb: readonly InputFileInfo[];
    readonly outDir: string;
    readonly views: readonly KitPreviewViewId[];
    readonly shadings: readonly KitPreviewShading[];
    readonly size: number;
    readonly transparent: boolean;
    readonly background: string;
    readonly quality: string;
    readonly pose: string;
    readonly morphs: readonly { readonly name: string; readonly value: number }[];
    readonly colors: Readonly<Record<string, string>>;
    readonly roleOverrides: Readonly<Record<string, string>>;
    readonly hairLod: number;
    readonly legacyMerge: boolean;
    /** CLI가 지정한 툰 덮어쓰기(지정하지 않은 값은 비어 있다 — 실제 적용값은 runtime.toon) */
    readonly toon: KitPreviewToonOverrides;
  };
  readonly environment: EnvironmentInfo;
  readonly inputs: StaticReport["inputs"];
  readonly meshes: StaticReport["meshes"];
  readonly totals: StaticReport["totals"] | null;
  readonly morphTargetNames: readonly string[];
  readonly boneNames: readonly string[];
  readonly skeleton: StaticReport["skeleton"];
  readonly merge: StaticReport["merge"] | null;
  readonly kitPlan: StaticReport["kitPlan"];
  readonly runtime: KitPreviewRuntimeReport | null;
  readonly outputs: readonly RenderRecord[];
  readonly contactSheets: readonly string[];
  readonly timings: TimingSummary;
  readonly warningCounts: { readonly error: number; readonly warn: number; readonly info: number };
  readonly warnings: readonly PreviewWarning[];
}

function poseLabel(request: KitPreviewRequest): string {
  const pose = request.pose;
  if (pose.kind === "none") return "none";
  if (pose.kind === "preset") return pose.id;
  return `custom(${Object.keys(pose.rotations).join(",")})`;
}

/** 뷰어·엔진 인프라 실패(에셋 문제가 아님): 이 코드의 `kit-*` 실패는 렌더 실패(4)로 둔다. */
const KIT_INFRA_FAILURE_CODES: ReadonlySet<string> = new Set(["kit-source-load-failed", "kit-engine-failed"]);

/**
 * 엔진의 키트 로더가 GLB·선언을 거부한 실패인지(`kit-joint-mismatch`·`kit-mesh-undeclared`·`kit-sha-mismatch` 등 계약 4.12의 `kit-*` 코드).
 * 키트 소스 경로는 병합 단계 없이 엔진이 에셋을 검증하므로, 병합 경로가 `prepare` 단계에서 내던 에셋 오류(3)와 같은 종류로 취급한다.
 */
export function isKitAssetFailureCode(code: string): boolean {
  return code.startsWith("kit-") && !code.startsWith("kit-preview-") && !KIT_INFRA_FAILURE_CODES.has(code);
}

/**
 * 종료 코드 결정. 실패 단계가 있으면 그 단계로, 없으면 렌더 기록으로 정한다.
 * `skipped`(스켈레톤이 없어 손·발 뷰를 만들 수 없는 경우 등)는 실패가 아니다. 성공한 렌더가 하나도 없거나 `failed`가 있으면 4.
 */
export function decideExitCode(failure: FailureInfo | null, renders: readonly RenderRecord[]): KitPreviewExitCode {
  if (failure) {
    if (failure.stage === "arguments") return KIT_PREVIEW_EXIT.usage;
    if (failure.stage === "environment") return KIT_PREVIEW_EXIT.environment;
    if (failure.stage === "fetch" || failure.stage === "prepare") return KIT_PREVIEW_EXIT.asset;
    if (failure.stage === "load" && isKitAssetFailureCode(failure.code)) return KIT_PREVIEW_EXIT.asset;
    return KIT_PREVIEW_EXIT.render;
  }
  if (renders.length === 0) return KIT_PREVIEW_EXIT.ok;
  const anyFailed = renders.some((record) => record.status === "failed");
  const anyOk = renders.some((record) => record.status === "ok");
  return anyFailed || !anyOk ? KIT_PREVIEW_EXIT.render : KIT_PREVIEW_EXIT.ok;
}

export function countWarnings(warnings: readonly PreviewWarning[]): { error: number; warn: number; info: number } {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const warning of warnings) counts[warning.severity] += 1;
  return counts;
}

/** stdout/summary.json의 최종 보고서. 시계·환경은 호출자가 넘긴다. */
export function buildFinalReport(input: ReportInput): KitPreviewCliReport {
  const exitCode = decideExitCode(input.failure, input.renders);
  const staticReport = input.staticReport;
  const request = input.request;
  return {
    schema: KIT_PREVIEW_CLI_REPORT_SCHEMA,
    ok: exitCode === KIT_PREVIEW_EXIT.ok,
    exitCode,
    generatedAt: input.generatedAt,
    failure: input.failure,
    sourceKind: input.source?.kind ?? staticReport?.sourceKind ?? null,
    sourceKindReasonKo: input.source?.reasonKo ?? null,
    request: {
      glb: input.inputFiles,
      outDir: input.outDir,
      views: request.views,
      shadings: request.shadings,
      size: request.size,
      transparent: request.transparent,
      background: request.background,
      quality: request.quality,
      pose: poseLabel(request),
      morphs: request.morphs.map((morph) => ({ name: morph.name, value: morph.value })),
      colors: Object.fromEntries(Object.entries(request.colors).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      roleOverrides: request.roleOverrides,
      hairLod: request.hairLod,
      legacyMerge: request.legacyMerge,
      toon: request.toon,
    },
    environment: input.environment,
    inputs: staticReport?.inputs ?? [],
    meshes: staticReport?.meshes ?? [],
    totals: staticReport?.totals ?? null,
    morphTargetNames: staticReport?.morphTargetNames ?? [],
    boneNames: staticReport?.boneNames ?? [],
    skeleton: staticReport?.skeleton ?? null,
    merge: staticReport?.merge ?? null,
    kitPlan: staticReport?.kitPlan ?? null,
    runtime: input.runtime,
    outputs: input.renders,
    contactSheets: input.contactSheets,
    timings: summarizeTimings(input.renders, input.loadMs, input.totalMs),
    warningCounts: countWarnings(input.warnings),
    warnings: input.warnings,
  };
}
