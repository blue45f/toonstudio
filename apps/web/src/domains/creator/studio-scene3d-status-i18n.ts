/**
 * scene-3d 패널 로딩·실패·빈 상태 문구 사전 (A4 잔여 3라운드 c03).
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. UI는 `t(key, fallback)`
 * 형태로 호출하므로 키가 없어도 한국어 폴백 문구가 그대로 노출된다.
 * 정본 패턴은 studio-panel-status-i18n.ts·studio-bg3d-panel-status-i18n.ts와
 * 동일하다. 대상 표면: scene-3d/StudioEmotionStagingSuggestionPanel·
 * scene-3d/StudioWebtoonPosePresetGrid.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.scene3dStatus.emotionStaging.noPoseMatch": "조건(인원·성별)에 맞는 포즈가 없어요. 표정 제안은 그대로 쓸 수 있어요.",
  "studio.scene3dStatus.posePresetGrid.exportFailed": "내보내기에 실패했습니다. 다시 시도해 주세요.",
  "studio.scene3dStatus.posePresetGrid.fileReadFailed": "파일을 읽지 못했습니다. 다시 시도해 주세요.",
  "studio.scene3dStatus.posePresetGrid.noMatchingPoses": "조건에 맞는 포즈가 없습니다. 필터나 검색어를 바꿔 보세요.",
});

registerI18nLocaleEntries("en", {
  "studio.scene3dStatus.emotionStaging.noPoseMatch": "No pose matches the conditions (figures · gender). You can still use the expression suggestions.",
  "studio.scene3dStatus.posePresetGrid.exportFailed": "Export failed. Try again.",
  "studio.scene3dStatus.posePresetGrid.fileReadFailed": "Could not read the file. Try again.",
  "studio.scene3dStatus.posePresetGrid.noMatchingPoses": "No poses match the conditions. Try different filters or a different search term.",
});
