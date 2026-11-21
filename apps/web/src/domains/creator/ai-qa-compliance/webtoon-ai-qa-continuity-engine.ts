/**
 * 웹툰 AI 자동 검수(QA) · 글로벌 심의 · 맞춤법/말투 · 180도 시선/소품 연속성 엔진 (1~3번 모듈)
 *
 * - 100% 무과금(₩0) · 외부 API 호출 없는 결정론적 TypeScript 엔진
 * - 1) `scanRegionalComplianceAndBrands`: KR/JP/SEA/US 심의 & 실제 상표권 로고 스캐너
 * - 2) `auditKoreanGrammarAndSpeechRegister`: 한국어 맞춤법 + 존댓말/반말 일관성 교정기
 * - 3) `auditEyeLineAndPropContinuity`: 180도 시선 법칙 & 소품 손 위치 연속성 검사기
 */

import {
  COMPLIANCE_REGION_POLICIES,
  CONTENT_SIGNAL_RULES,
  KOREAN_SPELLING_RULES,
  TRADEMARK_RULES,
  type AgeRatingTier,
  type AppliedComplianceRemediationResult,
  type CharacterSpeechContract,
  type ComplianceCategory,
  type ComplianceCutInput,
  type ComplianceFinding,
  type ComplianceRegion,
  type ComplianceRemediationType,
  type ComplianceScanInput,
  type ComplianceSeverity,
  type ContinuityAuditReport,
  type ContinuityCutInput,
  type DetectedSpeechRegister,
  type DialogueBalloonAuditInput,
  type EyelineContinuityIssue,
  type GazeDirection,
  type KoreanGrammarRegisterReport,
  type KoreanSpellingIssue,
  type NormalizedBox,
  type PropContinuityIssue,
  type RegionalComplianceReport,
  type SpeechRegister,
  type SpeechRegisterViolation,
} from "./webtoon-ai-qa-continuity-catalog";

export {
  COMPLIANCE_REGION_POLICIES,
  SAMPLE_COMPLIANCE_CUTS,
  SAMPLE_CONTINUITY_CUTS,
  SAMPLE_DIALOGUE_BALLOONS,
  SAMPLE_SPEECH_CONTRACTS,
  type AgeRatingTier,
  type AppliedComplianceRemediationResult,
  type CharacterSpeechContract,
  type ComplianceCategory,
  type ComplianceCutInput,
  type ComplianceFinding,
  type ComplianceRegion,
  type ComplianceRemediationType,
  type ComplianceScanInput,
  type ComplianceSeverity,
  type ContinuityAuditReport,
  type ContinuityCutInput,
  type CutCharacterPose,
  type CutCharacterProp,
  type DetectedSpeechRegister,
  type DialogueBalloonAuditInput,
  type EyelineContinuityIssue,
  type GazeDirection,
  type KoreanGrammarRegisterReport,
  type KoreanSpellingIssue,
  type NormalizedBox,
  type PropContinuityIssue,
  type PropHandSide,
  type RegionalComplianceReport,
  type SpeechRegister,
  type SpeechRegisterViolation,
} from "./webtoon-ai-qa-continuity-catalog";

const RATING_ORDER: readonly AgeRatingTier[] = ["ALL", "12+", "15+", "19+"];

function maxRating(a: AgeRatingTier, b: AgeRatingTier): AgeRatingTier {
  return RATING_ORDER.indexOf(a) >= RATING_ORDER.indexOf(b) ? a : b;
}

function evaluateRegionalSeverity(
  region: ComplianceRegion,
  rating: AgeRatingTier,
  category: Exclude<ComplianceCategory, "trademark-brand">,
  intensity: "low" | "medium" | "high",
): {
  readonly severity: ComplianceSeverity | null;
  readonly minSafeRating: AgeRatingTier;
  readonly remediationType: ComplianceRemediationType;
  readonly remediationLabelKo: string;
} {
  if (category === "self-harm") {
    return {
      severity: "block",
      minSafeRating: "19+",
      remediationType: region === "US" ? "trigger-warning-card" : "crop-reframe",
      remediationLabelKo:
        region === "US"
          ? "트리거 경고 카드 삽입 및 직접 묘사 가림 레이어 적용"
          : "직접 자해 묘사 프레이밍 교체 및 암전/실루엣 레이어 적용",
    };
  }
  if (category === "smoking") {
    if (intensity === "high") {
      return { severity: "block", minSafeRating: "19+", remediationType: "mosaic-layer", remediationLabelKo: "미성년 흡연 소품 제거/가림 레이어 적용" };
    }
    if (rating === "ALL" || rating === "12+") {
      return { severity: "block", minSafeRating: region === "SEA" ? "19+" : "15+", remediationType: "blur-cover", remediationLabelKo: "담배·연기 부분 블러/사탕 대체 레이어 적용" };
    }
    if (rating === "15+") {
      if (region === "SEA" || region === "JP") {
        return { severity: region === "SEA" ? "block" : "warn", minSafeRating: region === "SEA" ? "19+" : "15+", remediationType: "blur-cover", remediationLabelKo: "담배 끝단 가림 및 연기 약화 레이어 적용" };
      }
      return { severity: "info", minSafeRating: "15+", remediationType: "blur-cover", remediationLabelKo: "15세 등급 경고 문구 확인(선택적 약화 레이어)" };
    }
    return { severity: null, minSafeRating: "19+", remediationType: "blur-cover", remediationLabelKo: "조치 불필요" };
  }
  if (category === "alcohol") {
    if (intensity === "high") {
      return { severity: "block", minSafeRating: "19+", remediationType: "blur-cover", remediationLabelKo: "미성년 음주 연출 음료수 교체 레이어 적용" };
    }
    if (region === "SEA") {
      return { severity: rating === "19+" ? "warn" : "block", minSafeRating: "19+", remediationType: "mosaic-layer", remediationLabelKo: "동남아(SEA) 심의용 주류 병·라벨 모자이크/음료 대체" };
    }
    if (rating === "ALL") {
      return { severity: "block", minSafeRating: "12+", remediationType: "blur-cover", remediationLabelKo: "전체이용가 주류 용기 일반 음료 컵 대체 레이어" };
    }
    if (rating === "12+") {
      return { severity: region === "JP" ? "block" : "warn", minSafeRating: "15+", remediationType: "blur-cover", remediationLabelKo: "주류 라벨 블러 처리 레이어 적용" };
    }
    return { severity: null, minSafeRating: "15+", remediationType: "blur-cover", remediationLabelKo: "조치 불필요" };
  }
  if (category === "exposure") {
    if (region === "SEA") {
      return { severity: "block", minSafeRating: "19+", remediationType: "blur-cover", remediationLabelKo: "동남아(SEA) 노출 가림 의상 덧칠/빛가림 레이어 적용" };
    }
    if (intensity === "high") {
      if (rating === "19+") {
        return {
          severity: region === "JP" || region === "KR" ? "warn" : "info",
          minSafeRating: "19+",
          remediationType: "mosaic-layer",
          remediationLabelKo: region === "JP" ? "일본 픽코마 백광/모자이크 가림 레이어 적용" : "19세 심의 안전선 모자이크/가림 레이어 적용",
        };
      }
      return { severity: "block", minSafeRating: "19+", remediationType: "mosaic-layer", remediationLabelKo: "노출 부위 모자이크/의상 보정 가림 레이어 적용" };
    }
    if (rating === "ALL" || rating === "12+") {
      return { severity: "block", minSafeRating: "15+", remediationType: "crop-reframe", remediationLabelKo: "신체 강조 구도 크롭 또는 의상 가림 레이어 적용" };
    }
    return { severity: "info", minSafeRating: "15+", remediationType: "crop-reframe", remediationLabelKo: "노출 구도 경미 점검" };
  }
  if (intensity === "high") {
    if (rating === "19+") {
      return { severity: region === "JP" ? "warn" : "info", minSafeRating: "19+", remediationType: "blur-cover", remediationLabelKo: "고수위 유혈 암전/채도 저하 보정 레이어 적용" };
    }
    return { severity: "block", minSafeRating: "19+", remediationType: "blur-cover", remediationLabelKo: "유혈 흑백/암전 가림 및 흉기 블러 레이어 적용" };
  }
  if (rating === "ALL") {
    return { severity: "block", minSafeRating: "12+", remediationType: "blur-cover", remediationLabelKo: "혈흔 제거/타격 효과선 대체 레이어 적용" };
  }
  if (rating === "12+") {
    return { severity: "warn", minSafeRating: "15+", remediationType: "blur-cover", remediationLabelKo: "혈흔 채도 하향 보정 레이어 적용" };
  }
  return { severity: null, minSafeRating: "15+", remediationType: "blur-cover", remediationLabelKo: "조치 불필요" };
}

function findHintBox(cut: ComplianceCutInput, token: string): NormalizedBox {
  const lowered = token.toLowerCase();
  const matched = cut.boundingHints?.find(
    (hint) => hint.label.toLowerCase().includes(lowered) || lowered.includes(hint.label.toLowerCase()),
  );
  return matched ? matched.box : { x: 0.25, y: 0.25, width: 0.32, height: 0.24 };
}

/**
 * 1) 국가별·연령등급 심의 & 실제 상표권 로고 자동 스캐너
 */
export function scanRegionalComplianceAndBrands(
  input: ComplianceScanInput,
): RegionalComplianceReport {
  const findings: ComplianceFinding[] = [];
  let recommendedRating: AgeRatingTier = input.targetRating;

  for (const cut of input.cuts) {
    const combinedArtText = [
      cut.sceneSummary,
      cut.dialogueText,
      ...cut.visualTags,
      ...cut.detectedTextInArt,
    ].join(" ");

    for (const brand of TRADEMARK_RULES) {
      const matchedPattern = brand.patterns.find((pattern) => pattern.test(combinedArtText));
      if (!matchedPattern) continue;

      const rawMatch = combinedArtText.match(matchedPattern)?.[0] ?? brand.canonical;
      const box = findHintBox(cut, brand.canonical);
      findings.push({
        id: `cmp-tm-c${cut.cutNumber}-${findings.length + 1}`,
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        category: "trademark-brand",
        severity: "block",
        ruleCode: `${input.region}-TM-BRAND`,
        matchedToken: rawMatch,
        reasonKo: `실제 상표권 브랜드(${brand.canonical})가 배경·소품에 직접 노출되어 ${input.region} 출판 시 법적 분쟁 위험이 있습니다.`,
        remediationType: "brand-parody-replace",
        remediationLabelKo: `패러디 대체 텍스트("${brand.parodySuggestion}") 또는 로고 모자이크 레이어 생성`,
        suggestedReplacementText: brand.parodySuggestion,
        overlayLayerSpec: {
          layerName: `QA_상표대체_C${cut.cutNumber}_${brand.canonical}`,
          blendMode: "normal",
          opacity: 1,
          pixelSizePx: 14,
          box,
        },
      });

      if (brand.alsoAlcohol) {
        const alcEval = evaluateRegionalSeverity(input.region, input.targetRating, "alcohol", "medium");
        if (alcEval.severity) {
          recommendedRating = maxRating(recommendedRating, alcEval.minSafeRating);
          findings.push({
            id: `cmp-alc-tm-c${cut.cutNumber}-${findings.length + 1}`,
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            category: "alcohol",
            severity: alcEval.severity,
            ruleCode: `${input.region}-ALC-${input.targetRating.replace("+", "")}`,
            matchedToken: rawMatch,
            reasonKo: `${COMPLIANCE_REGION_POLICIES[input.region].labelKo} ${input.targetRating} 등급 기준 주류 상표·용기 노출 제한 대상입니다.`,
            remediationType: alcEval.remediationType,
            remediationLabelKo: alcEval.remediationLabelKo,
            overlayLayerSpec: {
              layerName: `QA_주류가림_C${cut.cutNumber}`,
              blendMode: "normal",
              opacity: 0.96,
              pixelSizePx: 16,
              box,
            },
          });
        }
      }
    }

    const hitCategories = new Set<Exclude<ComplianceCategory, "trademark-brand">>();
    for (const rule of CONTENT_SIGNAL_RULES) {
      if (hitCategories.has(rule.category)) continue;
      const matchedPattern = rule.patterns.find((pattern) => pattern.test(combinedArtText));
      if (!matchedPattern) continue;

      hitCategories.add(rule.category);
      const evaluation = evaluateRegionalSeverity(input.region, input.targetRating, rule.category, rule.intensity);
      if (!evaluation.severity) continue;

      recommendedRating = maxRating(recommendedRating, evaluation.minSafeRating);
      const rawMatch = combinedArtText.match(matchedPattern)?.[0] ?? rule.labelKo;
      const box = findHintBox(cut, rawMatch);
      const isWhiteBeam = input.region === "JP" && rule.category === "exposure";

      findings.push({
        id: `cmp-${rule.category}-c${cut.cutNumber}-${findings.length + 1}`,
        cutId: cut.cutId,
        cutNumber: cut.cutNumber,
        category: rule.category,
        severity: evaluation.severity,
        ruleCode: `${input.region}-${rule.category.toUpperCase()}-${input.targetRating.replace("+", "")}`,
        matchedToken: rawMatch,
        reasonKo: `${COMPLIANCE_REGION_POLICIES[input.region].labelKo} ${input.targetRating} 기준에서 '${rule.labelKo}' 항목이 탐지되었습니다.`,
        remediationType: evaluation.remediationType,
        remediationLabelKo: evaluation.remediationLabelKo,
        overlayLayerSpec: {
          layerName: `QA_${rule.category}_C${cut.cutNumber}`,
          blendMode: isWhiteBeam ? "screen" : "normal",
          opacity: isWhiteBeam ? 0.92 : 1,
          pixelSizePx: evaluation.remediationType === "mosaic-layer" ? 18 : undefined,
          box,
        },
      });
    }
  }

  const blockingCount = findings.filter((item) => item.severity === "block").length;
  const warningCount = findings.filter((item) => item.severity === "warn").length;
  const trademarkCount = findings.filter((item) => item.category === "trademark-brand").length;

  return {
    region: input.region,
    targetRating: input.targetRating,
    regionPolicyLabelKo: COMPLIANCE_REGION_POLICIES[input.region].labelKo,
    verdict: blockingCount > 0 ? "BLOCKED" : warningCount > 0 ? "REVIEW" : "PASS",
    blockingCount,
    warningCount,
    trademarkCount,
    recommendedRatingForRegion: recommendedRating,
    findings,
  };
}

/**
 * 1클릭 심의 모자이크/가림/상표 대체 레이어 적용 결과 시뮬레이션
 */
export function applyComplianceRemediationPatch(
  report: RegionalComplianceReport,
  selectedFindingIds: readonly string[],
): AppliedComplianceRemediationResult {
  const appliedSet = new Set(selectedFindingIds);
  const generatedLayers = report.findings
    .filter((finding) => appliedSet.has(finding.id))
    .map((finding) => ({
      findingId: finding.id,
      cutNumber: finding.cutNumber,
      layerName: finding.overlayLayerSpec.layerName,
      remediationType: finding.remediationType,
      replacementText: finding.suggestedReplacementText,
    }));

  const remaining = report.findings.filter((finding) => !appliedSet.has(finding.id));
  const remainingBlockingCount = remaining.filter((item) => item.severity === "block").length;
  const remainingWarningCount = remaining.filter((item) => item.severity === "warn").length;

  return {
    appliedIds: generatedLayers.map((layer) => layer.findingId),
    remainingBlockingCount,
    remainingWarningCount,
    updatedVerdict:
      remainingBlockingCount > 0 ? "BLOCKED" : remainingWarningCount > 0 ? "REVIEW" : "PASS",
    generatedLayers,
  };
}

// ---------------------------------------------------------------------------
// 2. 한국어 맞춤법 + 캐릭터 말투(존댓말/반말) 일관성 교정기
// ---------------------------------------------------------------------------

const HONORIFIC_ENDING_PATTERN =
  /(?:습니다|습니까|십시오|세요|셔요|시죠|시지요|해요|에요|예요|아요|어요|여요|거든요|잖아요|군요|네요|까요|을게요|ㄹ게요|할게요|갈게요|볼게요|줄게요|드릴게요|겠어요|드려요|요)$/u;

const CASUAL_ENDING_PATTERN =
  /(?:알았어|미안해|고마워|아니야|맞아|해라|가라|와라|마라|하자|가자|할게|갈게|볼게|줄게|됐어|잖아|거든|구나|는데|냐|니|야|어|아|해|지|봐|줘|돼|몰라|있다|없다|한다|간다|온다|했다|갔다|왔다)$/u;

const NEUTRAL_INTERJECTION_PATTERN =
  /^(?:앗|헉|어|아|응|음|잠깐|뭐|진짜|설마|제발|후|하아|크윽|으악|쾅|탁|\.{2,}|…+)$/u;

function stripTrailingPunctuation(text: string): { readonly core: string; readonly suffix: string } {
  const trimmed = text.trim();
  const match = trimmed.match(/([.?!~…"'”’\s]+)$/u);
  if (!match) return { core: trimmed, suffix: "" };
  const suffix = match[1];
  return { core: trimmed.slice(0, trimmed.length - suffix.length).trim(), suffix };
}

/**
 * 한국어 대사의 말투(존댓말 / 반말 / 중립 감탄사)를 결정론적으로 판별한다.
 */
export function detectKoreanSpeechRegister(text: string): DetectedSpeechRegister {
  const { core } = stripTrailingPunctuation(text);
  if (!core || core.length <= 1 || NEUTRAL_INTERJECTION_PATTERN.test(core)) return "neutral";
  if (HONORIFIC_ENDING_PATTERN.test(core)) return "honorific";
  if (CASUAL_ENDING_PATTERN.test(core)) return "casual";
  if (/(?:선배님|팀장님|대표님|선생님|제가|저희)/u.test(core)) return "honorific";
  if (/(?:^|\s)(?:너|네가|니가|야,)\s/u.test(core)) return "casual";
  return "neutral";
}

function convertSpeechRegisterText(text: string, target: SpeechRegister): string {
  const { core, suffix } = stripTrailingPunctuation(text);
  if (!core) return text;

  if (target === "honorific") {
    let next = core
      .replace(/(^|\s)너(?=\s|$)/gu, "$1선배님")
      .replace(/(^|\s)네가(?=\s|$)/gu, "$1선배님이")
      .replace(/미안해$/u, "죄송해요")
      .replace(/고마워$/u, "감사해요")
      .replace(/알았어$/u, "알겠습니다")
      .replace(/아니야$/u, "아니에요")
      .replace(/맞아$/u, "맞아요")
      .replace(/몰라$/u, "모르겠어요")
      .replace(/뭐\s*해$/u, "뭐 하세요")
      .replace(/해라$/u, "하세요")
      .replace(/가라$/u, "가세요")
      .replace(/하자$/u, "하시죠")
      .replace(/가자$/u, "같이 가요")
      .replace(/할게$/u, "할게요")
      .replace(/갈게$/u, "갈게요")
      .replace(/볼게$/u, "볼게요")
      .replace(/줄게$/u, "드릴게요");

    if (!HONORIFIC_ENDING_PATTERN.test(next)) {
      if (/(?:냐|니)$/u.test(next)) next = next.replace(/(?:냐|니)$/u, "나요");
      else if (/야$/u.test(next)) next = next.replace(/야$/u, "예요");
      else next = `${next}요`;
    }
    return `${next}${suffix}`;
  }

  const next = core
    .replace(/(^|\s)제가(?=\s|$)/gu, "$1내가")
    .replace(/(^|\s)저는(?=\s|$)/gu, "$1나는")
    .replace(/죄송합니다$/u, "미안해")
    .replace(/죄송해요$/u, "미안해")
    .replace(/감사합니다$/u, "고마워")
    .replace(/감사해요$/u, "고마워")
    .replace(/알겠습니다$/u, "알았어")
    .replace(/모르겠습니다$/u, "몰라")
    .replace(/하세요$/u, "해")
    .replace(/가세요$/u, "가")
    .replace(/보세요$/u, "봐")
    .replace(/주세요$/u, "줘")
    .replace(/드릴게요$/u, "줄게")
    .replace(/할게요$/u, "할게")
    .replace(/갈게요$/u, "갈게")
    .replace(/볼게요$/u, "볼게")
    .replace(/예요$/u, "야")
    .replace(/이에요$/u, "이야")
    .replace(/습니다$/u, "어")
    .replace(/습니까$/u, "냐")
    .replace(/세요$/u, "어")
    .replace(/요$/u, "");

  return `${next || core}${suffix}`;
}

/**
 * 2) 한국어 맞춤법 + 캐릭터 말투(존댓말/반말) 일관성 교정기
 */
export function auditKoreanGrammarAndSpeechRegister(
  relationships: readonly CharacterSpeechContract[],
  balloons: readonly DialogueBalloonAuditInput[],
): KoreanGrammarRegisterReport {
  const contractMap = new Map<string, CharacterSpeechContract>();
  for (const contract of relationships) {
    contractMap.set(`${contract.speakerId}::${contract.listenerId}`, contract);
  }

  const spellingIssues: KoreanSpellingIssue[] = [];
  const registerViolations: SpeechRegisterViolation[] = [];
  const correctedTextByBalloonId: Record<string, string> = {};

  for (const balloon of balloons) {
    let workingText = balloon.text;

    for (const rule of KOREAN_SPELLING_RULES) {
      const matches = workingText.match(rule.pattern);
      if (!matches) continue;
      for (const matched of matches) {
        spellingIssues.push({
          id: `spell-${balloon.balloonId}-${spellingIssues.length + 1}`,
          balloonId: balloon.balloonId,
          cutNumber: balloon.cutNumber,
          originalFragment: matched,
          suggestedFragment: rule.replacement,
          category: rule.category,
          reasonKo: rule.reasonKo,
        });
      }
      workingText = workingText.replace(rule.pattern, rule.replacement);
    }

    if (!balloon.isMonologue) {
      const contract = contractMap.get(`${balloon.speakerId}::${balloon.listenerId}`);
      if (contract) {
        const detected = detectKoreanSpeechRegister(workingText);
        if (detected !== "neutral" && detected !== contract.expectedRegister) {
          const converted = convertSpeechRegisterText(workingText, contract.expectedRegister);
          registerViolations.push({
            id: `reg-${balloon.balloonId}-${registerViolations.length + 1}`,
            balloonId: balloon.balloonId,
            cutNumber: balloon.cutNumber,
            speakerName: contract.speakerName,
            listenerName: contract.listenerName,
            expectedRegister: contract.expectedRegister,
            detectedRegister: detected,
            originalText: workingText,
            suggestedText: converted,
            reasonKo: `${contract.speakerName} → ${contract.listenerName} 관계(${contract.relationshipNoteKo})는 ${
              contract.expectedRegister === "honorific" ? "존댓말" : "반말"
            }로 등록되어 있으나 ${detected === "honorific" ? "존댓말" : "반말"} 어미가 검출되었습니다.`,
          });
          workingText = converted;
        }
      }
    }

    correctedTextByBalloonId[balloon.balloonId] = workingText;
  }

  const totalIssues = spellingIssues.length + registerViolations.length;
  const consistencyScore = Math.max(
    0,
    Math.min(100, Math.round(100 - spellingIssues.length * 6 - registerViolations.length * 14)),
  );

  return {
    totalBalloonsAudited: balloons.length,
    spellingIssues,
    registerViolations,
    correctedTextByBalloonId,
    consistencyScore: totalIssues === 0 ? 100 : consistencyScore,
  };
}

// ---------------------------------------------------------------------------
// 3. 180도 시선 법칙 & 소품·좌우 연속성 검사기
// ---------------------------------------------------------------------------

function handLabelKo(hand: "left" | "right"): string {
  return hand === "right" ? "오른손" : "왼손";
}

function gazeLabelKo(gaze: GazeDirection): string {
  switch (gaze) {
    case "left":
      return "왼쪽";
    case "right":
      return "오른쪽";
    case "camera":
      return "정면(카메라)";
    case "up":
      return "위쪽";
    case "down":
      return "아래쪽";
  }
}

/**
 * 3) 180도 시선 법칙 & 소품·좌우 연속성 검사기
 */
export function auditEyeLineAndPropContinuity(
  cuts: readonly ContinuityCutInput[],
): ContinuityAuditReport {
  const sortedCuts = [...cuts].sort((a, b) => a.cutNumber - b.cutNumber);
  const eyelineIssues: EyelineContinuityIssue[] = [];
  const propIssues: PropContinuityIssue[] = [];

  const pairAxisMemory = new Map<
    string,
    { readonly leftCharId: string; readonly rightCharId: string; readonly anchorCutNumber: number }
  >();
  const propHandMemory = new Map<
    string,
    { readonly hand: "left" | "right"; readonly cutNumber: number }
  >();

  const makePairKey = (sceneId: string, a: string, b: string): string =>
    `${sceneId}::${a < b ? `${a}::${b}` : `${b}::${a}`}`;

  for (const cut of sortedCuts) {
    if (cut.cameraAxisResetDeclared) {
      for (const key of [...pairAxisMemory.keys()]) {
        if (key.startsWith(`${cut.sceneId}::`)) pairAxisMemory.delete(key);
      }
    }

    const byCharId = new Map(cut.characters.map((ch) => [ch.characterId, ch]));
    const inspectedPairsInCut = new Set<string>();

    for (const speaker of cut.characters) {
      const targetId = speaker.talkingToCharacterId;
      if (!targetId) continue;
      const pairKey = makePairKey(cut.sceneId, speaker.characterId, targetId);
      const target = byCharId.get(targetId);

      if (target) {
        if (!inspectedPairsInCut.has(pairKey)) {
          inspectedPairsInCut.add(pairKey);
          const leftChar = speaker.screenXNorm <= target.screenXNorm ? speaker : target;
          const rightChar = leftChar === speaker ? target : speaker;

          if (
            leftChar.gazeDirection === "left" ||
            rightChar.gazeDirection === "right"
          ) {
            eyelineIssues.push({
              id: `eye-same-c${cut.cutNumber}-${eyelineIssues.length + 1}`,
              cutId: cut.cutId,
              cutNumber: cut.cutNumber,
              sceneId: cut.sceneId,
              kind: "EYELINE_MISALIGNED_SAME_CUT",
              severity: "warn",
              participantsKo: `${leftChar.characterName} ↔ ${rightChar.characterName}`,
              reasonKo: `${cut.cutNumber}컷 투샷에서 왼쪽 '${leftChar.characterName}'(${gazeLabelKo(
                leftChar.gazeDirection,
              )})과 오른쪽 '${rightChar.characterName}'(${gazeLabelKo(
                rightChar.gazeDirection,
              )})의 시선이 서로 맞지 않습니다.`,
              fixSuggestionKo: "화면 왼쪽 인물은 오른쪽 시선, 오른쪽 인물은 왼쪽 시선으로 맞추세요.",
            });
          }

          const prevAxis = pairAxisMemory.get(pairKey);
          if (!prevAxis) {
            pairAxisMemory.set(pairKey, {
              leftCharId: leftChar.characterId,
              rightCharId: rightChar.characterId,
              anchorCutNumber: cut.cutNumber,
            });
          } else if (prevAxis.leftCharId !== leftChar.characterId) {
            eyelineIssues.push({
              id: `eye-axis-c${cut.cutNumber}-${eyelineIssues.length + 1}`,
              cutId: cut.cutId,
              cutNumber: cut.cutNumber,
              previousCutNumber: prevAxis.anchorCutNumber,
              sceneId: cut.sceneId,
              kind: "AXIS_180_VIOLATION",
              severity: "block",
              participantsKo: `${leftChar.characterName} ↔ ${rightChar.characterName}`,
              reasonKo: `${prevAxis.anchorCutNumber}컷에서 설정된 180도 가상선을 넘어 ${cut.cutNumber}컷에서 두 인물의 화면 좌우 배치가 반전되었습니다.`,
              fixSuggestionKo: `${cut.cutNumber}컷을 좌우 반전(Flip H)하거나 카메라 축 이동 중간컷을 삽입하세요.`,
            });
          }
        }
      } else if (speaker.gazeDirection === "left" || speaker.gazeDirection === "right") {
        const prevAxis = pairAxisMemory.get(pairKey);
        if (!prevAxis) {
          pairAxisMemory.set(pairKey, {
            leftCharId: speaker.gazeDirection === "right" ? speaker.characterId : targetId,
            rightCharId: speaker.gazeDirection === "right" ? targetId : speaker.characterId,
            anchorCutNumber: cut.cutNumber,
          });
        } else {
          const expectedGaze: GazeDirection =
            prevAxis.leftCharId === speaker.characterId ? "right" : "left";
          if (speaker.gazeDirection !== expectedGaze) {
            eyelineIssues.push({
              id: `eye-rev-c${cut.cutNumber}-${eyelineIssues.length + 1}`,
              cutId: cut.cutId,
              cutNumber: cut.cutNumber,
              previousCutNumber: prevAxis.anchorCutNumber,
              sceneId: cut.sceneId,
              kind: "AXIS_180_VIOLATION",
              severity: "block",
              participantsKo: `${speaker.characterName} (대화 시선)`,
              reasonKo: `${prevAxis.anchorCutNumber}컷 기준 '${speaker.characterName}'의 시선은 '${gazeLabelKo(
                expectedGaze,
              )}'이어야 하나 ${cut.cutNumber}컷에서 '${gazeLabelKo(
                speaker.gazeDirection,
              )}'을 바라봐 180도 시선 법칙에 위배됩니다.`,
              fixSuggestionKo: `인물 시선을 '${gazeLabelKo(expectedGaze)}'으로 반전하거나 시선 전환 연출컷을 추가하세요.`,
            });
          }
        }
      }
    }

    for (const character of cut.characters) {
      if (!character.props) continue;
      for (const prop of character.props) {
        if (prop.hand !== "left" && prop.hand !== "right") continue;
        const propKey = `${cut.sceneId}::${character.characterId}::${prop.propId}`;
        const prev = propHandMemory.get(propKey);
        if (prev && prev.hand !== prop.hand && !prop.transferActionDeclared) {
          const cutGap = cut.cutNumber - prev.cutNumber;
          propIssues.push({
            id: `prop-flip-c${cut.cutNumber}-${propIssues.length + 1}`,
            cutId: cut.cutId,
            cutNumber: cut.cutNumber,
            previousCutNumber: prev.cutNumber,
            sceneId: cut.sceneId,
            characterName: character.characterName,
            propName: prop.propName,
            previousHand: prev.hand,
            currentHand: prop.hand,
            severity: cutGap <= 2 ? "block" : "warn",
            reasonKo: `${prev.cutNumber}컷에서 ${handLabelKo(prev.hand)}에 들었던 '${prop.propName}'이(가) 전환 연출 없이 ${cut.cutNumber}컷에서 ${handLabelKo(
              prop.hand,
            )}으로 급변했습니다.`,
            fixSuggestionKo: `'${prop.propName}' 소품 레이어를 ${handLabelKo(
              prev.hand,
            )}으로 교정하거나 손을 바꿔 쥐는 동작을 명시하세요.`,
          });
        }
        propHandMemory.set(propKey, { hand: prop.hand, cutNumber: cut.cutNumber });
      }
    }
  }

  const blockingCount =
    eyelineIssues.filter((i) => i.severity === "block").length +
    propIssues.filter((i) => i.severity === "block").length;
  const warningCount =
    eyelineIssues.filter((i) => i.severity === "warn").length +
    propIssues.filter((i) => i.severity === "warn").length;
  const continuityScore = Math.max(0, Math.min(100, 100 - blockingCount * 18 - warningCount * 9));

  return {
    totalCutsChecked: sortedCuts.length,
    eyelineIssues,
    propIssues,
    continuityScore,
    verdict: blockingCount > 0 ? "BLOCKED" : warningCount > 0 ? "WARN" : "PASS",
  };
}
