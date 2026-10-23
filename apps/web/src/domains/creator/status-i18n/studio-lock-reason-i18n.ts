/**
 * 잠금 사유 문구 사전 (A4 설계 D3 구현 — 모듈 상수 → 호출 시점 리졸버 전환).
 *
 * 설계 정본: r7-design-first.md D3. 모듈 상수는 모듈 평가 시점에 문자열이
 * 고정돼 렌더·반환 시점의 로케일을 반영할 수 없으므로, 상수 3종
 * (StudioLeftToolRail의 REVIEW_LOCK_REASON·IMAGE_EDIT_LOCK_REASON·
 * RASTER_RETOUCH_AUTO_TARGET_UNAVAILABLE_REASON)과 동종 모듈 상수인
 * useCharacterShaperBinding의 PREVIEW_LOCK_REASON을 이 모듈의 리졸버
 * 함수로 교체한다. 표시 문구 자체는 바꾸지 않는다 — ko 값은 이관 전
 * 원문 그대로, en은 충실 번역이며, 호출 지점에서는 ko 원문을 폴백으로
 * 함께 넘겨 등록 모듈이 로드되지 않은 표면에서도 원문이 깨지지 않는다.
 *
 * 네임스페이스 (전용 분리): `studio.lockReason.*` — 잠금·사용 불가 사유.
 * `RASTER_RETOUCH_AUTO_TARGET_GUIDANCE`(= STUDIO_RETOUCH_EDITABLE_COPY_NOTE)
 * 별칭은 원본 소유 모듈(studio-retouch-help)의 방침이 함께 필요해 이번
 * 전환 범위 밖이며, StudioLeftToolRail에 별칭이 그대로 남아 있다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.lockReason.reviewSurface": "현재 작업면의 검토 잠금을 먼저 해제하세요.",
  "studio.lockReason.imageEdit": "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요.",
  "studio.lockReason.rasterRetouchAutoTargetUnavailable": "편집 가능한 이미지도, 편집용 이미지 복사본을 자동 준비할 벡터 선·도형도 없습니다.",
  "studio.lockReason.shaperPreview": "미리보기 후보를 확정하거나 닫은 뒤에 다른 편집을 할 수 있습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.lockReason.reviewSurface": "Release the review lock on the current work surface first.",
  "studio.lockReason.imageEdit": "Release the edit lock on the selected image layer first.",
  "studio.lockReason.rasterRetouchAutoTargetUnavailable": "There is no editable image, and no vector line or shape from which an editing image copy can be prepared automatically.",
  "studio.lockReason.shaperPreview": "Confirm or close the preview candidate before making other edits.",
});

/**
 * 잠금 사유 해석 헬퍼 (frozen 계열 `*Text` 헬퍼와 동일 규약).
 * 키가 사전에 없으면 koFallback을 그대로 돌려준다.
 */
export function lockReasonText(key: string, koFallback: string): string {
  return resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, koFallback);
}

/** 구 REVIEW_LOCK_REASON (StudioLeftToolRail) — 작업면 검토 잠금 사유. */
export function reviewLockReason(): string {
  return lockReasonText(
    "studio.lockReason.reviewSurface",
    "현재 작업면의 검토 잠금을 먼저 해제하세요.",
  );
}

/** 구 IMAGE_EDIT_LOCK_REASON (StudioLeftToolRail) — 이미지 레이어 편집 잠금 사유. */
export function imageEditLockReason(): string {
  return lockReasonText(
    "studio.lockReason.imageEdit",
    "선택한 이미지 레이어의 편집 잠금을 먼저 해제하세요.",
  );
}

/** 구 RASTER_RETOUCH_AUTO_TARGET_UNAVAILABLE_REASON (StudioLeftToolRail) — 리터치 자동 대상 없음 사유. */
export function rasterRetouchAutoTargetUnavailableReason(): string {
  return lockReasonText(
    "studio.lockReason.rasterRetouchAutoTargetUnavailable",
    "편집 가능한 이미지도, 편집용 이미지 복사본을 자동 준비할 벡터 선·도형도 없습니다.",
  );
}

/** 구 PREVIEW_LOCK_REASON (useCharacterShaperBinding) — 미리보기 확정 전 편집 불가 사유. */
export function shaperPreviewLockReason(): string {
  return lockReasonText(
    "studio.lockReason.shaperPreview",
    "미리보기 후보를 확정하거나 닫은 뒤에 다른 편집을 할 수 있습니다.",
  );
}
