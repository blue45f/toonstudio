import { DEFAULT_SAFE_MARGIN } from "../balloon-sfx-placement-proposer";
import type { OneLineScenarioId, OneLineScenarioPreset } from "./oneline-orchestrator-engine";

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
