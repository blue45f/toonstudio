import { createCharacterCompatibilityReport } from "../compatibility/character-compatibility-report";

import type {
  CharacterCapabilityProfile,
  CharacterSemanticPassId,
} from "../../character-shaper/character-shaper-contract";
import type { CharacterCompatibilityReport } from "../compatibility/character-compatibility-report";

export type CharacterExportFormat = "png" | "psd";
export type CharacterExportExecutionStrategy = "direct-main-thread" | "tile-worker";
export type CharacterExportPassStatus = "planned" | "conditional" | "skipped";

export interface CharacterExportPassPlan {
  readonly pass: CharacterSemanticPassId;
  readonly label: string;
  readonly status: CharacterExportPassStatus;
  readonly reason: string;
}

export interface CharacterExportPreflightWarning {
  readonly code:
    | "model-not-ready"
    | "compatibility-limited"
    | "high-memory"
    | "surface-paint-empty"
    | "hair-split-conditional"
    | "transparent-background";
  readonly message: string;
}

export interface ShaperHairThreeLayerPlan {
  readonly layerId: "hair-base" | "hair-shadow" | "hair-line";
  readonly psdLayerName: "Hair Base" | "Hair Shadow" | "Hair Line";
  readonly blendMode: "normal" | "multiply";
  readonly clippingMaskToBase: boolean;
}

export interface ShaperPresetAssetVersionCheck {
  readonly compatible: boolean;
  readonly outdatedAssetIds: readonly string[];
  readonly summaryKo: string;
}

export interface CharacterExportPreflight {
  readonly format: CharacterExportFormat;
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly strategy: CharacterExportExecutionStrategy;
  readonly tileEdge: number | null;
  readonly estimatedResidentBytes: number;
  readonly passes: readonly CharacterExportPassPlan[];
  readonly plannedCount: number;
  readonly conditionalCount: number;
  readonly skippedCount: number;
  readonly compatibility: CharacterCompatibilityReport;
  readonly warnings: readonly CharacterExportPreflightWarning[];
  readonly shaperHairThreeLayers?: readonly ShaperHairThreeLayerPlan[];
  readonly shaperLuminanceOutlineFormula?: "a = 1 - r";
}

export interface CreateCharacterExportPreflightInput {
  readonly format: CharacterExportFormat;
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly profile: Partial<CharacterCapabilityProfile>;
  readonly compatibility?: CharacterCompatibilityReport;
  readonly hasSurfacePaint?: boolean;
  readonly canonical?: boolean;
  readonly createHairLayer?: boolean;
  readonly extractLuminanceOutline?: boolean;
}

export class CharacterExportPreflightError extends Error {
  constructor(readonly code: "invalid-dimensions", message: string) {
    super(message);
    this.name = "CharacterExportPreflightError";
  }
}

const MAX_EXPORT_EDGE = 16_384;
const DIRECT_EDGE_LIMIT = 2_048;
const DIRECT_MEMORY_LIMIT = 256 * 1024 * 1024;
const TILE_EDGE = 1_024;
const RGBA_CHANNELS = 4;
const WORKING_COPIES_PER_PASS = 3;

const PASS_LABELS: Readonly<Record<CharacterSemanticPassId, string>> = Object.freeze({
  beauty: "미리보기",
  flat: "밑색 전체",
  shadow: "음영",
  highlight: "하이라이트",
  line: "주선",
  "surface-paint": "표면 채색",
  "mask-face": "얼굴",
  "mask-eyes": "눈",
  "mask-hair": "헤어",
  "mask-skin": "피부",
  "mask-top": "상의",
  "mask-bottom": "하의",
  "mask-shoes": "신발",
  "mask-accessory": "액세서리",
});

const PSD_PASS_ORDER: readonly CharacterSemanticPassId[] = Object.freeze([
  "beauty",
  "flat",
  "shadow",
  "highlight",
  "line",
  "surface-paint",
  "mask-face",
  "mask-eyes",
  "mask-hair",
  "mask-skin",
  "mask-top",
  "mask-bottom",
  "mask-shoes",
  "mask-accessory",
]);

function ensureDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > MAX_EXPORT_EDGE
    || height > MAX_EXPORT_EDGE
  ) {
    throw new CharacterExportPreflightError(
      "invalid-dimensions",
      `내보내기 크기는 1~${MAX_EXPORT_EDGE}px의 정수여야 합니다.`,
    );
  }
}

function plan(
  pass: CharacterSemanticPassId,
  status: CharacterExportPassStatus,
  reason: string,
): CharacterExportPassPlan {
  return Object.freeze({ pass, label: PASS_LABELS[pass], status, reason });
}

function semanticPassStatus(
  pass: CharacterSemanticPassId,
  report: CharacterCompatibilityReport,
): CharacterExportPassPlan {
  const feature = report.features.find((item) => item.id === "semantic-psd");
  if (feature?.status === "supported") {
    return plan(pass, "planned", "공식 시맨틱 파츠에서 직접 생성합니다.");
  }
  if (feature?.status === "partial") {
    return plan(pass, "conditional", "모델의 메시·재질 구조에 따라 생략될 수 있습니다.");
  }
  return plan(pass, "skipped", "이 모델에서 분리 가능한 파츠 구조를 찾지 못했습니다.");
}

function psdPassPlan(
  pass: CharacterSemanticPassId,
  report: CharacterCompatibilityReport,
  hasSurfacePaint: boolean | undefined,
): CharacterExportPassPlan {
  const ready = report.grade !== "viewer";
  if (pass === "beauty") {
    return ready
      ? plan(pass, "planned", "현재 카메라의 캐릭터 미리보기를 저장합니다.")
      : plan(pass, "skipped", "캐릭터 렌더가 아직 준비되지 않았습니다.");
  }
  if (pass === "surface-paint") {
    const feature = report.features.find((item) => item.id === "surface-paint");
    if (feature?.status !== "supported") {
      return plan(pass, "skipped", feature?.reason ?? "표면 채색을 사용할 수 없습니다.");
    }
    if (hasSurfacePaint === true) return plan(pass, "planned", "현재 표면 채색 레이어를 저장합니다.");
    return plan(pass, "conditional", "표면 채색 픽셀이 있을 때만 레이어를 만듭니다.");
  }
  if (pass === "flat" || pass === "shadow" || pass === "highlight" || pass === "line") {
    return ready
      ? plan(pass, "conditional", "현재 재질과 렌더 상태에서 유효한 픽셀이 있을 때 생성합니다.")
      : plan(pass, "skipped", "캐릭터 렌더가 아직 준비되지 않았습니다.");
  }
  return semanticPassStatus(pass, report);
}

function estimateResidentBytes(width: number, height: number, activePasses: number): number {
  const bytes = width * height * RGBA_CHANNELS * Math.max(1, activePasses) * WORKING_COPIES_PER_PASS;
  return Number.isSafeInteger(bytes) ? bytes : Number.MAX_SAFE_INTEGER;
}

export function formatCharacterBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "알 수 없음";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KiB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
  const gib = mib / 1024;
  return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
}

export function createCharacterExportPreflight(
  input: CreateCharacterExportPreflightInput,
): CharacterExportPreflight {
  ensureDimensions(input.width, input.height);
  const compatibility = input.compatibility ?? createCharacterCompatibilityReport(
    input.profile,
    { canonical: input.canonical },
  );
  const passes = input.format === "png"
    ? Object.freeze([
        compatibility.grade === "viewer"
          ? plan("beauty", "skipped", "캐릭터 렌더가 아직 준비되지 않았습니다.")
          : plan("beauty", "planned", "현재 카메라의 캐릭터 이미지를 저장합니다."),
      ])
    : Object.freeze(PSD_PASS_ORDER.map((passId) => psdPassPlan(passId, compatibility, input.hasSurfacePaint)));
  const plannedCount = passes.filter((item) => item.status === "planned").length;
  const conditionalCount = passes.filter((item) => item.status === "conditional").length;
  const skippedCount = passes.length - plannedCount - conditionalCount;
  const estimatedResidentBytes = estimateResidentBytes(
    input.width,
    input.height,
    plannedCount + conditionalCount,
  );
  const strategy: CharacterExportExecutionStrategy =
    Math.max(input.width, input.height) <= DIRECT_EDGE_LIMIT
    && estimatedResidentBytes <= DIRECT_MEMORY_LIMIT
      ? "direct-main-thread"
      : "tile-worker";
  const warnings: CharacterExportPreflightWarning[] = [];
  if (compatibility.grade === "viewer") {
    warnings.push({ code: "model-not-ready", message: "캐릭터 렌더가 준비되지 않아 출력할 수 없습니다." });
  } else if (compatibility.grade !== "canonical" && (compatibility.partialCount > 0 || compatibility.unsupportedCount > 0)) {
    warnings.push({
      code: "compatibility-limited",
      message: `현재 모델은 ${compatibility.label}입니다. 일부 PSD 레이어가 생략될 수 있습니다.`,
    });
  }
  if (strategy === "tile-worker") {
    warnings.push({
      code: "high-memory",
      message: `예상 작업 메모리 ${formatCharacterBytes(estimatedResidentBytes)} · 타일 Worker 방식으로 처리합니다.`,
    });
  }
  if (input.format === "psd" && input.hasSurfacePaint !== true) {
    warnings.push({ code: "surface-paint-empty", message: "표면 채색 픽셀이 없으면 해당 레이어는 생략됩니다." });
  }
  if (input.transparent) {
    warnings.push({ code: "transparent-background", message: "배경은 투명 알파로 저장됩니다." });
  }
  const hairPass = passes.find((entry) => entry.pass === "mask-hair");
  if (input.format === "psd" && input.createHairLayer !== false) {
    warnings.push({ code: "hair-split-conditional", message: hairPass?.status === "skipped"
      ? `헤어 분리 생략: ${hairPass.reason}`
      : "실제 밑색과 보이는 헤어 영역이 있을 때만 Base·Shadow를 분리합니다. 없는 패스는 생략하며 추출 Line은 중복 합성을 막도록 기본 숨김입니다." });
  }

  return Object.freeze({
    format: input.format,
    width: input.width,
    height: input.height,
    transparent: input.transparent,
    strategy,
    tileEdge: strategy === "tile-worker" ? TILE_EDGE : null,
    estimatedResidentBytes,
    passes,
    plannedCount,
    conditionalCount,
    skippedCount,
    compatibility,
    warnings: Object.freeze(warnings),
    shaperHairThreeLayers: input.format === "psd" && input.createHairLayer !== false && hairPass?.status !== "skipped"
      ? planShaperHairThreeLayerSplit(true)
      : Object.freeze([]),
    shaperLuminanceOutlineFormula: input.extractLuminanceOutline !== false ? "a = 1 - r" : undefined,
  });
}

/**
 * SHAPER `PsdWriter::ExtractOutline` (`0x060002ac`) 내재화:
 * 흰색 배경 위에 렌더링된 선화 패스의 R 채널 휘도를 반전(`a = 1 - r`)하여
 * 순수 투명 배경의 잉크 레이어 알파(`alphaByte`)와 선 색상(`lineColorRgb`)으로 변환한다.
 */
export function extractShaperOutlineLuminanceToAlpha(
  rgbaPixels: Uint8ClampedArray | Uint8Array,
  lineColorRgb: readonly [number, number, number] = [0, 0, 0],
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgbaPixels.length);
  const rLine = Math.max(0, Math.min(255, Math.round(lineColorRgb[0])));
  const gLine = Math.max(0, Math.min(255, Math.round(lineColorRgb[1])));
  const bLine = Math.max(0, Math.min(255, Math.round(lineColorRgb[2])));
  for (let i = 0; i + 3 < rgbaPixels.length; i += 4) {
    const rNorm = rgbaPixels[i]! / 255;
    const srcAlpha = rgbaPixels[i + 3]! / 255;
    const inkAlpha = Math.max(0, Math.min(1, (1 - rNorm) * srcAlpha));
    out[i] = rLine;
    out[i + 1] = gLine;
    out[i + 2] = bLine;
    out[i + 3] = Math.round(inkAlpha * 255);
  }
  return out;
}

/**
 * SHAPER `PsdWriter::WritePSD` (`0x060002aa`) `createHairLayer` 3-레이어 분리 규칙 내재화:
 * 헤어 영역을 `Hair Base`(밑색 Normal), `Hair Shadow`(음영 Multiply 클리핑), `Hair Line`(선화 Normal) 3개 레이어로 분리한다.
 */
export function planShaperHairThreeLayerSplit(
  createHairLayer: boolean = true,
): readonly ShaperHairThreeLayerPlan[] {
  if (!createHairLayer) return Object.freeze([]);
  return Object.freeze([
    {
      layerId: "hair-base",
      psdLayerName: "Hair Base",
      blendMode: "normal",
      clippingMaskToBase: false,
    },
    {
      layerId: "hair-shadow",
      psdLayerName: "Hair Shadow",
      blendMode: "multiply",
      clippingMaskToBase: true,
    },
    {
      layerId: "hair-line",
      psdLayerName: "Hair Line",
      blendMode: "normal",
      clippingMaskToBase: true,
    },
  ]);
}

/**
 * SHAPER `PresetManager::CheckAsset` (`0x0600028a`) 내재화:
 * 프리셋에 기록된 파츠·헤어·의상 에셋 버전과 서버 최신 에셋 버전을 비교하여 업데이트 필요 항목을 진단한다.
 */
export function evaluateShaperPresetServerAssetUpdates(
  presetAssetVersions: Readonly<Record<string, number>>,
  serverAssetVersions: Readonly<Record<string, number>>,
): ShaperPresetAssetVersionCheck {
  const outdatedAssetIds: string[] = [];
  for (const [assetId, version] of Object.entries(presetAssetVersions)) {
    const latest = serverAssetVersions[assetId];
    if (typeof latest === "number" && latest > version) {
      outdatedAssetIds.push(assetId);
    }
  }
  return Object.freeze({
    compatible: outdatedAssetIds.length === 0,
    outdatedAssetIds: Object.freeze(outdatedAssetIds),
    summaryKo:
      outdatedAssetIds.length === 0
        ? "모든 파츠 에셋 버전 최신 호환"
        : `에셋 업데이트 권장 ${outdatedAssetIds.length}건 (${outdatedAssetIds.join(", ")})`,
  });
}

export interface ShaperInstallerEndpoints {
  readonly subdomain: "dev-shaper" | "shaper";
  readonly baseUrl: string;
  readonly buildLogsLatestUrl: string;
  readonly termsUrl: string;
  readonly cssBaseUrl: string;
  readonly downloadClientUrl: string;
}

export interface ShaperLauncherDiagnostics {
  readonly stage: "Version Check..." | "Loading SHAPER..." | "Completed..." | "error";
  readonly alreadyRunning: boolean;
  readonly needsUpdate: boolean;
  readonly launchArgs: readonly ["--args", "-logFile", "-"];
  readonly errorLogFile: "shaperx.txt";
}

/**
 * SHAPER `ShaperLauncher.app`, `ShaperInstaller.app`, `Shaper.app` 전수 REA 역공학 매니페스트 상수:
 * - `ShaperLauncher` (`ev_9ce7560a5f32075f9846fa4921df74ef760396406bbe4cc00695b9a068d8eae6`, 1,347 procs / 1,448 strings)
 * - `ShaperInstaller` (`ev_108c9d937b61c3bd0b07edde18e2461a45a557c638dca8a5275e2ee0fbede4b2`, 3,432 procs / 3,992 strings)
 * - `Shaper.app` (`ev_a6bc583c27cbaf0d5a55073219563ad200fdf88682ebad047947a011dcbc69a1`, `com.StudioHORANG.SHAPER` v1.05 build 9, Unity 6000.0.45f1)
 */
export const SHAPER_BUNDLE_MANIFEST_SPECS = Object.freeze({
  bundleIdentifier: "com.StudioHORANG.SHAPER",
  shortVersion: "1.05",
  bundleVersion: "9",
  unityPlayerVersion: "6000.0.45f1 (d91bd3d4e081)",
  buildGuid: "f86b61fdc39e43dc86876be4319dc709",
  gfxThreadingMode: 4,
  teamIdentifier: "2KLJA2N92K",
  scriptingAssembliesType16Count: 28,
  nativePluginBundles: Object.freeze([
    "TrackpadTouchOSX.bundle",
    "LibUniWinC.bundle",
    "libzipw.bundle",
    "Magick.Native-Q8-arm64.bundle",
    "Magick.Native-Q8-x64.bundle",
  ]),
} as const);

/**
 * `ShaperInstaller` (`0x10012cad0`..`0x10012d068`, `ev_fcc9a88c0be39cb5e8e9d8ff24ddd8f9735c10e2e6531d02087a471935076a00`) 내재화:
 * `../../dev.txt` 파일 유무에 따라 `dev-shaper` 또는 `shaper` 서브도메인 엔드포인트를 결정한다.
 */
export function resolveShaperInstallerEndpointUrls(
  hasDevTxt: boolean,
  os: "mac" | "win" = "mac",
  filePath: string = "SHAPER.zip",
): ShaperInstallerEndpoints {
  const subdomain = hasDevTxt ? "dev-shaper" : "shaper";
  const baseUrl = `https://${subdomain}.webtoons.com`;
  return Object.freeze({
    subdomain,
    baseUrl,
    buildLogsLatestUrl: `${baseUrl}/api/buildlogs/${os}/latest`,
    termsUrl: `${baseUrl}/terms`,
    cssBaseUrl: `${baseUrl}/css/`,
    downloadClientUrl: `${baseUrl}/api/clients/download?file_path=${encodeURIComponent(filePath)}`,
  });
}

/**
 * `ShaperInstaller` (`0x10012cba0`..`0x10012cd20`) 릴리스 노트 HTML 치환 규칙 내재화:
 * `<body>`, `class="header"`, `class="notice"`, `/css/` 경로를 인스톨러 뷰포트 스타일로 정규화한다.
 */
export function rewriteShaperReleaseNoticeHtml(rawHtml: string, hasDevTxt: boolean = false): string {
  const subdomain = hasDevTxt ? "dev-shaper" : "shaper";
  return rawHtml
    .replaceAll("/css/", `https://${subdomain}.webtoons.com/css/`)
    .replaceAll("<body>", "<body style='background-color:#fff; --text-primary:#000; --text-secondary:#222'>")
    .replaceAll('class="header"', "class='header' style='display:none;'")
    .replaceAll('class="notice"', "class='notice' style='padding:20px;'");
}

/**
 * `ShaperLauncher` (`0x100055480`..`0x100055830`, `ev_ba8d0c04c570c5269a82bab17fa0726c967b77b6f6794d68aabf351aadc62976`) 내재화:
 * `CFBundleShortVersionString` 버전 비교, `pgrep -l SHAPER` 중복 실행 감지 및 런처 상태 단계를 산출한다.
 */
export function evaluateShaperLauncherRuntimeDiagnostics(input: {
  readonly bundleShortVersion: string;
  readonly serverLatestVersion: string;
  readonly runningPgrepMatches: readonly string[];
  readonly launchExitCode?: number;
}): ShaperLauncherDiagnostics {
  const alreadyRunning = input.runningPgrepMatches.some((line) => /\bSHAPER\b/u.test(line));
  const needsUpdate = input.bundleShortVersion.trim() !== input.serverLatestVersion.trim();
  const stage: ShaperLauncherDiagnostics["stage"] =
    typeof input.launchExitCode === "number" && input.launchExitCode !== 0
      ? "error"
      : needsUpdate
        ? "Version Check..."
        : alreadyRunning
          ? "Completed..."
          : "Loading SHAPER...";
  return Object.freeze({
    stage,
    alreadyRunning,
    needsUpdate,
    launchArgs: Object.freeze(["--args", "-logFile", "-"] as const),
    errorLogFile: "shaperx.txt",
  });
}
