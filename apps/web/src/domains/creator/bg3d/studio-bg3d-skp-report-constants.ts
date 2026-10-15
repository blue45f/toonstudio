/**
 * SketchUp 가져오기 보고서 v1 의 상수 — zod 를 끌어오지 않는 최하위 층.
 *
 * 변환 Worker 는 보고서를 만들 뿐 검증하지 않으므로 이 상수와 생성기(studio-bg3d-skp-report-builder)만 쓰고,
 * zod 스키마(studio-bg3d-skp-import-report)는 메인 스레드·저장소 쪽에서만 불러온다.
 */

export const STUDIO_BG3D_SKP_IMPORT_REPORT_VERSION = 1 as const;
export const STUDIO_BG3D_SKP_IMPORT_REPORT_KIND = "toonstudio-bg3d-skp-import-report" as const;

/** 경고 코드. 새 코드를 더하는 것은 호환되지만, 기존 코드의 의미는 바꾸지 않는다. */
export const STUDIO_BG3D_SKP_WARNING_CODES = [
  "empty-scene",
  "size-abnormal",
  "unit-override-applied",
  "high-polygon-count",
  "flipped-faces",
  "orientation-check-skipped",
  "texture-missing",
  "texture-unsupported-format",
  "textures-omitted",
  "hidden-instances-included",
  "hidden-tags-included",
  "metadata-unavailable",
  "main-thread-fallback",
] as const;

export type StudioBg3dSkpWarningCode = (typeof STUDIO_BG3D_SKP_WARNING_CODES)[number];
