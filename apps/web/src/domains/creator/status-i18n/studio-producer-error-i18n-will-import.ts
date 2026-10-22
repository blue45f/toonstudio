/**
 * A4 D4 (R15): WILL v1 가져오기 생산자(studio-will-v1-import-bridge.ts) 표시 해석 —
 * trace-3 §2.26. throw는 interchange-import catch 2곳에서 코드 통과로 해석하고,
 * 적응 사유(constraints)와 커밋 상태 문구는 preview·status 타입이 문자열로 고정된
 * 집계자 예외라 생산자가 이 모듈의 합성 헬퍼를 호출한다. 면책 문구는 공개 상수
 * STUDIO_WILL_V1_IMPORT_DISCLAIMER가 정본이라 코드화하지 않는다(보고서 병기).
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StudioWillV1ImportErrorCode,
  StudioWillV1ImportLabelCode,
} from "../studio-will-v1-import-bridge-error";

const WILL_PREFIX = "studio.producerError.willImport";

type WillParams = Readonly<Record<string, string>> | undefined;

function resolveWillImport(key: string, fallback: string, params?: WillParams): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

const ERROR_KEYS: Record<StudioWillV1ImportErrorCode, string> = {
  aborted: `${WILL_PREFIX}.error.aborted`,
  invalidValue: `${WILL_PREFIX}.error.invalidValue`,
  elementCountMismatch: `${WILL_PREFIX}.error.elementCountMismatch`,
  profileUnverified: `${WILL_PREFIX}.error.profileUnverified`,
  blockedLoss: `${WILL_PREFIX}.error.blockedLoss`,
  destinationRequired: `${WILL_PREFIX}.error.destinationRequired`,
  newPageNotAllowed: `${WILL_PREFIX}.error.newPageNotAllowed`,
  currentPageNotAllowed: `${WILL_PREFIX}.error.currentPageNotAllowed`,
  elementLimitExceeded: `${WILL_PREFIX}.error.elementLimitExceeded`,
};

const ERROR_KO: Record<StudioWillV1ImportErrorCode, string> = {
  aborted: "WILL v1 가져오기를 취소했습니다.",
  invalidValue: "WILL v1 {label} 값이 올바르지 않습니다.",
  elementCountMismatch: "현재 페이지 요소 수가 Studio 저장 한도와 일치하지 않습니다.",
  profileUnverified: "이 파일은 ToonStudio bounded WILL v1 공개 명세 프로필로 검증되지 않아 가져오지 않았습니다.",
  blockedLoss: "차단된 WILL v1 손실 항목을 해결한 뒤 다시 검사해 주세요.",
  destinationRequired: "WILL v1을 가져올 위치를 먼저 선택해 주세요.",
  newPageNotAllowed: "검사 시점의 프로젝트·페이지 한도 때문에 새 페이지에 WILL v1을 추가할 수 없습니다.",
  currentPageNotAllowed: "검사 시점의 페이지 요소 한도 때문에 현재 페이지에 WILL v1을 추가할 수 없습니다.",
  elementLimitExceeded: "현재 페이지에 추가하면 요소 저장 한도 {max}개를 넘습니다. 새 페이지에 추가해 주세요.",
};

const LABEL_KEYS: Record<StudioWillV1ImportLabelCode, string> = {
  canvasWidth: `${WILL_PREFIX}.label.canvasWidth`,
  documentWidth: `${WILL_PREFIX}.label.documentWidth`,
  documentHeight: `${WILL_PREFIX}.label.documentHeight`,
};

const LABEL_KO: Record<StudioWillV1ImportLabelCode, string> = {
  canvasWidth: "Studio 캔버스 폭",
  documentWidth: "문서 폭",
  documentHeight: "문서 높이",
};

/** 적응 사유 코드 — constraintsForInspection의 preview message 채널(집계자 해석). */
export type StudioWillImportConstraintCode =
  | "scaled"
  | "catmullResampled"
  | "strokeWidthMapped"
  | "pathSplit"
  | "strokeWidthScaled"
  | "skippedPaths"
  | "noDrafts"
  | "tooManyElements"
  | "pageHeightExceeded"
  | "noDestination";

const CONSTRAINT_KEYS: Record<StudioWillImportConstraintCode, string> = {
  scaled: `${WILL_PREFIX}.constraint.scaled`,
  catmullResampled: `${WILL_PREFIX}.constraint.catmullResampled`,
  strokeWidthMapped: `${WILL_PREFIX}.constraint.strokeWidthMapped`,
  pathSplit: `${WILL_PREFIX}.constraint.pathSplit`,
  strokeWidthScaled: `${WILL_PREFIX}.constraint.strokeWidthScaled`,
  skippedPaths: `${WILL_PREFIX}.constraint.skippedPaths`,
  noDrafts: `${WILL_PREFIX}.constraint.noDrafts`,
  tooManyElements: `${WILL_PREFIX}.constraint.tooManyElements`,
  pageHeightExceeded: `${WILL_PREFIX}.constraint.pageHeightExceeded`,
  noDestination: `${WILL_PREFIX}.constraint.noDestination`,
};

const CONSTRAINT_KO: Record<StudioWillImportConstraintCode, string> = {
  scaled: "문서 폭을 Studio 캔버스에 맞추기 위해 좌표와 선폭을 {scale}배로 조정합니다.",
  catmullResampled: "Catmull–Rom 곡선을 편집 가능한 Studio 자유곡선 샘플로 변환합니다.",
  strokeWidthMapped: "WILL의 점별 선폭을 Studio의 기준 굵기와 점별 필압으로 보존합니다.",
  pathSplit: "공동 편집·저장 예산을 지키기 위해 긴 경로를 {count}개 연속 요소로 나눕니다.",
  strokeWidthScaled: "Studio 지원 굵기 {min}–{max}px 범위에 맞춰 경로 내부 굵기 비율을 유지하며 균일 조정합니다.",
  skippedPaths: "Studio 안전 좌표·샘플 예산을 넘은 경로 {count}개는 적용 대상에서 제외합니다.",
  noDrafts: "Studio에서 표시할 수 있는 WILL v1 경로가 없어 가져올 수 없습니다.",
  tooManyElements: "가져온 요소 {count}개가 페이지 저장 한도 {max}개를 넘습니다.",
  pageHeightExceeded: "적용 높이 {height}px가 Studio 페이지 저장 한도 {max}px를 넘습니다.",
  noDestination: "새 페이지 저장 한도에 도달했고 현재 페이지의 요소 여유도 부족해 가져올 위치가 없습니다.",
};

const COMMIT_KEYS = {
  status: `${WILL_PREFIX}.commit.status`,
  destinationNewPage: `${WILL_PREFIX}.commit.destinationNewPage`,
  destinationCurrentPage: `${WILL_PREFIX}.commit.destinationCurrentPage`,
  warningSuffix: `${WILL_PREFIX}.commit.warningSuffix`,
} as const;

const COMMIT_KO: Record<keyof typeof COMMIT_KEYS, string> = {
  status: "WILL v1 선 {count}개를 {destination} 추가했어요.{suffix}",
  destinationNewPage: "새 페이지에",
  destinationCurrentPage: "현재 페이지 위에",
  warningSuffix: " 변환·제외 알림 {count}건을 손실 미리보기에서 확인했어요.",
};

registerI18nLocaleEntries("ko", {
  "studio.producerError.willImport.error.aborted": "WILL v1 가져오기를 취소했습니다.",
  "studio.producerError.willImport.error.invalidValue": "WILL v1 {label} 값이 올바르지 않습니다.",
  "studio.producerError.willImport.error.elementCountMismatch": "현재 페이지 요소 수가 Studio 저장 한도와 일치하지 않습니다.",
  "studio.producerError.willImport.error.profileUnverified": "이 파일은 ToonStudio bounded WILL v1 공개 명세 프로필로 검증되지 않아 가져오지 않았습니다.",
  "studio.producerError.willImport.error.blockedLoss": "차단된 WILL v1 손실 항목을 해결한 뒤 다시 검사해 주세요.",
  "studio.producerError.willImport.error.destinationRequired": "WILL v1을 가져올 위치를 먼저 선택해 주세요.",
  "studio.producerError.willImport.error.newPageNotAllowed": "검사 시점의 프로젝트·페이지 한도 때문에 새 페이지에 WILL v1을 추가할 수 없습니다.",
  "studio.producerError.willImport.error.currentPageNotAllowed": "검사 시점의 페이지 요소 한도 때문에 현재 페이지에 WILL v1을 추가할 수 없습니다.",
  "studio.producerError.willImport.error.elementLimitExceeded": "현재 페이지에 추가하면 요소 저장 한도 {max}개를 넘습니다. 새 페이지에 추가해 주세요.",
  "studio.producerError.willImport.label.canvasWidth": "Studio 캔버스 폭",
  "studio.producerError.willImport.label.documentWidth": "문서 폭",
  "studio.producerError.willImport.label.documentHeight": "문서 높이",
  "studio.producerError.willImport.constraint.scaled": "문서 폭을 Studio 캔버스에 맞추기 위해 좌표와 선폭을 {scale}배로 조정합니다.",
  "studio.producerError.willImport.constraint.catmullResampled": "Catmull–Rom 곡선을 편집 가능한 Studio 자유곡선 샘플로 변환합니다.",
  "studio.producerError.willImport.constraint.strokeWidthMapped": "WILL의 점별 선폭을 Studio의 기준 굵기와 점별 필압으로 보존합니다.",
  "studio.producerError.willImport.constraint.pathSplit": "공동 편집·저장 예산을 지키기 위해 긴 경로를 {count}개 연속 요소로 나눕니다.",
  "studio.producerError.willImport.constraint.strokeWidthScaled": "Studio 지원 굵기 {min}–{max}px 범위에 맞춰 경로 내부 굵기 비율을 유지하며 균일 조정합니다.",
  "studio.producerError.willImport.constraint.skippedPaths": "Studio 안전 좌표·샘플 예산을 넘은 경로 {count}개는 적용 대상에서 제외합니다.",
  "studio.producerError.willImport.constraint.noDrafts": "Studio에서 표시할 수 있는 WILL v1 경로가 없어 가져올 수 없습니다.",
  "studio.producerError.willImport.constraint.tooManyElements": "가져온 요소 {count}개가 페이지 저장 한도 {max}개를 넘습니다.",
  "studio.producerError.willImport.constraint.pageHeightExceeded": "적용 높이 {height}px가 Studio 페이지 저장 한도 {max}px를 넘습니다.",
  "studio.producerError.willImport.constraint.noDestination": "새 페이지 저장 한도에 도달했고 현재 페이지의 요소 여유도 부족해 가져올 위치가 없습니다.",
  "studio.producerError.willImport.commit.status": "WILL v1 선 {count}개를 {destination} 추가했어요.{suffix}",
  "studio.producerError.willImport.commit.destinationNewPage": "새 페이지에",
  "studio.producerError.willImport.commit.destinationCurrentPage": "현재 페이지 위에",
  "studio.producerError.willImport.commit.warningSuffix": " 변환·제외 알림 {count}건을 손실 미리보기에서 확인했어요.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.willImport.error.aborted": "The WILL v1 import was cancelled.",
  "studio.producerError.willImport.error.invalidValue": "The WILL v1 {label} value is invalid.",
  "studio.producerError.willImport.error.elementCountMismatch": "The current page element count doesn't match the Studio storage limit.",
  "studio.producerError.willImport.error.profileUnverified": "This file wasn't verified as the ToonStudio bounded WILL v1 public-spec profile, so it wasn't imported.",
  "studio.producerError.willImport.error.blockedLoss": "Resolve the blocked WILL v1 loss items and inspect again.",
  "studio.producerError.willImport.error.destinationRequired": "Choose where to import the WILL v1 file first.",
  "studio.producerError.willImport.error.newPageNotAllowed": "The project/page limits at inspection time don't allow adding the WILL v1 file to a new page.",
  "studio.producerError.willImport.error.currentPageNotAllowed": "The page element limit at inspection time doesn't allow adding the WILL v1 file to the current page.",
  "studio.producerError.willImport.error.elementLimitExceeded": "Adding to the current page would exceed the element storage limit of {max}. Add it to a new page instead.",
  "studio.producerError.willImport.label.canvasWidth": "Studio canvas width",
  "studio.producerError.willImport.label.documentWidth": "document width",
  "studio.producerError.willImport.label.documentHeight": "document height",
  "studio.producerError.willImport.constraint.scaled": "Coordinates and stroke widths are scaled by {scale}× to fit the document width to the Studio canvas.",
  "studio.producerError.willImport.constraint.catmullResampled": "Catmull–Rom curves are converted into editable Studio free-curve samples.",
  "studio.producerError.willImport.constraint.strokeWidthMapped": "WILL's per-point stroke widths are preserved as Studio's base thickness and per-point pressure.",
  "studio.producerError.willImport.constraint.pathSplit": "Long paths are split into {count} consecutive elements to respect the collaboration and storage budget.",
  "studio.producerError.willImport.constraint.strokeWidthScaled": "Stroke widths are uniformly scaled to the Studio-supported thickness range of {min}–{max}px while keeping the ratios inside each path.",
  "studio.producerError.willImport.constraint.skippedPaths": "{count} paths that exceed the Studio safe coordinate and sample budget are excluded from applying.",
  "studio.producerError.willImport.constraint.noDrafts": "There are no WILL v1 paths Studio can display, so it can't be imported.",
  "studio.producerError.willImport.constraint.tooManyElements": "The imported {count} elements exceed the page storage limit of {max}.",
  "studio.producerError.willImport.constraint.pageHeightExceeded": "The applied height of {height}px exceeds the Studio page storage limit of {max}px.",
  "studio.producerError.willImport.constraint.noDestination": "The new-page storage limit has been reached and the current page doesn't have enough element room either, so there's nowhere to import it.",
  "studio.producerError.willImport.commit.status": "Added {count} WILL v1 strokes {destination}.{suffix}",
  "studio.producerError.willImport.commit.destinationNewPage": "to a new page",
  "studio.producerError.willImport.commit.destinationCurrentPage": "onto the current page",
  "studio.producerError.willImport.commit.warningSuffix": " Check the {count} conversion/exclusion notices in the loss preview.",
});

/** WILL 코드 오류 하나를 표시 문구로 푼다 — {label}은 라벨 코드로 먼저 해석한다. */
export function resolveStudioWillV1ImportError(error: {
  code: StudioWillV1ImportErrorCode;
  params?: Readonly<Record<string, string>>;
}): string {
  let params = error.params;
  if (error.code === "invalidValue" && params?.label !== undefined
    && Object.hasOwn(LABEL_KEYS, params.label)) {
    const labelCode = params.label as StudioWillV1ImportLabelCode;
    params = { ...params, label: resolveWillImport(LABEL_KEYS[labelCode], LABEL_KO[labelCode]) };
  }
  return resolveWillImport(ERROR_KEYS[error.code], ERROR_KO[error.code], params);
}

/** 원인 체인에서 WILL 코드 오류를 찾아 해석한다(아니면 null — 기존 경로 유지). */
export function resolveStudioWillV1ImportErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if ((name === "StudioWillV1ImportError" || name === "AbortError")
    && typeof code === "string" && Object.hasOwn(ERROR_KEYS, code)) {
    return resolveStudioWillV1ImportError(cause as {
      code: StudioWillV1ImportErrorCode;
      params?: Readonly<Record<string, string>>;
    });
  }
  return null;
}

/** 적응 사유(집계자 예외) — preview constraint message를 현재 언어로 합성한다. */
export function resolveStudioWillImportConstraint(
  code: StudioWillImportConstraintCode,
  params?: Readonly<Record<string, string>>,
): string {
  return resolveWillImport(CONSTRAINT_KEYS[code], CONSTRAINT_KO[code], params);
}

/** 커밋 상태 문구(집계자 예외) — status.text가 문자열로 고정돼 있어 이 경계에서 합성한다. */
export function resolveStudioWillImportCommitStatus(input: {
  count: string;
  destination: "new-page" | "current-page";
  warningCount?: string;
}): string {
  const destination = resolveWillImport(
    input.destination === "new-page" ? COMMIT_KEYS.destinationNewPage : COMMIT_KEYS.destinationCurrentPage,
    input.destination === "new-page" ? COMMIT_KO.destinationNewPage : COMMIT_KO.destinationCurrentPage,
  );
  const suffix = input.warningCount !== undefined
    ? resolveWillImport(COMMIT_KEYS.warningSuffix, COMMIT_KO.warningSuffix, { count: input.warningCount })
    : "";
  return resolveWillImport(COMMIT_KEYS.status, COMMIT_KO.status, {
    count: input.count,
    destination,
    suffix,
  });
}
