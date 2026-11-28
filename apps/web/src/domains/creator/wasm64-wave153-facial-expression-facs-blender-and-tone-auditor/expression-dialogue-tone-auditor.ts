/**
 * Wave 153 — 에피소드 연속 컷 대사-표정 감정 톤 불일치 감사기 & 최소 변화량 자동 표정 제안 솔버.
 *
 * 탐지 결함 4종:
 * 1. expression-dialogue-polarity-clash (blocker): 대사 감정과 표정 극성 충돌 (`intentionalIronyOrDeadpan: true`는 정상 허용)
 * 2. deadpan-underacting-on-climax (blocker/warning): 외침 톱니 말풍선(`shout-jagged`)에 무표정·닫힌 입 작화
 * 3. conflicting-anatomical-au (blocker): 해부학적 상충 AU 동시 고활성
 * 4. same-face-stagnation (warning): 연속 4컷 이상 감정이 크게 바뀌었는데 표정 AU 유클리드 거리 < 0.12 유지
 */

import {
  FACS_ACTION_UNIT_IDS,
  WEBTOON_EMOTION_PRESETS,
  clampAsymmetry,
  clampAuValue,
  computeAuEuclideanDistance,
  detectAnatomicalAuConflicts,
  sanitizeAuVector,
  sanitizeComicEmotionFxFlags,
  type AnatomicalAuConflict,
  type ComicEmotionFxFlags,
  type FacsActionUnitId,
  type FacsActionUnitVector,
  type WebtoonEmotionPresetId,
} from "./facs-expression-types-and-presets";
import {
  classifySmileAuthenticity,
  resolveAnatomicalAuConflicts,
  synthesizeFaceLandmarksFromAu,
  type SmileAuthenticityAnalysis,
  type SynthesizedFaceLandmarks,
} from "./facs-landmark-blender";
import { computeExpressionSheetSha256Hex } from "./expression-sha256-and-canonical";

export type DialogueBubbleStyle =
  | "shout-jagged"
  | "whisper-dashed"
  | "oval-normal"
  | "thought-cloud";

export type DialogueEmotionIntent = WebtoonEmotionPresetId;

export type ExpressionAuditDefectCode =
  | "expression-dialogue-polarity-clash"
  | "deadpan-underacting-on-climax"
  | "conflicting-anatomical-au"
  | "same-face-stagnation";

export type ExpressionAuditSeverity = "blocker" | "warning";

export interface EpisodePanelExpressionInput {
  readonly panelId: string;
  readonly panelIndex?: number;
  readonly characterId: string;
  readonly characterNameKo?: string;
  readonly dialogueText: string;
  readonly dialogueEmotionIntent: DialogueEmotionIntent;
  readonly bubbleStyle: DialogueBubbleStyle;
  readonly au: Partial<Record<FacsActionUnitId, number>>;
  readonly asymmetry?: number;
  readonly fx?: Partial<ComicEmotionFxFlags>;
  /** 쿨데레·반어적 미소·의도적 무표정 연출 허용 플래그 */
  readonly intentionalIronyOrDeadpan?: boolean;
}

export interface ExpressionAuditDefect {
  readonly code: ExpressionAuditDefectCode;
  readonly severity: ExpressionAuditSeverity;
  readonly panelId: string;
  readonly characterId: string;
  readonly messageKo: string;
  readonly relatedPanelIds?: ReadonlyArray<string>;
  readonly measuredValue?: number;
  readonly thresholdValue?: number;
}

export interface AuditedPanelExpressionReport {
  readonly panelId: string;
  readonly panelIndex: number;
  readonly characterId: string;
  readonly characterNameKo: string;
  readonly dialogueText: string;
  readonly dialogueEmotionIntent: DialogueEmotionIntent;
  readonly bubbleStyle: DialogueBubbleStyle;
  readonly intentionalIronyOrDeadpan: boolean;
  readonly intentionalIronyApplied: boolean;
  readonly au: FacsActionUnitVector;
  readonly asymmetry: number;
  readonly fx: ComicEmotionFxFlags;
  readonly landmarks: SynthesizedFaceLandmarks;
  readonly smileAnalysis: SmileAuthenticityAnalysis;
  readonly alignmentScore: number;
  readonly distanceToIntentPreset: number;
  readonly anatomicalConflicts: ReadonlyArray<AnatomicalAuConflict>;
  readonly defects: ReadonlyArray<ExpressionAuditDefect>;
}

export interface EpisodeExpressionAuditResult {
  readonly episodeTitleKo: string;
  readonly panelReports: ReadonlyArray<AuditedPanelExpressionReport>;
  readonly defects: ReadonlyArray<ExpressionAuditDefect>;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly intentionalIronyExemptionCount: number;
  readonly overallAlignmentScore: number;
  readonly passed: boolean;
  readonly expressionSheetSha256Hex: string;
}

export interface AuUnitDelta {
  readonly au: FacsActionUnitId;
  readonly before: number;
  readonly after: number;
  readonly delta: number;
}

export interface RecommendedExpressionCorrection {
  readonly panelId: string;
  readonly originalAu: FacsActionUnitVector;
  readonly recommendedAu: FacsActionUnitVector;
  readonly recommendedAsymmetry: number;
  readonly recommendedFx: ComicEmotionFxFlags;
  readonly auDeltaL2: number;
  readonly changedUnits: ReadonlyArray<AuUnitDelta>;
  readonly rationaleKo: string;
}

export interface RecommendCorrectionContext {
  readonly previousPanelAu?: FacsActionUnitVector;
  readonly previousIntent?: DialogueEmotionIntent;
}

export const SAME_FACE_STAGNATION_MIN_RUN = 4;
export const SAME_FACE_STAGNATION_MAX_AU_DISTANCE = 0.12;
export const SAME_FACE_STAGNATION_MIN_INTENT_SHIFT = 0.45;
export const SHOUT_CLIMAX_MIN_MOUTH_ACTIVITY = 0.35;
export const SHOUT_CLIMAX_MIN_BROW_ACTIVITY = 0.3;

const NEGATIVE_HIGH_INTENTS: ReadonlyArray<DialogueEmotionIntent> = [
  "anger-shout",
  "sorrow-cry",
  "shock-terror",
];

function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 10000) / 10000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function measureFacialPolarityScores(au: FacsActionUnitVector): {
  readonly positiveSmile: number;
  readonly negativeDistress: number;
} {
  const positiveSmile = round4(au.AU12_lipCornerPuller * 0.65 + au.AU06_cheekRaiser * 0.35);
  const angerScore = au.AU04_browLowerer * 0.55 + au.AU09_noseWrinkler * 0.45;
  const sorrowScore = au.AU01_innerBrowRaise * 0.42 + au.AU15_lipCornerDepressor * 0.58;
  const terrorScore = au.AU05_upperLidRaiser * 0.48 + au.AU20_lipStretcher * 0.52;
  const negativeDistress = round4(Math.max(angerScore, sorrowScore, terrorScore));
  return { positiveSmile, negativeDistress };
}

function hasPolarityClash(
  intent: DialogueEmotionIntent,
  au: FacsActionUnitVector,
): { readonly clashed: boolean; readonly detailKo: string; readonly measured: number } {
  const { positiveSmile, negativeDistress } = measureFacialPolarityScores(au);

  if (NEGATIVE_HIGH_INTENTS.includes(intent)) {
    if (
      au.AU12_lipCornerPuller >= 0.45 &&
      positiveSmile >= 0.38 &&
      positiveSmile > negativeDistress + 0.12
    ) {
      const intentLabel = WEBTOON_EMOTION_PRESETS[intent].labelKo;
      return {
        clashed: true,
        detailKo: `대사 의도는 '${intentLabel}'이나 표정이 미소(AU12=${au.AU12_lipCornerPuller.toFixed(2)}, 미소 지수=${positiveSmile.toFixed(2)})로 그려져 감정이 충돌함`,
        measured: positiveSmile,
      };
    }
  }

  if (intent === "joy-warm") {
    if (
      negativeDistress >= 0.46 &&
      au.AU12_lipCornerPuller < 0.25 &&
      negativeDistress > positiveSmile + 0.15
    ) {
      return {
        clashed: true,
        detailKo: `대사 의도는 '따뜻한 기쁨'이나 표정이 부정 긴장(부정 지수=${negativeDistress.toFixed(2)}, AU12=${au.AU12_lipCornerPuller.toFixed(2)})으로 그려져 감정이 충돌함`,
        measured: negativeDistress,
      };
    }
  }

  return { clashed: false, detailKo: "", measured: 0 };
}

function checkShoutClimaxDeadpan(
  bubbleStyle: DialogueBubbleStyle,
  au: FacsActionUnitVector,
): {
  readonly isDeadpan: boolean;
  readonly severity: ExpressionAuditSeverity;
  readonly mouthActivity: number;
  readonly browActivity: number;
  readonly detailKo: string;
} {
  if (bubbleStyle !== "shout-jagged") {
    return { isDeadpan: false, severity: "warning", mouthActivity: 0, browActivity: 0, detailKo: "" };
  }
  const mouthActivity = round4(Math.max(au.AU25_lipsPart, au.AU26_jawDrop, au.AU27_mouthStretch));
  const browActivity = round4(Math.max(au.AU01_innerBrowRaise, au.AU02_outerBrowRaise, au.AU04_browLowerer));
  if (mouthActivity < SHOUT_CLIMAX_MIN_MOUTH_ACTIVITY || browActivity < SHOUT_CLIMAX_MIN_BROW_ACTIVITY) {
    const severeDeadpan = mouthActivity < 0.2 && browActivity < 0.2;
    return {
      isDeadpan: true,
      severity: severeDeadpan ? "blocker" : "warning",
      mouthActivity,
      browActivity,
      detailKo: `외침 톱니 말풍선 대비 입 벌림(${mouthActivity.toFixed(2)} < ${SHOUT_CLIMAX_MIN_MOUTH_ACTIVITY}) 또는 눈썹 활성(${browActivity.toFixed(2)} < ${SHOUT_CLIMAX_MIN_BROW_ACTIVITY})이 낮아 클라이맥스 감정이 약화됨`,
    };
  }
  return { isDeadpan: false, severity: "warning", mouthActivity, browActivity, detailKo: "" };
}

/**
 * 연속 컷의 대사 감정·말풍선 스타일과 작화된 FACS 18-AU를 대조해 4종 결함을 감사한다.
 */
export function auditEpisodeExpressionAlignment(
  panels: ReadonlyArray<EpisodePanelExpressionInput>,
  options?: { readonly episodeTitleKo?: string },
): EpisodeExpressionAuditResult {
  const episodeTitleKo = options?.episodeTitleKo ?? "웹툰 에피소드 표정-대사 일관성 감사";
  const defectsByPanelIndex: Array<ExpressionAuditDefect[]> = [];
  const sanitizedPanels: Array<{
    readonly input: EpisodePanelExpressionInput;
    readonly panelIndex: number;
    readonly characterNameKo: string;
    readonly au: FacsActionUnitVector;
    readonly asymmetry: number;
    readonly fx: ComicEmotionFxFlags;
    readonly anatomicalConflicts: ReadonlyArray<AnatomicalAuConflict>;
    readonly intentionalIronyApplied: boolean;
  }> = [];

  let intentionalIronyExemptionCount = 0;

  for (let i = 0; i < panels.length; i += 1) {
    const input = panels[i];
    if (input === undefined) continue;
    const panelIndex = input.panelIndex ?? i + 1;
    const au = sanitizeAuVector(input.au);
    const preset = WEBTOON_EMOTION_PRESETS[input.dialogueEmotionIntent];
    const asymmetry = clampAsymmetry(input.asymmetry ?? 0);
    const fx = sanitizeComicEmotionFxFlags(input.fx);
    const anatomicalConflicts = detectAnatomicalAuConflicts(au);
    const panelDefects: ExpressionAuditDefect[] = [];
    let ironyApplied = false;

    // 1. 해부학적 모순 AU 탐지 (의도적 무표정 여부와 무관하게 blocker)
    for (let c = 0; c < anatomicalConflicts.length; c += 1) {
      const conflict = anatomicalConflicts[c];
      if (conflict === undefined) continue;
      panelDefects.push({
        code: "conflicting-anatomical-au",
        severity: "blocker",
        panelId: input.panelId,
        characterId: input.characterId,
        messageKo: `${conflict.descriptionKo} (${conflict.auA}=${conflict.valueA.toFixed(2)}, ${conflict.auB}=${conflict.valueB.toFixed(2)})`,
        measuredValue: conflict.combinedValue,
        thresholdValue: conflict.maxAllowedSum,
      });
    }

    // 2. 대사-표정 감정 극성 충돌 탐지
    const clashCheck = hasPolarityClash(input.dialogueEmotionIntent, au);
    if (clashCheck.clashed) {
      if (input.intentionalIronyOrDeadpan === true) {
        ironyApplied = true;
      } else {
        panelDefects.push({
          code: "expression-dialogue-polarity-clash",
          severity: "blocker",
          panelId: input.panelId,
          characterId: input.characterId,
          messageKo: clashCheck.detailKo,
          measuredValue: clashCheck.measured,
          thresholdValue: 0.38,
        });
      }
    }

    // 3. 외침 말풍선(shout-jagged) 무표정 저연기 탐지
    const shoutCheck = checkShoutClimaxDeadpan(input.bubbleStyle, au);
    if (shoutCheck.isDeadpan) {
      if (input.intentionalIronyOrDeadpan === true) {
        ironyApplied = true;
      } else {
        panelDefects.push({
          code: "deadpan-underacting-on-climax",
          severity: shoutCheck.severity,
          panelId: input.panelId,
          characterId: input.characterId,
          messageKo: shoutCheck.detailKo,
          measuredValue: Math.min(shoutCheck.mouthActivity, shoutCheck.browActivity),
          thresholdValue: SHOUT_CLIMAX_MIN_BROW_ACTIVITY,
        });
      }
    }

    if (ironyApplied) {
      intentionalIronyExemptionCount += 1;
    }

    defectsByPanelIndex.push(panelDefects);
    sanitizedPanels.push({
      input,
      panelIndex,
      characterNameKo:
        input.characterNameKo !== undefined && input.characterNameKo.trim().length > 0
          ? input.characterNameKo.trim()
          : `${input.characterId} (${preset.labelKo})`,
      au,
      asymmetry,
      fx,
      anatomicalConflicts,
      intentionalIronyApplied: ironyApplied,
    });
  }

  // 4. 캐릭터별 연속 4컷 이상 복붙 표정 정체(same-face-stagnation) 탐지
  const characterIndicesMap: Record<string, number[]> = {};
  for (let i = 0; i < sanitizedPanels.length; i += 1) {
    const entry = sanitizedPanels[i];
    if (entry === undefined) continue;
    const charId = entry.input.characterId;
    const list = characterIndicesMap[charId];
    if (list === undefined) {
      characterIndicesMap[charId] = [i];
    } else {
      list.push(i);
    }
  }

  const charIds = Object.keys(characterIndicesMap).sort();
  for (let c = 0; c < charIds.length; c += 1) {
    const charId = charIds[c];
    if (charId === undefined) continue;
    const indices = characterIndicesMap[charId];
    if (indices === undefined || indices.length < SAME_FACE_STAGNATION_MIN_RUN) continue;

    let runStart = 0;
    while (runStart < indices.length) {
      let runEnd = runStart;
      while (runEnd + 1 < indices.length) {
        const currIdx = indices[runEnd];
        const nextIdx = indices[runEnd + 1];
        if (currIdx === undefined || nextIdx === undefined) break;
        const currPanel = sanitizedPanels[currIdx];
        const nextPanel = sanitizedPanels[nextIdx];
        if (currPanel === undefined || nextPanel === undefined) break;
        const dist = computeAuEuclideanDistance(currPanel.au, nextPanel.au);
        if (dist < SAME_FACE_STAGNATION_MAX_AU_DISTANCE) {
          runEnd += 1;
        } else {
          break;
        }
      }

      const runLength = runEnd - runStart + 1;
      if (runLength >= SAME_FACE_STAGNATION_MIN_RUN) {
        let maxIntentShift = 0;
        let allIntentionalDeadpan = true;
        const relatedIds: string[] = [];
        let maxAdjacentDist = 0;

        for (let r = runStart; r <= runEnd; r += 1) {
          const idx = indices[r];
          if (idx === undefined) continue;
          const p = sanitizedPanels[idx];
          if (p === undefined) continue;
          relatedIds.push(p.input.panelId);
          if (p.input.intentionalIronyOrDeadpan !== true) {
            allIntentionalDeadpan = false;
          }
          if (r > runStart) {
            const prevIdx = indices[r - 1];
            const prevP = prevIdx !== undefined ? sanitizedPanels[prevIdx] : undefined;
            if (prevP !== undefined) {
              const adjDist = computeAuEuclideanDistance(prevP.au, p.au);
              if (adjDist > maxAdjacentDist) maxAdjacentDist = adjDist;
            }
          }
          for (let q = r + 1; q <= runEnd; q += 1) {
            const idxQ = indices[q];
            if (idxQ === undefined) continue;
            const pQ = sanitizedPanels[idxQ];
            if (pQ === undefined) continue;
            const presetA = WEBTOON_EMOTION_PRESETS[p.input.dialogueEmotionIntent].au;
            const presetB = WEBTOON_EMOTION_PRESETS[pQ.input.dialogueEmotionIntent].au;
            const intentDist = computeAuEuclideanDistance(presetA, presetB);
            if (intentDist > maxIntentShift) {
              maxIntentShift = intentDist;
            }
          }
        }

        if (maxIntentShift >= SAME_FACE_STAGNATION_MIN_INTENT_SHIFT && !allIntentionalDeadpan) {
          const targetIdx = indices[runEnd];
          const targetPanel = targetIdx !== undefined ? sanitizedPanels[targetIdx] : undefined;
          const targetDefects = targetIdx !== undefined ? defectsByPanelIndex[targetIdx] : undefined;
          if (targetPanel !== undefined && targetDefects !== undefined) {
            targetDefects.push({
              code: "same-face-stagnation",
              severity: "warning",
              panelId: targetPanel.input.panelId,
              characterId: charId,
              relatedPanelIds: relatedIds,
              measuredValue: round4(maxAdjacentDist),
              thresholdValue: SAME_FACE_STAGNATION_MAX_AU_DISTANCE,
              messageKo: `캐릭터 '${targetPanel.characterNameKo}'가 연속 ${runLength}컷(${relatedIds.join("→")}) 동안 감정이 크게 변했으나 표정 AU 변화량이 ${maxAdjacentDist.toFixed(3)} (< ${SAME_FACE_STAGNATION_MAX_AU_DISTANCE})에 머무른 복붙 표정 정체`,
            });
          }
        }
      }

      runStart = runEnd + 1;
    }
  }

  // 최종 리포트 조립 및 정렬 점수 계산
  const panelReports: AuditedPanelExpressionReport[] = [];
  const allDefects: ExpressionAuditDefect[] = [];
  let blockerCount = 0;
  let warningCount = 0;
  let scoreSum = 0;

  for (let i = 0; i < sanitizedPanels.length; i += 1) {
    const item = sanitizedPanels[i];
    const panelDefects = defectsByPanelIndex[i] ?? [];
    if (item === undefined) continue;

    const targetPreset = WEBTOON_EMOTION_PRESETS[item.input.dialogueEmotionIntent];
    const distanceToIntentPreset = computeAuEuclideanDistance(item.au, targetPreset.au);
    const baseProximity = Math.max(0, 100 - distanceToIntentPreset * 38);

    let penalty = 0;
    for (let d = 0; d < panelDefects.length; d += 1) {
      const defect = panelDefects[d];
      if (defect === undefined) continue;
      allDefects.push(defect);
      if (defect.severity === "blocker") {
        blockerCount += 1;
        penalty += 38;
      } else {
        warningCount += 1;
        penalty += 16;
      }
    }

    const alignmentScore = item.intentionalIronyApplied
      ? Math.max(85, Math.round(baseProximity))
      : Math.max(0, Math.min(100, Math.round(baseProximity - penalty)));

    scoreSum += alignmentScore;

    panelReports.push({
      panelId: item.input.panelId,
      panelIndex: item.panelIndex,
      characterId: item.input.characterId,
      characterNameKo: item.characterNameKo,
      dialogueText: item.input.dialogueText,
      dialogueEmotionIntent: item.input.dialogueEmotionIntent,
      bubbleStyle: item.input.bubbleStyle,
      intentionalIronyOrDeadpan: item.input.intentionalIronyOrDeadpan === true,
      intentionalIronyApplied: item.intentionalIronyApplied,
      au: item.au,
      asymmetry: item.asymmetry,
      fx: item.fx,
      landmarks: synthesizeFaceLandmarksFromAu(item.au, {
        asymmetry: item.asymmetry,
        fx: item.fx,
      }),
      smileAnalysis: classifySmileAuthenticity(item.au, item.asymmetry),
      alignmentScore,
      distanceToIntentPreset,
      anatomicalConflicts: item.anatomicalConflicts,
      defects: panelDefects,
    });
  }

  const overallAlignmentScore =
    panelReports.length === 0 ? 100 : Math.round(scoreSum / panelReports.length);

  const manifestPayload = {
    schemaVersion: "wave153-facs-expression-audit-v1",
    episodeTitleKo,
    panels: panelReports.map((p) => ({
      panelId: p.panelId,
      panelIndex: p.panelIndex,
      characterId: p.characterId,
      dialogueText: p.dialogueText,
      dialogueEmotionIntent: p.dialogueEmotionIntent,
      bubbleStyle: p.bubbleStyle,
      intentionalIronyOrDeadpan: p.intentionalIronyOrDeadpan,
      au: p.au,
      asymmetry: p.asymmetry,
      fx: p.fx,
      defectCodes: p.defects.map((d) => d.code),
    })),
  };

  const expressionSheetSha256Hex = computeExpressionSheetSha256Hex(manifestPayload);

  return {
    episodeTitleKo,
    panelReports,
    defects: allDefects,
    blockerCount,
    warningCount,
    intentionalIronyExemptionCount,
    overallAlignmentScore,
    passed: blockerCount === 0 && warningCount === 0,
    expressionSheetSha256Hex,
  };
}

function lerpAuVector(
  from: FacsActionUnitVector,
  to: FacsActionUnitVector,
  alpha: number,
): FacsActionUnitVector {
  const result: Record<FacsActionUnitId, number> = { ...from };
  for (let i = 0; i < FACS_ACTION_UNIT_IDS.length; i += 1) {
    const id = FACS_ACTION_UNIT_IDS[i];
    if (id === undefined) continue;
    result[id] = clampAuValue(from[id] * (1 - alpha) + to[id] * alpha);
  }
  return sanitizeAuVector(result);
}

function primaryBrowAuForIntent(intent: DialogueEmotionIntent): FacsActionUnitId {
  if (intent === "anger-shout" || intent === "smug-scheming" || intent === "exhausted-hollow") {
    return "AU04_browLowerer";
  }
  if (intent === "shock-terror") {
    return "AU02_outerBrowRaise";
  }
  return "AU01_innerBrowRaise";
}

/**
 * 위반 컷의 AU 벡터를 대사 의도와 말풍선 스타일에 맞춰 최소 변화량으로 자동 교정 제안한다.
 */
export function recommendAlignedExpressionAu(
  panel: EpisodePanelExpressionInput,
  context?: RecommendCorrectionContext,
): RecommendedExpressionCorrection {
  const originalAu = sanitizeAuVector(panel.au);
  const targetPreset = WEBTOON_EMOTION_PRESETS[panel.dialogueEmotionIntent];
  const reasons: string[] = [];

  // 1. 해부학적 상충 우선 해소
  const conflictPass = resolveAnatomicalAuConflicts(originalAu);
  let candidate: FacsActionUnitVector = conflictPass.au;
  if (conflictPass.adjustments.length > 0) {
    reasons.push(`해부학 상충 AU ${conflictPass.adjustments.length}건 자동 해소`);
  }

  const isIntentionalDeadpan = panel.intentionalIronyOrDeadpan === true;

  // 2. 극성 충돌 해소: 최소 블렌드 계수(0.05 단위)로 목표 프리셋 방향으로 보정
  if (!isIntentionalDeadpan && hasPolarityClash(panel.dialogueEmotionIntent, candidate).clashed) {
    for (let step = 1; step <= 20; step += 1) {
      const alpha = step / 20;
      const trial = resolveAnatomicalAuConflicts(lerpAuVector(candidate, targetPreset.au, alpha)).au;
      if (!hasPolarityClash(panel.dialogueEmotionIntent, trial).clashed) {
        candidate = trial;
        reasons.push(
          `대사 의도('${targetPreset.labelKo}')에 맞춰 표정 극성을 최소 보정(혼합 ${Math.round(alpha * 100)}%)`,
        );
        break;
      }
    }
  }

  // 3. 외침 말풍선(shout-jagged) 저연기 보정
  if (!isIntentionalDeadpan && checkShoutClimaxDeadpan(panel.bubbleStyle, candidate).isDeadpan) {
    const working: Record<FacsActionUnitId, number> = { ...candidate };
    const browKey = primaryBrowAuForIntent(panel.dialogueEmotionIntent);
    working.AU25_lipsPart = Math.max(working.AU25_lipsPart, 0.62);
    working.AU26_jawDrop = Math.max(working.AU26_jawDrop, 0.48);
    working.AU23_lipTightener = Math.min(working.AU23_lipTightener, 0.12);
    working[browKey] = Math.max(working[browKey], 0.48);
    candidate = resolveAnatomicalAuConflicts(sanitizeAuVector(working)).au;
    reasons.push("외침 말풍선 강도에 맞춰 입 벌림(AU25·AU26)과 눈썹 활성 보강");
  }

  // 4. 이전 컷 대비 복붙 정체 해소 (의도가 달라졌는데 AU 거리가 너무 가까우면 최소 변위 부여)
  if (
    !isIntentionalDeadpan &&
    context?.previousPanelAu !== undefined &&
    context.previousIntent !== undefined &&
    context.previousIntent !== panel.dialogueEmotionIntent
  ) {
    const prevDist = computeAuEuclideanDistance(context.previousPanelAu, candidate);
    if (prevDist < SAME_FACE_STAGNATION_MAX_AU_DISTANCE + 0.06) {
      for (let step = 1; step <= 20; step += 1) {
        const alpha = step / 20;
        const trial = resolveAnatomicalAuConflicts(lerpAuVector(candidate, targetPreset.au, alpha)).au;
        if (computeAuEuclideanDistance(context.previousPanelAu, trial) >= 0.22) {
          candidate = trial;
          reasons.push("연속 컷 표정 정체 해소를 위해 목표 감정 방향으로 최소 변위 부여");
          break;
        }
      }
    }
  }

  // 5. 최종 해부학 안전 검증
  candidate = resolveAnatomicalAuConflicts(candidate).au;

  const changedUnits: AuUnitDelta[] = [];
  for (let i = 0; i < FACS_ACTION_UNIT_IDS.length; i += 1) {
    const id = FACS_ACTION_UNIT_IDS[i];
    if (id === undefined) continue;
    const before = originalAu[id];
    const after = candidate[id];
    const delta = round4(after - before);
    if (Math.abs(delta) >= 0.0005) {
      changedUnits.push({ au: id, before, after, delta });
    }
  }

  const auDeltaL2 = computeAuEuclideanDistance(originalAu, candidate);
  const currentFx = sanitizeComicEmotionFxFlags(panel.fx);
  const recommendedFx =
    auDeltaL2 === 0
      ? currentFx
      : sanitizeComicEmotionFxFlags({
          blushIntensity: Math.max(currentFx.blushIntensity, targetPreset.fx.blushIntensity),
          sweatDrop: currentFx.sweatDrop || targetPreset.fx.sweatDrop,
          angerVein: currentFx.angerVein || targetPreset.fx.angerVein,
          tearPool: Math.max(currentFx.tearPool, targetPreset.fx.tearPool),
          shadowOverEyes: Math.max(currentFx.shadowOverEyes, targetPreset.fx.shadowOverEyes),
          sparkleEyes: currentFx.sparkleEyes || targetPreset.fx.sparkleEyes,
        });

  const recommendedAsymmetry =
    auDeltaL2 === 0
      ? clampAsymmetry(panel.asymmetry ?? 0)
      : clampAsymmetry(panel.asymmetry ?? targetPreset.defaultAsymmetry);

  return {
    panelId: panel.panelId,
    originalAu,
    recommendedAu: candidate,
    recommendedAsymmetry,
    recommendedFx,
    auDeltaL2,
    changedUnits,
    rationaleKo:
      reasons.length > 0 ? reasons.join(" · ") : "현재 표정이 대사 의도 및 해부학 제약에 부합함",
  };
}

/**
 * 에피소드 전체 컷에 자동 교정 제안을 순차 적용해 새 컷 배열을 생성한다.
 */
export function applyRecommendedExpressionCorrections(
  panels: ReadonlyArray<EpisodePanelExpressionInput>,
): {
  readonly correctedPanels: ReadonlyArray<EpisodePanelExpressionInput>;
  readonly corrections: ReadonlyArray<RecommendedExpressionCorrection>;
} {
  const correctedPanels: EpisodePanelExpressionInput[] = [];
  const corrections: RecommendedExpressionCorrection[] = [];
  const lastStateByCharacter: Record<
    string,
    { readonly au: FacsActionUnitVector; readonly intent: DialogueEmotionIntent }
  > = {};

  for (let i = 0; i < panels.length; i += 1) {
    const panel = panels[i];
    if (panel === undefined) continue;
    const prev = lastStateByCharacter[panel.characterId];
    const correction = recommendAlignedExpressionAu(panel, {
      previousPanelAu: prev?.au,
      previousIntent: prev?.intent,
    });
    corrections.push(correction);
    correctedPanels.push({
      ...panel,
      au: correction.recommendedAu,
      asymmetry: correction.recommendedAsymmetry,
      fx: correction.recommendedFx,
    });
    lastStateByCharacter[panel.characterId] = {
      au: correction.recommendedAu,
      intent: panel.dialogueEmotionIntent,
    };
  }

  return { correctedPanels, corrections };
}
