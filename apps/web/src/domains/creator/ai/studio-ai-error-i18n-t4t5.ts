/**
 * AI 진단·구조 채널 에러 문구 사전 (A4 후속 AI 이관 T4+T5, 2026-10-22).
 *
 * T1의 `studio-ai-error-i18n.ts`(60키)는 병행 트랜치(T2+T3)가 사용 중이라
 * 건드리지 않고, T4+T5 구간만 이 전용 모듈에 분리 등록한다. 등록 방식과
 * 해석 헬퍼는 T1 정본을 그대로 따른다: 생산자는 `aiErrorText(키, …, 한국어
 * 폴백)`로 현재 로케일 문구를 만들고, 구조가 렌더까지 유지되는 채널
 * (episode 이슈·media findings·영속 job.error)은 코드(id·키)를 싣고
 * 표시 시점에 이 모듈의 해석 함수로 현재 로케일 문구를 얻는다.
 *
 * 네임스페이스 구간: `.issue.*` episode-director 이슈 템플릿,
 * `.media.*` comic-director-media, `.preflight.*` execution-preflight,
 * `.scenarioImage.*` scenario-image, `.comicApi.*` comic-director-api,
 * `.canon.*` character-canon, `.session.*` comic-director-session 영속,
 * `.bridge.*` stroke-proposal-bridge, `.onnx.*` onnx-colorize-layers.
 */
import { registerI18nLocaleEntries } from "@/shared/lib/i18n";

import { aiErrorText } from "./studio-ai-error-i18n";
import type { StudioAiEpisodeIssue } from "./studio-ai-episode-production-director";
import type { ScenarioImageQualityFinding } from "../studio-scenario-layout";

export { aiErrorText };

const KO = {
  // episode-director 이슈 템플릿 (id × title/description/resolution)
  "studio.aiError.issue.inputEmpty.title": "대본이 비어 있어요",
  "studio.aiError.issue.inputEmpty.description": "장면과 컷을 계획할 원문이 없어 생성 묶음을 만들 수 없습니다.",
  "studio.aiError.issue.inputEmpty.resolution": "장면 제목과 행동·대사를 한 줄 이상 입력하세요.",
  "studio.aiError.issue.inputTooFewCuts.title": "회차가 매우 짧아요",
  "studio.aiError.issue.inputTooFewCuts.description": "{count}개 컷만 감지되어 도입·전개·후킹 리듬을 평가하기 어렵습니다.",
  "studio.aiError.issue.inputTooFewCuts.resolution": "의도한 티저가 아니라면 반응 컷이나 공간 전환 컷을 보강하세요.",
  "studio.aiError.issue.missingAnchor.description": "{lock} 연속성 잠금은 켜져 있지만 비교할 기준이 없습니다.",
  "studio.aiError.issue.missingCharacter.title": "캐릭터 기준이 없어요",
  "studio.aiError.issue.missingCharacter.resolution": "이름·얼굴·헤어·체형을 캐릭터 기준란에 고정하세요.",
  "studio.aiError.issue.missingCostume.title": "의상 기준이 없어요",
  "studio.aiError.issue.missingCostume.resolution": "회차의 기본 의상 또는 장면별 의상 버전을 지정하세요.",
  "studio.aiError.issue.missingLocation.title": "장소 기준이 없어요",
  "studio.aiError.issue.missingLocation.resolution": "공간명과 고정 구조물·시간대를 장소 기준란에 적으세요.",
  "studio.aiError.issue.missingLighting.title": "광원 기준이 없어요",
  "studio.aiError.issue.missingLighting.resolution": "주광 방향과 시간대 또는 색온도를 고정하세요.",
  "studio.aiError.issue.missingStyle.title": "화풍 기준이 없어요",
  "studio.aiError.issue.missingStyle.resolution": "선 굵기·채색·명암·질감 기준을 한 문장으로 지정하세요.",
  "studio.aiError.issue.missingProps.title": "고정 소품 기준이 없어요",
  "studio.aiError.issue.missingProps.resolution": "서사에 중요한 무기·액세서리·휴대품만 고정하세요.",
  "studio.aiError.issue.sceneLargeBatch.title": "{sceneTitle}의 생성 범위가 커요",
  "studio.aiError.issue.sceneLargeBatch.description": "{count}개 컷이 한 장면에 몰려 있어 수정 시 재생성 범위가 커집니다.",
  "studio.aiError.issue.sceneLargeBatch.resolution": "행동 전환이나 장소 변화 지점에서 장면을 더 나누세요.",
  "studio.aiError.issue.sceneLocationAmbiguous.title": "{sceneTitle}의 장소가 모호해요",
  "studio.aiError.issue.sceneLocationAmbiguous.description": "회차에 장소 후보가 여러 개 있지만 이 장면에서 사용할 장소를 찾지 못했습니다.",
  "studio.aiError.issue.sceneLocationAmbiguous.resolution": "장면 제목이나 첫 문장에 장소를 명시하세요.",
  "studio.aiError.issue.sceneLightingConflict.title": "{sceneTitle}의 시간대가 충돌할 수 있어요",
  "studio.aiError.issue.sceneLightingConflict.description": "한 장면에서 {times} 표현이 함께 감지됐습니다.",
  "studio.aiError.issue.sceneLightingConflict.resolution": "시간 전환을 명시하거나 장면을 분리하고 광원 버전을 지정하세요.",
  "studio.aiError.issue.costumeChangeWithoutTransition.title": "의상 버전 전환이 설명되지 않았어요",
  "studio.aiError.issue.costumeChangeWithoutTransition.description": "{detail}가 감지됐지만 환복·시간 전환 지시가 없습니다.",
  "studio.aiError.issue.costumeChangeWithoutTransition.resolution": "장면별 의상 버전을 붙이거나 환복 전환 문장을 추가하세요.",
  "studio.aiError.issue.cutLongDialogue.title": "컷 {cutNumber}의 대사가 길어요",
  "studio.aiError.issue.cutLongDialogue.description": "{count}자로 감지되어 모바일 말풍선과 표정 연출을 동시에 압박합니다.",
  "studio.aiError.issue.cutLongDialogue.resolution": "두 말풍선이나 반응 컷으로 나누고 핵심 문장을 앞에 두세요.",
  "studio.aiError.issue.cutRepeatedShot.title": "컷 {cutNumber}까지 같은 샷이 반복돼요",
  "studio.aiError.issue.cutRepeatedShot.description": "{shotScale} 구도가 3컷 연속 이어져 스크롤 리듬이 평평해질 수 있습니다.",
  "studio.aiError.issue.cutRepeatedShot.resolution": "감정 클로즈업·공간 롱숏·행동 디테일 중 하나로 변주하세요.",
  "studio.aiError.issue.cameraVarietyLow.title": "카메라 변주가 적어요",
  "studio.aiError.issue.cameraVarietyLow.description": "{shotCount}개 샷 크기와 {angleCount}개 앵글만 사용됩니다.",
  "studio.aiError.issue.cameraVarietyLow.resolution": "독자의 시선 이동이 필요한 핵심 비트에만 앵글 변화를 추가하세요.",
  "studio.aiError.issue.episodeCutCountHigh.title": "한 번에 계획하기엔 컷이 많아요",
  "studio.aiError.issue.episodeCutCountHigh.description": "{count}개 컷은 수정·검수 범위가 커서 생성 실패의 영향이 커집니다.",
  "studio.aiError.issue.episodeCutCountHigh.resolution": "회차를 파트로 나누거나 장면 단위로 생성·승인하세요.",
  // comic-director-media — Result·reason 채널
  "studio.aiError.media.apiNotConnected": "이미지 편집 API가 연결되지 않았습니다.",
  "studio.aiError.media.editPathMissing": "현재 연결에 이미지 편집 경로가 없습니다.",
  "studio.aiError.media.repairUnavailable": "마스크 영역 수리를 사용할 수 없습니다.",
  "studio.aiError.media.repairPromptRequired": "수리 지시를 입력해 주세요.",
  "studio.aiError.media.repairImageOrMaskInvalid": "수리 이미지 또는 마스크가 올바르지 않습니다.",
  "studio.aiError.media.repairMustBeImages": "수리 원본과 마스크는 이미지여야 합니다.",
  "studio.aiError.media.repairRequestCancelled": "수리 요청이 취소되었습니다.",
  "studio.aiError.media.repairRequestFailed": "수리 요청에 실패했습니다.",
  "studio.aiError.media.repairResultUnparseable": "수리 결과를 해석하지 못했습니다.",
  "studio.aiError.media.repairRequestFailedWithStatus": "수리 요청이 실패했습니다 (HTTP {status}): {message}",
  "studio.aiError.media.repairResultImageMissing": "수리 결과 이미지가 없습니다.",
  // comic-director-media — throw 채널
  "studio.aiError.media.analysisBrowserOnly": "이미지 분석은 브라우저에서만 사용할 수 있어요.",
  "studio.aiError.media.workBrowserOnly": "이 작업은 브라우저에서만 사용할 수 있어요.",
  "studio.aiError.media.context2dUnavailable": "2D 이미지 처리 컨텍스트를 만들지 못했습니다.",
  "studio.aiError.media.maskSizeMismatch": "레이어 분리 마스크 크기가 원본 이미지와 다릅니다.",
  // comic-director-media — findings (id 해석) + 단일 레이어 limitation
  "studio.aiError.media.findingResolution": "원본이 {width}×{height}px입니다. 최종 원고 확대 전에 확인하세요.",
  "studio.aiError.media.findingAlpha": "투명 픽셀이 포함되어 있습니다. 합성 순서와 배경을 확인하세요.",
  "studio.aiError.media.findingEdgeClipping": "불투명 피사체가 이미지 가장자리에 많이 닿아 있어 잘림을 확인해야 합니다.",
  "studio.aiError.media.findingContrast": "명암 대비가 낮아 작은 화면에서 인물과 배경이 합쳐 보일 수 있습니다.",
  "studio.aiError.media.findingExposure": "매우 어둡거나 밝은 픽셀 비중이 높습니다. 디테일 손실을 확인하세요.",
  "studio.aiError.media.findingSemanticUnknown": "캐릭터 정체성·손·해부·이야기 정확성은 자동 픽셀 검사로 확정하지 않습니다.",
  "studio.aiError.media.singleLayerLimitation": "분리 가능한 공급자 레이어나 검토된 마스크가 없어 단일 장면 레이어로 유지합니다.",
  // execution-preflight
  "studio.aiError.preflight.imageUnavailable": "이미지 API가 연결되지 않아 실행할 수 없습니다. AI 어시스트 설정에서 키를 등록해 주세요.",
  "studio.aiError.preflight.textUnavailable": "텍스트 AI가 연결되지 않아 실행할 수 없습니다. 로그인하면 자동 무료 AI를 먼저 사용하며, 무료 경로를 사용할 수 없으면 통합 AI 설정에서 개인 클라우드 API 키와 모델을 연결하세요.",
  "studio.aiError.preflight.connectionUnverified": "연결 상태가 정상으로 확인되지 않았습니다 ({connectionLabel}). AI 어시스트 설정에서 다시 확인해 주세요.",
  // scenario-image-generation
  "studio.aiError.scenarioImage.referenceAssetsLoading": "AI 참조 에셋을 불러오는 중이에요. 잠시 뒤 다시 시도해 주세요.",
  "studio.aiError.scenarioImage.referenceLimitExceeded": "AI 이미지 참조는 최대 {count}개까지 사용할 수 있어요. 참조 팩에서 일부를 제거해 주세요.",
  "studio.aiError.scenarioImage.referenceAssetsMissing": "연결된 AI 참조 에셋 {count}개를 찾을 수 없어요. 참조 팩에서 제거하거나 에셋을 다시 추가해 주세요.",
  "studio.aiError.scenarioImage.batchLimitExceeded": "한 번에 최대 {count}개까지 생성할 수 있어요. 선택 컷 또는 후보 수를 줄여 나눠 생성해 주세요.",
  // comic-director-api
  "studio.aiError.comicApi.loginRequired": "로그인하면 AI 코믹 디렉터 세션을 클라우드에 저장할 수 있어요.",
  "studio.aiError.comicApi.serverUnreachable": "AI 코믹 디렉터 저장 서버에 연결하지 못했어요.",
  "studio.aiError.comicApi.responseUnparseable": "AI 코믹 디렉터 서버 응답을 해석하지 못했어요.",
  "studio.aiError.comicApi.requestFailedWithStatus": "요청이 실패했습니다 (HTTP {status}).",
  // character-canon 검증
  "studio.aiError.canon.nameRequired": "캐릭터 이름을 입력해 주세요.",
  "studio.aiError.canon.appearanceRequired": "외모 설명을 입력해 주세요. 얼굴·머리·체형이 드러나면 좋아요.",
  // comic-director-session 영속 job.error
  "studio.aiError.session.providerCompletionUnverified": "브라우저 연결이 끊긴 동안 공급자 완료 여부를 확인하지 못했습니다.",
  // stroke-proposal-bridge (T5)
  "studio.aiError.bridge.noRecentStroke": "최근 확정 획이 없어 제안할 수 없습니다.",
  "studio.aiError.bridge.sourceElementMissing": "제안 획의 원본 요소를 찾을 수 없습니다.",
  "studio.aiError.bridge.proposalFailed": "획 제안을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.",
  // onnx-colorize-layers throw (T5)
  "studio.aiError.onnx.canvasSizeInvalid": "레이어 분리 캔버스 크기가 올바르지 않습니다.",
  "studio.aiError.onnx.canvasTooLarge": "레이어 분리 내보내기는 {maxPixels}px까지 지원합니다. 더 작은 이미지로 다시 채색해 주세요.",
  "studio.aiError.onnx.layerSizeMismatch": "{label} 레이어의 크기가 {width}×{height}와 맞지 않습니다.",
  "studio.aiError.onnx.sourceBufferSizeMismatch": "원본 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.",
  "studio.aiError.onnx.noLayersForPsd": "PSD로 저장할 레이어가 없습니다.",
  "studio.aiError.onnx.duplicateLayerId": "채색 레이어 ID가 중복되었습니다.",
  "studio.aiError.onnx.psdCreationFailed": "PSD 파일을 만들지 못했습니다: {message}",
  "studio.aiError.onnx.psdResultOutOfBudget": "채색 레이어 PSD 결과가 signature, version 또는 출력 예산을 벗어났습니다.",
  "studio.aiError.onnx.highlightSkippedReason": "하이라이트는 원본 선화에 정보가 없고 모델의 밝은 영역이 밑색 레이어에 이미 들어 있어 별도 레이어로 만들지 않았습니다.",
} as const;

type AiErrorT4T5Key = keyof typeof KO;

const EN: Readonly<Record<AiErrorT4T5Key, string>> = {
  "studio.aiError.issue.inputEmpty.title": "The script is empty",
  "studio.aiError.issue.inputEmpty.description": "There is no source text to plan scenes and cuts from, so no generation batches can be created.",
  "studio.aiError.issue.inputEmpty.resolution": "Enter at least one line with a scene title and action or dialogue.",
  "studio.aiError.issue.inputTooFewCuts.title": "This episode is very short",
  "studio.aiError.issue.inputTooFewCuts.description": "Only {count} cuts were detected, so the opening, development, and hook rhythm is hard to evaluate.",
  "studio.aiError.issue.inputTooFewCuts.resolution": "Unless this is an intentional teaser, add reaction cuts or spatial transition cuts.",
  "studio.aiError.issue.missingAnchor.description": "The {lock} continuity lock is on, but there is no reference to compare against.",
  "studio.aiError.issue.missingCharacter.title": "No character reference",
  "studio.aiError.issue.missingCharacter.resolution": "Fix the name, face, hair, and build in the character reference field.",
  "studio.aiError.issue.missingCostume.title": "No costume reference",
  "studio.aiError.issue.missingCostume.resolution": "Specify the episode's default costume or per-scene costume versions.",
  "studio.aiError.issue.missingLocation.title": "No location reference",
  "studio.aiError.issue.missingLocation.resolution": "Write the space name, fixed structures, and time of day in the location reference field.",
  "studio.aiError.issue.missingLighting.title": "No lighting reference",
  "studio.aiError.issue.missingLighting.resolution": "Fix the key light direction and time of day or color temperature.",
  "studio.aiError.issue.missingStyle.title": "No style reference",
  "studio.aiError.issue.missingStyle.resolution": "Specify line weight, coloring, shading, and texture references in one sentence.",
  "studio.aiError.issue.missingProps.title": "No signature prop reference",
  "studio.aiError.issue.missingProps.resolution": "Fix only the weapons, accessories, and carried items that matter to the story.",
  "studio.aiError.issue.sceneLargeBatch.title": "The generation scope of {sceneTitle} is large",
  "studio.aiError.issue.sceneLargeBatch.description": "{count} cuts are concentrated in one scene, so edits will require regenerating a larger range.",
  "studio.aiError.issue.sceneLargeBatch.resolution": "Split the scene at action transitions or location changes.",
  "studio.aiError.issue.sceneLocationAmbiguous.title": "The location of {sceneTitle} is ambiguous",
  "studio.aiError.issue.sceneLocationAmbiguous.description": "The episode has several location candidates, but no location was found for this scene.",
  "studio.aiError.issue.sceneLocationAmbiguous.resolution": "State the location in the scene title or its first sentence.",
  "studio.aiError.issue.sceneLightingConflict.title": "The time of day in {sceneTitle} may conflict",
  "studio.aiError.issue.sceneLightingConflict.description": "The expressions {times} were detected together in one scene.",
  "studio.aiError.issue.sceneLightingConflict.resolution": "State the time transition explicitly, split the scene, and assign a lighting version.",
  "studio.aiError.issue.costumeChangeWithoutTransition.title": "The costume change is not explained",
  "studio.aiError.issue.costumeChangeWithoutTransition.description": "{detail} was detected, but there is no costume-change or time-transition instruction.",
  "studio.aiError.issue.costumeChangeWithoutTransition.resolution": "Attach a costume version per scene or add a costume-change transition sentence.",
  "studio.aiError.issue.cutLongDialogue.title": "The dialogue in cut {cutNumber} is long",
  "studio.aiError.issue.cutLongDialogue.description": "It was detected at {count} characters, which pressures mobile speech bubbles and facial acting at the same time.",
  "studio.aiError.issue.cutLongDialogue.resolution": "Split it into two speech bubbles or a reaction cut, and put the key line first.",
  "studio.aiError.issue.cutRepeatedShot.title": "The same shot repeats through cut {cutNumber}",
  "studio.aiError.issue.cutRepeatedShot.description": "The {shotScale} composition continues for 3 cuts in a row, which can flatten the scroll rhythm.",
  "studio.aiError.issue.cutRepeatedShot.resolution": "Vary it with an emotional close-up, a spatial long shot, or an action detail.",
  "studio.aiError.issue.cameraVarietyLow.title": "There is little camera variety",
  "studio.aiError.issue.cameraVarietyLow.description": "Only {shotCount} shot sizes and {angleCount} angles are used.",
  "studio.aiError.issue.cameraVarietyLow.resolution": "Add angle changes only at key beats where the reader's gaze needs to move.",
  "studio.aiError.issue.episodeCutCountHigh.title": "There are too many cuts to plan at once",
  "studio.aiError.issue.episodeCutCountHigh.description": "{count} cuts make the edit and review scope large, so a generation failure has a bigger impact.",
  "studio.aiError.issue.episodeCutCountHigh.resolution": "Split the episode into parts, or generate and approve scene by scene.",
  "studio.aiError.media.apiNotConnected": "The image editing API is not connected.",
  "studio.aiError.media.editPathMissing": "The current connection has no image editing path.",
  "studio.aiError.media.repairUnavailable": "Mask region repair is unavailable.",
  "studio.aiError.media.repairPromptRequired": "Enter repair instructions.",
  "studio.aiError.media.repairImageOrMaskInvalid": "The repair image or mask is invalid.",
  "studio.aiError.media.repairMustBeImages": "The repair source and mask must be images.",
  "studio.aiError.media.repairRequestCancelled": "The repair request was cancelled.",
  "studio.aiError.media.repairRequestFailed": "The repair request failed.",
  "studio.aiError.media.repairResultUnparseable": "Could not parse the repair result.",
  "studio.aiError.media.repairRequestFailedWithStatus": "The repair request failed (HTTP {status}): {message}",
  "studio.aiError.media.repairResultImageMissing": "The repair result has no image.",
  "studio.aiError.media.analysisBrowserOnly": "Image analysis is only available in the browser.",
  "studio.aiError.media.workBrowserOnly": "This operation is only available in the browser.",
  "studio.aiError.media.context2dUnavailable": "Could not create a 2D image processing context.",
  "studio.aiError.media.maskSizeMismatch": "The layer separation mask size differs from the source image.",
  "studio.aiError.media.findingResolution": "The original is {width}×{height}px. Check it before enlarging for the final manuscript.",
  "studio.aiError.media.findingAlpha": "Transparent pixels are included. Check the compositing order and background.",
  "studio.aiError.media.findingEdgeClipping": "Opaque subjects touch the image edges a lot, so check for clipping.",
  "studio.aiError.media.findingContrast": "The contrast is low, so characters and background may merge on small screens.",
  "studio.aiError.media.findingExposure": "The share of very dark or bright pixels is high. Check for detail loss.",
  "studio.aiError.media.findingSemanticUnknown": "Character identity, hands, anatomy, and story accuracy are not determined by automatic pixel checks.",
  "studio.aiError.media.singleLayerLimitation": "There is no separable provider layer or reviewed mask, so it stays as a single scene layer.",
  "studio.aiError.preflight.imageUnavailable": "The image API is not connected, so this cannot run. Add a key in the AI assist settings.",
  "studio.aiError.preflight.textUnavailable": "Text AI is not connected, so this cannot run. Sign in to use the automatic free AI first; if no free route is available, connect a personal cloud API key and model in the unified AI settings.",
  "studio.aiError.preflight.connectionUnverified": "The connection status could not be verified as healthy ({connectionLabel}). Check again in the AI assist settings.",
  "studio.aiError.scenarioImage.referenceAssetsLoading": "AI reference assets are still loading. Please try again in a moment.",
  "studio.aiError.scenarioImage.referenceLimitExceeded": "You can use up to {count} AI image references. Remove some from the reference pack.",
  "studio.aiError.scenarioImage.referenceAssetsMissing": "Could not find {count} connected AI reference assets. Remove them from the reference pack or add the assets again.",
  "studio.aiError.scenarioImage.batchLimitExceeded": "You can generate up to {count} at a time. Reduce the selected cuts or candidates and generate in batches.",
  "studio.aiError.comicApi.loginRequired": "Sign in to save AI Comic Director sessions to the cloud.",
  "studio.aiError.comicApi.serverUnreachable": "Could not connect to the AI Comic Director storage server.",
  "studio.aiError.comicApi.responseUnparseable": "Could not parse the AI Comic Director server response.",
  "studio.aiError.comicApi.requestFailedWithStatus": "The request failed (HTTP {status}).",
  "studio.aiError.canon.nameRequired": "Enter a character name.",
  "studio.aiError.canon.appearanceRequired": "Enter an appearance description. It helps to show the face, hair, and build.",
  "studio.aiError.session.providerCompletionUnverified": "While the browser connection was lost, provider completion could not be verified.",
  "studio.aiError.bridge.noRecentStroke": "There are no recent committed strokes to propose from.",
  "studio.aiError.bridge.sourceElementMissing": "Could not find the source element for the proposed stroke.",
  "studio.aiError.bridge.proposalFailed": "Could not create a stroke proposal. Please try again in a moment.",
  "studio.aiError.onnx.canvasSizeInvalid": "The layer separation canvas size is invalid.",
  "studio.aiError.onnx.canvasTooLarge": "Layer separation export supports up to {maxPixels}px. Colorize again with a smaller image.",
  "studio.aiError.onnx.layerSizeMismatch": "The {label} layer size does not match {width}×{height}.",
  "studio.aiError.onnx.sourceBufferSizeMismatch": "The source RGBA buffer length does not match the image size.",
  "studio.aiError.onnx.noLayersForPsd": "There are no layers to save as a PSD.",
  "studio.aiError.onnx.duplicateLayerId": "Colorize layer IDs are duplicated.",
  "studio.aiError.onnx.psdCreationFailed": "Could not create the PSD file: {message}",
  "studio.aiError.onnx.psdResultOutOfBudget": "The colorize layer PSD result exceeds the signature, version, or output budget.",
  "studio.aiError.onnx.highlightSkippedReason": "Highlights are not made into a separate layer because the source line art has no highlight information and the model's bright areas are already in the base color layer.",
};

registerI18nLocaleEntries("ko", KO);
registerI18nLocaleEntries("en", EN);

/** 이 트랜치가 등록한 키의 ko 원문 (테스트·영속 해석 폴백용). */
export const STUDIO_AI_ERROR_T4T5_KO: Readonly<Record<string, string>> = KO;

/** 이 트랜치가 등록한 키의 en 번역 (테스트 패리티 검증용). */
export const STUDIO_AI_ERROR_T4T5_EN: Readonly<Record<string, string>> = EN;

/** 영속 필드에 문구 대신 저장하는 코드 표식 접두사. */
export const AI_ERROR_CODE_PREFIX = "i18n:";

/** 영속 레코드에 문자열 대신 코드(+키)를 저장한다. 표시 시점에 해석한다. */
export function encodeAiErrorCode(key: string): string {
  return `${AI_ERROR_CODE_PREFIX}${key}`;
}

/**
 * 영속된 값을 표시 시점에 현재 로케일로 해석한다. 코드 표식이 없는
 * 구 레코드(한국어 문자열 저장분)는 하위호환으로 그대로 돌려준다.
 */
export function resolvePersistedAiErrorText(value: string): string {
  if (!value.startsWith(AI_ERROR_CODE_PREFIX)) return value;
  const key = value.slice(AI_ERROR_CODE_PREFIX.length);
  const koFallback = KO[key as AiErrorT4T5Key];
  return koFallback ? aiErrorText(key, koFallback) : value;
}

const MISSING_ANCHOR_CODES = {
  character: "missingCharacter",
  costume: "missingCostume",
  location: "missingLocation",
  lighting: "missingLighting",
  style: "missingStyle",
  props: "missingProps",
} as const;

/** episode 이슈 id → 사전 코드. 동적 id 패턴(scene-N-…·cut-N-…)도 여기서 흡수한다. */
export function studioAiEpisodeIssueCode(issueId: string): string | null {
  if (issueId === "input-empty") return "inputEmpty";
  if (issueId === "input-too-few-cuts") return "inputTooFewCuts";
  if (issueId === "costume-change-without-transition") return "costumeChangeWithoutTransition";
  if (issueId === "camera-variety-low") return "cameraVarietyLow";
  if (issueId === "episode-cut-count-high") return "episodeCutCountHigh";
  const missing = /^missing-(character|costume|location|lighting|style|props)-anchor$/.exec(issueId);
  if (missing) return MISSING_ANCHOR_CODES[missing[1] as keyof typeof MISSING_ANCHOR_CODES];
  if (/^scene-\d+-large-batch$/.test(issueId)) return "sceneLargeBatch";
  if (/^scene-\d+-location-ambiguous$/.test(issueId)) return "sceneLocationAmbiguous";
  if (/^scene-\d+-lighting-conflict$/.test(issueId)) return "sceneLightingConflict";
  if (/^cut-\d+-long-dialogue$/.test(issueId)) return "cutLongDialogue";
  if (/^cut-\d+-repeated-shot$/.test(issueId)) return "cutRepeatedShot";
  return null;
}

/**
 * 표시 시점 해석 계층 — 생산자가 만든 이슈(id+파라미터+한국어 폴백)를
 * 현재 로케일 문구로 바꾼다. 코드를 모르거나 템플릿 파라미터가 없으면
 * 생산자 원문을 그대로 돌려주므로 구 데이터도 깨지지 않는다.
 * missing-anchor 계열은 description 키만 공유하고 title/resolution은
 * 잠금별 키를 쓴다.
 */
export function resolveStudioAiEpisodeIssue(
  issue: StudioAiEpisodeIssue,
): StudioAiEpisodeIssue {
  const code = studioAiEpisodeIssueCode(issue.id);
  if (!code) return issue;
  const needsParams = code !== "inputEmpty";
  if (needsParams && !issue.params) return issue;
  const params: Record<string, string | number> = { ...(issue.params ?? {}) };
  if (issue.cutNumber !== undefined) params.cutNumber ??= issue.cutNumber;
  if (issue.sceneNumber !== undefined) params.sceneNumber ??= issue.sceneNumber;
  const prefix = `studio.aiError.issue.${code}`;
  const descriptionKey = code.startsWith("missing")
    ? "studio.aiError.issue.missingAnchor.description"
    : `${prefix}.description`;
  return {
    ...issue,
    title: aiErrorText(`${prefix}.title`, params, issue.title),
    description: aiErrorText(descriptionKey, params, issue.description),
    resolution: aiErrorText(`${prefix}.resolution`, params, issue.resolution),
  };
}

const FINDING_KEYS: Readonly<Record<string, AiErrorT4T5Key>> = {
  resolution: "studio.aiError.media.findingResolution",
  alpha: "studio.aiError.media.findingAlpha",
  "edge-clipping": "studio.aiError.media.findingEdgeClipping",
  contrast: "studio.aiError.media.findingContrast",
  exposure: "studio.aiError.media.findingExposure",
  "semantic-unknown": "studio.aiError.media.findingSemanticUnknown",
};

/**
 * media findings 표시 시점 해석 — finding.id로 키를 찾고, 해상도 finding은
 * 리포트의 실측 크기(width·height)를 파라미터로 채운다. 모르는 id거나
 * 파라미터가 없으면 생산자 원문을 그대로 돌려준다.
 */
export function resolveStudioAiComicFindingMessage(
  finding: Pick<ScenarioImageQualityFinding, "id" | "message">,
  report?: { readonly width: number; readonly height: number },
): string {
  const key = FINDING_KEYS[finding.id];
  if (!key) return finding.message;
  if (finding.id === "resolution") {
    if (!report) return finding.message;
    return aiErrorText(
      key,
      { width: report.width, height: report.height },
      finding.message,
    );
  }
  return aiErrorText(key, finding.message);
}
