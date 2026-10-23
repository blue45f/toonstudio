/**
 * 생산자 구조화 에러 해석 모듈 — storyworld 구간: studio-storyworld-causality 이슈 세부 37코드 + 수선 제안 9쌍 (A4 D4, R14).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 코어 모듈이
 * 소스 파일 크기 래칫(800줄 상한)에 닿아, R11 구간부터 frozen 사전군과 같은
 * 분할 관례로 파일 단위 형제 모듈로 나눴다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 *
 * 코드 체계: 기존 거친 코드 24종 중 dangling-reference 11변형은 지칭 대상별
 * 세부 코드로 분리하고, accessibility-gap·rights-risk·orphan-payoff의 변형
 * 2종씩도 세부 코드로 나눴다(총 37종). 수선 제안은 생산자가 repairCode만
 * 방출하고 title/rationale은 repair.<repairCode> 키 쌍으로 해석한다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  StoryworldIssue,
  StoryworldIssueCode,
  StoryworldRepairCode,
  StoryworldRepairProposal,
} from "../storyworld/studio-storyworld-causality";

function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.storyworld.danglingEffectFact": "장면 ‘{sceneTitle}’의 효과가 정의되지 않은 사실 {factId}을(를) 가리킵니다.",
  "studio.producerError.storyworld.danglingDependencyScene": "장면 ‘{sceneTitle}’이 존재하지 않는 선행 장면 {id}을(를) 요구합니다.",
  "studio.producerError.storyworld.danglingCharacterFact": "인물 ‘{characterName}’이 정의되지 않은 사실 {factId}을(를) 참조합니다.",
  "studio.producerError.storyworld.danglingParticipant": "장면 ‘{sceneTitle}’의 참여 인물 {characterId}이(가) 존재하지 않습니다.",
  "studio.producerError.storyworld.danglingAssignee": "장면 ‘{sceneTitle}’의 담당자 {assigneeId}이(가) 프로젝트 인물/역할 목록에 없습니다.",
  "studio.producerError.storyworld.danglingPremiseFact": "장면 ‘{sceneTitle}’이 정의되지 않은 사실 {factId}을(를) 전제로 사용합니다.",
  "studio.producerError.storyworld.danglingKnowledgeCharacter": "장면 ‘{sceneTitle}’이 존재하지 않는 인물 {characterId}의 지식을 사용합니다.",
  "studio.producerError.storyworld.danglingKnowledgeFact": "장면 ‘{sceneTitle}’이 정의되지 않은 사실 {factId}을(를) 지식으로 사용합니다.",
  "studio.producerError.storyworld.danglingRevealFact": "장면 ‘{sceneTitle}’의 공개가 정의되지 않은 사실 {factId}을(를) 가리킵니다.",
  "studio.producerError.storyworld.danglingRevealAudience": "장면 ‘{sceneTitle}’의 공개 대상 인물 {characterId}이(가) 존재하지 않습니다.",
  "studio.producerError.storyworld.danglingEmotionCharacter": "장면 ‘{sceneTitle}’의 감정 비트가 존재하지 않는 인물 {characterId}을(를) 가리킵니다.",
  "studio.producerError.storyworld.invalidMutation": "장면 ‘{sceneTitle}’에서 숫자가 아닌 사실 {factId}에 증감 연산을 시도했습니다.",
  "studio.producerError.storyworld.duplicateId": "{family} id ‘{id}’가 중복됩니다.",
  "studio.producerError.storyworld.dependencyCycle": "장면 의존성이 순환합니다: {cycle}",
  "studio.producerError.storyworld.inactiveDependency": "활성 장면 ‘{sceneTitle}’이 비활성 선행 장면 ‘{dependencyTitle}’에 의존합니다.",
  "studio.producerError.storyworld.dependencyOrder": "장면 ‘{sceneTitle}’의 선행 장면 ‘{dependencyTitle}’이 현재 장면보다 뒤에 배치되어 있습니다.",
  "studio.producerError.storyworld.timeRegression": "‘{sceneTitle}’의 시간 인덱스가 직전 장면보다 뒤로 이동합니다. 회상 표식이 필요합니다.",
  "studio.producerError.storyworld.impossibleTravel": "같은 시간에 {sharedNames}이(가) {fromLocation}에서 {toLocation}(으)로 이동합니다.",
  "studio.producerError.storyworld.missingPrecondition": "‘{sceneTitle}’에 필요한 사실 {factId}이 아직 성립하지 않았습니다.",
  "studio.producerError.storyworld.contradictedPrecondition": "‘{sceneTitle}’의 전제 {factId}이 현재 세계 상태와 모순됩니다.",
  "studio.producerError.storyworld.knowledgeLeak": "‘{sceneTitle}’에서 {characterId}이(가) 아직 알 수 없는 사실 {factId}을(를) 사용합니다.",
  "studio.producerError.storyworld.prematureReaderReveal": "사실 {factLabel}이(가) 계획보다 일찍 독자에게 노출됩니다.",
  "studio.producerError.storyworld.readerRevealMissed": "사실 ‘{factLabel}’의 예정 공개 시점이 지났지만 독자 공개 장면이 없습니다.",
  "studio.producerError.storyworld.orphanPayoffBeforeSetup": "복선 {setupLabel}의 회수가 설치보다 먼저 또는 설치 없이 등장합니다.",
  "studio.producerError.storyworld.orphanPayoffFirstBeforeFirstSetup": "복선 {setupLabel}의 첫 회수가 첫 설치보다 앞섭니다.",
  "studio.producerError.storyworld.unpaidSetup": "복선 {setupLabel}의 회수가 {dueOrder}화 순서까지 완료되지 않았습니다.",
  "studio.producerError.storyworld.motifUnderused": "모티프 {motifLabel}이(가) 목표 횟수보다 적게 등장합니다.",
  "studio.producerError.storyworld.motifGap": "모티프 {motifLabel}의 등장 간격이 {gapScenes}개 장면까지 벌어집니다.",
  "studio.producerError.storyworld.emotionalWhiplash": "‘{sceneTitle}’에서 {characterId}의 감정이 연결 비트 없이 크게 점프합니다.",
  "studio.producerError.storyworld.localizationOverflow": "‘{sceneTitle}’의 {locale} 번역이 말풍선 용량을 {overflowChars}자 초과합니다.",
  "studio.producerError.storyworld.accessibilityEvidenceMissing": "‘{sceneTitle}’에 접근성 근거가 기록되지 않았습니다.",
  "studio.producerError.storyworld.accessibilityEvidenceShort": "‘{sceneTitle}’의 접근성 증거가 {missingCount}개 부족합니다.",
  "studio.producerError.storyworld.rightsLicenseStatus": "‘{sceneTitle}’의 자산 ‘{assetLabel}’ 사용 권리가 {licenseStatus} 상태입니다.",
  "studio.producerError.storyworld.rightsConsentStatus": "‘{sceneTitle}’의 자산 ‘{assetLabel}’에 필요한 동의가 {consentStatus} 상태입니다.",
  "studio.producerError.storyworld.missingProvenance": "생성 자산 ‘{assetLabel}’의 모델·입력·원본 해시 영수증이 없습니다.",
  "studio.producerError.storyworld.productionBottleneck": "‘{sceneTitle}’의 제작 복잡도 {complexity}가 병목 경고선 {threshold}을 넘습니다.",
  "studio.producerError.storyworld.productionOverCapacity": "예상 제작 시간 {totalMinutes}분이 가용 시간 {capacityMinutes}분을 초과합니다.",
  "studio.producerError.storyworld.repair.knowledge-leak.title": "지식 획득 비트 제안",
  "studio.producerError.storyworld.repair.knowledge-leak.rationale": "사용 장면보다 앞선 장면에 명시적 전달·목격·추론 공개를 추가합니다.",
  "studio.producerError.storyworld.repair.premature-reader-reveal.title": "독자 공개 시점 복원",
  "studio.producerError.storyworld.repair.premature-reader-reveal.rationale": "시각·대사·메타데이터에서 해당 사실을 계획된 공개 순서까지 숨깁니다.",
  "studio.producerError.storyworld.repair.unpaid-setup.title": "최소 회수 장면 제안",
  "studio.producerError.storyworld.repair.unpaid-setup.rationale": "기존 설정을 폐기하지 않고 가장 가까운 장면에 짧은 시각·행동 회수를 배치합니다.",
  "studio.producerError.storyworld.repair.emotional-whiplash.title": "감정 연결 비트 추가",
  "studio.producerError.storyworld.repair.emotional-whiplash.rationale": "표정·행동·침묵·컷 여백 중 하나로 변화 원인을 독자가 관찰할 수 있게 합니다.",
  "studio.producerError.storyworld.repair.localization-overflow.title": "번역 레이아웃 안전 영역 확대",
  "studio.producerError.storyworld.repair.localization-overflow.rationale": "원문을 훼손하지 않고 말풍선 재배치·자동 행갈이·대체 짧은 번역을 비교합니다.",
  "studio.producerError.storyworld.repair.accessibility-gap.title": "접근성 증거 채우기",
  "studio.producerError.storyworld.repair.accessibility-gap.rationale": "읽기 순서·비색상 단서·대체 텍스트·동작 대체를 장면 체크리스트로 기록합니다.",
  "studio.producerError.storyworld.repair.rights-risk.title": "권리 안전 자산으로 교체",
  "studio.producerError.storyworld.repair.rights-risk.rationale": "정확한 리비전과 사용 근거가 있는 자산으로 분기 교체하고 원본은 보존합니다.",
  "studio.producerError.storyworld.repair.production-split.title": "제작 단위 분할",
  "studio.producerError.storyworld.repair.production-split.rationale": "장면을 배경·인물·레터링·검수 작업으로 분리해 병렬화와 자산 재사용을 검토합니다.",
  "studio.producerError.storyworld.repair.review-manually.title": "근거와 함께 수동 검토",
  "studio.producerError.storyworld.repair.review-manually.rationale": "자동 수정은 적용하지 않고 문제 장면과 현재 세계 상태를 함께 엽니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.storyworld.danglingEffectFact": "The effect of scene '{sceneTitle}' points to the undefined fact {factId}.",
  "studio.producerError.storyworld.danglingDependencyScene": "Scene '{sceneTitle}' requires the preceding scene {id}, which does not exist.",
  "studio.producerError.storyworld.danglingCharacterFact": "Character '{characterName}' references the undefined fact {factId}.",
  "studio.producerError.storyworld.danglingParticipant": "Participant {characterId} in scene '{sceneTitle}' does not exist.",
  "studio.producerError.storyworld.danglingAssignee": "Assignee {assigneeId} in scene '{sceneTitle}' is not in the project's character/role list.",
  "studio.producerError.storyworld.danglingPremiseFact": "Scene '{sceneTitle}' uses the undefined fact {factId} as a premise.",
  "studio.producerError.storyworld.danglingKnowledgeCharacter": "Scene '{sceneTitle}' uses the knowledge of character {characterId}, who does not exist.",
  "studio.producerError.storyworld.danglingKnowledgeFact": "Scene '{sceneTitle}' uses the undefined fact {factId} as knowledge.",
  "studio.producerError.storyworld.danglingRevealFact": "The reveal in scene '{sceneTitle}' points to the undefined fact {factId}.",
  "studio.producerError.storyworld.danglingRevealAudience": "Reveal target character {characterId} in scene '{sceneTitle}' does not exist.",
  "studio.producerError.storyworld.danglingEmotionCharacter": "The emotional beat in scene '{sceneTitle}' points to character {characterId}, who does not exist.",
  "studio.producerError.storyworld.invalidMutation": "Scene '{sceneTitle}' tried to increment or decrement the non-numeric fact {factId}.",
  "studio.producerError.storyworld.duplicateId": "The {family} id '{id}' is duplicated.",
  "studio.producerError.storyworld.dependencyCycle": "Scene dependencies form a cycle: {cycle}",
  "studio.producerError.storyworld.inactiveDependency": "Active scene '{sceneTitle}' depends on the inactive preceding scene '{dependencyTitle}'.",
  "studio.producerError.storyworld.dependencyOrder": "The preceding scene '{dependencyTitle}' of scene '{sceneTitle}' is placed after the current scene.",
  "studio.producerError.storyworld.timeRegression": "The time index of '{sceneTitle}' moves backward from the previous scene. A flashback marker is needed.",
  "studio.producerError.storyworld.impossibleTravel": "At the same time, {sharedNames} moves from {fromLocation} to {toLocation}.",
  "studio.producerError.storyworld.missingPrecondition": "The fact {factId} needed for '{sceneTitle}' has not been established yet.",
  "studio.producerError.storyworld.contradictedPrecondition": "The premise {factId} of '{sceneTitle}' contradicts the current world state.",
  "studio.producerError.storyworld.knowledgeLeak": "In '{sceneTitle}', {characterId} uses the fact {factId}, which they cannot know yet.",
  "studio.producerError.storyworld.prematureReaderReveal": "The fact {factLabel} is exposed to the reader earlier than planned.",
  "studio.producerError.storyworld.readerRevealMissed": "The planned reveal point for the fact '{factLabel}' has passed, but there is no scene revealing it to the reader.",
  "studio.producerError.storyworld.orphanPayoffBeforeSetup": "The payoff of the setup {setupLabel} appears before its setup, or without any setup.",
  "studio.producerError.storyworld.orphanPayoffFirstBeforeFirstSetup": "The first payoff of the setup {setupLabel} comes before its first setup.",
  "studio.producerError.storyworld.unpaidSetup": "The payoff of the setup {setupLabel} was not completed by episode order {dueOrder}.",
  "studio.producerError.storyworld.motifUnderused": "The motif {motifLabel} appears fewer times than its target count.",
  "studio.producerError.storyworld.motifGap": "The gap between appearances of the motif {motifLabel} widens to {gapScenes} scenes.",
  "studio.producerError.storyworld.emotionalWhiplash": "In '{sceneTitle}', the emotion of {characterId} jumps sharply without a connecting beat.",
  "studio.producerError.storyworld.localizationOverflow": "The {locale} translation of '{sceneTitle}' overflows the balloon capacity by {overflowChars} characters.",
  "studio.producerError.storyworld.accessibilityEvidenceMissing": "No accessibility evidence is recorded for '{sceneTitle}'.",
  "studio.producerError.storyworld.accessibilityEvidenceShort": "The accessibility evidence for '{sceneTitle}' is missing {missingCount} items.",
  "studio.producerError.storyworld.rightsLicenseStatus": "The usage right for asset '{assetLabel}' in '{sceneTitle}' is in the {licenseStatus} state.",
  "studio.producerError.storyworld.rightsConsentStatus": "The consent required for asset '{assetLabel}' in '{sceneTitle}' is in the {consentStatus} state.",
  "studio.producerError.storyworld.missingProvenance": "The generated asset '{assetLabel}' has no model, input, or source hash receipt.",
  "studio.producerError.storyworld.productionBottleneck": "The production complexity {complexity} of '{sceneTitle}' exceeds the bottleneck warning line {threshold}.",
  "studio.producerError.storyworld.productionOverCapacity": "The estimated production time of {totalMinutes} minutes exceeds the available {capacityMinutes} minutes.",
  "studio.producerError.storyworld.repair.knowledge-leak.title": "Add a knowledge acquisition beat",
  "studio.producerError.storyworld.repair.knowledge-leak.rationale": "Add an explicit handover, witnessing, or deduction reveal in a scene before the use scene.",
  "studio.producerError.storyworld.repair.premature-reader-reveal.title": "Restore the reader reveal timing",
  "studio.producerError.storyworld.repair.premature-reader-reveal.rationale": "Hide the fact in visuals, dialogue, and metadata until its planned reveal order.",
  "studio.producerError.storyworld.repair.unpaid-setup.title": "Add a minimal payoff scene",
  "studio.producerError.storyworld.repair.unpaid-setup.rationale": "Place a short visual or action payoff in the nearest scene without discarding the existing setup.",
  "studio.producerError.storyworld.repair.emotional-whiplash.title": "Add an emotional connecting beat",
  "studio.producerError.storyworld.repair.emotional-whiplash.rationale": "Let the reader observe the cause of the change through expression, action, silence, or panel spacing.",
  "studio.producerError.storyworld.repair.localization-overflow.title": "Expand the translation layout safe area",
  "studio.producerError.storyworld.repair.localization-overflow.rationale": "Compare balloon repositioning, automatic line breaking, and a shorter alternative translation without altering the source text.",
  "studio.producerError.storyworld.repair.accessibility-gap.title": "Fill in the accessibility evidence",
  "studio.producerError.storyworld.repair.accessibility-gap.rationale": "Record reading order, non-color cues, alternative text, and motion alternatives as a scene checklist.",
  "studio.producerError.storyworld.repair.rights-risk.title": "Replace with a rights-safe asset",
  "studio.producerError.storyworld.repair.rights-risk.rationale": "Branch-replace with an asset that has an exact revision and usage basis, and preserve the original.",
  "studio.producerError.storyworld.repair.production-split.title": "Split the production unit",
  "studio.producerError.storyworld.repair.production-split.rationale": "Split the scene into background, character, lettering, and review work to consider parallelization and asset reuse.",
  "studio.producerError.storyworld.repair.review-manually.title": "Review manually with the evidence",
  "studio.producerError.storyworld.repair.review-manually.rationale": "Do not apply an automatic fix; open the problem scene together with the current world state.",
});

const STORYWORLD_ISSUE_KEYS: Readonly<Record<StoryworldIssueCode, string>> = {
  "dangling-effect-fact": "studio.producerError.storyworld.danglingEffectFact",
  "dangling-dependency-scene": "studio.producerError.storyworld.danglingDependencyScene",
  "dangling-character-fact": "studio.producerError.storyworld.danglingCharacterFact",
  "dangling-participant": "studio.producerError.storyworld.danglingParticipant",
  "dangling-assignee": "studio.producerError.storyworld.danglingAssignee",
  "dangling-premise-fact": "studio.producerError.storyworld.danglingPremiseFact",
  "dangling-knowledge-character": "studio.producerError.storyworld.danglingKnowledgeCharacter",
  "dangling-knowledge-fact": "studio.producerError.storyworld.danglingKnowledgeFact",
  "dangling-reveal-fact": "studio.producerError.storyworld.danglingRevealFact",
  "dangling-reveal-audience": "studio.producerError.storyworld.danglingRevealAudience",
  "dangling-emotion-character": "studio.producerError.storyworld.danglingEmotionCharacter",
  "invalid-mutation": "studio.producerError.storyworld.invalidMutation",
  "duplicate-id": "studio.producerError.storyworld.duplicateId",
  "dependency-cycle": "studio.producerError.storyworld.dependencyCycle",
  "inactive-dependency": "studio.producerError.storyworld.inactiveDependency",
  "dependency-order": "studio.producerError.storyworld.dependencyOrder",
  "time-regression": "studio.producerError.storyworld.timeRegression",
  "impossible-travel": "studio.producerError.storyworld.impossibleTravel",
  "missing-precondition": "studio.producerError.storyworld.missingPrecondition",
  "contradicted-precondition": "studio.producerError.storyworld.contradictedPrecondition",
  "knowledge-leak": "studio.producerError.storyworld.knowledgeLeak",
  "premature-reader-reveal": "studio.producerError.storyworld.prematureReaderReveal",
  "reader-reveal-missed": "studio.producerError.storyworld.readerRevealMissed",
  "orphan-payoff-before-setup": "studio.producerError.storyworld.orphanPayoffBeforeSetup",
  "orphan-payoff-first-before-first-setup": "studio.producerError.storyworld.orphanPayoffFirstBeforeFirstSetup",
  "unpaid-setup": "studio.producerError.storyworld.unpaidSetup",
  "motif-underused": "studio.producerError.storyworld.motifUnderused",
  "motif-gap": "studio.producerError.storyworld.motifGap",
  "emotional-whiplash": "studio.producerError.storyworld.emotionalWhiplash",
  "localization-overflow": "studio.producerError.storyworld.localizationOverflow",
  "accessibility-evidence-missing": "studio.producerError.storyworld.accessibilityEvidenceMissing",
  "accessibility-evidence-short": "studio.producerError.storyworld.accessibilityEvidenceShort",
  "rights-license-status": "studio.producerError.storyworld.rightsLicenseStatus",
  "rights-consent-status": "studio.producerError.storyworld.rightsConsentStatus",
  "missing-provenance": "studio.producerError.storyworld.missingProvenance",
  "production-bottleneck": "studio.producerError.storyworld.productionBottleneck",
  "production-over-capacity": "studio.producerError.storyworld.productionOverCapacity",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const STORYWORLD_ISSUE_KO: Readonly<Record<StoryworldIssueCode, string>> = {
  "dangling-effect-fact": "장면 ‘{sceneTitle}’의 효과가 정의되지 않은 사실 {factId}을(를) 가리킵니다.",
  "dangling-dependency-scene": "장면 ‘{sceneTitle}’이 존재하지 않는 선행 장면 {id}을(를) 요구합니다.",
  "dangling-character-fact": "인물 ‘{characterName}’이 정의되지 않은 사실 {factId}을(를) 참조합니다.",
  "dangling-participant": "장면 ‘{sceneTitle}’의 참여 인물 {characterId}이(가) 존재하지 않습니다.",
  "dangling-assignee": "장면 ‘{sceneTitle}’의 담당자 {assigneeId}이(가) 프로젝트 인물/역할 목록에 없습니다.",
  "dangling-premise-fact": "장면 ‘{sceneTitle}’이 정의되지 않은 사실 {factId}을(를) 전제로 사용합니다.",
  "dangling-knowledge-character": "장면 ‘{sceneTitle}’이 존재하지 않는 인물 {characterId}의 지식을 사용합니다.",
  "dangling-knowledge-fact": "장면 ‘{sceneTitle}’이 정의되지 않은 사실 {factId}을(를) 지식으로 사용합니다.",
  "dangling-reveal-fact": "장면 ‘{sceneTitle}’의 공개가 정의되지 않은 사실 {factId}을(를) 가리킵니다.",
  "dangling-reveal-audience": "장면 ‘{sceneTitle}’의 공개 대상 인물 {characterId}이(가) 존재하지 않습니다.",
  "dangling-emotion-character": "장면 ‘{sceneTitle}’의 감정 비트가 존재하지 않는 인물 {characterId}을(를) 가리킵니다.",
  "invalid-mutation": "장면 ‘{sceneTitle}’에서 숫자가 아닌 사실 {factId}에 증감 연산을 시도했습니다.",
  "duplicate-id": "{family} id ‘{id}’가 중복됩니다.",
  "dependency-cycle": "장면 의존성이 순환합니다: {cycle}",
  "inactive-dependency": "활성 장면 ‘{sceneTitle}’이 비활성 선행 장면 ‘{dependencyTitle}’에 의존합니다.",
  "dependency-order": "장면 ‘{sceneTitle}’의 선행 장면 ‘{dependencyTitle}’이 현재 장면보다 뒤에 배치되어 있습니다.",
  "time-regression": "‘{sceneTitle}’의 시간 인덱스가 직전 장면보다 뒤로 이동합니다. 회상 표식이 필요합니다.",
  "impossible-travel": "같은 시간에 {sharedNames}이(가) {fromLocation}에서 {toLocation}(으)로 이동합니다.",
  "missing-precondition": "‘{sceneTitle}’에 필요한 사실 {factId}이 아직 성립하지 않았습니다.",
  "contradicted-precondition": "‘{sceneTitle}’의 전제 {factId}이 현재 세계 상태와 모순됩니다.",
  "knowledge-leak": "‘{sceneTitle}’에서 {characterId}이(가) 아직 알 수 없는 사실 {factId}을(를) 사용합니다.",
  "premature-reader-reveal": "사실 {factLabel}이(가) 계획보다 일찍 독자에게 노출됩니다.",
  "reader-reveal-missed": "사실 ‘{factLabel}’의 예정 공개 시점이 지났지만 독자 공개 장면이 없습니다.",
  "orphan-payoff-before-setup": "복선 {setupLabel}의 회수가 설치보다 먼저 또는 설치 없이 등장합니다.",
  "orphan-payoff-first-before-first-setup": "복선 {setupLabel}의 첫 회수가 첫 설치보다 앞섭니다.",
  "unpaid-setup": "복선 {setupLabel}의 회수가 {dueOrder}화 순서까지 완료되지 않았습니다.",
  "motif-underused": "모티프 {motifLabel}이(가) 목표 횟수보다 적게 등장합니다.",
  "motif-gap": "모티프 {motifLabel}의 등장 간격이 {gapScenes}개 장면까지 벌어집니다.",
  "emotional-whiplash": "‘{sceneTitle}’에서 {characterId}의 감정이 연결 비트 없이 크게 점프합니다.",
  "localization-overflow": "‘{sceneTitle}’의 {locale} 번역이 말풍선 용량을 {overflowChars}자 초과합니다.",
  "accessibility-evidence-missing": "‘{sceneTitle}’에 접근성 근거가 기록되지 않았습니다.",
  "accessibility-evidence-short": "‘{sceneTitle}’의 접근성 증거가 {missingCount}개 부족합니다.",
  "rights-license-status": "‘{sceneTitle}’의 자산 ‘{assetLabel}’ 사용 권리가 {licenseStatus} 상태입니다.",
  "rights-consent-status": "‘{sceneTitle}’의 자산 ‘{assetLabel}’에 필요한 동의가 {consentStatus} 상태입니다.",
  "missing-provenance": "생성 자산 ‘{assetLabel}’의 모델·입력·원본 해시 영수증이 없습니다.",
  "production-bottleneck": "‘{sceneTitle}’의 제작 복잡도 {complexity}가 병목 경고선 {threshold}을 넘습니다.",
  "production-over-capacity": "예상 제작 시간 {totalMinutes}분이 가용 시간 {capacityMinutes}분을 초과합니다.",
};

/** 표시 지점 전용 해석 (storyworld 이슈): IssueList·분기 비교 목록이 부른다. */
export function resolveStoryworldIssue(issue: StoryworldIssue): string {
  return resolveProducerError(STORYWORLD_ISSUE_KEYS[issue.code], STORYWORLD_ISSUE_KO[issue.code], issue.params);
}

const STORYWORLD_REPAIR_KEYS: Readonly<Record<StoryworldRepairCode, { readonly title: string; readonly rationale: string }>> = {
  "knowledge-leak": {
    title: "studio.producerError.storyworld.repair.knowledge-leak.title",
    rationale: "studio.producerError.storyworld.repair.knowledge-leak.rationale",
  },
  "premature-reader-reveal": {
    title: "studio.producerError.storyworld.repair.premature-reader-reveal.title",
    rationale: "studio.producerError.storyworld.repair.premature-reader-reveal.rationale",
  },
  "unpaid-setup": {
    title: "studio.producerError.storyworld.repair.unpaid-setup.title",
    rationale: "studio.producerError.storyworld.repair.unpaid-setup.rationale",
  },
  "emotional-whiplash": {
    title: "studio.producerError.storyworld.repair.emotional-whiplash.title",
    rationale: "studio.producerError.storyworld.repair.emotional-whiplash.rationale",
  },
  "localization-overflow": {
    title: "studio.producerError.storyworld.repair.localization-overflow.title",
    rationale: "studio.producerError.storyworld.repair.localization-overflow.rationale",
  },
  "accessibility-gap": {
    title: "studio.producerError.storyworld.repair.accessibility-gap.title",
    rationale: "studio.producerError.storyworld.repair.accessibility-gap.rationale",
  },
  "rights-risk": {
    title: "studio.producerError.storyworld.repair.rights-risk.title",
    rationale: "studio.producerError.storyworld.repair.rights-risk.rationale",
  },
  "production-split": {
    title: "studio.producerError.storyworld.repair.production-split.title",
    rationale: "studio.producerError.storyworld.repair.production-split.rationale",
  },
  "review-manually": {
    title: "studio.producerError.storyworld.repair.review-manually.title",
    rationale: "studio.producerError.storyworld.repair.review-manually.rationale",
  },
};

/** 수선 코드별 ko 원문 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const STORYWORLD_REPAIR_KO: Readonly<Record<StoryworldRepairCode, { readonly title: string; readonly rationale: string }>> = {
  "knowledge-leak": {
    title: "지식 획득 비트 제안",
    rationale: "사용 장면보다 앞선 장면에 명시적 전달·목격·추론 공개를 추가합니다.",
  },
  "premature-reader-reveal": {
    title: "독자 공개 시점 복원",
    rationale: "시각·대사·메타데이터에서 해당 사실을 계획된 공개 순서까지 숨깁니다.",
  },
  "unpaid-setup": {
    title: "최소 회수 장면 제안",
    rationale: "기존 설정을 폐기하지 않고 가장 가까운 장면에 짧은 시각·행동 회수를 배치합니다.",
  },
  "emotional-whiplash": {
    title: "감정 연결 비트 추가",
    rationale: "표정·행동·침묵·컷 여백 중 하나로 변화 원인을 독자가 관찰할 수 있게 합니다.",
  },
  "localization-overflow": {
    title: "번역 레이아웃 안전 영역 확대",
    rationale: "원문을 훼손하지 않고 말풍선 재배치·자동 행갈이·대체 짧은 번역을 비교합니다.",
  },
  "accessibility-gap": {
    title: "접근성 증거 채우기",
    rationale: "읽기 순서·비색상 단서·대체 텍스트·동작 대체를 장면 체크리스트로 기록합니다.",
  },
  "rights-risk": {
    title: "권리 안전 자산으로 교체",
    rationale: "정확한 리비전과 사용 근거가 있는 자산으로 분기 교체하고 원본은 보존합니다.",
  },
  "production-split": {
    title: "제작 단위 분할",
    rationale: "장면을 배경·인물·레터링·검수 작업으로 분리해 병렬화와 자산 재사용을 검토합니다.",
  },
  "review-manually": {
    title: "근거와 함께 수동 검토",
    rationale: "자동 수정은 적용하지 않고 문제 장면과 현재 세계 상태를 함께 엽니다.",
  },
};

/** 표시 지점 전용 해석 (storyworld 수선 제안): 제안 카드가 title/rationale 쌍으로 부른다. */
export function resolveStoryworldRepairProposal(proposal: StoryworldRepairProposal): {
  readonly title: string;
  readonly rationale: string;
} {
  const keys = STORYWORLD_REPAIR_KEYS[proposal.repairCode];
  const ko = STORYWORLD_REPAIR_KO[proposal.repairCode];
  return {
    title: resolveProducerError(keys.title, ko.title),
    rationale: resolveProducerError(keys.rationale, ko.rationale),
  };
}
