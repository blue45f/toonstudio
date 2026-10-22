import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { scanHardcodedStatusStrings } from "@/shared/language/status-i18n";

/**
 * character-shaper·planning·studio-production 로딩·실패·에러·빈 상태 문구
 * i18n 키 이관 계약 (A4 잔여 3라운드 c04, 42파일 138건 중 이관 118건·
 * 신규 키 126개).
 *
 * 표시 정본은 studio.r3c04Status.* (studio-r3c04-status-i18n 등록 모듈) 키이며,
 * 코드 안의 한국어 원문은 useT 폴백 인자나 r3c04StatusText 헬퍼의 koFallback으로만
 * 남아야 한다. 잔여 20건(본문·제목·버튼 라벨·표 헤더 등 상태 문구가 아닌 것)은
 * r3-c04.md에 근거와 함께 남겼고, 그 파일들도 탐지기 위반은 0이다.
 */

const HANGUL = /[가-힣]/;

function readSource(relativePath: string): string {
  return readFileSync(new URL(`./${relativePath}`, import.meta.url), "utf-8");
}

/** 등록 모듈(registerI18nLocaleEntries)의 locale 블록을 파싱한다. */
function parseRegisterModule(source: string): Record<"ko" | "en", Record<string, string>> {
  const blocks: Record<string, Record<string, string>> = {};
  const pattern = /registerI18nLocaleEntries\("(ko|en)", \{([\s\S]*?)\}\);/g;
  for (const match of source.matchAll(pattern)) {
    const entries: Record<string, string> = {};
    for (const entry of (match[2] ?? "").matchAll(/"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
      entries[entry[1] ?? ""] = entry[2] ?? "";
    }
    blocks[match[1] ?? ""] = entries;
  }
  return blocks as Record<"ko" | "en", Record<string, string>>;
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1] ?? "").sort();
}

const R3C04_KEYS = [
  "studio.r3c04Status.shaper.blender.readFailed",
  "studio.r3c04Status.shaper.blender.installUnavailable",
  "studio.r3c04Status.shaper.blender.loadFailedWithReason",
  "studio.r3c04Status.shaper.blender.reading",
  "studio.r3c04Status.shaper.blender.previewPassed",
  "studio.r3c04Status.shaper.blender.installing",
  "studio.r3c04Status.shaper.blender.sentWithName",
  "studio.r3c04Status.shaper.blender.empty",
  "studio.r3c04Status.shaper.outputDock.captureNotReady",
  "studio.r3c04Status.shaper.outputDock.noCharacter",
  "studio.r3c04Status.shaper.outputDock.captureStartFailed",
  "studio.r3c04Status.shaper.outputDock.progressPng",
  "studio.r3c04Status.shaper.outputDock.progressPsd",
  "studio.r3c04Status.shaper.outputDock.progressSheet",
  "studio.r3c04Status.shaper.outputDock.clothSyncFailed",
  "studio.r3c04Status.shaper.outputDock.downloadUnavailable",
  "studio.r3c04Status.shaper.outputDock.pngSaveFailed",
  "studio.r3c04Status.shaper.outputDock.psdExportFailed",
  "studio.r3c04Status.shaper.outputDock.sheetExportFailed",
  "studio.r3c04Status.shaper.shelf.emptyFavorites",
  "studio.r3c04Status.shaper.shelf.emptySelected",
  "studio.r3c04Status.shaper.shelf.emptySearch",
  "studio.r3c04Status.shaper.shelf.favoritesRetryAria",
  "studio.r3c04Status.shaper.shelf.favoritesRetry",
  "studio.r3c04Status.shaper.shelf.slotEmpty",
  "studio.r3c04Status.shaper.summaryBar.noChangedSlots",
  "studio.r3c04Status.shaper.summaryBar.compareEmpty",
  "studio.r3c04Status.shaper.summaryBar.noChangedSlotsNotice",
  "studio.r3c04Status.shaper.viewportHud.comparing",
  "studio.r3c04Status.shaper.viewportHud.loading",
  "studio.r3c04Status.shaper.viewportHud.loadFailed",
  "studio.r3c04Status.shaper.viewportHud.emptyModel",
  "studio.r3c04Status.shaper.viewportHud.captureUnavailable",
  "studio.r3c04Status.shaper.viewportHud.captureEmpty",
  "studio.r3c04Status.shaper.viewportHud.captureFailed",
  "studio.r3c04Status.shaper.viewportHud.imageLoadFailed",
  "studio.r3c04Status.shaper.viewportHud.ltSavedAsPng",
  "studio.r3c04Status.shaper.viewportHud.ltNotConnected",
  "studio.r3c04Status.shaper.dialog.presetsLoading",
  "studio.r3c04Status.shaper.dialog.commitUnavailable",
  "studio.r3c04Status.shaper.dialog.modelLoadFailed",
  "studio.r3c04Status.shaper.dialog.loadPrompt",
  "studio.r3c04Status.shaper.dialog.loadHint",
  "studio.r3c04Status.shaper.stcFlow.analyzing",
  "studio.r3c04Status.planning.appearance.empty",
  "studio.r3c04Status.planning.coverage.emptyLatest",
  "studio.r3c04Status.planning.coverage.emptySelected",
  "studio.r3c04Status.planning.sheetCitation.empty",
  "studio.r3c04Status.planning.sheetPanel.emptyProfile",
  "studio.r3c04Status.planning.sheetPanel.emptyRelations",
  "studio.r3c04Status.planning.continuity.noCandidates",
  "studio.r3c04Status.planning.storyPage.synopsisEmpty",
  "studio.r3c04Status.planning.storyPage.synopsisFilled",
  "studio.r3c04Status.planning.fact.notFoundInPublished",
  "studio.r3c04Status.planning.fact.emptyIndexFiltered",
  "studio.r3c04Status.planning.fact.emptyRevisions",
  "studio.r3c04Status.planning.fact.emptyValue",
  "studio.r3c04Status.planning.foreshadow.emptySeeds",
  "studio.r3c04Status.planning.foreshadow.emptyByStatus",
  "studio.r3c04Status.planning.loreImpact.noUnacknowledged",
  "studio.r3c04Status.planning.loreImpact.noChanges",
  "studio.r3c04Status.planning.loreImpact.noUnacknowledgedAck",
  "studio.r3c04Status.planning.loreGraph.noConnectedInline",
  "studio.r3c04Status.planning.loreGraph.noRelations",
  "studio.r3c04Status.planning.loreGraph.noConnectedSelected",
  "studio.r3c04Status.planning.loreName.emptyDictionary",
  "studio.r3c04Status.planning.loreName.noFindings",
  "studio.r3c04Status.planning.loreTimeline.empty",
  "studio.r3c04Status.planning.moodboard.cardContentRequired",
  "studio.r3c04Status.planning.moodboard.cardAddFailed",
  "studio.r3c04Status.planning.moodboard.emptyCards",
  "studio.r3c04Status.planning.plotline.emptyEpisodes",
  "studio.r3c04Status.planning.plotline.emptyFilter",
  "studio.r3c04Status.planning.projectMoodboard.loadFailed",
  "studio.r3c04Status.planning.storyPlanning.metricsLoadFailed",
  "studio.r3c04Status.planning.storyPlanning.emptyCharacters",
  "studio.r3c04Status.planning.sceneSetting.noLinked",
  "studio.r3c04Status.planning.sceneSetting.emptySettings",
  "studio.r3c04Status.planning.sceneSetting.locationDetailEmpty",
  "studio.r3c04Status.planning.seasonBeat.noCharacters",
  "studio.r3c04Status.planning.seasonBeat.emptyEpisodes",
  "studio.r3c04Status.planning.seasonBeat.emptyBoard",
  "studio.r3c04Status.planning.storySeed.generateFailed",
  "studio.r3c04Status.planning.storySeed.providerNotConnected",
  "studio.r3c04Status.planning.storySeed.retry",
  "studio.r3c04Status.planning.worldLore.emptySettings",
  "studio.r3c04Status.planning.worldLore.intentionalGapNote",
  "studio.r3c04Status.planning.worldLore.searchEmpty",
  "studio.r3c04Status.production.roleSwitcher.roleSaveFailed",
  "studio.r3c04Status.production.roleSwitcher.notificationSaveFailed",
  "studio.r3c04Status.production.notificationCenter.empty",
  "studio.r3c04Status.production.taskInbox.empty",
  "studio.r3c04Status.production.todayQueue.waiting",
  "studio.r3c04Status.production.todayQueue.emptyDueToday",
  "studio.r3c04Status.production.todayQueue.emptyWaiting",
  "studio.r3c04Status.production.externalReview.noToken",
  "studio.r3c04Status.production.externalReview.loadFailed",
  "studio.r3c04Status.production.externalReview.inputRequired",
  "studio.r3c04Status.production.externalReview.saveFailed",
  "studio.r3c04Status.production.externalReview.loading",
  "studio.r3c04Status.production.externalReview.cannotOpen",
  "studio.r3c04Status.production.externalReview.retry",
  "studio.r3c04Status.production.externalReview.emptyPages",
  "studio.r3c04Status.production.externalReview.saving",
  "studio.r3c04Status.production.pitchDocument.saveBlocked",
  "studio.r3c04Status.production.pitchDocument.emptyCharacters",
  "studio.r3c04Status.production.pitchPptx.createFailed",
  "studio.r3c04Status.production.pitchPptx.titleEmpty",
  "studio.r3c04Status.production.hubPage.invalidReviewLink",
  "studio.r3c04Status.production.reviewBoard.titleRequired",
  "studio.r3c04Status.production.reviewBoard.empty",
  "studio.r3c04Status.production.taskBoard.saveFailed",
  "studio.r3c04Status.production.taskBoard.titleRequired",
  "studio.r3c04Status.production.taskBoard.dueInvalid",
  "studio.r3c04Status.production.reviewLink.loadFailed",
  "studio.r3c04Status.production.reviewLink.createFailed",
  "studio.r3c04Status.production.reviewLink.revokeFailed",
  "studio.r3c04Status.production.reviewLink.copyFailed",
  "studio.r3c04Status.production.reviewLink.loading",
  "studio.r3c04Status.production.reviewLink.empty",
  "studio.r3c04Status.production.reviewLink.statusActive",
  "studio.r3c04Status.production.reviewLink.statusExpired",
  "studio.r3c04Status.production.reviewLink.statusRevoked",
  "studio.r3c04Status.production.serverVersions.loadFailed",
  "studio.r3c04Status.production.serverVersions.restoreFailed",
  "studio.r3c04Status.production.serverVersions.empty",
] as const;

const EXPECTED_KO: Readonly<Record<string, string>> = {
  "studio.r3c04Status.shaper.blender.readFailed": "패키지를 읽지 못했습니다.",
  "studio.r3c04Status.shaper.blender.installUnavailable": "이 화면에서는 모델을 설치할 수 없습니다.",
  "studio.r3c04Status.shaper.blender.loadFailedWithReason": "불러오지 못했습니다 — {reason}",
  "studio.r3c04Status.shaper.blender.reading": "패키지 구조·품질·SHA-256을 확인하는 중입니다.",
  "studio.r3c04Status.shaper.blender.previewPassed": "검증을 통과했습니다. 모델 정보를 확인하고 가져오기를 눌러 주세요.",
  "studio.r3c04Status.shaper.blender.installing": "검증한 모델을 전달하는 중입니다.",
  "studio.r3c04Status.shaper.blender.sentWithName": "{name} 파일을 모델 로더에 전달했습니다. 최종 결과는 모델 화면에서 확인하세요.",
  "studio.r3c04Status.shaper.blender.empty": "아직 불러온 패키지가 없습니다.",
  "studio.r3c04Status.shaper.outputDock.captureNotReady": "캡처할 3D 장면이 아직 준비되지 않았습니다.",
  "studio.r3c04Status.shaper.outputDock.noCharacter": "내보낼 캐릭터가 없습니다.",
  "studio.r3c04Status.shaper.outputDock.captureStartFailed": "캡처를 시작하지 못했습니다.",
  "studio.r3c04Status.shaper.outputDock.progressPng": "PNG로 굽는 중",
  "studio.r3c04Status.shaper.outputDock.progressPsd": "레이어를 나누는 중 · 밑색 · 음영 · 하이라이트 · 주선",
  "studio.r3c04Status.shaper.outputDock.progressSheet": "다각도 설정화 준비 중",
  "studio.r3c04Status.shaper.outputDock.clothSyncFailed": "의상 천 물리를 현재 포즈에 맞추지 못했습니다. 다시 시도해 주세요.",
  "studio.r3c04Status.shaper.outputDock.downloadUnavailable": "이 브라우저에서는 파일을 내려받을 수 없습니다.",
  "studio.r3c04Status.shaper.outputDock.pngSaveFailed": "PNG를 저장하지 못했습니다.",
  "studio.r3c04Status.shaper.outputDock.psdExportFailed": "PSD를 내보내지 못했습니다.",
  "studio.r3c04Status.shaper.outputDock.sheetExportFailed": "설정화를 내보내지 못했습니다.",
  "studio.r3c04Status.shaper.shelf.emptyFavorites": "조건에 맞는 즐겨찾기가 없습니다",
  "studio.r3c04Status.shaper.shelf.emptySelected": "조건에 맞는 선택 항목이 없습니다",
  "studio.r3c04Status.shaper.shelf.emptySearch": "검색 결과가 없습니다",
  "studio.r3c04Status.shaper.shelf.favoritesRetryAria": "즐겨찾기 저장 다시 시도",
  "studio.r3c04Status.shaper.shelf.favoritesRetry": "저장 다시 시도",
  "studio.r3c04Status.shaper.shelf.slotEmpty": "이 슬롯에는 아직 프리셋이 없습니다",
  "studio.r3c04Status.shaper.summaryBar.noChangedSlots": "아직 바꾼 슬롯이 없습니다",
  "studio.r3c04Status.shaper.summaryBar.compareEmpty": "바꾼 슬롯이 없어 비교할 내용이 없습니다",
  "studio.r3c04Status.shaper.summaryBar.noChangedSlotsNotice": "아직 바꾼 슬롯이 없습니다.",
  "studio.r3c04Status.shaper.viewportHud.comparing": "기준 상태 보는 중",
  "studio.r3c04Status.shaper.viewportHud.loading": "VRM 불러오는 중",
  "studio.r3c04Status.shaper.viewportHud.loadFailed": "불러오기 실패",
  "studio.r3c04Status.shaper.viewportHud.emptyModel": "모델 없음",
  "studio.r3c04Status.shaper.viewportHud.captureUnavailable": "3D 뷰 캡처를 사용할 수 없어요. 이미지 파일을 불러와 변환할 수 있습니다.",
  "studio.r3c04Status.shaper.viewportHud.captureEmpty": "3D 뷰 캡처 결과가 비어 있습니다.",
  "studio.r3c04Status.shaper.viewportHud.captureFailed": "3D 뷰 캡처에 실패했습니다.",
  "studio.r3c04Status.shaper.viewportHud.imageLoadFailed": "이미지를 불러오지 못했습니다.",
  "studio.r3c04Status.shaper.viewportHud.ltSavedAsPng": "레이어에 바로 넣는 기능은 준비 중이라 선화·톤 PNG 파일로 저장했어요.",
  "studio.r3c04Status.shaper.viewportHud.ltNotConnected": "레이어 저장을 아직 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  "studio.r3c04Status.shaper.dialog.presetsLoading": "프리셋 불러오는 중",
  "studio.r3c04Status.shaper.dialog.commitUnavailable": "지금은 적용할 수 없습니다.",
  "studio.r3c04Status.shaper.dialog.modelLoadFailed": "모델을 불러오지 못했습니다",
  "studio.r3c04Status.shaper.dialog.loadPrompt": "VRM 캐릭터를 불러오세요",
  "studio.r3c04Status.shaper.dialog.loadHint": "파일 형식이나 경로를 확인한 뒤 다시 시도해 주세요.",
  "studio.r3c04Status.shaper.stcFlow.analyzing": "특징을 읽는 중…",
  "studio.r3c04Status.planning.appearance.empty": "아직 등장 기록이 없어요. 회차에서 이 캐릭터를 태그하면 여기에 회차·씬 목록이 쌓여요.",
  "studio.r3c04Status.planning.coverage.emptyLatest": "아직 등장 기록이 없어요. 회차마다 등장 캐릭터를 태그하면 여기에 쌓여요.",
  "studio.r3c04Status.planning.coverage.emptySelected": "아직 등장 기록이 없어요. 처음 등장하는 회차에서 태그하면 다음부터 요약이 쌓여요.",
  "studio.r3c04Status.planning.sheetCitation.empty": "아직 이 캐릭터의 시트가 비어 있어요. 캐릭터 시트에 말투와 대표 대사를 적어 두면 여기에 바로 보여요.",
  "studio.r3c04Status.planning.sheetPanel.emptyProfile": "아직 시트가 비어 있어요. 성격 한 줄부터 시작해 보세요.",
  "studio.r3c04Status.planning.sheetPanel.emptyRelations": "아직 적힌 관계가 없어요.",
  "studio.r3c04Status.planning.continuity.noCandidates": "기록된 회차 사이에서는 역행·겹침 후보가 없어요.",
  "studio.r3c04Status.planning.storyPage.synopsisEmpty": "아직 줄거리 칸이 비어 있어요.",
  "studio.r3c04Status.planning.storyPage.synopsisFilled": "줄거리 칸이 채워졌어요.",
  "studio.r3c04Status.planning.fact.notFoundInPublished": "게시된 회차 본문에서 찾지 못했어요.",
  "studio.r3c04Status.planning.fact.emptyIndexFiltered": "이 조건에 맞는 색인 항목이 없어요.",
  "studio.r3c04Status.planning.fact.emptyRevisions": "아직 설정 수정 이력이 없어요.",
  "studio.r3c04Status.planning.fact.emptyValue": "(비어 있음)",
  "studio.r3c04Status.planning.foreshadow.emptySeeds": "아직 등록된 복선이 없어요 — 첫 복선 등록하기",
  "studio.r3c04Status.planning.foreshadow.emptyByStatus": "이 상태의 복선이 없어요.",
  "studio.r3c04Status.planning.loreImpact.noUnacknowledged": "미확인 영향이 없어요.",
  "studio.r3c04Status.planning.loreImpact.noChanges": "아직 영향을 주는 설정 변경이 없어요. 설정의 이름이나 규칙이 바뀌면, 그 설정을 참조하는 줄거리·대사·다른 설정이 여기에 쌓입니다.",
  "studio.r3c04Status.planning.loreImpact.noUnacknowledgedAck": "미확인 영향이 없어요. 확인한 항목은 위 버튼으로 다시 볼 수 있어요.",
  "studio.r3c04Status.planning.loreGraph.noConnectedInline": " — 아직 이어진 항목이 없어요",
  "studio.r3c04Status.planning.loreGraph.noRelations": "아직 설정 사이에 이어진 연결이 없어요. 항목을 고칠 때 “이어지는 설정”과 “이어지는 캐릭터”를 체크하면, 여기에 관계도가 그려져요.",
  "studio.r3c04Status.planning.loreGraph.noConnectedSelected": "이어진 항목이 없어요",
  "studio.r3c04Status.planning.loreName.emptyDictionary": "아직 검사할 이름 사전이 비어 있어요. 위에서 세계관 설정을 적거나 캐릭터가 생기면, 그 이름들이 사전이 되어 줄거리·대사의 표기 흔들림을 검사할 수 있어요.",
  "studio.r3c04Status.planning.loreName.noFindings": "발견된 흔들림이 없어요. 이름 표기가 사전과 잘 맞고 있어요.",
  "studio.r3c04Status.planning.loreTimeline.empty": "아직 세계관 설정이 없어서 보여 줄 연표가 없어요.",
  "studio.r3c04Status.planning.moodboard.cardContentRequired": "카드 내용을 입력해 주세요.",
  "studio.r3c04Status.planning.moodboard.cardAddFailed": "카드를 더할 수 없어요. 카드가 너무 많거나 이미 있는 카드예요.",
  "studio.r3c04Status.planning.moodboard.emptyCards": "아직 카드가 없어요. 아래에서 첫 카드를 더해 보세요.",
  "studio.r3c04Status.planning.plotline.emptyEpisodes": "아직 회차 줄거리가 없어요. 회차 줄거리를 적으면 그 회차가 열로 나타나요.",
  "studio.r3c04Status.planning.plotline.emptyFilter": "이 필터에 맞는 플롯라인이 없어요. 필터를 풀면 전체 타임라인이 보여요.",
  "studio.r3c04Status.planning.projectMoodboard.loadFailed": "무드보드를 불러올 수 없어요.",
  "studio.r3c04Status.planning.storyPlanning.metricsLoadFailed": "회차 성과를 불러오지 못했습니다.",
  "studio.r3c04Status.planning.storyPlanning.emptyCharacters": "아직 등록된 캐릭터가 없어요. 원고나 스토리월드에서 캐릭터가 생기면, 여기서 성격·말투·관계를 시트로 적을 수 있어요.",
  "studio.r3c04Status.planning.sceneSetting.noLinked": "이 장면과 이어진 설정이 아직 없어요. 장면에 장소와 등장 캐릭터를 지정하면 연결된 설정이 자동으로 모입니다.",
  "studio.r3c04Status.planning.sceneSetting.emptySettings": "아직 적어 둔 설정이 없어요. 세계관 설정을 먼저 세워 두면, 작업 화면에서 장면마다 이어진 설정이 자동으로 곁에 나타납니다.",
  "studio.r3c04Status.planning.sceneSetting.locationDetailEmpty": " — 이 장소의 상세 설정은 아직 없어요.",
  "studio.r3c04Status.planning.seasonBeat.noCharacters": "캐릭터가 아직 없어요. 캐릭터 시트에서 인물을 만들면 그 캐릭터가 열로 나타나요.",
  "studio.r3c04Status.planning.seasonBeat.emptyEpisodes": "아직 회차 줄거리가 없어요. 회차 줄거리를 적으면 그 회차가 행으로 나타나요.",
  "studio.r3c04Status.planning.seasonBeat.emptyBoard": "아직 적힌 줄거리가 없어서 보드가 비어 있어요. 회차 줄거리와 등장 캐릭터를 적으면 비트가 채워져요.",
  "studio.r3c04Status.planning.storySeed.generateFailed": "제안을 만들지 못했어요. 네트워크나 제공자 상태를 확인하거나, 기본 제안으로 만들어 보세요.",
  "studio.r3c04Status.planning.storySeed.providerNotConnected": "외부 AI 제공자는 연결 전입니다. 대신 기본 제안(로컬·결정적)이 지금 바로 동작합니다 — 같은 입력은 항상 같은 초안이고, 횟수 제한이 없습니다.",
  "studio.r3c04Status.planning.storySeed.retry": "다시 시도",
  "studio.r3c04Status.planning.worldLore.emptySettings": "아직 적어 둔 설정이 없어요. 세계를 이루는 것들부터 하나씩 세워 보세요.",
  "studio.r3c04Status.planning.worldLore.intentionalGapNote": "의도적으로 비워 둔 설정이에요 — 내용을 채우지 않아도 오류가 아니에요.",
  "studio.r3c04Status.planning.worldLore.searchEmpty": "찾는 설정이 없어요. 다른 말로 찾아보거나, 새 설정으로 추가해 보세요.",
  "studio.r3c04Status.production.roleSwitcher.roleSaveFailed": "프로젝트 작업 모드를 저장하지 못했습니다.",
  "studio.r3c04Status.production.roleSwitcher.notificationSaveFailed": "프로젝트 알림 설정을 저장하지 못했습니다.",
  "studio.r3c04Status.production.notificationCenter.empty": "지금 바로 확인할 직무 알림이 없습니다",
  "studio.r3c04Status.production.taskInbox.empty": "현재 직무에 연결된 미완료 작업이 없습니다.",
  "studio.r3c04Status.production.todayQueue.waiting": "대기 중",
  "studio.r3c04Status.production.todayQueue.emptyDueToday": "오늘 마감인 내 작업이 없습니다.",
  "studio.r3c04Status.production.todayQueue.emptyWaiting": "앞 공정을 기다리는 작업도 없습니다. 아래 인박스에서 다음 작업을 확인하세요.",
  "studio.r3c04Status.production.externalReview.noToken": "검토 링크 토큰이 없습니다.",
  "studio.r3c04Status.production.externalReview.loadFailed": "검토 원고를 불러오지 못했습니다.",
  "studio.r3c04Status.production.externalReview.inputRequired": "검토자 이름과 댓글 또는 반려 사유를 입력해 주세요.",
  "studio.r3c04Status.production.externalReview.saveFailed": "검토 의견을 저장하지 못했습니다.",
  "studio.r3c04Status.production.externalReview.loading": "검토 원고를 불러오는 중입니다.",
  "studio.r3c04Status.production.externalReview.cannotOpen": "검토 원고를 열 수 없습니다",
  "studio.r3c04Status.production.externalReview.retry": "다시 시도",
  "studio.r3c04Status.production.externalReview.emptyPages": "이 링크에 공개된 렌더 페이지가 없습니다.",
  "studio.r3c04Status.production.externalReview.saving": "저장 중",
  "studio.r3c04Status.production.pitchDocument.saveBlocked": "이름이 비어 있는 캐릭터 행이 있어 기획서를 저장하지 않았습니다.",
  "studio.r3c04Status.production.pitchDocument.emptyCharacters": "아직 등록한 캐릭터가 없습니다. “캐릭터 추가”로 주인공부터 적어 보세요.",
  "studio.r3c04Status.production.pitchPptx.createFailed": "PPTX를 만들지 못했습니다.",
  "studio.r3c04Status.production.pitchPptx.titleEmpty": "슬라이드 제목은 비워 둘 수 없습니다.",
  "studio.r3c04Status.production.hubPage.invalidReviewLink": "검토 링크를 확인할 수 없습니다",
  "studio.r3c04Status.production.reviewBoard.titleRequired": "검수 항목 제목을 입력해 주세요.",
  "studio.r3c04Status.production.reviewBoard.empty": "검수 항목이 없습니다",
  "studio.r3c04Status.production.taskBoard.saveFailed": "작업 정보를 저장하지 못했습니다. 입력은 유지됩니다.",
  "studio.r3c04Status.production.taskBoard.titleRequired": "작업 제목을 입력해 주세요.",
  "studio.r3c04Status.production.taskBoard.dueInvalid": "마감일을 올바르게 입력해 주세요.",
  "studio.r3c04Status.production.reviewLink.loadFailed": "검토 링크를 불러오지 못했습니다.",
  "studio.r3c04Status.production.reviewLink.createFailed": "검토 링크를 만들지 못했습니다.",
  "studio.r3c04Status.production.reviewLink.revokeFailed": "검토 링크를 폐기하지 못했습니다.",
  "studio.r3c04Status.production.reviewLink.copyFailed": "클립보드 권한이 없어 링크를 복사하지 못했습니다.",
  "studio.r3c04Status.production.reviewLink.loading": "검토 링크를 불러오는 중입니다.",
  "studio.r3c04Status.production.reviewLink.empty": "아직 발급한 검토 링크가 없습니다.",
  "studio.r3c04Status.production.reviewLink.statusActive": "활성",
  "studio.r3c04Status.production.reviewLink.statusExpired": "만료",
  "studio.r3c04Status.production.reviewLink.statusRevoked": "폐기",
  "studio.r3c04Status.production.serverVersions.loadFailed": "서버 원고 버전을 불러오지 못했습니다.",
  "studio.r3c04Status.production.serverVersions.restoreFailed": "서버 원고 버전을 복원하지 못했습니다.",
  "studio.r3c04Status.production.serverVersions.empty": "저장된 서버 revision 이력이 없습니다.",
};

const CONSUMERS = [
  "character-shaper/CharacterShaperBlenderPackage.tsx",
  "character-shaper/CharacterShaperOutputDock.tsx",
  "character-shaper/CharacterShaperShelf.tsx",
  "character-shaper/CharacterShaperSummaryBar.tsx",
  "character-shaper/CharacterShaperViewportHud.tsx",
  "character-shaper/StudioCharacterShaperDialog.tsx",
  "character-shaper/StudioStcGuidedFlowPanel.tsx",
  "planning/StudioCharacterAppearanceList.tsx",
  "planning/StudioCharacterCoverageMap.tsx",
  "planning/StudioCharacterSheetCitation.tsx",
  "planning/StudioCharacterSheetPanel.tsx",
  "planning/StudioEpisodeContinuityTimeline.tsx",
  "planning/StudioEpisodeStoryPage.tsx",
  "planning/StudioFactConcordancePanel.tsx",
  "planning/StudioForeshadowLedgerPanel.tsx",
  "planning/StudioLoreChangeImpactPanel.tsx",
  "planning/StudioLoreGraph.tsx",
  "planning/StudioLoreNameCheckPanel.tsx",
  "planning/StudioLoreTimeline.tsx",
  "planning/StudioMoodboardPanel.tsx",
  "planning/StudioPlotlineTimeline.tsx",
  "planning/StudioProjectMoodboard.tsx",
  "planning/StudioProjectStoryPlanning.tsx",
  "planning/StudioSceneSettingReferencePanel.tsx",
  "planning/StudioSeasonBeatBoard.tsx",
  "planning/StudioStorySeedBuilder.tsx",
  "planning/StudioWorldLoreHub.tsx",
  "studio-production/CreatorProjectRoleSwitcher.tsx",
  "studio-production/CreatorRoleNotificationCenter.tsx",
  "studio-production/CreatorRoleTaskInbox.tsx",
  "studio-production/CreatorRoleTodayQueue.tsx",
  "studio-production/StudioExternalReviewPanel.tsx",
  "studio-production/StudioPitchDocumentCard.tsx",
  "studio-production/StudioPitchPptxCard.tsx",
  "studio-production/StudioProductionHubPage.tsx",
  "studio-production/StudioProductionReviewBoard.tsx",
  "studio-production/StudioProductionTaskBoard.tsx",
  "studio-production/StudioReviewLinkManager.tsx",
  "studio-production/StudioServerVersionsCard.tsx",
] as const;

/** 이관하지 않은 잔여 파일(본문·헤더만 보유) — 탐지기 위반 0만 고정한다. */
const RESIDUAL_FILES = [
  "character-shaper/CharacterShaperFramingControls.tsx",
  "studio-production/CreatorRoleToolkit.tsx",
  "studio-production/CreatorRoleWorkloadPanel.tsx",
] as const;

describe("studio shaper/planning/production status i18n r3c04", () => {
  it("등록 모듈의 ko/en 키가 패리티를 이루고 ko 원문·플레이스홀더가 정확하다", () => {
    const blocks = parseRegisterModule(readSource("studio-r3c04-status-i18n.ts"));
    expect(Object.keys(blocks.ko).sort()).toEqual(Object.keys(blocks.en).sort());
    expect(Object.keys(blocks.ko).length).toBe(R3C04_KEYS.length);
    for (const key of R3C04_KEYS) {
      expect(blocks.ko[key], `ko missing ${key}`).toBe(EXPECTED_KO[key]);
      expect(blocks.en[key], `en missing ${key}`).toBeTruthy();
      expect(HANGUL.test(blocks.en[key] ?? ""), `en value has Hangul: ${key}`).toBe(false);
      expect(placeholders(blocks.en[key] ?? ""), `placeholder mismatch ${key}`).toEqual(
        placeholders(blocks.ko[key] ?? ""),
      );
    }
  });

  it("신규 키가 소비 파일에서 실제로 참조되고 미등록 참조가 없다", () => {
    const consumerSource = CONSUMERS.map((file) => readSource(file)).join("\n");
    for (const key of R3C04_KEYS) {
      expect(consumerSource.includes(`"${key}"`), `unreferenced key: ${key}`).toBe(true);
    }
    const referenced = new Set(
      [...consumerSource.matchAll(/"(studio\.r3c04Status\.[A-Za-z0-9.]+)"/g)].map(
        (match) => match[1] ?? "",
      ),
    );
    for (const key of referenced) {
      expect(
        (R3C04_KEYS as readonly string[]).includes(key),
        `dangling key reference: ${key}`,
      ).toBe(true);
    }
  });

  it("이관·잔여 파일에 하드코딩된 로딩·실패·에러 문자열이 남지 않았다", () => {
    for (const file of [...CONSUMERS, ...RESIDUAL_FILES]) {
      const violations = scanHardcodedStatusStrings(readSource(file));
      expect(violations, `${file}: ${JSON.stringify(violations)}`).toEqual([]);
    }
  });
});
