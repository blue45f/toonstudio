/**
 * 투고 패키지 — 폭 기준별 용량 점검 기준을 앱에 이미 기록된 내보내기 프리셋에서 가져온다.
 *
 * 새 규정을 만들지 않는다: `studio-export-presets` 의 `EXPORT_PRESETS`(네이버 도전만화 이미지당 5MB·회차 합계 약
 * 50MB 등 "각 플랫폼 업로드·공모전 가이드에서 가져온 일반 기준값")를 그대로 읽는다. 기록된 용량 기준이 없는
 * 기준 폭(카카오·웹툰 캔버스·고화질)은 `null` — 점검이 플랫폼 용량을 건너뛴다. 이 값들은 앱에 기록된 참고값이며
 * 투고처의 현재 규정을 보증하지 않는다(화면과 표지가 그렇게 말한다).
 */
import { EXPORT_PRESETS } from "../export/studio-export-presets";

import type { SubmissionPlatformSizeLimits, SubmissionTargetWidthId } from "./submission-package-types";

/** 폭 기준 id → 내보내기 프리셋 id. 프리셋이 없는 기준은 목록에 없다. */
const PRESET_ID_BY_WIDTH_ID: Readonly<Partial<Record<SubmissionTargetWidthId, string>>> = Object.freeze({
  naver: "naver-challenge",
  kakao: "kakaopage",
  canvas: "webtoon-canvas",
});

export function submissionPlatformLimits(id: SubmissionTargetWidthId): SubmissionPlatformSizeLimits | null {
  const presetId = PRESET_ID_BY_WIDTH_ID[id];
  if (!presetId) return null;
  const preset = EXPORT_PRESETS.find((entry) => entry.id === presetId);
  if (!preset || (preset.maxFileBytes === undefined && preset.maxEpisodeBytes === undefined)) return null;
  return {
    label: preset.label,
    ...(preset.maxFileBytes !== undefined ? { maxFileBytes: preset.maxFileBytes } : {}),
    ...(preset.maxEpisodeBytes !== undefined ? { maxEpisodeBytes: preset.maxEpisodeBytes } : {}),
  };
}
