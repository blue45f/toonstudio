/**
 * Wave 49D — 대사 한 줄 → 4대 어시스턴트 원스톱 연출 체인 (One-Line Multi-Advisor Orchestrator) 엔진.
 *
 * 이미 구현된 4개 어시스턴트 엔진을 중복 구현 없이 직접 조합해 순수 결정론적으로 실행한다:
 * 1. Wave 47B (`char-expression-pose-advisor`): 대사 기반 표정·입모양·포즈·손 모양 Top-3
 * 2. Wave 48A (`scene-lighting-atmosphere-advisor`): 3점 조명·역광·색온도·대기감 Top-3 (바이올렛 0%)
 * 3. Wave 48B (`camera-framing-continuity-coach`): 180° 법칙 보존 카메라 앵글 Top-3
 * 4. Wave 48C (`balloon-sfx-placement-proposer`): 얼굴 회피 말풍선 꼬리·한글 SFX 배치 Top-3
 */

import {
  HAND_GESTURE_PRESETS, UPPER_BODY_POSE_PRESETS, checkExpressionContinuity, clampIntensity,
  getArchetypeMeta, getEmotionMeta, getPreviousCutPreset, recommendCharacterAdjustments,
  type CharacterAdjustmentProposal, type CharacterAdvisorRecommendationBundle, type CharacterArchetype,
  type CharacterCutSnapshot, type DialogueEmotion, type EmotionIntensity,
  type ExpressionContinuityReport, type PreviousCutPresetId,
} from "../char-expression-pose-advisor";
import {
  compareLightingCuts, formatOklch, getPreviousCutLightingPreset, getSceneEmotionMeta,
  getSceneLocationPreset, getTimeOfDayMeta, isVioletSlopHue, proposeSceneLightingTop3,
  type LightingCutComparison, type LightingReadabilityAudit, type PreviousCutLightingPresetId,
  type SceneLightingProposal, type SceneLightingProposalBundle, type SceneLightingRig,
  type SceneLocationPresetId, type SceneTimeOfDay,
} from "../scene-lighting-atmosphere-advisor";
import {
  proposeCameraFramingsTop3,
  type CameraContinuityAuditReport, type CameraFramingCoachInput, type CameraFramingProposal,
  type CameraFramingType, type DialogueTension, type PreviousCutCameraState, type SpeakerCount,
} from "../camera-framing-continuity-coach";
import {
  BALLOON_STYLE_LABELS, DEFAULT_SAFE_MARGIN, getCutPreset, getEmotionToneMeta,
  proposeBalloonSfxLayoutsTop3,
  type BalloonSfxLayoutProposal, type BalloonSfxRecommendationBundle, type CutPresetId,
  type DialogueItem, type EmotionTone, type ProtectedZone,
} from "../balloon-sfx-placement-proposer";

export const ORCHESTRATOR_SCHEMA_VERSION = "toonstudio.oneline-multi-advisor-bundle.v1";

export type OneLineScenarioId =
  | "rooftop-rain-confession" | "chase-standoff" | "shock-reveal-monologue"
  | "sunset-classroom-reconcile" | "action-finisher";
export type AdvisorSlotKey = "expression" | "lighting" | "camera" | "balloon";
export type SlotCandidateIndex = 0 | 1 | 2;
export type SlotSelectionMap = Readonly<Record<AdvisorSlotKey, SlotCandidateIndex>>;
export type UnifiedBundleId = "bundle-emotional-standard" | "bundle-cinematic-contrast" | "bundle-readability-rhythm";
export type UnifiedBundleVariant = "emotional-standard" | "cinematic-contrast" | "readability-rhythm";
export type OrchestratorSessionStatus = "idle" | "previewing" | "applied" | "partial-applied" | "reverted";
export type UnifiedCoherenceGrade = "optimal" | "caution" | "warning";
export type SlotViewSource = "preview" | "applied" | "draft";

export interface AdvisorSlotMeta {
  readonly key: AdvisorSlotKey; readonly labelKo: string; readonly labelEn: string;
  readonly shortKo: string; readonly shortEn: string; readonly sourceWave: "47B" | "48A" | "48B" | "48C";
}

export interface OneLineScenarioPreset {
  readonly id: OneLineScenarioId; readonly labelKo: string; readonly labelEn: string;
  readonly genreKo: string; readonly genreEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly defaultDialogueKo: string; readonly defaultDialogueEn: string;
  readonly speakerNameKo: string; readonly speakerNameEn: string;
  readonly archetype: CharacterArchetype; readonly defaultIntensity: EmotionIntensity;
  readonly previousExpressionCutId: PreviousCutPresetId; readonly scenePresetId: SceneLocationPresetId;
  readonly timeOfDay: SceneTimeOfDay; readonly previousLightingCutId: PreviousCutLightingPresetId;
  readonly previousCamera: PreviousCutCameraState; readonly dialogueTension: DialogueTension;
  readonly speakerCount: SpeakerCount; readonly cutPresetId: CutPresetId; readonly safeMargin: number;
}

export interface OneLineOrchestrationInput {
  readonly dialogue: string; readonly scenarioId?: OneLineScenarioId;
  readonly archetype?: CharacterArchetype; readonly intensity?: number; readonly safeMargin?: number;
}

export interface UnifiedCoherenceAudit {
  readonly overallScore: number; readonly grade: UnifiedCoherenceGrade;
  readonly expressionContinuity: ExpressionContinuityReport;
  readonly lightingReadability: LightingReadabilityAudit;
  readonly lightingCutComparison: LightingCutComparison;
  readonly cameraContinuity: CameraContinuityAuditReport;
  readonly balloonFaceOcclusionPct: number; readonly balloonReadingOrderValid: boolean;
  readonly violetSlopFree: boolean; readonly notesKo: readonly string[]; readonly notesEn: readonly string[];
}

export interface UnifiedSceneBundle {
  readonly id: UnifiedBundleId; readonly rank: 1 | 2 | 3; readonly variant: UnifiedBundleVariant;
  readonly titleKo: string; readonly titleEn: string; readonly badgeKo: string; readonly badgeEn: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly slotIndices: SlotSelectionMap;
  readonly expression: CharacterAdjustmentProposal; readonly lighting: SceneLightingProposal;
  readonly camera: CameraFramingProposal; readonly balloon: BalloonSfxLayoutProposal;
  readonly coherence: UnifiedCoherenceAudit; readonly requiresAuthorApproval: true;
}

export interface OneLineOrchestrationResult {
  readonly dialogue: string; readonly scenario: OneLineScenarioPreset;
  readonly archetype: CharacterArchetype; readonly intensity: EmotionIntensity;
  readonly derivedBalloonTone: EmotionTone; readonly derivedCameraTension: DialogueTension;
  readonly previousExpressionCut: CharacterCutSnapshot; readonly previousLightingRig: SceneLightingRig;
  readonly cameraInput: CameraFramingCoachInput; readonly protectedZones: readonly ProtectedZone[];
  readonly dialoguesForBalloon: readonly DialogueItem[];
  readonly expressionBundle: CharacterAdvisorRecommendationBundle;
  readonly lightingBundle: SceneLightingProposalBundle;
  readonly cameraProposals: readonly [CameraFramingProposal, CameraFramingProposal, CameraFramingProposal];
  readonly balloonBundle: BalloonSfxRecommendationBundle;
  readonly unifiedBundles: readonly [UnifiedSceneBundle, UnifiedSceneBundle, UnifiedSceneBundle];
}

export interface AppliedSlotRecord<TProposal> {
  readonly index: SlotCandidateIndex; readonly proposal: TProposal;
}

export interface OrchestratorAppliedSlots {
  readonly expression: AppliedSlotRecord<CharacterAdjustmentProposal> | null;
  readonly lighting: AppliedSlotRecord<SceneLightingProposal> | null;
  readonly camera: AppliedSlotRecord<CameraFramingProposal> | null;
  readonly balloon: AppliedSlotRecord<BalloonSfxLayoutProposal> | null;
}

export interface OrchestratorHistoryEntry {
  readonly step: number;
  readonly action: "select-bundle" | "mix-slot" | "preview" | "apply-all" | "apply-slot" | "revert-slot" | "revert-all";
  readonly slot: AdvisorSlotKey | "all"; readonly labelKo: string; readonly labelEn: string;
}

export interface OneLineOrchestratorSession {
  readonly status: OrchestratorSessionStatus; readonly draftSelection: SlotSelectionMap;
  readonly selectedBundleId: UnifiedBundleId | null; readonly isPreviewing: boolean;
  readonly applied: OrchestratorAppliedSlots; readonly appliedSlotCount: 0 | 1 | 2 | 3 | 4;
  readonly canRevertAll: boolean; readonly history: readonly OrchestratorHistoryEntry[];
}

export interface ResolvedSlotItem<TProposal> {
  readonly index: SlotCandidateIndex; readonly proposal: TProposal; readonly source: SlotViewSource;
  readonly isApplied: boolean; readonly appliedIndex: SlotCandidateIndex | null;
}

export interface ResolvedOrchestratorView {
  readonly expression: ResolvedSlotItem<CharacterAdjustmentProposal>;
  readonly lighting: ResolvedSlotItem<SceneLightingProposal>;
  readonly camera: ResolvedSlotItem<CameraFramingProposal>;
  readonly balloon: ResolvedSlotItem<BalloonSfxLayoutProposal>;
  readonly activeIndices: SlotSelectionMap; readonly matchedBundleId: UnifiedBundleId | null;
  readonly isCustomMix: boolean; readonly recipeLabelKo: string; readonly recipeLabelEn: string;
  readonly coherence: UnifiedCoherenceAudit;
}

export const ADVISOR_SLOT_KEYS: readonly [AdvisorSlotKey, AdvisorSlotKey, AdvisorSlotKey, AdvisorSlotKey] = [
  "expression", "lighting", "camera", "balloon",
];

export const ADVISOR_SLOT_META: Readonly<Record<AdvisorSlotKey, AdvisorSlotMeta>> = {
  expression: { key: "expression", labelKo: "표정·포즈·손 모양", labelEn: "Expression & Pose", shortKo: "표정", shortEn: "Expr", sourceWave: "47B" },
  lighting: { key: "lighting", labelKo: "3점 조명·대기감", labelEn: "3-Point Lighting", shortKo: "조명", shortEn: "Light", sourceWave: "48A" },
  camera: { key: "camera", labelKo: "180° 카메라 앵글", labelEn: "180° Camera Angle", shortKo: "카메라", shortEn: "Cam", sourceWave: "48B" },
  balloon: { key: "balloon", labelKo: "말풍선 꼬리·SFX", labelEn: "Balloon & SFX", shortKo: "말풍선", shortEn: "Balloon", sourceWave: "48C" },
};

const DEFAULT_SCENARIO: OneLineScenarioPreset = {
  id: "rooftop-rain-confession", labelKo: "비 오는 옥상 고백", labelEn: "Rainy Rooftop Confession",
  genreKo: "로맨스·드라마", genreEn: "Romance Drama",
  summaryKo: "빗속 옥상에서 두근거리는 진심을 전하는 감성 투샷 연출",
  summaryEn: "Emotional two-shot confession under rain on a dusk rooftop",
  defaultDialogueKo: "빗소리 때문에 안 들릴지도 모르지만… 사실 오래전부터 두근거리며 좋아했어.",
  defaultDialogueEn: "You might barely hear over the rain… my heart has been racing because I like you.",
  speakerNameKo: "서연", speakerNameEn: "Seoyeon", archetype: "gentle", defaultIntensity: 3,
  previousExpressionCutId: "calm-neutral", scenePresetId: "rooftop-rain", timeOfDay: "rainy-dusk",
  previousLightingCutId: "cold-rain",
  previousCamera: { prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 46 },
  dialogueTension: "intimacy", speakerCount: 2, cutPresetId: "romance-twoshot", safeMargin: DEFAULT_SAFE_MARGIN,
};

export const ONE_LINE_SCENARIO_PRESETS: readonly OneLineScenarioPreset[] = [
  DEFAULT_SCENARIO,
  {
    id: "chase-standoff", labelKo: "추격전 대치", labelEn: "Chase Standoff",
    genreKo: "스릴러·추격", genreEn: "Thriller Chase",
    summaryKo: "네온 뒷골목 막다른 길에서 추격자와 맞서는 팽팽한 대치 컷",
    summaryEn: "Tense standoff in a wet neon alley dead-end during a chase",
    defaultDialogueKo: "거기 서! 골목 끝 막다른 길이다, 더는 도망칠 곳 없어!!",
    defaultDialogueEn: "Freeze! Dead end at the alley, nowhere left to run!!",
    speakerNameKo: "강현", speakerNameEn: "Kanghyun", archetype: "stoic", defaultIntensity: 4,
    previousExpressionCutId: "calm-neutral", scenePresetId: "chase-alley", timeOfDay: "night-neon",
    previousLightingCutId: "neon-night",
    previousCamera: { prevSubjectSide: "right", prevGazeDirection: "right-to-left", prevShotScale: "wide", prevCameraYawDeg: 118 },
    dialogueTension: "confrontation", speakerCount: 2, cutPresetId: "corridor-chase", safeMargin: DEFAULT_SAFE_MARGIN,
  },
  {
    id: "shock-reveal-monologue", labelKo: "충격 반전 독백", labelEn: "Shock Reveal Monologue",
    genreKo: "미스터리·반전", genreEn: "Mystery Reveal",
    summaryKo: "숨겨진 정체를 깨닫는 순간의 동공 흔들림과 더치 앵글 클로즈업",
    summaryEn: "Sudden truth realization amplified by startled close-up and Dutch tilt",
    defaultDialogueKo: "설마?! 방금 지나간 사람이 사라진 형이었다고…?!",
    defaultDialogueEn: "No way?! The person who just walked past was my missing brother…?!",
    speakerNameKo: "지안", speakerNameEn: "Jian", archetype: "stoic", defaultIntensity: 5,
    previousExpressionCutId: "calm-neutral", scenePresetId: "dawn-bedroom", timeOfDay: "dawn",
    previousLightingCutId: "neutral-day",
    previousCamera: { prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 68 },
    dialogueTension: "reveal", speakerCount: 1, cutPresetId: "closeup-monologue", safeMargin: DEFAULT_SAFE_MARGIN,
  },
  {
    id: "sunset-classroom-reconcile", labelKo: "교실 노을 화해", labelEn: "Sunset Classroom Reconcile",
    genreKo: "학원·청춘", genreEn: "Campus Youth",
    summaryKo: "붉은 노을빛이 번지는 방과 후 교실에서 마음을 푸는 따뜻한 화해 컷",
    summaryEn: "Warm golden-hour reconciliation in an after-school classroom",
    defaultDialogueKo: "미안해, 그때는 내가 너무 성급했어. 다시 웃어줘서 정말 고마워.",
    defaultDialogueEn: "Sorry I rushed back then. Thank you so much for smiling again.",
    speakerNameKo: "하린", speakerNameEn: "Harin", archetype: "gentle", defaultIntensity: 3,
    previousExpressionCutId: "deep-sadness", scenePresetId: "sunset-classroom", timeOfDay: "golden-hour",
    previousLightingCutId: "warm-sunset",
    previousCamera: { prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 44 },
    dialogueTension: "intimacy", speakerCount: 2, cutPresetId: "romance-twoshot", safeMargin: DEFAULT_SAFE_MARGIN,
  },
  {
    id: "action-finisher", labelKo: "액션 결정타", labelEn: "Action Finisher",
    genreKo: "액션·판타지", genreEn: "Action Climax",
    summaryKo: "전력을 다한 일격 순간의 로앵글 압축과 강렬한 외침·효과음 연출",
    summaryEn: "Climactic finishing strike with low-angle punch and explosive SFX",
    defaultDialogueKo: "지금이다! 반드시 뚫어내겠어, 이 한 방으로 끝낸다!!",
    defaultDialogueEn: "Now! I will break straight through and finish this in one strike!!",
    speakerNameKo: "진우", speakerNameEn: "Jinwoo", archetype: "energetic", defaultIntensity: 5,
    previousExpressionCutId: "tense-anger", scenePresetId: "snow-duel", timeOfDay: "snow-overcast",
    previousLightingCutId: "cold-rain",
    previousCamera: { prevSubjectSide: "left", prevGazeDirection: "left-to-right", prevShotScale: "medium", prevCameraYawDeg: 58 },
    dialogueTension: "impact", speakerCount: 1, cutPresetId: "action-impact", safeMargin: DEFAULT_SAFE_MARGIN,
  },
];

export function getOneLineScenarioPreset(id?: OneLineScenarioId): OneLineScenarioPreset {
  return ONE_LINE_SCENARIO_PRESETS.find((item) => item.id === id) ?? DEFAULT_SCENARIO;
}

const clampScore = (v: number): number => (Number.isFinite(v) ? Math.round(Math.min(100, Math.max(0, v))) : 0);
const isSelectionEqual = (a: SlotSelectionMap, b: SlotSelectionMap): boolean =>
  a.expression === b.expression && a.lighting === b.lighting && a.camera === b.camera && a.balloon === b.balloon;

function countAppliedSlots(applied: OrchestratorAppliedSlots): 0 | 1 | 2 | 3 | 4 {
  let count = 0;
  for (const key of ADVISOR_SLOT_KEYS) {
    if (applied[key] !== null) count += 1;
  }
  return count as 0 | 1 | 2 | 3 | 4;
}

/** 47B 감정 분석 결과와 대사 문장부호를 48C 말풍선 감정 톤으로 매핑한다. */
export function mapEmotionToBalloonTone(dialogue: string, emotion: DialogueEmotion, intensity: EmotionIntensity): EmotionTone {
  const clean = dialogue.trim();
  if (/!!|거기\s*서|뚫|끝낸|멈춰/u.test(clean) || (emotion === "anger" && intensity >= 4)) return "shout";
  if (/\?!|설마|방금|정체|배신/u.test(clean) || emotion === "surprise") return "tension";
  if (/속삭|비밀|조용|몰래/u.test(clean)) return "whisper";
  if (/(?:\.{2,}|…)/u.test(clean) && (emotion === "sadness" || emotion === "tired" || emotion === "embarrassed")) {
    return emotion === "embarrassed" ? "whisper" : "thought";
  }
  if (emotion === "determined") return intensity >= 4 ? "shout" : "tension";
  if (emotion === "anger") return "tension";
  if (emotion === "sadness" || emotion === "tired") return "thought";
  return emotion === "embarrassed" ? "whisper" : "normal";
}

/** 대사 신호·47B 주 감정·시나리오 기본값으로부터 48B 카메라 긴장도를 산출한다. */
export function deriveCameraTension(dialogue: string, emotion: DialogueEmotion, fallback: DialogueTension): DialogueTension {
  const clean = dialogue.trim();
  if (/\?!|설마|정체|반전|말도\s*안/u.test(clean) || emotion === "surprise") return "reveal";
  if (/지금이다|한\s*방|뚫|끝낸|결정타|부숴/u.test(clean)) return "impact";
  if (/거기\s*서|도망|멈춰|막다른|장난해|용서/u.test(clean) || emotion === "anger") return "confrontation";
  if (/좋아|고백|미안|고마워|두근|손이|웃어줘/u.test(clean) || emotion === "embarrassed") return "intimacy";
  return fallback;
}

function buildDialogueItemsForBalloon(dialogue: string, scenario: OneLineScenarioPreset, tone: EmotionTone): readonly DialogueItem[] {
  const cutPreset = getCutPreset(scenario.cutPresetId);
  const firstAnchor = cutPreset.dialogues[0];
  const secondAnchor = cutPreset.dialogues[1] ?? firstAnchor;
  const segments = dialogue.split(/\r?\n|\s+\/\s+/u).map((p) => p.trim()).filter((p) => p.length > 0).slice(0, 2);
  const lines = segments.length > 0 ? segments : [scenario.defaultDialogueKo];
  return lines.map((text, idx) => {
    const anchor = idx === 0 ? firstAnchor : secondAnchor;
    return {
      id: `oneline-d${idx + 1}`,
      speakerNameKo: idx === 0 ? scenario.speakerNameKo : anchor?.speakerNameKo ?? scenario.speakerNameKo,
      speakerNameEn: idx === 0 ? scenario.speakerNameEn : anchor?.speakerNameEn ?? scenario.speakerNameEn,
      text, mouthX: anchor?.mouthX ?? 400, mouthY: anchor?.mouthY ?? 640, emotion: tone,
    };
  });
}

function isLightingVioletFree(rig: SceneLightingRig): boolean {
  return (
    !isVioletSlopHue(rig.keyLight.colorOklch.h) && !isVioletSlopHue(rig.fillLight.colorOklch.h) &&
    !isVioletSlopHue(rig.rimLight.pigmentOklch.h) && !isVioletSlopHue(rig.atmosphere.backdropOklch.h)
  );
}

/** 4개 슬롯 제안 조합의 교차 정합성(표정 연속성·조명 가독성·180° 법칙·얼굴 가림률·탈-바이올렛)을 진단한다. */
export function auditUnifiedSceneCoherence(params: {
  readonly previousExpressionCut: CharacterCutSnapshot; readonly previousLightingRig: SceneLightingRig;
  readonly expression: CharacterAdjustmentProposal; readonly lighting: SceneLightingProposal;
  readonly camera: CameraFramingProposal; readonly balloon: BalloonSfxLayoutProposal;
}): UnifiedCoherenceAudit {
  const { previousExpressionCut, previousLightingRig, expression, lighting, camera, balloon } = params;
  const expressionContinuity = checkExpressionContinuity(previousExpressionCut, expression);
  const lightingReadability = lighting.readabilityAudit;
  const lightingCutComparison = compareLightingCuts(previousLightingRig, lighting.rig);
  const cameraContinuity = camera.continuityAudit;
  const balloonFaceOcclusionPct = balloon.metrics.faceOcclusionPct;
  const balloonReadingOrderValid = balloon.metrics.readingOrderValid;
  const violetSlopFree = isLightingVioletFree(lighting.rig);

  const exprScore = expression.confidence * 100 - (expressionContinuity.severity === "abrupt-jump" ? 12 : 0);
  const lightScore = lightingReadability.overallGrade === "pass" ? 96 : lightingReadability.overallGrade === "caution" ? 82 : 66;
  const camScore = cameraContinuity.status === "safe" ? camera.score : cameraContinuity.status === "warning" ? 72 : 42;
  const balloonScore = balloon.metrics.overallScore - (balloonFaceOcclusionPct > 0 ? 18 : 0);
  const overallScore = clampScore(exprScore * 0.23 + lightScore * 0.25 + camScore * 0.26 + balloonScore * 0.26);

  const notesKo: string[] = [];
  const notesEn: string[] = [];
  if (balloonFaceOcclusionPct === 0) {
    notesKo.push("말풍선·SFX 얼굴 가림률 0%로 인물 표정과 눈빛이 온전히 살아납니다.");
    notesEn.push("0% face occlusion preserves full expression and eye readability.");
  } else {
    notesKo.push(`말풍선 얼굴 가림률(${balloonFaceOcclusionPct}%)이 감지되었습니다. 3안(화자 밀착) 또는 1안을 확인하세요.`);
    notesEn.push(`Detected ${balloonFaceOcclusionPct}% face occlusion — inspect compact or balanced balloon slots.`);
  }
  if (cameraContinuity.status === "safe") {
    notesKo.push(`카메라가 180° 액션 축선(${camera.cameraRig.yawDeg}°) 안에서 직전 컷 시선 동선을 유지합니다.`);
    notesEn.push(`Camera stays inside the 180° action hemisphere (${camera.cameraRig.yawDeg}°) with intact eyeline flow.`);
  } else {
    notesKo.push(cameraContinuity.reasonKo);
    notesEn.push(cameraContinuity.reasonEn);
  }
  if (lightingReadability.bubbleZoneLuminance >= 0.72) {
    notesKo.push("상단 배경 명도가 높아 말풍선에 2px 진한 먹선 외곽선을 권장합니다.");
    notesEn.push("Bright upper backdrop — reinforce speech balloons with a crisp 2px dark ink outline.");
  } else if (lightingReadability.bubbleZoneLuminance <= 0.28) {
    notesKo.push("야경·암부 배경과 흰색 말풍선 대비가 뚜렷해 대사 몰입도가 높습니다.");
    notesEn.push("Dark ambient backdrop yields high speech-balloon contrast for crisp dialogue focus.");
  } else {
    notesKo.push(`조명 대비비 ${lightingReadability.faceContrastRatio.toFixed(1)}:1 · ${lighting.rig.rimLight.pigmentNameKo} 역광으로 인물 실루엣이 선명합니다.`);
    notesEn.push(`Facial contrast ${lightingReadability.faceContrastRatio.toFixed(1)}:1 with ${lighting.rig.rimLight.pigmentNameEn} rim keeps silhouette separation crisp.`);
  }
  if (expressionContinuity.severity === "abrupt-jump") {
    notesKo.push(`직전 컷 대비 표정 점프(${expressionContinuity.expressionJumpScore}점)가 큽니다. 연속 컷이라면 2안으로 완충하세요.`);
    notesEn.push(`Large expression jump (${expressionContinuity.expressionJumpScore}/100) from prior cut — use slot #2 to soften.`);
  }

  const grade: UnifiedCoherenceGrade =
    cameraContinuity.status === "axis-crossed" || balloonFaceOcclusionPct > 5 || !violetSlopFree
      ? "warning"
      : lightingReadability.overallGrade === "warning" || cameraContinuity.status === "warning" || balloonFaceOcclusionPct > 0
        ? "caution"
        : "optimal";

  return {
    overallScore, grade, expressionContinuity, lightingReadability, lightingCutComparison,
    cameraContinuity, balloonFaceOcclusionPct, balloonReadingOrderValid, violetSlopFree, notesKo, notesEn,
  };
}

function pickCameraIndexByPreference(
  proposals: readonly [CameraFramingProposal, CameraFramingProposal, CameraFramingProposal],
  preferredTypes: readonly CameraFramingType[],
  fallback: SlotCandidateIndex,
): SlotCandidateIndex {
  for (const preferred of preferredTypes) {
    const idx = proposals.findIndex((item) => item.framingType === preferred);
    if (idx === 0 || idx === 1 || idx === 2) return idx;
  }
  return fallback;
}

function pickBalloonIndexByStrategy(
  proposals: readonly [BalloonSfxLayoutProposal, BalloonSfxLayoutProposal, BalloonSfxLayoutProposal],
  strategyId: BalloonSfxLayoutProposal["strategyId"],
  fallback: SlotCandidateIndex,
): SlotCandidateIndex {
  const idx = proposals.findIndex((item) => item.strategyId === strategyId);
  return idx === 0 || idx === 1 || idx === 2 ? idx : fallback;
}

/** 대사 한 줄과 상황 프리셋으로 4대 어시스턴트(47B/48A/48B/48C)를 실제 연동해 통합 연출 3안을 즉시 생성한다. */
export function orchestrateOneLineSceneBundles(input: OneLineOrchestrationInput): OneLineOrchestrationResult {
  const scenario = getOneLineScenarioPreset(input.scenarioId);
  const dialogue = input.dialogue.trim() || scenario.defaultDialogueKo;
  const archetype = input.archetype ?? scenario.archetype;
  const intensity = clampIntensity(input.intensity ?? scenario.defaultIntensity);
  const safeMargin = input.safeMargin ?? scenario.safeMargin;

  const previousExpressionCut = getPreviousCutPreset(scenario.previousExpressionCutId).snapshot;
  const expressionBundle = recommendCharacterAdjustments({ dialogue, intensity, archetype }, previousExpressionCut);

  const previousLightingRig = getPreviousCutLightingPreset(scenario.previousLightingCutId).rig;
  const lightingBundle = proposeSceneLightingTop3(
    { dialogue, timeOfDay: scenario.timeOfDay, scenePresetId: scenario.scenePresetId },
    previousLightingRig,
  );

  const derivedCameraTension = deriveCameraTension(dialogue, expressionBundle.analysis.primaryEmotion, scenario.dialogueTension);
  const cameraInput: CameraFramingCoachInput = {
    ...scenario.previousCamera, dialogueTension: derivedCameraTension, speakerCount: scenario.speakerCount, dialogueText: dialogue,
  };
  const [c0, c1, c2] = proposeCameraFramingsTop3(cameraInput);
  if (!c0 || !c1 || !c2) throw new Error("Camera framing coach returned fewer than 3 proposals.");
  const cameraProposals: readonly [CameraFramingProposal, CameraFramingProposal, CameraFramingProposal] = [c0, c1, c2];

  const derivedBalloonTone = mapEmotionToBalloonTone(dialogue, expressionBundle.analysis.primaryEmotion, intensity);
  const cutPreset = getCutPreset(scenario.cutPresetId);
  const dialoguesForBalloon = buildDialogueItemsForBalloon(dialogue, scenario, derivedBalloonTone);
  const balloonBundle = proposeBalloonSfxLayoutsTop3({
    canvasWidth: cutPreset.canvasWidth, canvasHeight: cutPreset.canvasHeight,
    safeMargin, protectedZones: cutPreset.protectedZones, dialogues: dialoguesForBalloon,
  });

  const stdCamIdx: SlotCandidateIndex = 0;
  const dramaCamIdx = pickCameraIndexByPreference(cameraProposals, ["dutch-tilt", "low-angle-closeup", "eyeline-insert"], 1);
  const readCamIdx = pickCameraIndexByPreference(cameraProposals, ["rule-of-thirds-eye", "over-the-shoulder", "high-angle-wide"], 2);
  const stdBalIdx = pickBalloonIndexByStrategy(balloonBundle.proposals, "balanced-flow", 0);
  const dramaBalIdx = pickBalloonIndexByStrategy(balloonBundle.proposals, "dramatic-breathing", 1);
  const readBalIdx = pickBalloonIndexByStrategy(balloonBundle.proposals, "compact-anchor", 2);

  const buildBundle = (spec: {
    readonly id: UnifiedBundleId; readonly rank: 1 | 2 | 3; readonly variant: UnifiedBundleVariant;
    readonly titleKo: string; readonly titleEn: string; readonly badgeKo: string; readonly badgeEn: string;
    readonly summaryKo: string; readonly summaryEn: string; readonly slotIndices: SlotSelectionMap;
  }): UnifiedSceneBundle => {
    const expression = expressionBundle.proposals[spec.slotIndices.expression];
    const lighting = lightingBundle.proposals[spec.slotIndices.lighting];
    const camera = cameraProposals[spec.slotIndices.camera];
    const balloon = balloonBundle.proposals[spec.slotIndices.balloon];
    return {
      ...spec, expression, lighting, camera, balloon, requiresAuthorApproval: true,
      coherence: auditUnifiedSceneCoherence({ previousExpressionCut, previousLightingRig, expression, lighting, camera, balloon }),
    };
  };

  const bundle1 = buildBundle({
    id: "bundle-emotional-standard", rank: 1, variant: "emotional-standard",
    titleKo: "1안 · 감정 몰입 표준", titleEn: "Set #1 · Emotional Standard", badgeKo: "표준 균형", badgeEn: "Balanced",
    summaryKo: "정석 표정·시네마틱 3점 조명·1순위 180° 구도·균형 시선 말풍선을 묶어 바로 쓰기 좋은 기준 컷을 만듭니다.",
    summaryEn: "Pairs canonical expression, 3-point cinematic key lighting, top 180° framing, and balanced balloon flow.",
    slotIndices: { expression: 0, lighting: 0, camera: stdCamIdx, balloon: stdBalIdx },
  });
  const bundle2 = buildBundle({
    id: "bundle-cinematic-contrast", rank: 2, variant: "cinematic-contrast",
    titleKo: "2안 · 시네마틱 극적 대비", titleEn: "Set #2 · Cinematic Contrast", badgeKo: "클라이맥스", badgeEn: "Dramatic",
    summaryKo: "여운 대조 표정과 고대비 역광 림라이트, 극적 카메라 앵글, 여백 강조 효과음으로 컷 타격감을 끌어올립니다.",
    summaryEn: "Combines subtext contrast expression, dramatic rim split lighting, dynamic angle, and generous breathing space.",
    slotIndices: { expression: 2, lighting: 1, camera: dramaCamIdx === stdCamIdx ? 1 : dramaCamIdx, balloon: dramaBalIdx },
  });
  const bundle3 = buildBundle({
    id: "bundle-readability-rhythm", rank: 3, variant: "readability-rhythm",
    titleKo: "3안 · 가독성·리듬 최우선", titleEn: "Set #3 · Readability & Rhythm", badgeKo: "대사 선명", badgeEn: "Readable",
    summaryKo: "절제된 성격 변주 표정과 대사 가독성 우선 조명, 안정된 수평 구도, 화자 밀착 꼬리로 빠른 스크롤 가독성을 확보합니다.",
    summaryEn: "Prioritizes crisp dialogue legibility with readable soft lighting, balanced framing, and compact speaker tails.",
    slotIndices: { expression: 1, lighting: 2, camera: readCamIdx === stdCamIdx ? 2 : readCamIdx, balloon: readBalIdx },
  });

  return {
    dialogue, scenario, archetype, intensity, derivedBalloonTone, derivedCameraTension,
    previousExpressionCut, previousLightingRig, cameraInput, protectedZones: cutPreset.protectedZones,
    dialoguesForBalloon, expressionBundle, lightingBundle, cameraProposals, balloonBundle,
    unifiedBundles: [bundle1, bundle2, bundle3],
  };
}

/** 4개 슬롯 선택 조합과 정확히 일치하는 통합 세트 ID를 찾는다(없으면 null = 커스텀 조합). */
export function findMatchingBundleId(selection: SlotSelectionMap, bundles?: readonly UnifiedSceneBundle[]): UnifiedBundleId | null {
  if (!bundles) return null;
  for (const bundle of bundles) {
    if (isSelectionEqual(selection, bundle.slotIndices)) return bundle.id;
  }
  return null;
}

/** 비파괴 4대 어시스턴트 오케스트레이터 세션 초기 상태를 생성한다. */
export function createOrchestratorSession(
  initialSelection?: SlotSelectionMap,
  bundles?: readonly UnifiedSceneBundle[],
): OneLineOrchestratorSession {
  const draftSelection: SlotSelectionMap = initialSelection ?? { expression: 0, lighting: 0, camera: 0, balloon: 0 };
  return {
    status: "idle", draftSelection,
    selectedBundleId: bundles ? findMatchingBundleId(draftSelection, bundles) : "bundle-emotional-standard",
    isPreviewing: false, applied: { expression: null, lighting: null, camera: null, balloon: null },
    appliedSlotCount: 0, canRevertAll: false, history: [],
  };
}

/** 3가지 통합 세트 중 하나를 원클릭 선택해 비파괴 미리보기 상태로 전환한다. */
export function selectUnifiedBundle(session: OneLineOrchestratorSession, bundle: UnifiedSceneBundle): OneLineOrchestratorSession {
  const entry: OrchestratorHistoryEntry = {
    step: session.history.length + 1, action: "select-bundle", slot: "all",
    labelKo: `${bundle.titleKo} 선택(미리보기)`, labelEn: `Selected ${bundle.titleEn} (preview)`,
  };
  return {
    ...session, status: "previewing", draftSelection: { ...bundle.slotIndices },
    selectedBundleId: bundle.id, isPreviewing: true, history: [...session.history.slice(-29), entry],
  };
}

/** 4개 슬롯 중 하나만 독립적으로 1안/2안/3안으로 교체하는 믹스&매치 비파괴 미리보기. */
export function selectSlotCandidate(
  session: OneLineOrchestratorSession,
  slot: AdvisorSlotKey,
  index: SlotCandidateIndex,
  bundles?: readonly UnifiedSceneBundle[],
): OneLineOrchestratorSession {
  const nextSelection: SlotSelectionMap = { ...session.draftSelection, [slot]: index };
  const meta = ADVISOR_SLOT_META[slot];
  const entry: OrchestratorHistoryEntry = {
    step: session.history.length + 1, action: "mix-slot", slot,
    labelKo: `${meta.shortKo} ${index + 1}안 선택`, labelEn: `Picked ${meta.shortEn} #${index + 1}`,
  };
  return {
    ...session, status: "previewing", draftSelection: nextSelection,
    selectedBundleId: findMatchingBundleId(nextSelection, bundles), isPreviewing: true,
    history: [...session.history.slice(-29), entry],
  };
}

/** 비파괴 미리보기 오버레이를 켜거나 끈다(적용 상태·원본 미변경). */
export function togglePreviewOrchestrator(session: OneLineOrchestratorSession, enabled?: boolean): OneLineOrchestratorSession {
  const nextPreview = enabled ?? !session.isPreviewing;
  const restoredStatus: OrchestratorSessionStatus =
    session.appliedSlotCount === 4 ? "applied"
      : session.appliedSlotCount > 0 ? "partial-applied"
        : session.history.some((h) => h.action === "revert-all" || h.action === "revert-slot") ? "reverted" : "idle";
  return { ...session, isPreviewing: nextPreview, status: nextPreview ? "previewing" : restoredStatus };
}

/** 현재 선택된 통합 세트 또는 믹스&매치 조합을 4개 슬롯 전체에 비파괴 일괄 적용한다. */
export function applyUnifiedSelection(
  session: OneLineOrchestratorSession,
  orchestration: OneLineOrchestrationResult,
): OneLineOrchestratorSession {
  const s = session.draftSelection;
  const applied: OrchestratorAppliedSlots = {
    expression: { index: s.expression, proposal: orchestration.expressionBundle.proposals[s.expression] },
    lighting: { index: s.lighting, proposal: orchestration.lightingBundle.proposals[s.lighting] },
    camera: { index: s.camera, proposal: orchestration.cameraProposals[s.camera] },
    balloon: { index: s.balloon, proposal: orchestration.balloonBundle.proposals[s.balloon] },
  };
  const recipeKo = `표정 ${s.expression + 1}안 · 조명 ${s.lighting + 1}안 · 카메라 ${s.camera + 1}안 · 말풍선 ${s.balloon + 1}안`;
  const recipeEn = `Expr #${s.expression + 1} · Light #${s.lighting + 1} · Cam #${s.camera + 1} · Balloon #${s.balloon + 1}`;
  const entry: OrchestratorHistoryEntry = {
    step: session.history.length + 1, action: "apply-all", slot: "all",
    labelKo: `4대 연출 일괄 적용 (${recipeKo})`, labelEn: `Batch applied (${recipeEn})`,
  };
  return {
    ...session, status: "applied", isPreviewing: false, applied,
    appliedSlotCount: 4, canRevertAll: true, history: [...session.history.slice(-29), entry],
  };
}

/** 4개 슬롯 중 특정 슬롯 하나만 작가 승인으로 비파괴 적용한다. */
export function applySingleSlot(
  session: OneLineOrchestratorSession,
  slot: AdvisorSlotKey,
  orchestration: OneLineOrchestrationResult,
): OneLineOrchestratorSession {
  const idx = session.draftSelection[slot];
  const nextApplied: OrchestratorAppliedSlots =
    slot === "expression" ? { ...session.applied, expression: { index: idx, proposal: orchestration.expressionBundle.proposals[idx] } }
      : slot === "lighting" ? { ...session.applied, lighting: { index: idx, proposal: orchestration.lightingBundle.proposals[idx] } }
        : slot === "camera" ? { ...session.applied, camera: { index: idx, proposal: orchestration.cameraProposals[idx] } }
          : { ...session.applied, balloon: { index: idx, proposal: orchestration.balloonBundle.proposals[idx] } };
  const appliedSlotCount = countAppliedSlots(nextApplied);
  const meta = ADVISOR_SLOT_META[slot];
  const entry: OrchestratorHistoryEntry = {
    step: session.history.length + 1, action: "apply-slot", slot,
    labelKo: `${meta.shortKo} ${idx + 1}안 개별 적용`, labelEn: `Applied ${meta.shortEn} #${idx + 1}`,
  };
  return {
    ...session, status: appliedSlotCount === 4 ? "applied" : "partial-applied",
    isPreviewing: false, applied: nextApplied, appliedSlotCount, canRevertAll: appliedSlotCount > 0,
    history: [...session.history.slice(-29), entry],
  };
}

/** 특정 슬롯 하나만 원본 상태로 비파괴 원복한다(나머지 슬롯 적용 유지). */
export function revertOrchestratorSlot(session: OneLineOrchestratorSession, slot: AdvisorSlotKey): OneLineOrchestratorSession {
  if (session.applied[slot] === null) return session;
  const nextApplied: OrchestratorAppliedSlots = { ...session.applied, [slot]: null };
  const appliedSlotCount = countAppliedSlots(nextApplied);
  const meta = ADVISOR_SLOT_META[slot];
  const entry: OrchestratorHistoryEntry = {
    step: session.history.length + 1, action: "revert-slot", slot,
    labelKo: `${meta.shortKo} 항목 원본 되돌림`, labelEn: `Reverted ${meta.shortEn} slot`,
  };
  return {
    ...session, status: appliedSlotCount === 0 ? "reverted" : "partial-applied",
    isPreviewing: false, applied: nextApplied, appliedSlotCount, canRevertAll: appliedSlotCount > 0,
    history: [...session.history.slice(-29), entry],
  };
}

/** 적용된 4개 슬롯 전체를 원본 상태로 한 번에 되돌린다. */
export function revertAllOrchestratorSlots(session: OneLineOrchestratorSession): OneLineOrchestratorSession {
  if (!session.canRevertAll && !session.isPreviewing) return session;
  const entry: OrchestratorHistoryEntry = {
    step: session.history.length + 1, action: "revert-all", slot: "all",
    labelKo: "4대 연출 전체 원본 되돌림", labelEn: "Reverted all 4 advisor slots",
  };
  return {
    ...session, status: "reverted", isPreviewing: false,
    applied: { expression: null, lighting: null, camera: null, balloon: null },
    appliedSlotCount: 0, canRevertAll: false, history: [...session.history.slice(-29), entry],
  };
}

/** 현재 SVG 통합 프리뷰·큐시트·JSON 내보내기에 사용할 4개 슬롯 유효 조합과 교차 정합성을 산출한다. */
export function resolveActiveOrchestratorView(
  orchestration: OneLineOrchestrationResult,
  session: OneLineOrchestratorSession,
): ResolvedOrchestratorView {
  const resolveSlot = <TProposal,>(
    candidates: readonly [TProposal, TProposal, TProposal],
    draftIdx: SlotCandidateIndex,
    appliedRec: AppliedSlotRecord<TProposal> | null,
  ): ResolvedSlotItem<TProposal> => {
    if (session.isPreviewing) {
      return { index: draftIdx, proposal: candidates[draftIdx], source: "preview", isApplied: appliedRec !== null, appliedIndex: appliedRec?.index ?? null };
    }
    if (appliedRec !== null) {
      return { index: appliedRec.index, proposal: appliedRec.proposal, source: "applied", isApplied: true, appliedIndex: appliedRec.index };
    }
    return { index: draftIdx, proposal: candidates[draftIdx], source: "draft", isApplied: false, appliedIndex: null };
  };

  const expression = resolveSlot(orchestration.expressionBundle.proposals, session.draftSelection.expression, session.applied.expression);
  const lighting = resolveSlot(orchestration.lightingBundle.proposals, session.draftSelection.lighting, session.applied.lighting);
  const camera = resolveSlot(orchestration.cameraProposals, session.draftSelection.camera, session.applied.camera);
  const balloon = resolveSlot(orchestration.balloonBundle.proposals, session.draftSelection.balloon, session.applied.balloon);
  const activeIndices: SlotSelectionMap = { expression: expression.index, lighting: lighting.index, camera: camera.index, balloon: balloon.index };
  const matchedBundleId = findMatchingBundleId(activeIndices, orchestration.unifiedBundles);

  return {
    expression, lighting, camera, balloon, activeIndices, matchedBundleId, isCustomMix: matchedBundleId === null,
    recipeLabelKo: `표정 ${activeIndices.expression + 1}안 · 조명 ${activeIndices.lighting + 1}안 · 카메라 ${activeIndices.camera + 1}안 · 말풍선 ${activeIndices.balloon + 1}안`,
    recipeLabelEn: `Expr #${activeIndices.expression + 1} · Light #${activeIndices.lighting + 1} · Cam #${activeIndices.camera + 1} · Balloon #${activeIndices.balloon + 1}`,
    coherence: auditUnifiedSceneCoherence({
      previousExpressionCut: orchestration.previousExpressionCut, previousLightingRig: orchestration.previousLightingRig,
      expression: expression.proposal, lighting: lighting.proposal, camera: camera.proposal, balloon: balloon.proposal,
    }),
  };
}

/** 4대 어시스턴트 통합 컷 연출 패키지를 결정론적 JSON 문자열로 내보낸다. */
export function exportUnifiedSceneBundleJson(
  orchestration: OneLineOrchestrationResult,
  session: OneLineOrchestratorSession,
): string {
  const active = resolveActiveOrchestratorView(orchestration, session);
  const rig = active.lighting.proposal.rig;
  return JSON.stringify({
    schema: ORCHESTRATOR_SCHEMA_VERSION, requiresAuthorApproval: true,
    violetSlopPct: active.coherence.violetSlopFree ? 0 : 100,
    input: {
      dialogue: orchestration.dialogue, scenarioId: orchestration.scenario.id,
      scenarioLabelKo: orchestration.scenario.labelKo, scenarioLabelEn: orchestration.scenario.labelEn,
      archetype: orchestration.archetype, intensity: orchestration.intensity,
      timeOfDay: orchestration.scenario.timeOfDay, scenePresetId: orchestration.scenario.scenePresetId,
      cutPresetId: orchestration.scenario.cutPresetId,
    },
    session: {
      status: session.status, isPreviewing: session.isPreviewing, selectedBundleId: session.selectedBundleId,
      matchedBundleId: active.matchedBundleId, isCustomMix: active.isCustomMix,
      draftSelection: session.draftSelection, activeIndices: active.activeIndices,
      appliedSlotCount: session.appliedSlotCount, canRevertAll: session.canRevertAll,
      appliedSlots: {
        expression: session.applied.expression?.proposal.id ?? null, lighting: session.applied.lighting?.proposal.id ?? null,
        camera: session.applied.camera?.proposal.id ?? null, balloon: session.applied.balloon?.proposal.id ?? null,
      },
      historyCount: session.history.length,
    },
    coherenceAudit: {
      overallScore: active.coherence.overallScore, grade: active.coherence.grade, violetSlopFree: active.coherence.violetSlopFree,
      expressionJumpScore: active.coherence.expressionContinuity.expressionJumpScore,
      lightingReadabilityGrade: active.coherence.lightingReadability.overallGrade,
      cameraContinuityStatus: active.coherence.cameraContinuity.status,
      balloonFaceOcclusionPct: active.coherence.balloonFaceOcclusionPct,
      balloonReadingOrderValid: active.coherence.balloonReadingOrderValid, notesKo: active.coherence.notesKo,
    },
    activeMix: {
      expression: {
        slotRank: active.expression.index + 1, source: active.expression.source, proposal: active.expression.proposal,
        upperBodyPose: UPPER_BODY_POSE_PRESETS[active.expression.proposal.upperBodyPoseId],
        handGesture: HAND_GESTURE_PRESETS[active.expression.proposal.handGestureId],
      },
      lighting: {
        slotRank: active.lighting.index + 1, source: active.lighting.source,
        proposalId: active.lighting.proposal.id, titleKo: active.lighting.proposal.titleKo,
        keyLight: { ...rig.keyLight, colorCss: formatOklch(rig.keyLight.colorOklch) },
        fillLight: { ...rig.fillLight, colorCss: formatOklch(rig.fillLight.colorOklch) },
        rimLight: { ...rig.rimLight, pigmentCss: formatOklch(rig.rimLight.pigmentOklch) },
        atmosphere: { ...rig.atmosphere, backdropCss: formatOklch(rig.atmosphere.backdropOklch) },
        readabilityAudit: active.lighting.proposal.readabilityAudit,
      },
      camera: { slotRank: active.camera.index + 1, source: active.camera.source, proposal: active.camera.proposal },
      balloon: { slotRank: active.balloon.index + 1, source: active.balloon.source, proposal: active.balloon.proposal },
    },
    unifiedBundles: orchestration.unifiedBundles.map((b) => ({
      id: b.id, rank: b.rank, titleKo: b.titleKo, slotIndices: b.slotIndices, coherenceScore: b.coherence.overallScore,
    })),
  }, null, 2);
}

/** 4대 어시스턴트 통합 연출 결과를 스튜디오 제작용 한글(또는 영문) 큐시트 Markdown으로 내보낸다. */
export function exportUnifiedSceneMarkdown(
  orchestration: OneLineOrchestrationResult,
  session: OneLineOrchestratorSession,
  locale: "ko" | "en" = "ko",
): string {
  const active = resolveActiveOrchestratorView(orchestration, session);
  const expr = active.expression.proposal;
  const light = active.lighting.proposal;
  const cam = active.camera.proposal;
  const bal = active.balloon.proposal;
  const emotionMeta = getEmotionMeta(expr.emotion);
  const archMeta = getArchetypeMeta(orchestration.archetype);
  const poseMeta = UPPER_BODY_POSE_PRESETS[expr.upperBodyPoseId];
  const handMeta = HAND_GESTURE_PRESETS[expr.handGestureId];
  const locMeta = getSceneLocationPreset(orchestration.scenario.scenePresetId);
  const timeMeta = getTimeOfDayMeta(orchestration.scenario.timeOfDay);
  const sceneEmoMeta = getSceneEmotionMeta(orchestration.lightingBundle.analysis.primaryEmotion);
  const toneMeta = getEmotionToneMeta(orchestration.derivedBalloonTone);

  if (locale === "en") {
    const balloonLines = bal.balloons
      .map((b) => `- #${b.order} [${BALLOON_STYLE_LABELS[b.style].en}] (${b.box.x}, ${b.box.y}, ${b.box.width}x${b.box.height}) tail=${b.tailDirection} — "${b.text}"`)
      .join("\n");
    return [
      `# Cut Director Cue Sheet — ${orchestration.scenario.labelEn}`, "",
      `- **Dialogue**: "${orchestration.dialogue}"`,
      `- **Active Recipe**: ${active.recipeLabelEn}${active.isCustomMix ? " (Custom Mix)" : ""}`,
      `- **Session Status**: ${session.status} (${session.appliedSlotCount}/4 slots applied)`,
      `- **Coherence Score**: ${active.coherence.overallScore}/100 (${active.coherence.grade})`, "",
      "## 1. Character Expression & Pose (47B)",
      `- **Emotion / Viseme**: ${emotionMeta.labelEn} / \`${expr.viseme}\` (${archMeta.labelEn})`,
      `- **Pose / Hand**: ${poseMeta.labelEn} · ${handMeta.labelEn}`,
      `- **Brows & Gaze**: Tilt ${expr.eyebrowTiltDeg}°, Lift ${expr.eyebrowLift}, Gaze (${expr.gazeYaw}°, ${expr.gazePitch}°)`, "",
      "## 2. 3-Point Lighting & Atmosphere (48A)",
      `- **Preset**: ${locMeta.labelEn} (${timeMeta.labelEn}) · Mood: ${sceneEmoMeta.labelEn}`,
      `- **Key / Fill / Rim**: Key ${light.rig.keyLight.kelvin}K (${light.rig.keyLight.azimuthDeg}°) · Fill ${Math.round(light.rig.fillLight.fillRatio * 100)}% · Rim ${light.rig.rimLight.pigmentNameEn} (${formatOklch(light.rig.rimLight.pigmentOklch)})`,
      `- **Readability**: Face Contrast ${light.readabilityAudit.faceContrastRatio.toFixed(1)}:1 · Bubble Bg L ${Math.round(light.readabilityAudit.bubbleZoneLuminance * 100)}% (${light.readabilityAudit.overallGrade})`, "",
      "## 3. Camera Angle & 180° Continuity (48B)",
      `- **Framing**: ${cam.titleEn} (${cam.shotScale}, ${cam.focalLengthMm}mm)`,
      `- **Rig Pose**: Yaw ${cam.cameraRig.yawDeg}° / Pitch ${cam.cameraRig.pitchDeg}° / Roll ${cam.cameraRig.rollDeg}°`,
      `- **180° Audit**: ${cam.continuityAudit.status} — ${cam.continuityAudit.reasonEn}`, "",
      "## 4. Speech Balloon & Hangul SFX (48C)",
      `- **Tone / Face Occlusion**: ${toneMeta.labelEn} · Face Occlusion ${bal.metrics.faceOcclusionPct}%`,
      balloonLines,
      `- **SFX**: "${bal.sfx.text}" at (${bal.sfx.centerX}, ${bal.sfx.centerY}) rot ${bal.sfx.rotationDeg}°`,
    ].join("\n");
  }

  const balloonLinesKo = bal.balloons
    .map((b) => `- ${b.order}번 [${BALLOON_STYLE_LABELS[b.style].ko}] 좌표 (${b.box.x}, ${b.box.y}, ${b.box.width}×${b.box.height}) · 꼬리 ${b.tailDirection} — "${b.text}"`)
    .join("\n");
  return [
    `# 컷 연출 큐시트 — ${orchestration.scenario.labelKo}`, "",
    `- **입력 대사**: "${orchestration.dialogue}"`,
    `- **현재 연출 조합**: ${active.recipeLabelKo}${active.isCustomMix ? " (커스텀 믹스)" : ""}`,
    `- **적용 상태**: ${session.status} (${session.appliedSlotCount}/4 슬롯 적용 · 작가 승인 후 적용)`,
    `- **통합 정합성 점수**: ${active.coherence.overallScore}점 / 100점 (${active.coherence.grade})`, "",
    "## 1. 캐릭터 표정·포즈·손 모양 (47B)",
    `- **선택안**: ${active.expression.index + 1}안 · ${expr.titleKo}`,
    `- **주 감정 / 입모양**: ${emotionMeta.labelKo} / 비젬 \`${expr.viseme}\` (${archMeta.labelKo} 성격 · 강도 ${orchestration.intensity}/5)`,
    `- **상체 포즈 / 손 모양**: ${poseMeta.labelKo} · ${handMeta.labelKo}`,
    `- **눈썹·시선**: 눈썹 각도 ${expr.eyebrowTiltDeg}°, 리프트 ${expr.eyebrowLift}, 시선 (${expr.gazeYaw}°, ${expr.gazePitch}°)`, "",
    "## 2. 3점 조명·대기감 (48A)",
    `- **선택안**: ${active.lighting.index + 1}안 · ${light.titleKo}`,
    `- **배경·시간대**: ${locMeta.labelKo} (${timeMeta.labelKo}) · 장면 감정 ${sceneEmoMeta.labelKo}`,
    `- **광원 설정**: 키 ${light.rig.keyLight.kelvin}K(${light.rig.keyLight.azimuthDeg}°) · 필 ${Math.round(light.rig.fillLight.fillRatio * 100)}% · 림 ${light.rig.rimLight.pigmentNameKo} (${formatOklch(light.rig.rimLight.pigmentOklch)})`,
    `- **가독성 점검**: 얼굴 대비비 ${light.readabilityAudit.faceContrastRatio.toFixed(1)}:1 · 말풍선 배경 명도 ${Math.round(light.readabilityAudit.bubbleZoneLuminance * 100)}% (${light.readabilityAudit.overallGrade})`, "",
    "## 3. 카메라 앵글·180° 연속성 (48B)",
    `- **선택안**: ${active.camera.index + 1}안 · ${cam.titleKo} (${cam.shotScale} · ${cam.focalLengthMm}mm)`,
    `- **카메라 릭**: Yaw ${cam.cameraRig.yawDeg}° · Pitch ${cam.cameraRig.pitchDeg}° · Roll ${cam.cameraRig.rollDeg}°`,
    `- **180° 법칙 판정**: ${cam.continuityAudit.status} — ${cam.continuityAudit.reasonKo}`, "",
    "## 4. 말풍선 꼬리·한글 효과음 (48C)",
    `- **선택안**: ${active.balloon.index + 1}안 · ${bal.titleKo} (톤: ${toneMeta.labelKo} · 얼굴 가림률 ${bal.metrics.faceOcclusionPct}%)`,
    balloonLinesKo,
    `- **한글 효과음(SFX)**: "${bal.sfx.text}" 위치 (${bal.sfx.centerX}, ${bal.sfx.centerY}) · 회전 ${bal.sfx.rotationDeg}°`,
  ].join("\n");
}
