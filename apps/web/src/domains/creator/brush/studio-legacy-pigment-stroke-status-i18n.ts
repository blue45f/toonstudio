import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

registerI18nLocaleEntries("ko", {
  "studio.legacyPigment.title": "이전 혼색 획 확인",
  "studio.legacyPigment.explanation": "이 원고에는 예전 Mixbox로 그린 획이 있습니다. 색이 조용히 바뀌지 않도록 해당 획의 재생·내보내기를 멈췄습니다. 자체 혼색 사본은 색이 달라질 수 있습니다. 전환하면 이전 획은 숨긴 원본으로 남습니다.",
  "studio.legacyPigment.undo": "전환한 획의 레이어 위치·클리핑·애니메이션은 유지합니다. 이전 데이터는 별도 숨김 그룹에 보관하며, 한 번의 실행 취소로 전환 전체를 되돌릴 수 있습니다.",
  "studio.legacyPigment.master": "마스터에 있는 획은 마스터 편집에서 확인하세요. 마스터 변경은 실행 취소 기록에 포함되지 않으며, 숨긴 원본 획은 레이어에서 보관합니다.",
  "studio.legacyPigment.reviewMaster": "마스터 편집에서 확인",
  "studio.legacyPigment.download": "원본 파일 내려받기",
  "studio.legacyPigment.copy": "원본 보존·자체 혼색 사본 만들기",
  "studio.legacyPigment.stale": "그림이 변경됐습니다. 현재 페이지에서 다시 확인해 주세요.",
  "studio.legacyPigment.denied": "현재 편집 권한으로 전환할 수 없습니다. 원본은 유지됩니다.",
  "studio.legacyPigment.failed": "자체 혼색 사본을 만들지 못했습니다. 원본은 유지됩니다.",
});
registerI18nLocaleEntries("en", {
  "studio.legacyPigment.title": "Review earlier pigment strokes",
  "studio.legacyPigment.explanation": "This page contains strokes painted with the former Mixbox engine. Replay and export of these strokes are paused to prevent silent color changes. Copies using the internal pigment engine may look different. Conversion keeps the original strokes hidden.",
  "studio.legacyPigment.undo": "Converted strokes keep their layer order, clipping and animation. Earlier data stays in a separate hidden group. One undo step restores the whole page conversion.",
  "studio.legacyPigment.master": "Review master strokes in master editing mode. Master changes do not enter undo history; the hidden original strokes remain in the layer list.",
  "studio.legacyPigment.reviewMaster": "Review in master editing mode",
  "studio.legacyPigment.download": "Download the original file",
  "studio.legacyPigment.copy": "Keep originals and create internal pigment copies",
  "studio.legacyPigment.stale": "The artwork changed. Review the current page again.",
  "studio.legacyPigment.denied": "Your current editing permissions do not allow conversion. Originals are unchanged.",
  "studio.legacyPigment.failed": "Could not create pigment copies. Originals are unchanged.",
});
