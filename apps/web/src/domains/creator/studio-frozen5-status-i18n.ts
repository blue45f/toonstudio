/**
 * 파일 크기 래칫 동결 패널 상태 문구 사전 5 (A4 cat4 동결 tsx 꼬리 이관 — frozen5).
 *
 * 소비 파일이 전부 래칫 기준선과 동률이라 순증이 불가능하므로, 문구는 이
 * 모듈로 이관하고 소비 파일에서는 import 1줄 증가분을 같은 파일 안의 다중행
 * 템플릿·호출·삼항 접기와 중복 문구 키 통합으로 상쇄해 줄 수를 중립(±0 이하)으로
 * 맞춘다. 3~6라운드 모듈(studio-frozen-status-i18n.ts,
 * studio-frozen2-status-i18n.ts, studio-frozen3-status-i18n.ts,
 * studio-frozen4-status-i18n.ts)은 각 테스트가 전 키의 소비 파일을 단언해
 * 확장이 불가능하므로 형제 모듈로 분리했다.
 *
 * `registerI18nLocaleEntries`로 ko/en 키를 등록한다. ko 값은 이관 전 원문
 * 그대로, en은 신규 번역이며 두 로케일의 키 집합은 항상 일치해야 한다
 * (studio-frozen5-status-i18n-r6frz5.test.ts가 패리티를 고정한다). 상태 문구
 * (로딩·실패·성공·빈 상태·확인 중·사용 불가 사유·잡혀서 표시되는 throw·콜백·
 * aria-live 공지)만 다루며, 콘텐츠 본문·폼 라벨·placeholder·예시 데이터는
 * 대상이 아니다. 비컴포넌트 생산자(throw·콜백)도 있어 현재 로케일로 해석하는
 * `frozenStatus5Text` 헬퍼를 함께 둔다 (studio-frozen-status-i18n 선례).
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";


// ── StudioCharacterBiblePanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.bible.relationSaveFailed": "관계를 저장하지 못했어요.",
  "studio.frozenStatus5.bible.saveFailed": "캐릭터 바이블을 저장하지 못했어요.",
  "studio.frozenStatus5.bible.addFailed": "캐릭터를 추가하지 못했어요.",
  "studio.frozenStatus5.bible.relationsEmpty": "아직 등록된 관계가 없어요. 아래에서 첫 관계를 추가하세요.",
  "studio.frozenStatus5.bible.mapEmpty": "관계를 추가하면 이곳에 관계 맵이 그려집니다.",
  "studio.frozenStatus5.bible.charactersEmpty": "등장인물을 먼저 추가하세요",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.bible.relationSaveFailed": "Could not save the relationship.",
  "studio.frozenStatus5.bible.saveFailed": "Could not save the character bible.",
  "studio.frozenStatus5.bible.addFailed": "Could not add the character.",
  "studio.frozenStatus5.bible.relationsEmpty": "No relationships registered yet. Add your first relationship below.",
  "studio.frozenStatus5.bible.mapEmpty": "Add a relationship and the relationship map will be drawn here.",
  "studio.frozenStatus5.bible.charactersEmpty": "Add a character first",
});

// ── StudioPromisePayoffLedgerPanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.promise.saveFailed": "약속 원장을 저장하지 못했어요.",
  "studio.frozenStatus5.promise.addFailed": "약속을 추가하지 못했어요.",
  "studio.frozenStatus5.promise.episodeChangeFailed": "현재 회차를 바꾸지 못했어요.",
  "studio.frozenStatus5.promise.emptyFirst": "첫 약속을 실제 컷과 연결하세요",
  "studio.frozenStatus5.promise.emptyNoMatch": "조건에 맞는 약속이 없어요",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.promise.saveFailed": "Could not save the promise ledger.",
  "studio.frozenStatus5.promise.addFailed": "Could not add the promise.",
  "studio.frozenStatus5.promise.episodeChangeFailed": "Could not change the current episode.",
  "studio.frozenStatus5.promise.emptyFirst": "Connect your first promise to an actual cut",
  "studio.frozenStatus5.promise.emptyNoMatch": "No promises match the conditions",
});

// ── StudioWriterRoomPanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.writer.emptyBeatLink": "비트 단계에서 항목을 만들면 이 장면에 연결할 수 있어요.",
  "studio.frozenStatus5.writer.charactersEmptyGuide": "캐릭터 바이블에 등장인물을 먼저 등록하세요.",
  "studio.frozenStatus5.writer.budgetExceeded": "Writer Room 문서가 2,000,000바이트 저장 예산을 초과해 변경하지 않았어요.",
  "studio.frozenStatus5.writer.unreadable": "Writer Room 변경을 안전하게 읽을 수 없어 기존 문서를 유지했어요.",
  "studio.frozenStatus5.writer.saveFailed": "Writer Room 변경을 저장하지 못했어요.",
  "studio.frozenStatus5.writer.aiFailed": "AI 제안을 받지 못했어요.",
  "studio.frozenStatus5.writer.stageToggleFailed": "단계 완료 상태를 바꾸지 못했어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.writer.emptyBeatLink": "Create an item in the beat stage to link it to this scene.",
  "studio.frozenStatus5.writer.charactersEmptyGuide": "Register characters in the character bible first.",
  "studio.frozenStatus5.writer.budgetExceeded": "The Writer Room document exceeds the 2,000,000-byte storage budget, so nothing was changed.",
  "studio.frozenStatus5.writer.unreadable": "The Writer Room changes could not be read safely, so the existing document was kept.",
  "studio.frozenStatus5.writer.saveFailed": "Could not save the Writer Room changes.",
  "studio.frozenStatus5.writer.aiFailed": "Could not get AI suggestions.",
  "studio.frozenStatus5.writer.stageToggleFailed": "Could not change the stage completion state.",
});

// ── StudioBrushStudio
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.brushStudio.tipImporting": "펜촉 변환 중…",
  "studio.frozenStatus5.brushStudio.restoreGuidance": "가져온 브러시는 저장된 브러시 라이브러리에서 다시 적용해 원본 설정으로 돌아갈 수 있습니다.",
  "studio.frozenStatus5.brushStudio.restoreProfileNotFound": "이 브러시의 검증된 기본 프로필을 찾지 못했습니다.",
  "studio.frozenStatus5.brushStudio.restoreLoadFailed": "기본 프로필을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  "studio.frozenStatus5.brushStudio.engineToolsLoading": "엔진 시험 도구를 불러오는 중…",
  "studio.frozenStatus5.brushStudio.restoringDefaults": "기본값 불러오는 중",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.brushStudio.tipImporting": "Converting brush tip…",
  "studio.frozenStatus5.brushStudio.restoreGuidance": "An imported brush can be reapplied from the saved brush library to return to its original settings.",
  "studio.frozenStatus5.brushStudio.restoreProfileNotFound": "Could not find a verified default profile for this brush.",
  "studio.frozenStatus5.brushStudio.restoreLoadFailed": "Could not load the default profile. Please try again shortly.",
  "studio.frozenStatus5.brushStudio.engineToolsLoading": "Loading engine test tools…",
  "studio.frozenStatus5.brushStudio.restoringDefaults": "Loading defaults",
});

// ── StudioLazyPanelStack
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.lazy.referenceLoadingLabel": "레퍼런스 캔버스 불러오는 중",
  "studio.frozenStatus5.lazy.referenceLoadingText": "자유 보드와 저장된 배치를 준비하고 있어요…",
  "studio.frozenStatus5.lazy.loading": "불러오는 중…",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.lazy.referenceLoadingLabel": "Loading reference canvas",
  "studio.frozenStatus5.lazy.referenceLoadingText": "Preparing the free board and saved layout…",
  "studio.frozenStatus5.lazy.loading": "Loading…",
});

// ── StudioVrmPoserViewport
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.vrmViewport.undoPaintLocked": "표면 페인트 획을 마친 뒤 실행 취소할 수 있습니다.",
  "studio.frozenStatus5.vrmViewport.undoUnavailable": "되돌릴 캐릭터 변경이 없습니다.",
  "studio.frozenStatus5.vrmViewport.redoPaintLocked": "표면 페인트 획을 마친 뒤 다시 실행할 수 있습니다.",
  "studio.frozenStatus5.vrmViewport.redoUnavailable": "다시 적용할 캐릭터 변경이 없습니다.",
  "studio.frozenStatus5.vrmViewport.loading": "VRM을 불러오는 중입니다.",
  "studio.frozenStatus5.vrmViewport.loadFailed": "불러오기에 실패했습니다.",
  "studio.frozenStatus5.vrmViewport.loadFailedDetail": "파일 형식 또는 경로를 확인해 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.vrmViewport.undoPaintLocked": "Finish the surface paint stroke before undoing.",
  "studio.frozenStatus5.vrmViewport.undoUnavailable": "There are no character changes to undo.",
  "studio.frozenStatus5.vrmViewport.redoPaintLocked": "Finish the surface paint stroke before redoing.",
  "studio.frozenStatus5.vrmViewport.redoUnavailable": "There are no character changes to redo.",
  "studio.frozenStatus5.vrmViewport.loading": "Loading the VRM.",
  "studio.frozenStatus5.vrmViewport.loadFailed": "Loading failed.",
  "studio.frozenStatus5.vrmViewport.loadFailedDetail": "Check the file format or path.",
});

// ── StudioBg3dEditorViewport
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.bg3dViewport.undoUnavailable": "되돌릴 3D 장면 변경이 없습니다.",
  "studio.frozenStatus5.bg3dViewport.redoUnavailable": "다시 적용할 3D 장면 변경이 없습니다.",
  "studio.frozenStatus5.bg3dViewport.turntableLoading": "턴테이블 컨트롤을 불러오는 중입니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.bg3dViewport.undoUnavailable": "There are no 3D scene changes to undo.",
  "studio.frozenStatus5.bg3dViewport.redoUnavailable": "There are no 3D scene changes to redo.",
  "studio.frozenStatus5.bg3dViewport.turntableLoading": "Loading turntable controls.",
});

// ── ProductionRoleWorkspace
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.role.transitionFailed": "작업 상태를 변경하지 못했습니다.",
  "studio.frozenStatus5.role.taskNotFound": "작업을 찾을 수 없음",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.role.transitionFailed": "Could not change the task status.",
  "studio.frozenStatus5.role.taskNotFound": "Task not found",
});

// ── StudioLift3dPage
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.lift.decodeFailed": "이미지를 여는 중 문제가 생겼습니다. 다른 파일로 다시 시도해 주세요.",
  "studio.frozenStatus5.lift.convertFailedWithDetail": "변환 중 문제가 생겼습니다: {detail}",
  "studio.frozenStatus5.lift.convertFailedUnknown": "변환 중 알 수 없는 문제가 생겼습니다. 해상도를 낮춰 다시 시도해 주세요.",
  "studio.frozenStatus5.lift.libraryRegisteredStale": "{prefix}등록했습니다. 지금 화면의 설정으로는 다시 등록해 주세요.",
  "studio.frozenStatus5.lift.libraryRegistered": "배경 3D 편집기의 모델 목록에 등록했습니다.",
  "studio.frozenStatus5.lift.libraryOpenFailed": "3D 모델 라이브러리를 열 수 없습니다. 대신 GLB 파일로 저장해 주세요.",
  "studio.frozenStatus5.lift.previewUnavailable": "원화 미리보기를 사용할 수 없습니다.",
  "studio.frozenStatus5.lift.converting": "변환하는 중입니다...",
  "studio.frozenStatus5.lift.noResultYet": "아직 변환 결과가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.lift.decodeFailed": "Something went wrong while opening the image. Please try again with a different file.",
  "studio.frozenStatus5.lift.convertFailedWithDetail": "Something went wrong during conversion: {detail}",
  "studio.frozenStatus5.lift.convertFailedUnknown": "An unknown problem occurred during conversion. Lower the resolution and try again.",
  "studio.frozenStatus5.lift.libraryRegisteredStale": "{prefix}Registered. Register again with the settings currently on screen.",
  "studio.frozenStatus5.lift.libraryRegistered": "Registered in the background 3D editor's model list.",
  "studio.frozenStatus5.lift.libraryOpenFailed": "Could not open the 3D model library. Save the file as GLB instead.",
  "studio.frozenStatus5.lift.previewUnavailable": "The source preview is unavailable.",
  "studio.frozenStatus5.lift.converting": "Converting...",
  "studio.frozenStatus5.lift.noResultYet": "No conversion result yet.",
});

// ── StudioToonAutomationWorkspace
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.automation.reviewDone": "자연스러운 호흡으로 음성 검수를 마쳤습니다.",
  "studio.frozenStatus5.automation.reviewPlayFailed": "이 브라우저에서 음성 검수를 재생하지 못했습니다.",
  "studio.frozenStatus5.automation.reviewUnavailable": "이 브라우저에서는 음성 검수를 사용할 수 없습니다.",
  "studio.frozenStatus5.automation.charactersEmpty": "등록된 캐릭터가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.automation.reviewDone": "Finished the voice review with a natural breathing pace.",
  "studio.frozenStatus5.automation.reviewPlayFailed": "Could not play the voice review in this browser.",
  "studio.frozenStatus5.automation.reviewUnavailable": "Voice review is not available in this browser.",
  "studio.frozenStatus5.automation.charactersEmpty": "No characters registered.",
});

// ── StudioVrmAvatarForgePanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.forge.rigPaused": "리그를 안전한 상태로 확인할 때까지 아바타 조형을 잠시 중단했습니다. {reason}",
  "studio.frozenStatus5.forge.rigUnsupported": "이 모델은 리그 안전 체형 편집을 사용할 수 없습니다. {reason} 헤어·얼굴 편집은 계속 사용할 수 있어요.",
  "studio.frozenStatus5.forge.faceProfileFallback": "모델을 불러오면 native morph와 적응형 얼굴 메시를 함께 검사합니다.",
  "studio.frozenStatus5.forge.generating": "생성 중…",
  "studio.frozenStatus5.forge.stylesEmpty": "검색 조건과 일치하는 스타일이 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.forge.rigPaused": "Avatar shaping is paused until the rig can be verified as safe. {reason}",
  "studio.frozenStatus5.forge.rigUnsupported": "This model cannot use rig-safe body editing. {reason} Hair and face editing remain available.",
  "studio.frozenStatus5.forge.faceProfileFallback": "Load a model to inspect its native morphs and adaptive face mesh together.",
  "studio.frozenStatus5.forge.generating": "Generating…",
  "studio.frozenStatus5.forge.stylesEmpty": "No styles match the search conditions.",
});

// ── StudioVrmPhotoPoseScanner
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.photoPose.recognizeFailed": "사진 포즈를 인식하지 못했습니다.",
  "studio.frozenStatus5.photoPose.applyFailed": "포즈를 캐릭터에 적용하지 못했습니다. 다시 시도해 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.photoPose.recognizeFailed": "Could not recognize the photo pose.",
  "studio.frozenStatus5.photoPose.applyFailed": "Could not apply the pose to the character. Please try again.",
});

// ── StudioLayerLiftDialog
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.liftLayer.recompositing": "보정 경계를 다시 합성하는 중…",
  "studio.frozenStatus5.liftLayer.analyzingGeneral": "일반 피사체 경계를 찾고 있어요",
  "studio.frozenStatus5.liftLayer.analyzingPerson": "인물·캐릭터 경계를 찾고 있어요",
  "studio.frozenStatus5.liftLayer.analyzeFailed": "분석을 완료하지 못했습니다",
  "studio.frozenStatus5.liftLayer.readyToAnalyze": "분석 준비 완료",
  "studio.frozenStatus5.liftLayer.firstRunSlow": "첫 실행은 로컬 모델을 준비하느라 조금 더 걸릴 수 있습니다.",
  "studio.frozenStatus5.liftLayer.startOnRight": "오른쪽에서 분석을 시작해 주세요.",
  "studio.frozenStatus5.liftLayer.analyzingOnDevice": "기기에서 분석 중",
  "studio.frozenStatus5.liftLayer.applyingGroup": "레이어 그룹 적용 중",
  "studio.frozenStatus5.liftLayer.recheckNeeded": "다시 확인이 필요해요",
  "studio.frozenStatus5.liftLayer.readyShort": "분석 준비",
  "studio.frozenStatus5.liftLayer.retryAfterCheck": "이미지와 모델 상태를 확인한 뒤 다시 분석해 주세요.",
  "studio.frozenStatus5.liftLayer.mutationLockedFallback": "현재 문서 상태에서는 결과를 적용할 수 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.liftLayer.recompositing": "Recompositing the corrected boundary…",
  "studio.frozenStatus5.liftLayer.analyzingGeneral": "Finding the general subject boundary",
  "studio.frozenStatus5.liftLayer.analyzingPerson": "Finding the person/character boundary",
  "studio.frozenStatus5.liftLayer.analyzeFailed": "Could not complete the analysis",
  "studio.frozenStatus5.liftLayer.readyToAnalyze": "Ready to analyze",
  "studio.frozenStatus5.liftLayer.firstRunSlow": "The first run may take a little longer while the local model is prepared.",
  "studio.frozenStatus5.liftLayer.startOnRight": "Start the analysis on the right.",
  "studio.frozenStatus5.liftLayer.analyzingOnDevice": "Analyzing on this device",
  "studio.frozenStatus5.liftLayer.applyingGroup": "Applying the layer group",
  "studio.frozenStatus5.liftLayer.recheckNeeded": "Needs another check",
  "studio.frozenStatus5.liftLayer.readyShort": "Ready to analyze",
  "studio.frozenStatus5.liftLayer.retryAfterCheck": "Check the image and model state, then analyze again.",
  "studio.frozenStatus5.liftLayer.mutationLockedFallback": "The result cannot be applied in the current document state.",
});

// ── StudioLiveCanvasOverlay
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.live.movingGuide": "댓글 위치 이동 중입니다. 손가락이나 포인터를 놓으면 저장합니다.",
  "studio.frozenStatus5.live.moved": "댓글 위치를 옮겼습니다.",
  "studio.frozenStatus5.live.moveCanceled": "댓글 위치 이동을 취소했습니다.",
  "studio.frozenStatus5.live.movedLarge": "댓글 위치를 크게 옮겼습니다.",
  "studio.frozenStatus5.live.movedSmall": "댓글 위치를 조금 옮겼습니다.",
  "studio.frozenStatus5.live.moveFailed": "댓글 위치를 옮길 수 없습니다. {reason}",
  "studio.frozenStatus5.live.noPermission": "이 댓글 위치를 옮길 권한이 없어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.live.movingGuide": "Moving the comment position. Release your finger or pointer to save.",
  "studio.frozenStatus5.live.moved": "Moved the comment position.",
  "studio.frozenStatus5.live.moveCanceled": "Canceled moving the comment position.",
  "studio.frozenStatus5.live.movedLarge": "Moved the comment position a lot.",
  "studio.frozenStatus5.live.movedSmall": "Moved the comment position a little.",
  "studio.frozenStatus5.live.moveFailed": "Could not move the comment position. {reason}",
  "studio.frozenStatus5.live.noPermission": "You do not have permission to move this comment position.",
});

// ── StudioProjectCenterSearch
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.search.fileControlLoading": "파일 제어 센터를 불러오는 중…",
  "studio.frozenStatus5.search.actionUnavailable": "{label}은 현재 프로젝트 상태에서 사용할 수 없습니다.",
  "studio.frozenStatus5.search.actionExecuted": "{label} 실행",
  "studio.frozenStatus5.search.emptyNoMatch": "일치하는 프로젝트 도구가 없습니다",
  "studio.frozenStatus5.search.emptyFavorites": "즐겨찾기한 프로젝트 도구가 없습니다",
  "studio.frozenStatus5.search.emptyRecent": "최근 실행한 프로젝트 도구가 없습니다",
  "studio.frozenStatus5.search.emptyNoMatchHint": "백업, archive, 검수, publish, 버전처럼 작업 목적을 입력해 보세요.",
  "studio.frozenStatus5.search.emptyFavoritesHint": "검색 결과의 별 버튼으로 반복 작업을 고정할 수 있습니다.",
  "studio.frozenStatus5.search.emptyRecentHint": "프로젝트 도구를 실행하면 이 기기의 최근 목록에 기록됩니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.search.fileControlLoading": "Loading the file control center…",
  "studio.frozenStatus5.search.actionUnavailable": "{label} is not available in the current project state.",
  "studio.frozenStatus5.search.actionExecuted": "Ran {label}",
  "studio.frozenStatus5.search.emptyNoMatch": "No project tools match",
  "studio.frozenStatus5.search.emptyFavorites": "No favorite project tools",
  "studio.frozenStatus5.search.emptyRecent": "No recently run project tools",
  "studio.frozenStatus5.search.emptyNoMatchHint": "Try a work purpose such as backup, archive, review, publish, or version.",
  "studio.frozenStatus5.search.emptyFavoritesHint": "Use the star button on a search result to pin repeated work.",
  "studio.frozenStatus5.search.emptyRecentHint": "Run a project tool and it will be recorded in this device's recent list.",
});

// ── StudioBrushLibrarySheet
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.brushSheet.profileNotFound": "브러시 프로필을 찾을 수 없습니다.",
  "studio.frozenStatus5.brushSheet.loadFailed": "브러시를 불러오지 못했습니다. 다시 시도해 주세요.",
  "studio.frozenStatus5.brushSheet.searchingAll": "재질 분류와 관계없이 전체 {count}종에서 검색 중",
  "studio.frozenStatus5.brushSheet.emptyFavorites": "즐겨찾기한 {label}가 없어요. ☆로 추가해 보세요.",
  "studio.frozenStatus5.brushSheet.emptyRecent": "최근 사용한 {label}가 아직 없어요.",
  "studio.frozenStatus5.brushSheet.emptySearch": "검색 결과가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.brushSheet.profileNotFound": "Could not find the brush profile.",
  "studio.frozenStatus5.brushSheet.loadFailed": "Could not load the brush. Please try again.",
  "studio.frozenStatus5.brushSheet.searchingAll": "Searching all {count} types regardless of material category",
  "studio.frozenStatus5.brushSheet.emptyFavorites": "No favorite {label} yet. Add one with a star.",
  "studio.frozenStatus5.brushSheet.emptyRecent": "No recently used {label} yet.",
  "studio.frozenStatus5.brushSheet.emptySearch": "No search results.",
});

// ── StudioCompanionAssistantDisplay
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.assistant.colorCopied": "색상 코드를 복사했습니다",
  "studio.frozenStatus5.assistant.colorCopyFailed": "색상 코드 복사에 실패했습니다",
  "studio.frozenStatus5.assistant.sfxSearchEmpty": "검색 결과가 없습니다",
  "studio.frozenStatus5.assistant.noWarnings": "현재 입력에서는 긴 공백·과밀 경고가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.assistant.colorCopied": "Copied the color code",
  "studio.frozenStatus5.assistant.colorCopyFailed": "Could not copy the color code",
  "studio.frozenStatus5.assistant.sfxSearchEmpty": "No search results",
  "studio.frozenStatus5.assistant.noWarnings": "No long-gap or overcrowding warnings for the current input.",
});

// ── StudioCompanionReferenceDisplay
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.refState.disconnectedTitle": "기본 스튜디오 연결이 끊겼습니다",
  "studio.frozenStatus5.refState.disconnectedDetail": "편집 탭을 다시 열거나 이 창을 새로 연결해 주세요.",
  "studio.frozenStatus5.refState.reconnectingTitle": "기본 스튜디오에 다시 연결하는 중",
  "studio.frozenStatus5.refState.reconnectingDetail": "마지막 합성본은 유지하고 새 입력은 잠시 막았습니다.",
  "studio.frozenStatus5.refState.emptyTitle": "레퍼런스가 아직 없습니다",
  "studio.frozenStatus5.refState.emptyDetail": "기본 스튜디오의 레퍼런스 캔버스에 이미지를 추가하면 여기에 표시됩니다.",
  "studio.frozenStatus5.refState.unavailableTitle": "표시할 수 있는 레퍼런스가 없습니다",
  "studio.frozenStatus5.refState.unavailableDetail": "불러오지 못한 항목을 기본 스튜디오에서 확인해 주세요.",
  "studio.frozenStatus5.refState.partialTitle": "일부 레퍼런스만 표시 중",
  "studio.frozenStatus5.refState.partialDetail": "사용 가능한 항목으로 합성본을 만들었습니다.",
  "studio.frozenStatus5.refState.loadingTitle": "레퍼런스 미리보기를 준비하고 있어요",
  "studio.frozenStatus5.refState.loadingDetail": "편집을 막지 않도록 안전한 합성본을 만드는 중입니다.",
  "studio.frozenStatus5.refState.readyTitle": "레퍼런스 캔버스가 최신 상태입니다",
  "studio.frozenStatus5.refState.readyDetail": "스포이드로 합성본의 색을 기본 스튜디오에 보낼 수 있습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.refState.disconnectedTitle": "Disconnected from the main studio",
  "studio.frozenStatus5.refState.disconnectedDetail": "Reopen the editing tab or reconnect this window.",
  "studio.frozenStatus5.refState.reconnectingTitle": "Reconnecting to the main studio",
  "studio.frozenStatus5.refState.reconnectingDetail": "The last composite is kept and new input is briefly blocked.",
  "studio.frozenStatus5.refState.emptyTitle": "No references yet",
  "studio.frozenStatus5.refState.emptyDetail": "Add an image to the reference canvas in the main studio and it will appear here.",
  "studio.frozenStatus5.refState.unavailableTitle": "No references can be displayed",
  "studio.frozenStatus5.refState.unavailableDetail": "Check the items that could not be loaded in the main studio.",
  "studio.frozenStatus5.refState.partialTitle": "Showing only some references",
  "studio.frozenStatus5.refState.partialDetail": "A composite was made from the available items.",
  "studio.frozenStatus5.refState.loadingTitle": "Preparing the reference preview",
  "studio.frozenStatus5.refState.loadingDetail": "Building a safe composite without blocking editing.",
  "studio.frozenStatus5.refState.readyTitle": "The reference canvas is up to date",
  "studio.frozenStatus5.refState.readyDetail": "Use the eyedropper to send a color from the composite to the main studio.",
});

// ── StudioAnimTimelinePanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.anim.layersEmpty": "이 페이지에는 아직 레이어가 없어요.",
  "studio.frozenStatus5.anim.cellsEmpty": "아직 키프레임이 없어 도출할 셀이 없어요. 키프레임을 추가하면 노출 구간이 표로 펼쳐져요.",
  "studio.frozenStatus5.anim.noKeyframeToDelete": "삭제할 키프레임이 없어요",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.anim.layersEmpty": "This page has no layers yet.",
  "studio.frozenStatus5.anim.cellsEmpty": "There are no keyframes yet, so no cells can be derived. Add a keyframe and the exposure ranges will spread out as a table.",
  "studio.frozenStatus5.anim.noKeyframeToDelete": "No keyframe to delete",
});

// ── StudioQuickAccessPalette
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.quick.setEmpty": "이 세트가 비어 있어요",
  "studio.frozenStatus5.quick.noMatchingCommands": "일치하는 추가 명령이 없어요.",
  "studio.frozenStatus5.quick.allCommandsIncluded": "모든 등록 명령이 현재 세트에 있어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.quick.setEmpty": "This set is empty",
  "studio.frozenStatus5.quick.noMatchingCommands": "No additional commands match.",
  "studio.frozenStatus5.quick.allCommandsIncluded": "All registered commands are already in the current set.",
});

// ── StudioGuidedHelpDialog
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.guidedHelp.notFound": "작성형 가이드에서 찾지 못했습니다",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.guidedHelp.notFound": "Not found in the written guides",
});

// ── StudioContextHelpDialog
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.contextHelp.toolUnknown": "현재 도구를 확인할 수 없습니다",
  "studio.frozenStatus5.contextHelp.guideInPreparation": "핵심 도구 가이드를 준비 중입니다",
  "studio.frozenStatus5.contextHelp.noRecipes": "일치하는 해결 레시피가 없습니다",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.contextHelp.toolUnknown": "Cannot identify the current tool",
  "studio.frozenStatus5.contextHelp.guideInPreparation": "Core tool guides are being prepared",
  "studio.frozenStatus5.contextHelp.noRecipes": "No matching solution recipes",
});

// ── StudioCuttoonEditorChrome
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.cuttoon.accountChecking": "계정 설치 확인 중…",
  "studio.frozenStatus5.cuttoon.sharedDocOpenFailed": "공동 문서를 열지 못했어요",
  "studio.frozenStatus5.cuttoon.sharedDocCheckingPermission": "공동 문서 권한을 확인하고 있어요",
  "studio.frozenStatus5.cuttoon.syncingOperations": "동시 편집 연산 동기화 중",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.cuttoon.accountChecking": "Checking account installation…",
  "studio.frozenStatus5.cuttoon.sharedDocOpenFailed": "Could not open the shared document",
  "studio.frozenStatus5.cuttoon.sharedDocCheckingPermission": "Checking shared document permissions",
  "studio.frozenStatus5.cuttoon.syncingOperations": "Syncing simultaneous editing operations",
});

// ── StudioQuickComicWizard
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.quickComic.readabilityOk": "추가로 확인할 가독성 문제가 없습니다.",
  "studio.frozenStatus5.quickComic.layoutLoadFailed": "선택한 구성을 읽지 못했습니다. 이전 단계에서 레이아웃을 다시 골라 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.quickComic.readabilityOk": "No more readability issues to check.",
  "studio.frozenStatus5.quickComic.layoutLoadFailed": "Couldn't read the selected layout. Please choose a layout again in the previous step.",
});

// ── StudioAiSuperSuiteModal
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.superSuite.clipboardCopied": "클립보드에 복사했어요.",
  "studio.frozenStatus5.superSuite.clipboardCopyFailed": "클립보드에 복사하지 못했어요. 텍스트를 직접 선택해 복사해 주세요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.superSuite.clipboardCopied": "Copied to the clipboard.",
  "studio.frozenStatus5.superSuite.clipboardCopyFailed": "Couldn't copy to the clipboard. Please select the text and copy it manually.",
});

// ── StudioVrmPropPanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.vrmProp.gripNoProfile": "손 부착과 그립 프로필이 모두 있는 소품에서 사용할 수 있습니다.",
  "studio.frozenStatus5.vrmProp.gripIncompleteRig": "이 캐릭터에서 필요한 손가락 관절을 모두 찾지 못해 자동 그립을 적용할 수 없습니다. 현재 손 포즈는 그대로 유지됩니다.",
  "studio.frozenStatus5.vrmProp.gripContactConflict": "같은 손에 자동 그립 소품이 둘 이상 연결되어 있습니다. 한 소품만 켜면 손가락이 다시 맞춰집니다.",
  "studio.frozenStatus5.vrmProp.gripInvalidContact": "소품 접촉점이나 자동 크기 값을 안전하게 계산하지 못했습니다. 스마트 소켓 맞춤을 초기화해 보세요.",
  "studio.frozenStatus5.vrmProp.gripNotHand": "부착 부위를 왼손 또는 오른손으로 선택하면 사용할 수 있습니다.",
  "studio.frozenStatus5.vrmProp.gripUnsupported": "이 소품은 손가락 자동 그립을 지원하지 않습니다.",
  "studio.frozenStatus5.vrmProp.equippedEmpty": "아직 장착된 소품이 없습니다.",
  "studio.frozenStatus5.vrmProp.searchEmpty": "검색 결과가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.vrmProp.gripNoProfile": "Available for props that have both hand attachment and a grip profile.",
  "studio.frozenStatus5.vrmProp.gripIncompleteRig": "Couldn't find all the finger joints needed on this character, so auto grip can't be applied. The current hand pose stays as is.",
  "studio.frozenStatus5.vrmProp.gripContactConflict": "Two or more auto-grip props are attached to the same hand. Turn on just one and the fingers will fit again.",
  "studio.frozenStatus5.vrmProp.gripInvalidContact": "Couldn't safely compute the prop contact points or auto-size values. Try resetting the smart socket fit.",
  "studio.frozenStatus5.vrmProp.gripNotHand": "Choose the left or right hand as the attach point to use this.",
  "studio.frozenStatus5.vrmProp.gripUnsupported": "This prop doesn't support finger auto grip.",
  "studio.frozenStatus5.vrmProp.equippedEmpty": "No props equipped yet.",
  "studio.frozenStatus5.vrmProp.searchEmpty": "No search results.",
});

// ── StudioDrawOptionsBar
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.drawOptions.fillUnavailable": "선과 화살표는 내부 영역이 없어요. 사각형·타원·다각형을 선택하면 채우기를 사용할 수 있어요.",
  "studio.frozenStatus5.drawOptions.fillUnavailableHint": "선과 화살표는 내부 영역이 없어 채울 수 없습니다. 사각형·타원·다각형을 선택하면 활성화돼요.",
  "studio.frozenStatus5.drawOptions.resettingDefaults": "{source} 기본값을 불러오는 중",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.drawOptions.fillUnavailable": "Lines and arrows have no inner area. Choose a rectangle, ellipse or polygon to use fill.",
  "studio.frozenStatus5.drawOptions.fillUnavailableHint": "Lines and arrows have no inner area to fill. Choose a rectangle, ellipse or polygon to enable it.",
  "studio.frozenStatus5.drawOptions.resettingDefaults": "Loading the {source} defaults",
});

// ── StudioWebtoonAssistantContent
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.webtoonAssistant.sfxSearchEmpty": "검색 결과가 없습니다",
  "studio.frozenStatus5.webtoonAssistant.copied": "복사됨",
  "studio.frozenStatus5.webtoonAssistant.copyFailed": "복사 실패",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.webtoonAssistant.sfxSearchEmpty": "No search results",
  "studio.frozenStatus5.webtoonAssistant.copied": "Copied",
  "studio.frozenStatus5.webtoonAssistant.copyFailed": "Copy failed",
});

// ── StudioProductionOperationsPanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.productionOps.structureEmpty": "아직 제작 구조가 없습니다. 에피소드부터 추가하세요.",
  "studio.frozenStatus5.productionOps.handoffsEmpty": "아직 인계 브리프가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.productionOps.structureEmpty": "No production structure yet. Start by adding an episode.",
  "studio.frozenStatus5.productionOps.handoffsEmpty": "No handoff briefs yet.",
});

// ── StudioHybridDccModifierInspector
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.hybridModifier.previewFailed": "미리보기를 계산하지 못했습니다",
  "studio.frozenStatus5.hybridModifier.modifiersEmpty": "아직 쌓인 변형이 없습니다",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.hybridModifier.previewFailed": "Couldn't compute the preview",
  "studio.frozenStatus5.hybridModifier.modifiersEmpty": "No modifiers stacked yet",
});

// ── studio-chrome-ui
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.chrome.toolUnavailable": "현재 작업 상태에서는 이 도구를 사용할 수 없어요.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.chrome.toolUnavailable": "This tool isn't available in the current work state.",
});

// ── StudioStoryboardGridPanel
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.storyboardGrid.pagesEmpty": "조건에 맞는 페이지가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.storyboardGrid.pagesEmpty": "No pages match the conditions.",
});

// ── StudioPageListPaneBase
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.pageList.pagesEmpty": "조건에 맞는 페이지가 없습니다",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.pageList.pagesEmpty": "No pages match the conditions",
});

// ── StudioBg3dSceneAssistantWorkspace
registerI18nLocaleEntries("ko", {
  "studio.frozenStatus5.bg3dAssistant.assetsEmpty": "표시할 준비된 소재가 없습니다.",
});
registerI18nLocaleEntries("en", {
  "studio.frozenStatus5.bg3dAssistant.assetsEmpty": "No ready assets to show.",
});

export function frozenStatus5Text(key: string, koFallback: string): string;
export function frozenStatus5Text(
  key: string,
  params: Readonly<Record<string, string | number>>,
  koFallback: string,
): string;
export function frozenStatus5Text(
  key: string,
  paramsOrFallback: Readonly<Record<string, string | number>> | string,
  koFallback?: string,
): string {
  const params = typeof paramsOrFallback === "string" ? undefined : paramsOrFallback;
  const fallback = typeof paramsOrFallback === "string" ? paramsOrFallback : koFallback ?? "";
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(params, token) ? String(params[token]) : placeholder,
  );
}
