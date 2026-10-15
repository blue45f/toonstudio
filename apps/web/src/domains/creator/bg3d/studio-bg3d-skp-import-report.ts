/**
 * SketchUp 가져오기 보고서 v1 — 후속 작업(컴포넌트·태그·장면 연동, SKP 사이드카)이 읽는 안정 계약.
 *
 * 변환기가 한 번의 .skp 변환에서 알아낸 사실만 담는다. 추측하거나 채워 넣은 값은 없으며, 읽지 못한
 * 항목은 null 또는 available:false 로 구분한다. 자세한 필드 설명은 docs/features/skp-import.md 를 따른다.
 *
 * 규칙
 * - version 1 의 필드 의미는 바꾸지 않는다. 필드를 더하거나 의미를 바꾸면 version 을 올리고 이전 버전
 *   읽기(migrate)를 함께 둔다.
 * - 이름(컴포넌트·태그·장면)은 파일 안의 신뢰할 수 없는 텍스트다. 제어 문자는 제거했고 길이를
 *   제한했을 뿐 마크업을 이스케이프하지 않았으므로 소비자가 텍스트로만 렌더해야 한다.
 * - 자산 메타데이터(studio-bg3d-asset-metadata)의 skpImport 필드에 이 객체가 그대로 저장된다.
 *
 * 이 모듈은 zod 스키마·검증·타입만 맡는다(메인 스레드와 저장소가 읽는다). 보고서를 만드는 쪽은
 * studio-bg3d-skp-report-builder 이고, 상수는 studio-bg3d-skp-report-constants 에 있다.
 */

import { z } from "zod";

import {
  STUDIO_BG3D_SKP_REPORT_MAX_NAME_CODE_POINTS,
  STUDIO_BG3D_SKP_REPORT_MAX_NAMES,
  STUDIO_BG3D_SKP_REPORT_MAX_WARNINGS,
} from "./studio-bg3d-skp-contract";
import {
  STUDIO_BG3D_SKP_IMPORT_REPORT_KIND,
  STUDIO_BG3D_SKP_IMPORT_REPORT_VERSION,
  STUDIO_BG3D_SKP_WARNING_CODES,
} from "./studio-bg3d-skp-report-constants";
import { STUDIO_BG3D_SKP_UNITS, studioBg3dSkpUnitScaleFactor } from "./studio-bg3d-skp-unit";

const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const finiteNumber = z.number().finite();
const vector3 = z.tuple([finiteNumber, finiteNumber, finiteNumber]);
const unitSchema = z.enum(STUDIO_BG3D_SKP_UNITS);

const nameListSchema = z.object({
  /** false 면 이 파일 형식·상태에서는 이름을 읽지 못했다(빈 목록과 구분). */
  available: z.boolean(),
  items: z.array(z.string().min(1).max(STUDIO_BG3D_SKP_REPORT_MAX_NAME_CODE_POINTS * 2))
    .max(STUDIO_BG3D_SKP_REPORT_MAX_NAMES),
  /** 중복을 제거한 전체 이름 수(목록이 잘렸어도 전체 수를 유지). */
  total: count,
  truncated: z.boolean(),
}).refine((list) => list.items.length <= list.total, { message: "items must not exceed total" });

const warningSchema = z.object({
  code: z.enum(STUDIO_BG3D_SKP_WARNING_CODES),
  severity: z.enum(["info", "warning"]),
  count: count.nullable(),
  detail: z.string().max(160).nullable(),
});

export const studioBg3dSkpImportReportSchema = z.object({
  version: z.literal(STUDIO_BG3D_SKP_IMPORT_REPORT_VERSION),
  kind: z.literal(STUDIO_BG3D_SKP_IMPORT_REPORT_KIND),
  source: z.object({
    byteSize: count,
    container: z.enum(["vff", "legacy", "unknown"]),
    /** 중괄호를 뺀 파일 버전. 예: "21.0.339". */
    sketchupVersion: z.string().max(40).nullable(),
    sketchupMajor: count.nullable(),
    /** 예: "SketchUp 2021". */
    sketchupLabel: z.string().max(40).nullable(),
    /** 파일에 적힌 표시 단위 원문(VFF 2021+ 에서만 읽을 수 있음). */
    declaredUnits: z.string().max(40).nullable(),
  }),
  conversion: z.object({
    converter: z.literal("openskp"),
    execution: z.enum(["worker", "main-thread"]),
    elapsedMs: count,
    /** embedded: GLB 에 이미지 포함, omitted: 있었지만 한도로 제외(평균 색), none: 텍스처 없음. */
    textures: z.enum(["embedded", "omitted", "none"]),
    /** 이름·단위 보고용 2차 파싱 결과. */
    metadataPass: z.enum(["done", "skipped-large", "failed"]),
    /** SketchUp 에서 "숨김"으로 지정한 면은 변환에서 제외한다(openskp respectEdgeVisibility). */
    hiddenFacesExcluded: z.boolean(),
    primitivesBeforeMerge: count,
    primitivesAfterMerge: count,
  }),
  /** OpenSKP 가 적용한 좌표 변환(README 근거). 모든 보고서에서 같은 값이다. */
  coordinates: z.object({
    sourceUnit: z.literal("inch"),
    outputUnit: z.literal("meter"),
    metersPerSourceUnit: z.literal(0.0254),
    sourceUpAxis: z.literal("z"),
    outputUpAxis: z.literal("y"),
  }),
  units: z.object({
    /** 사용자가 고르거나 기본(인치)으로 둔, 원본 숫자 1의 의미. */
    appliedUnit: unitSchema,
    /** OpenSKP 출력(인치 가정)에 곱한 상대 배율. 인치는 1. */
    scaleFactor: finiteNumber.positive(),
    /** true 면 사용자가 크기 확인 단계에서 직접 선택했다. */
    userSelected: z.boolean(),
  }),
  /** 형상이 없으면 null. */
  size: z.object({
    /** OpenSKP 출력 그대로의 크기(미터, 보정 전). */
    openSkpMeters: vector3,
    /** 단위 보정 후 크기(미터). */
    meters: vector3,
    maxExtentMeters: finiteNumber.min(0),
    level: z.enum(["ok", "too-small", "too-large"]),
    recommendedUnit: unitSchema.nullable(),
  }).nullable(),
  counts: z.object({
    /** 정의 단위 SketchUp 면 수. 이름·메타 2차 파싱을 못 했으면 null. */
    sourceFaces: count.nullable(),
    vertices: count,
    triangles: count,
    /** 변환 결과에서 실제로 쓰는 재질 수. */
    materials: count,
    /** GLB 에 포함한 텍스처 이미지 수. */
    textures: count,
    /** 변환 결과가 참조하는 텍스처 이미지 수(제외했더라도 포함). */
    texturesReferenced: count,
    /** 배치된 컴포넌트·그룹 인스턴스 수. */
    instances: count,
  }),
  names: z.object({
    components: nameListSchema,
    tags: nameListSchema,
    scenes: nameListSchema,
  }),
  warnings: z.array(warningSchema).max(STUDIO_BG3D_SKP_REPORT_MAX_WARNINGS),
}).refine(
  (report) => Math.abs(report.units.scaleFactor - studioBg3dSkpUnitScaleFactor(report.units.appliedUnit)) < 1e-12,
  { message: "units.scaleFactor must match units.appliedUnit" },
);

export type StudioBg3dSkpImportReport = z.infer<typeof studioBg3dSkpImportReportSchema>;
export type StudioBg3dSkpReportWarning = z.infer<typeof warningSchema>;
export type StudioBg3dSkpReportNameList = z.infer<typeof nameListSchema>;

/** 저장소·Worker 에서 읽은 값을 검증한다. 올바르지 않으면 null(부분 복구는 하지 않는다). */
export function parseStudioBg3dSkpImportReport(value: unknown): StudioBg3dSkpImportReport | null {
  const parsed = studioBg3dSkpImportReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
