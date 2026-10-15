/**
 * SketchUp 가져오기 보고서 v1 생성기 — 이름 정리, 경고 만들기, 변환 사실로 보고서 만들기, 단위 반영.
 *
 * zod 에 의존하지 않는다. 변환 Worker 가 이 모듈만 불러오므로(스키마 검증은 받는 쪽이 한다) Worker 번들에
 * 검증 라이브러리가 들어가지 않는다. 보고서 타입은 스키마 모듈에서 `import type` 으로만 가져온다.
 * 필드 의미와 안정 계약은 studio-bg3d-skp-import-report 와 docs/features/skp-import.md 를 따른다.
 */

import {
  STUDIO_BG3D_SKP_REPORT_MAX_NAME_CODE_POINTS,
  STUDIO_BG3D_SKP_REPORT_MAX_NAMES,
  STUDIO_BG3D_SKP_REPORT_MAX_WARNINGS,
} from "./studio-bg3d-skp-contract";
import {
  STUDIO_BG3D_SKP_IMPORT_REPORT_KIND,
  STUDIO_BG3D_SKP_IMPORT_REPORT_VERSION,
  type StudioBg3dSkpWarningCode,
} from "./studio-bg3d-skp-report-constants";
import {
  STUDIO_BG3D_SKP_DEFAULT_UNIT,
  assessStudioBg3dSkpSize,
  classifyStudioBg3dSkpMaxExtent,
  maxStudioBg3dSkpExtent,
  scaleStudioBg3dSkpSize,
  studioBg3dSkpUnitScaleFactor,
  type StudioBg3dSkpDeclaredUnits,
  type StudioBg3dSkpUnit,
} from "./studio-bg3d-skp-unit";

import type {
  StudioBg3dSkpImportReport,
  StudioBg3dSkpReportNameList,
  StudioBg3dSkpReportWarning,
} from "./studio-bg3d-skp-import-report";
import type { StudioBg3dSkpMeshStats } from "./studio-bg3d-skp-mesh-analysis";
import type { StudioBg3dSkpContainerKind, StudioBg3dSkpVersionInfo } from "./studio-bg3d-skp-preflight";

function isUnsafeCodePoint(codePoint: number): boolean {
  return codePoint <= 0x1f
    || (codePoint >= 0x7f && codePoint <= 0x9f)
    || (codePoint >= 0x200b && codePoint <= 0x200f)
    || (codePoint >= 0x202a && codePoint <= 0x202e)
    || codePoint === 0x2060
    || (codePoint >= 0x2066 && codePoint <= 0x2069)
    || codePoint === 0xfeff;
}

/** 파일 안의 이름을 보고서에 담을 수 있는 짧은 텍스트로 정리한다. 비면 null. */
export function sanitizeStudioBg3dSkpName(
  raw: unknown,
  maxCodePoints = STUDIO_BG3D_SKP_REPORT_MAX_NAME_CODE_POINTS,
): string | null {
  if (typeof raw !== "string") return null;
  let masked = "";
  for (const character of raw.normalize("NFC")) {
    masked += isUnsafeCodePoint(character.codePointAt(0) ?? 0) ? " " : character;
  }
  const cleaned = masked.replace(/\s+/gu, " ").trim();
  if (cleaned.length === 0) return null;
  const points = Array.from(cleaned);
  return points.length <= maxCodePoints ? cleaned : `${points.slice(0, maxCodePoints - 1).join("")}…`;
}

/** 이름들을 정리·중복 제거해 목록으로 만든다. 첫 등장 순서를 유지하고 한도를 넘으면 잘라 total 만 남긴다. */
export function buildStudioBg3dSkpNameList(names: Iterable<unknown>): StudioBg3dSkpReportNameList {
  const unique = new Set<string>();
  for (const name of names) {
    const cleaned = sanitizeStudioBg3dSkpName(name);
    if (cleaned !== null) unique.add(cleaned);
  }
  const all = [...unique];
  return {
    available: true,
    items: all.slice(0, STUDIO_BG3D_SKP_REPORT_MAX_NAMES),
    total: all.length,
    truncated: all.length > STUDIO_BG3D_SKP_REPORT_MAX_NAMES,
  };
}

/** 이름을 읽을 수 없는 경우의 목록(빈 목록과 구분한다). */
export const STUDIO_BG3D_SKP_UNAVAILABLE_NAME_LIST: StudioBg3dSkpReportNameList = Object.freeze({
  available: false,
  items: [],
  total: 0,
  truncated: false,
});

export function createStudioBg3dSkpWarning(
  code: StudioBg3dSkpWarningCode,
  severity: StudioBg3dSkpReportWarning["severity"],
  options: { readonly count?: number; readonly detail?: string } = {},
): StudioBg3dSkpReportWarning {
  const detail = options.detail === undefined ? null : sanitizeStudioBg3dSkpName(options.detail, 160);
  return { code, severity, count: options.count ?? null, detail };
}

export interface StudioBg3dSkpReportInput {
  readonly byteSize: number;
  readonly container: StudioBg3dSkpContainerKind;
  readonly version: StudioBg3dSkpVersionInfo;
  readonly declaredUnits: StudioBg3dSkpDeclaredUnits;
  readonly execution: "worker" | "main-thread";
  readonly elapsedMs: number;
  readonly textures: "embedded" | "omitted" | "none";
  readonly metadataPass: "done" | "skipped-large" | "failed";
  readonly primitivesBeforeMerge: number;
  readonly stats: StudioBg3dSkpMeshStats;
  readonly texturesReferenced: number;
  readonly texturesEmbedded: number;
  readonly sourceFaces: number | null;
  readonly instances: number;
  readonly components: StudioBg3dSkpReportNameList;
  readonly tags: StudioBg3dSkpReportNameList;
  readonly scenes: StudioBg3dSkpReportNameList;
  /** 크기·단위 경고는 보고서가 직접 만든다. 여기에는 나머지 경고만 넘긴다. */
  readonly warnings: readonly StudioBg3dSkpReportWarning[];
}

const SIZE_WARNING_CODES: ReadonlySet<StudioBg3dSkpWarningCode> = new Set(["size-abnormal", "unit-override-applied"]);

function sizeWarnings(
  level: "ok" | "too-small" | "too-large",
  unit: StudioBg3dSkpUnit,
): readonly StudioBg3dSkpReportWarning[] {
  const warnings: StudioBg3dSkpReportWarning[] = [];
  if (level !== "ok") warnings.push(createStudioBg3dSkpWarning("size-abnormal", "warning", { detail: level }));
  if (unit !== STUDIO_BG3D_SKP_DEFAULT_UNIT) {
    warnings.push(createStudioBg3dSkpWarning("unit-override-applied", "info", { detail: unit }));
  }
  return warnings;
}

function limitWarnings(warnings: readonly StudioBg3dSkpReportWarning[]): StudioBg3dSkpReportWarning[] {
  const seen = new Set<StudioBg3dSkpWarningCode>();
  const unique: StudioBg3dSkpReportWarning[] = [];
  for (const warning of warnings) {
    if (seen.has(warning.code)) continue;
    seen.add(warning.code);
    unique.push(warning);
  }
  return unique.slice(0, STUDIO_BG3D_SKP_REPORT_MAX_WARNINGS);
}

/** 변환 단계가 모은 사실로 보고서 v1 을 만든다. 빈 장면이면 size 는 null 이고 empty-scene 경고가 붙는다. */
export function buildStudioBg3dSkpImportReport(input: StudioBg3dSkpReportInput): StudioBg3dSkpImportReport {
  const { stats } = input;
  const sizeMeters = stats.sizeMeters;
  const assessment = sizeMeters === null
    ? null
    : assessStudioBg3dSkpSize(sizeMeters, input.declaredUnits.unit);
  const warnings = [
    ...(sizeMeters === null ? [createStudioBg3dSkpWarning("empty-scene", "warning")] : []),
    ...(assessment === null ? [] : sizeWarnings(assessment.level, STUDIO_BG3D_SKP_DEFAULT_UNIT)),
    ...input.warnings,
  ];
  return {
    version: STUDIO_BG3D_SKP_IMPORT_REPORT_VERSION,
    kind: STUDIO_BG3D_SKP_IMPORT_REPORT_KIND,
    source: {
      byteSize: input.byteSize,
      container: input.container,
      sketchupVersion: input.version.raw,
      sketchupMajor: input.version.major,
      sketchupLabel: input.version.label,
      declaredUnits: input.declaredUnits.raw,
    },
    conversion: {
      converter: "openskp",
      execution: input.execution,
      elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
      textures: input.textures,
      metadataPass: input.metadataPass,
      hiddenFacesExcluded: true,
      primitivesBeforeMerge: input.primitivesBeforeMerge,
      primitivesAfterMerge: stats.primitiveCount,
    },
    coordinates: {
      sourceUnit: "inch",
      outputUnit: "meter",
      metersPerSourceUnit: 0.0254,
      sourceUpAxis: "z",
      outputUpAxis: "y",
    },
    units: {
      appliedUnit: STUDIO_BG3D_SKP_DEFAULT_UNIT,
      scaleFactor: 1,
      userSelected: false,
    },
    size: sizeMeters === null || assessment === null
      ? null
      : {
        openSkpMeters: [sizeMeters[0], sizeMeters[1], sizeMeters[2]],
        meters: [sizeMeters[0], sizeMeters[1], sizeMeters[2]],
        maxExtentMeters: assessment.maxExtentMeters,
        level: assessment.level,
        recommendedUnit: assessment.recommendedUnit,
      },
    counts: {
      sourceFaces: input.sourceFaces,
      vertices: stats.vertexCount,
      triangles: stats.triangleCount,
      materials: stats.materialCount,
      textures: input.texturesEmbedded,
      texturesReferenced: input.texturesReferenced,
      instances: input.instances,
    },
    names: { components: input.components, tags: input.tags, scenes: input.scenes },
    warnings: limitWarnings(warnings),
  };
}

/**
 * 사용자가 고른 단위를 보고서에 반영한 새 보고서를 돌려준다. 크기는 항상 OpenSKP 출력(openSkpMeters)에서
 * 다시 계산하므로 단위를 여러 번 바꿔도 오차가 쌓이지 않는다. 크기·단위 경고도 다시 맞춘다.
 */
export function applyStudioBg3dSkpUnitToReport(
  report: StudioBg3dSkpImportReport,
  unit: StudioBg3dSkpUnit,
  options: { readonly userSelected: boolean },
): StudioBg3dSkpImportReport {
  const scaleFactor = studioBg3dSkpUnitScaleFactor(unit);
  const units = { appliedUnit: unit, scaleFactor, userSelected: options.userSelected };
  if (report.size === null) return { ...report, units };
  const meters = scaleStudioBg3dSkpSize(report.size.openSkpMeters, scaleFactor);
  const maxExtentMeters = maxStudioBg3dSkpExtent(meters);
  const level = classifyStudioBg3dSkpMaxExtent(maxExtentMeters);
  const kept = report.warnings.filter((warning) => !SIZE_WARNING_CODES.has(warning.code));
  return {
    ...report,
    units,
    size: {
      ...report.size,
      meters: [meters[0], meters[1], meters[2]],
      maxExtentMeters,
      level,
    },
    warnings: limitWarnings([...sizeWarnings(level, unit), ...kept]),
  };
}
