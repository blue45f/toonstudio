/**
 * .skp 가져오기 화면의 사용자 문구 — 보고서 필드를 사람이 읽는 한국어로 바꾸는 순수 함수 모음.
 *
 * 화면(StudioBg3dSkpImportPanel)과 안내 문단이 같은 문장을 쓰도록 한곳에 두고, 테스트가 문구와
 * 보고서 계약(경고 코드·단계)이 어긋나지 않는지 확인한다. 새 경고 코드를 보고서에 더하면 이 파일의
 * describeStudioBg3dSkpWarning 도 함께 갱신해야 하고, 빠뜨리면 테스트가 실패한다.
 */

import {
  STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS,
  STUDIO_BG3D_SKP_MAX_SOURCE_BYTES,
  STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION,
  STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES,
  STUDIO_BG3D_SKP_STAGES,
  studioBg3dSkpStageNumber,
  type StudioBg3dSkpStage,
  type StudioBg3dSkpStageProgress,
} from "./studio-bg3d-skp-contract";
import {
  STUDIO_BG3D_SKP_UNIT_LABELS,
  isStudioBg3dSkpUnit,
  type StudioBg3dSkpSizeLevel,
} from "./studio-bg3d-skp-unit";

import type { StudioBg3dSkpMetadataStatus } from "./studio-bg3d-skp-asset-metadata";
import type { StudioBg3dSkpImportReport, StudioBg3dSkpReportWarning } from "./studio-bg3d-skp-import-report";

/** 3D Warehouse 에서 받은 모델의 이용 조건 안내. 기존 이용 권리 기록(권리 관문)과 함께 읽도록 안내한다. */
export const STUDIO_BG3D_SKP_WAREHOUSE_NOTICE =
  "SketchUp 3D Warehouse에서 받은 모델은 Trimble의 3D Warehouse 이용 약관과 모델 게시자가 정한 조건을 따릅니다. 상업 작품에 쓰거나 다시 배포해도 되는지 직접 확인한 뒤 '이용 권리 기록'에 기록해 주세요. 확인 전에는 '확인 전'으로 두면 상업 이용이 보류됩니다.";

/** 변환기의 법적 지위 안내. OpenSKP 는 비공식 파서이고 SketchUp 은 Trimble 의 상표다. */
export const STUDIO_BG3D_SKP_LEGAL_NOTICE =
  "OpenSKP는 Trimble과 관련 없는 비공식 오픈소스(MIT) 파서이며 모든 .skp 파일의 변환을 보장하지 않습니다. SketchUp은 Trimble Inc.의 상표입니다.";

const MIB = 1024 * 1024;

/** 가져오기 안내에 쓰는 지원 범위 요약. 한도 숫자는 계약 상수에서 만들어 문서·오류 문구와 어긋나지 않는다. */
export const STUDIO_BG3D_SKP_SUPPORT_SUMMARY =
  `SketchUp ${2000 + STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION} 이후 .skp를 브라우저 안에서 GLB로 변환해 가져옵니다(파일은 외부로 보내지 않습니다). `
  + `변환은 별도 Worker에서 하며 ${STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS / 1000}초를 넘기면 중단하고, `
  + `큰 파일(데스크톱 ${STUDIO_BG3D_SKP_MAX_SOURCE_BYTES / MIB}MiB·모바일 ${STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES / MIB}MiB 초과, 2021 이후 형식은 압축을 푼 모델 데이터 기준)은 받지 않습니다. `
  + "컴포넌트·태그·장면 이름은 읽을 수 있는 범위만 보고서에 담습니다. 장면(카메라)과 애니메이션은 가져오지 않고, 숨긴 컴포넌트·태그의 형상은 결과에 포함될 수 있습니다.";

const STAGE_LABELS: Readonly<Record<StudioBg3dSkpStage, string>> = Object.freeze({
  validating: "파일 확인",
  "loading-converter": "변환기 준비",
  "reading-metadata": "이름·단위 읽기",
  "building-scene": "모델 구조 만들기",
  optimizing: "재질별로 합치기",
  "writing-glb": "GLB 만들기",
});

export function studioBg3dSkpStageLabel(stage: StudioBg3dSkpStage): string {
  return STAGE_LABELS[stage];
}

/** "3/6 · 모델 구조 만들기 · 별도 Worker" 같은 한 줄 진행 문구. */
export function describeStudioBg3dSkpStage(progress: StudioBg3dSkpStageProgress): string {
  const step = `${studioBg3dSkpStageNumber(progress.stage)}/${STUDIO_BG3D_SKP_STAGES.length}`;
  const percent = progress.fraction === null
    ? ""
    : ` ${Math.round(Math.min(1, Math.max(0, progress.fraction)) * 100)}%`;
  const where = progress.execution === "worker"
    ? "별도 Worker"
    : "화면 스레드(이 브라우저는 Worker를 쓸 수 없어 잠시 멈출 수 있음)";
  return `${step} · ${studioBg3dSkpStageLabel(progress.stage)}${percent} · ${where}`;
}

function trimTrailingZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/u, "") : text;
}

function roundedLength(value: number, digits: number): string {
  return trimTrailingZeros(value.toFixed(digits));
}

/** 미터 값을 읽기 쉬운 길이로 쓴다: mm / cm / m / km 중 알맞은 단위. */
export function formatStudioBg3dSkpLength(meters: number): string {
  if (!Number.isFinite(meters)) return "알 수 없음";
  const magnitude = Math.abs(meters);
  if (magnitude === 0) return "0m";
  if (magnitude < 0.01) return `${roundedLength(meters * 1000, 1)}mm`;
  if (magnitude < 1) return `${roundedLength(meters * 100, 1)}cm`;
  if (magnitude < 1000) return `${roundedLength(meters, 2)}m`;
  return `${roundedLength(meters / 1000, 2)}km`;
}

/** OpenSKP 출력은 Y-up 이므로 X = 너비, Y = 높이, Z = 깊이다. */
export function formatStudioBg3dSkpDimensions(meters: readonly [number, number, number]): string {
  return `너비 ${formatStudioBg3dSkpLength(meters[0])} × 높이 ${formatStudioBg3dSkpLength(meters[1])} × 깊이 ${formatStudioBg3dSkpLength(meters[2])}`;
}

export function describeStudioBg3dSkpSizeLevel(level: StudioBg3dSkpSizeLevel): string {
  switch (level) {
    case "ok":
      return "크기 정상";
    case "too-small":
      return "수 mm 수준으로 매우 작음";
    case "too-large":
      return "수 km 수준으로 매우 큼";
  }
}

function unitLabel(unit: string | null): string {
  return unit !== null && isStudioBg3dSkpUnit(unit) ? STUDIO_BG3D_SKP_UNIT_LABELS[unit] : "알 수 없는 단위";
}

function countText(count: number | null): string {
  return count === null ? "" : `${count.toLocaleString("ko-KR")}`;
}

export interface StudioBg3dSkpWarningCopy {
  readonly code: StudioBg3dSkpReportWarning["code"];
  readonly severity: StudioBg3dSkpReportWarning["severity"];
  readonly text: string;
}

/** 경고 한 건을 사용자 문구로 바꾼다. 해결 방법이 있으면 문장에 함께 적는다. */
export function describeStudioBg3dSkpWarning(warning: StudioBg3dSkpReportWarning): StudioBg3dSkpWarningCopy {
  const { code, severity, count, detail } = warning;
  const number = countText(count);
  const names = detail ? `(${detail})` : "";
  const text = ((): string => {
    switch (code) {
      case "empty-scene":
        return "보이는 형상이 없습니다. SketchUp에서 숨김을 해제하거나 GLB·DAE로 내보내 가져와 주세요.";
      case "size-abnormal":
        return detail === "too-large"
          ? "모델이 수 km 이상으로 매우 큽니다. 모델을 만든 단위를 확인해 주세요."
          : "모델이 수 mm 이하로 매우 작습니다. 모델을 만든 단위를 확인해 주세요.";
      case "unit-override-applied":
        return `모델을 만든 단위를 ${unitLabel(detail)}로 다시 적용했습니다.`;
      case "high-polygon-count":
        return `삼각형이 ${number}개로 많습니다. 모바일에서는 느릴 수 있으니 SketchUp에서 단순화를 권장합니다.`;
      case "flipped-faces":
        return `면 방향이 어긋난 경계가 ${number}곳 있습니다. 모델이 어둡거나 비어 보이면 SketchUp에서 면 방향을 맞춰 주세요.`;
      case "orientation-check-skipped":
        return "삼각형이 많아 면 방향 점검을 건너뛰었습니다.";
      case "texture-missing":
        return `파일에서 이미지를 찾지 못한 재질이 ${number}개 있어 단색으로 가져왔습니다${names}.`;
      case "texture-unsupported-format":
        return `지원하지 않는 이미지 형식의 재질이 ${number}개 있어 단색으로 가져왔습니다${names}.`;
      case "textures-omitted":
        return detail === "count"
          ? `텍스처 이미지가 너무 많아(${number}개) GLB에 넣지 않고 평균 색으로 가져왔습니다.`
          : `텍스처 이미지 용량이 커서(${number}개) GLB에 넣지 않고 평균 색으로 가져왔습니다.`;
      case "hidden-instances-included":
        return `SketchUp에서 숨긴 컴포넌트·그룹 ${number}개가 결과에 포함될 수 있습니다. 필요 없으면 SketchUp에서 삭제한 뒤 다시 저장해 주세요.`;
      case "hidden-tags-included":
        return `숨긴 태그 ${number}개${names}의 형상이 결과에 포함될 수 있습니다. 필요 없으면 SketchUp에서 삭제한 뒤 다시 저장해 주세요.`;
      case "metadata-unavailable":
        return detail === "large-file"
          ? "파일이 커서 컴포넌트·태그·장면 이름 읽기를 건너뛰었습니다."
          : "컴포넌트·태그·장면 이름을 읽지 못했습니다. 형상 변환에는 영향이 없습니다.";
      case "main-thread-fallback":
        return "이 브라우저는 Worker를 쓸 수 없어 화면 스레드에서 변환했습니다.";
    }
  })();
  return { code, severity, text };
}

/** 적용된 단위와 배율을 한 줄로 보여 준다. 인치(기본)는 보정이 없음을 분명히 적는다. */
export function describeStudioBg3dSkpAppliedUnit(report: StudioBg3dSkpImportReport): string {
  const { appliedUnit, scaleFactor, userSelected } = report.units;
  const label = STUDIO_BG3D_SKP_UNIT_LABELS[appliedUnit];
  if (appliedUnit === "inch") {
    return userSelected
      ? `${label}로 확인함 · 보정 없음(SketchUp 기본 저장 단위)`
      : `${label} 기준 · 보정 없음(SketchUp 기본 저장 단위)`;
  }
  return `${label}로 해석 · 크기 ×${roundedLength(scaleFactor, 4)} 보정${userSelected ? "(직접 선택)" : ""}`;
}

/** 파일에 적힌 표시 단위(2021+ 파일만 읽을 수 있음). */
export function describeStudioBg3dSkpDeclaredUnit(report: StudioBg3dSkpImportReport): string {
  return report.source.declaredUnits === null
    ? "파일에 적힌 표시 단위: 읽지 못함(레거시 형식은 제공하지 않음)"
    : `파일에 적힌 표시 단위: ${report.source.declaredUnits}`;
}

export function describeStudioBg3dSkpCounts(report: StudioBg3dSkpImportReport): string {
  const { counts } = report;
  const parts = [
    `삼각형 ${counts.triangles.toLocaleString("ko-KR")}`,
    `정점 ${counts.vertices.toLocaleString("ko-KR")}`,
    `재질 ${counts.materials.toLocaleString("ko-KR")}`,
    `텍스처 ${counts.textures.toLocaleString("ko-KR")}`,
    `배치된 컴포넌트·그룹 ${counts.instances.toLocaleString("ko-KR")}`,
  ];
  if (counts.sourceFaces !== null) parts.unshift(`원본 면 ${counts.sourceFaces.toLocaleString("ko-KR")}`);
  return parts.join(" · ");
}

export function describeStudioBg3dSkpMetadataStatus(status: StudioBg3dSkpMetadataStatus): string {
  switch (status) {
    case "saved":
      return "변환 보고서를 자산 정보에 저장했습니다.";
    case "existing":
      return "같은 모델의 자산 정보가 이미 있어 그대로 두었습니다.";
    case "failed":
      return "가져오기는 끝났지만 변환 보고서를 자산 정보에 저장하지 못했습니다. 이 화면의 보고서는 새로고침하면 사라집니다.";
    case "skipped":
      return "변환 보고서를 자산 정보에 저장하지 않았습니다.";
  }
}

/** 보고서에서 가져온 이름 목록(컴포넌트·태그·장면)의 표시용 요약. 읽지 못했으면 그 사실을 적는다. */
export function describeStudioBg3dSkpNameList(
  label: string,
  list: StudioBg3dSkpImportReport["names"]["components"],
): string {
  if (!list.available) return `${label}: 읽지 못함`;
  if (list.total === 0) return `${label}: 없음`;
  const shown = list.items.join(", ");
  const hidden = list.total - list.items.length;
  return hidden > 0 ? `${label} ${list.total}개: ${shown} 외 ${hidden}개` : `${label} ${list.total}개: ${shown}`;
}

/** 바이트 수를 KiB/MiB 로. */
export function formatStudioBg3dSkpBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "알 수 없음";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < MIB) return `${roundedLength(bytes / 1024, 1)}KiB`;
  return `${roundedLength(bytes / MIB, 1)}MiB`;
}

/** 원본 파일의 버전·형식·크기 요약. */
export function describeStudioBg3dSkpSource(report: StudioBg3dSkpImportReport): string {
  const { source } = report;
  const container = source.container === "vff"
    ? "2021 이후 형식"
    : source.container === "legacy"
      ? "2013–2020 형식"
      : "형식 알 수 없음";
  return `${source.sketchupLabel ?? "SketchUp 버전 알 수 없음"} · ${container} · ${formatStudioBg3dSkpBytes(source.byteSize)}`;
}

/** 변환 방식·시간·텍스처 처리 요약. 폴백은 숨기지 않고 그대로 적는다. */
export function describeStudioBg3dSkpConversion(report: StudioBg3dSkpImportReport): string {
  const { conversion } = report;
  const where = conversion.execution === "worker" ? "별도 Worker에서 변환" : "화면 스레드에서 변환(Worker 사용 불가)";
  const seconds = roundedLength(conversion.elapsedMs / 1000, 1);
  const textures = conversion.textures === "embedded"
    ? "텍스처 포함"
    : conversion.textures === "omitted"
      ? "텍스처 제외(평균 색)"
      : "텍스처 없음";
  return `${where} · ${seconds}초 · ${textures} · 드로 콜 ${conversion.primitivesBeforeMerge.toLocaleString("ko-KR")}→${conversion.primitivesAfterMerge.toLocaleString("ko-KR")}`;
}
