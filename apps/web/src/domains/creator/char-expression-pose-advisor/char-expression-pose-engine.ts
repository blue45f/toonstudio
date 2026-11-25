/**
 * Wave 47B — 대사·감정 기반 캐릭터 표정·입모양·포즈·손 모양 자동 제안 & 비파괴 교체 엔진.
 *
 * - 한국어 대사·감정 강도(1~5)·성격 아키타입 5종 분석(`analyzeDialogueIntent`)
 *   : 감탄사/문장부호/어휘 사전 기반 8대 감정 분류 + 한글 음절 중성 분해 기반 VRM 비젬 추론
 * - Top-3 비파괴 추천안 생성(`recommendCharacterAdjustments`)
 *   : VRM 표준 11종 블렌드셰이프, 눈썹 각도·시선 오프셋, 상체 포즈·손 모양 프리셋 및 1줄 추천 이유
 * - 직전 컷 연속성 검사(`checkExpressionContinuity`) 및 급격한 표정 점프 중간 전환안 생성
 * - 비파괴 미리보기·1클릭 적용·원복 상태기계(`previewAdvisorProposal`, `applyAdvisorProposal`,
 *   `revertAdvisorProposal`) 및 JSON 패키지 직렬화(`exportAdvisorStateJson`)
 */

export type CharacterArchetype = "stoic" | "energetic" | "tsundere" | "gentle" | "villain";
export type DialogueEmotion =
  | "joy" | "anger" | "sadness" | "surprise" | "embarrassed" | "smirk" | "tired" | "determined";
export type EmotionIntensity = 1 | 2 | 3 | 4 | 5;
export type VisemeId = "aa" | "ih" | "ou" | "ee" | "oh" | "closed";
export type UpperBodyPoseId =
  | "lean-forward-confront" | "hand-on-chin-think" | "arms-crossed-guard" | "shoulder-slump-sigh"
  | "open-gesture-greet" | "step-back-startled" | "shy-hunch-deflect" | "heroic-chest-brace"
  | "tilted-smirk-command";
export type HandGestureId =
  | "pointing-finger" | "clenched-fist" | "open-palm" | "peace-relaxed"
  | "chin-rest" | "wave-halt" | "chest-hold" | "collar-tug";
export type ProposalVariant = "canonical" | "archetype-nuance" | "dramatic-contrast" | "continuity-bridge";
export type ContinuitySeverity = "smooth" | "notice" | "abrupt-jump";
export type AdvisorSessionStatus = "idle" | "previewing" | "applied" | "reverted";
export type PreviousCutPresetId = "calm-neutral" | "bright-joy" | "tense-anger" | "deep-sadness";

export interface VrmBlendShapeWeights {
  readonly happy: number; readonly angry: number; readonly sad: number;
  readonly surprised: number; readonly relaxed: number; readonly blink: number;
  readonly aa: number; readonly ih: number; readonly ou: number; readonly ee: number; readonly oh: number;
}
export interface CharacterArchetypeMeta {
  readonly id: CharacterArchetype; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly expressionScale: number; readonly mouthScale: number;
  readonly preferredEmotion: DialogueEmotion; readonly secondaryAffinity: DialogueEmotion;
}
export interface EmotionMeta {
  readonly id: DialogueEmotion; readonly labelKo: string; readonly labelEn: string;
  readonly valence: "positive" | "negative" | "neutral";
}
export interface UpperBodyPosePreset {
  readonly id: UpperBodyPoseId; readonly labelKo: string; readonly labelEn: string;
  readonly energyLevel: number; readonly noteKo: string; readonly noteEn: string;
}
export interface HandGesturePreset {
  readonly id: HandGestureId; readonly labelKo: string; readonly labelEn: string;
  readonly noteKo: string; readonly noteEn: string;
}
export interface DialogueAnalysisInput {
  readonly dialogue: string; readonly intensity?: number; readonly archetype?: CharacterArchetype;
}
export interface DialogueIntentAnalysis {
  readonly dialogue: string; readonly archetype: CharacterArchetype;
  readonly effectiveIntensity: EmotionIntensity; readonly suggestedIntensity: EmotionIntensity;
  readonly primaryEmotion: DialogueEmotion; readonly secondaryEmotion: DialogueEmotion;
  readonly emotionScores: Readonly<Record<DialogueEmotion, number>>;
  readonly confidence: number; readonly detectedSignals: readonly string[];
  readonly viseme: VisemeId; readonly visemeSourceSyllable: string | null;
  readonly visemeReasonKo: string; readonly visemeReasonEn: string;
}
export interface CharacterAdjustmentProposal {
  readonly id: string; readonly rank: 1 | 2 | 3; readonly variant: ProposalVariant;
  readonly titleKo: string; readonly titleEn: string;
  readonly emotion: DialogueEmotion; readonly viseme: VisemeId; readonly confidence: number;
  readonly blendShapes: VrmBlendShapeWeights;
  readonly eyebrowTiltDeg: number; readonly eyebrowLift: number;
  readonly gazeYaw: number; readonly gazePitch: number;
  readonly upperBodyPoseId: UpperBodyPoseId; readonly handGestureId: HandGestureId;
  readonly reasonKo: string; readonly reasonEn: string;
  readonly requiresAuthorApproval: true;
}
export interface CharacterCutSnapshot {
  readonly labelKo: string; readonly labelEn: string;
  readonly emotion: DialogueEmotion; readonly viseme: VisemeId;
  readonly blendShapes: VrmBlendShapeWeights;
  readonly eyebrowTiltDeg: number; readonly eyebrowLift: number;
  readonly gazeYaw: number; readonly gazePitch: number;
  readonly upperBodyPoseId: UpperBodyPoseId; readonly handGestureId: HandGestureId;
}
export interface ExpressionContinuityReport {
  readonly expressionJumpScore: number; readonly severity: ContinuitySeverity;
  readonly emotionDelta: number; readonly eyebrowDeltaDeg: number; readonly gazeDeltaDeg: number;
  readonly valenceFlipped: boolean;
  readonly jumpFactorsKo: readonly string[]; readonly jumpFactorsEn: readonly string[];
  readonly summaryKo: string; readonly summaryEn: string;
  readonly bridgeProposal: CharacterAdjustmentProposal | null;
}
export interface CharacterAdvisorRecommendationBundle {
  readonly analysis: DialogueIntentAnalysis;
  readonly proposals: readonly [CharacterAdjustmentProposal, CharacterAdjustmentProposal, CharacterAdjustmentProposal];
  readonly continuityCheck: ExpressionContinuityReport | null;
}
export interface AdvisorStateTransition {
  readonly step: number; readonly action: "apply" | "revert";
  readonly proposalId: string | null; readonly labelKo: string;
}
export interface AdvisorApplyState {
  readonly baseline: CharacterCutSnapshot; readonly current: CharacterCutSnapshot;
  readonly previousCut: CharacterCutSnapshot;
  readonly previewingProposalId: string | null; readonly appliedProposalId: string | null;
  readonly status: AdvisorSessionStatus; readonly canRevert: boolean;
  readonly history: readonly AdvisorStateTransition[];
}
export interface DialoguePresetScenario {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly dialogue: string; readonly archetype: CharacterArchetype;
  readonly intensity: EmotionIntensity; readonly previousCutId: PreviousCutPresetId;
}
export interface PreviousCutPreset {
  readonly id: PreviousCutPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly snapshot: CharacterCutSnapshot;
}

const ZERO_BLEND: VrmBlendShapeWeights = {
  happy: 0, angry: 0, sad: 0, surprised: 0, relaxed: 0, blink: 0, aa: 0, ih: 0, ou: 0, ee: 0, oh: 0,
};

function makeBlend(partial: Partial<VrmBlendShapeWeights>): VrmBlendShapeWeights {
  return { ...ZERO_BLEND, ...partial };
}

export const CHARACTER_ARCHETYPES: readonly CharacterArchetypeMeta[] = [
  { id: "stoic", labelKo: "냉정", labelEn: "Stoic", summaryKo: "표정 폭을 절제하고 시선과 눈썹 각도로 감정을 전달합니다.", summaryEn: "Restrains facial amplitude and leads with crisp brow angle and steady gaze.", expressionScale: 0.72, mouthScale: 0.74, preferredEmotion: "determined", secondaryAffinity: "tired" },
  { id: "energetic", labelKo: "활발", labelEn: "Energetic", summaryKo: "눈매·입모양 개방감과 상체 제스처를 크게 살립니다.", summaryEn: "Amplifies mouth aperture, upbeat brows, and open upper-body gestures.", expressionScale: 1.14, mouthScale: 1.16, preferredEmotion: "joy", secondaryAffinity: "surprise" },
  { id: "tsundere", labelKo: "츤데레", labelEn: "Tsundere", summaryKo: "당황·호감을 시선 회피와 약한 눈썹 찌푸림으로 감춥니다.", summaryEn: "Masks warmth or embarrassment with averted gaze and guarded brow tension.", expressionScale: 0.96, mouthScale: 0.92, preferredEmotion: "embarrassed", secondaryAffinity: "anger" },
  { id: "gentle", labelKo: "온화", labelEn: "Gentle", summaryKo: "눈썹 긴장을 풀고 부드러운 시선과 열린 손바닥을 우선합니다.", summaryEn: "Softens brow tension and prioritizes calm eye contact with open palms.", expressionScale: 0.88, mouthScale: 0.9, preferredEmotion: "joy", secondaryAffinity: "sadness" },
  { id: "villain", labelKo: "카리스마", labelEn: "Charismatic", summaryKo: "비대칭 미소와 내려다보는 시선, 여유로운 상체 각도를 조합합니다.", summaryEn: "Pairs composed smirk tension with commanding gaze and tilted posture.", expressionScale: 0.94, mouthScale: 0.88, preferredEmotion: "smirk", secondaryAffinity: "determined" },
];

export const DIALOGUE_EMOTIONS: readonly EmotionMeta[] = [
  { id: "joy", labelKo: "기쁨", labelEn: "Joy", valence: "positive" },
  { id: "anger", labelKo: "분노", labelEn: "Anger", valence: "negative" },
  { id: "sadness", labelKo: "슬픔", labelEn: "Sadness", valence: "negative" },
  { id: "surprise", labelKo: "놀람", labelEn: "Surprise", valence: "neutral" },
  { id: "embarrassed", labelKo: "당황·수줍음", labelEn: "Embarrassed", valence: "neutral" },
  { id: "smirk", labelKo: "여유·비웃음", labelEn: "Smirk", valence: "positive" },
  { id: "tired", labelKo: "피곤·체념", labelEn: "Tired", valence: "negative" },
  { id: "determined", labelKo: "결의·단호", labelEn: "Determined", valence: "neutral" },
];

export const VRM_BLENDSHAPE_KEYS: readonly (keyof VrmBlendShapeWeights)[] = [
  "happy", "angry", "sad", "surprised", "relaxed", "blink", "aa", "ih", "ou", "ee", "oh",
];

export const UPPER_BODY_POSE_PRESETS: Readonly<Record<UpperBodyPoseId, UpperBodyPosePreset>> = {
  "lean-forward-confront": { id: "lean-forward-confront", labelKo: "상체 전경 · 대치", labelEn: "Lean Forward Confront", energyLevel: 5, noteKo: "상체를 12° 앞으로 기울이고 어깨 중심을 상대 쪽으로 밀어 긴장감을 높입니다.", noteEn: "Pitches torso 12° forward to project confrontation and urgency." },
  "hand-on-chin-think": { id: "hand-on-chin-think", labelKo: "턱 괴기 · 사색", labelEn: "Hand on Chin Think", energyLevel: 2, noteKo: "고개를 살짝 꺾고 무게 중심을 뒤로 빼 침착하고 계산적인 인상을 줍니다.", noteEn: "Tilts head gently while shifting weight back for a reflective read." },
  "arms-crossed-guard": { id: "arms-crossed-guard", labelKo: "팔짱 · 경계", labelEn: "Arms Crossed Guard", energyLevel: 3, noteKo: "가슴 앞에서 양팔을 교차해 방어선과 단호한 태도를 세웁니다.", noteEn: "Crosses arms across the chest to establish a guarded boundary." },
  "shoulder-slump-sigh": { id: "shoulder-slump-sigh", labelKo: "어깨 처짐 · 한숨", labelEn: "Shoulder Slump Sigh", energyLevel: 1, noteKo: "양어깨와 흉곽 힘을 빼고 시선을 낮춰 피로감과 체념을 드러냅니다.", noteEn: "Drops shoulder line and lowers sternum to convey fatigue or resignation." },
  "open-gesture-greet": { id: "open-gesture-greet", labelKo: "양팔 열림 · 환대", labelEn: "Open Gesture Greet", energyLevel: 4, noteKo: "가슴을 열고 팔 간격을 넓혀 밝은 호감과 해방감을 강조합니다.", noteEn: "Opens shoulders and widens arm span for warm, celebratory framing." },
  "step-back-startled": { id: "step-back-startled", labelKo: "상체 후퇴 · 화들짝", labelEn: "Step Back Startled", energyLevel: 4, noteKo: "상체를 뒤로 젖히며 어깨를 순간 올려 예상 밖의 충격을 시각화합니다.", noteEn: "Pulls upper torso backward with raised shoulders for startled impact." },
  "shy-hunch-deflect": { id: "shy-hunch-deflect", labelKo: "어깨 움츠림 · 회피", labelEn: "Shy Hunch Deflect", energyLevel: 2, noteKo: "어깨를 안쪽으로 모으고 상체를 15° 비틀어 수줍음·당황을 표현합니다.", noteEn: "Draws shoulders inward with a 15° torso twist to show flustered avoidance." },
  "heroic-chest-brace": { id: "heroic-chest-brace", labelKo: "가슴 펴기 · 결의", labelEn: "Heroic Chest Brace", energyLevel: 4, noteKo: "척추를 곧게 세우고 턱을 살짝 당겨 흔들리지 않는 각오를 잡습니다.", noteEn: "Squares spine upright with a subtle chin tuck for unwavering resolve." },
  "tilted-smirk-command": { id: "tilted-smirk-command", labelKo: "고개 기울임 · 여유 제압", labelEn: "Tilted Smirk Command", energyLevel: 3, noteKo: "턱을 살짝 들고 고개를 8° 기울여 상황을 내려다보는 여유를 만듭니다.", noteEn: "Lifts chin slightly with an 8° head tilt for effortless dominance." },
};

export const HAND_GESTURE_PRESETS: Readonly<Record<HandGestureId, HandGesturePreset>> = {
  "pointing-finger": { id: "pointing-finger", labelKo: "검지 지목", labelEn: "Pointing Finger", noteKo: "검지를 곧게 뻗어 상대나 핵심 대상을 명확히 지목합니다.", noteEn: "Extends index finger cleanly toward the target of confrontation." },
  "clenched-fist": { id: "clenched-fist", labelKo: "꽉 쥔 주먹", labelEn: "Clenched Fist", noteKo: "손가락을 단단히 말아 쥐어 분노나 결의를 손끝까지 전달합니다.", noteEn: "Tightly curls fingers into a tense fist for anger or firm resolve." },
  "open-palm": { id: "open-palm", labelKo: "펼친 손바닥", labelEn: "Open Palm", noteKo: "손바닥을 자연스럽게 펼쳐 솔직함, 위로, 설득의 뉘앙스를 줍니다.", noteEn: "Relaxes and opens palm outward to convey honesty and warmth." },
  "peace-relaxed": { id: "peace-relaxed", labelKo: "느슨한 브이 · 경쾌", labelEn: "Peace Relaxed", noteKo: "검지·중지를 가볍게 펼쳐 경쾌하고 여유 있는 리듬을 더합니다.", noteEn: "Splits index and middle fingers casually for upbeat charm." },
  "chin-rest": { id: "chin-rest", labelKo: "턱 받침", labelEn: "Chin Rest", noteKo: "엄지와 검지로 턱선을 받쳐 관망·추론·여유를 드러냅니다.", noteEn: "Rests thumb and index along the jawline for poise or calculation." },
  "wave-halt": { id: "wave-halt", labelKo: "손바닥 제지", labelEn: "Wave Halt", noteKo: "손바닥을 정면으로 세워 당황·제지·거리 두기를 즉각 알립니다.", noteEn: "Raises upright palm toward the viewer to pause or deflect." },
  "chest-hold": { id: "chest-hold", labelKo: "가슴 위 손", labelEn: "Chest Hold", noteKo: "손끝을 가슴 가까이 모아 슬픔, 안도, 진심 어린 감정을 담습니다.", noteEn: "Draws soft fingers over the chest to express sincerity or ache." },
  "collar-tug": { id: "collar-tug", labelKo: "뒷목 · 옷깃 잡기", labelEn: "Collar Tug", noteKo: "뒷목이나 옷깃을 매만져 민망함·피로·어색함을 자연스럽게 풉니다.", noteEn: "Touches collar or nape to release awkwardness or fatigue." },
};

export const PREVIOUS_CUT_PRESETS: readonly PreviousCutPreset[] = [
  {
    id: "calm-neutral", labelKo: "평온 대화 컷", labelEn: "Calm Dialogue Cut",
    snapshot: { labelKo: "직전 컷 · 평온 대화", labelEn: "Prev Cut · Calm Dialogue", emotion: "determined", viseme: "closed", blendShapes: makeBlend({ happy: 0.12, relaxed: 0.42, blink: 0.08 }), eyebrowTiltDeg: 0, eyebrowLift: 0, gazeYaw: 0, gazePitch: 0, upperBodyPoseId: "hand-on-chin-think", handGestureId: "open-palm" },
  },
  {
    id: "bright-joy", labelKo: "환한 웃음 컷", labelEn: "Bright Joy Cut",
    snapshot: { labelKo: "직전 컷 · 환한 웃음", labelEn: "Prev Cut · Bright Joy", emotion: "joy", viseme: "aa", blendShapes: makeBlend({ happy: 0.88, surprised: 0.08, relaxed: 0.3, blink: 0.14, aa: 0.62 }), eyebrowTiltDeg: 8, eyebrowLift: 0.32, gazeYaw: 4, gazePitch: 3, upperBodyPoseId: "open-gesture-greet", handGestureId: "peace-relaxed" },
  },
  {
    id: "tense-anger", labelKo: "격앙 대치 컷", labelEn: "Tense Confrontation Cut",
    snapshot: { labelKo: "직전 컷 · 격앙 대치", labelEn: "Prev Cut · Tense Confrontation", emotion: "anger", viseme: "oh", blendShapes: makeBlend({ angry: 0.86, surprised: 0.14, blink: 0.04, oh: 0.68 }), eyebrowTiltDeg: -20, eyebrowLift: -0.45, gazeYaw: -2, gazePitch: -2, upperBodyPoseId: "lean-forward-confront", handGestureId: "pointing-finger" },
  },
  {
    id: "deep-sadness", labelKo: "침울 독백 컷", labelEn: "Quiet Sadness Cut",
    snapshot: { labelKo: "직전 컷 · 침울 독백", labelEn: "Prev Cut · Quiet Sadness", emotion: "sadness", viseme: "ou", blendShapes: makeBlend({ sad: 0.84, relaxed: 0.06, blink: 0.28, ou: 0.44 }), eyebrowTiltDeg: 14, eyebrowLift: 0.18, gazeYaw: -6, gazePitch: -12, upperBodyPoseId: "shoulder-slump-sigh", handGestureId: "chest-hold" },
  },
];

export const ADVISOR_DIALOGUE_PRESETS: readonly DialoguePresetScenario[] = [
  { id: "confront-anger", labelKo: "격앙 대치", labelEn: "Confrontation", dialogue: "지금 장난해?! 당장 거기서 멈춰!!", archetype: "stoic", intensity: 4, previousCutId: "bright-joy" },
  { id: "tsundere-blush", labelKo: "츤데레 당황", labelEn: "Tsundere Fluster", dialogue: "아, 아니거든! 딱히 너 걱정돼서 온 거 아니야...", archetype: "tsundere", intensity: 3, previousCutId: "calm-neutral" },
  { id: "villain-smirk", labelKo: "카리스마 여유", labelEn: "Villain Smirk", dialogue: "흥, 고작 그 정도로 나를 막겠다고? 재밌네~", archetype: "villain", intensity: 4, previousCutId: "calm-neutral" },
  { id: "gentle-comfort", labelKo: "온화 위로", labelEn: "Gentle Comfort", dialogue: "괜찮아, 여기까지 온 것만으로도 정말 고마워.", archetype: "gentle", intensity: 3, previousCutId: "deep-sadness" },
  { id: "hero-resolve", labelKo: "클라이맥스 결의", labelEn: "Climax Resolve", dialogue: "반드시 지켜낼 거야! 여기서 한 걸음도 물러서지 않아!", archetype: "energetic", intensity: 5, previousCutId: "calm-neutral" },
];

const EMOTION_LEXICON: Readonly<Record<DialogueEmotion, readonly string[]>> = {
  joy: ["기뻐", "행복", "좋아", "고마워", "감사", "최고", "해냈", "성공", "다행", "신나", "반가워", "축하", "사랑", "완벽", "야호", "만세", "즐거", "ㅎㅎ", "ㅋㅋ", "괜찮아", "happy", "thanks", "glad", "awesome"],
  anger: ["장난해", "그만둬", "닥쳐", "화나", "짜증", "열받", "미쳤", "젠장", "제길", "꺼져", "용서", "감히", "당장", "시끄러", "배신", "복수", "부숴", "최악", "멈춰", "angry", "shut up", "furious", "how dare"],
  sadness: ["미안", "슬퍼", "눈물", "울", "외로", "혼자", "그리워", "보고 싶", "잃었", "떠나", "아파", "후회", "안타까", "결국", "헤어", "어떡해", "ㅠㅠ", "ㅜㅜ", "흑흑", "sorry", "sad", "lonely", "miss you"],
  surprise: ["헉", "설마", "진짜", "뭐야", "세상에", "깜짝", "갑자기", "어떻게", "대체", "잠깐", "충격", "방금", "있을 줄", "말도 안", "어?!", "뭐?!", "에?!", "what?!", "no way", "wait", "whoa", "surprised"],
  embarrassed: ["아니거든", "딱히", "부끄", "창피", "민망", "왜 봐", "보지 마", "착각", "오해", "저기", "그게", "심장", "두근", "바보", "몰라", "놀리지 마", "얼굴", "걱정돼서", "blush", "embarrassed", "don't look", "flustered"],
  smirk: ["흥", "칫", "후후", "크크", "고작", "겨우", "재밌네", "흥미롭", "예상대로", "어리석", "순진", "시시하", "한심", "그 정도로", "나를 막", "기대되네", "가소롭", "heh", "amusing", "pathetic", "predictable"],
  tired: ["하아", "휴", "피곤", "지쳤", "졸려", "힘들", "야근", "귀찮", "쉬고 싶", "녹초", "기운", "체력", "끝이 없", "잠 좀", "죽겠", "무기력", "한숨", "언제 끝나", "tired", "exhausted", "sigh", "sleepy"],
  determined: ["반드시", "절대", "지켜", "물러서지", "끝까지", "결심", "각오", "막아", "해내겠", "포기하지", "약속", "승부", "전력", "뚫고", "이겨", "시작하자", "책임", "기필코", "promise", "never give up", "determined", "protect"],
};

interface EmotionRigProfile {
  readonly blend: Pick<VrmBlendShapeWeights, "happy" | "angry" | "sad" | "surprised" | "relaxed" | "blink">;
  readonly eyebrowTiltDeg: number; readonly eyebrowLift: number; readonly gazeYaw: number; readonly gazePitch: number;
  readonly primaryPose: UpperBodyPoseId; readonly secondaryPose: UpperBodyPoseId;
  readonly primaryHand: HandGestureId; readonly secondaryHand: HandGestureId;
}

const EMOTION_RIG_PROFILES: Readonly<Record<DialogueEmotion, EmotionRigProfile>> = {
  joy: { blend: { happy: 0.88, angry: 0, sad: 0, surprised: 0.08, relaxed: 0.3, blink: 0.12 }, eyebrowTiltDeg: 8, eyebrowLift: 0.28, gazeYaw: 2, gazePitch: 2, primaryPose: "open-gesture-greet", secondaryPose: "heroic-chest-brace", primaryHand: "open-palm", secondaryHand: "peace-relaxed" },
  anger: { blend: { happy: 0, angry: 0.92, sad: 0, surprised: 0.14, relaxed: 0, blink: 0.04 }, eyebrowTiltDeg: -22, eyebrowLift: -0.46, gazeYaw: 0, gazePitch: -2, primaryPose: "lean-forward-confront", secondaryPose: "arms-crossed-guard", primaryHand: "pointing-finger", secondaryHand: "clenched-fist" },
  sadness: { blend: { happy: 0, angry: 0, sad: 0.88, surprised: 0, relaxed: 0.08, blink: 0.26 }, eyebrowTiltDeg: 15, eyebrowLift: 0.2, gazeYaw: -6, gazePitch: -12, primaryPose: "shoulder-slump-sigh", secondaryPose: "shy-hunch-deflect", primaryHand: "chest-hold", secondaryHand: "open-palm" },
  surprise: { blend: { happy: 0, angry: 0, sad: 0, surprised: 0.94, relaxed: 0, blink: 0 }, eyebrowTiltDeg: 6, eyebrowLift: 0.72, gazeYaw: 0, gazePitch: 4, primaryPose: "step-back-startled", secondaryPose: "lean-forward-confront", primaryHand: "wave-halt", secondaryHand: "open-palm" },
  embarrassed: { blend: { happy: 0.22, angry: 0.14, sad: 0.1, surprised: 0.34, relaxed: 0, blink: 0.2 }, eyebrowTiltDeg: 10, eyebrowLift: 0.24, gazeYaw: -15, gazePitch: -6, primaryPose: "shy-hunch-deflect", secondaryPose: "arms-crossed-guard", primaryHand: "collar-tug", secondaryHand: "wave-halt" },
  smirk: { blend: { happy: 0.56, angry: 0.12, sad: 0, surprised: 0, relaxed: 0.44, blink: 0.14 }, eyebrowTiltDeg: -8, eyebrowLift: 0.12, gazeYaw: 10, gazePitch: -4, primaryPose: "tilted-smirk-command", secondaryPose: "hand-on-chin-think", primaryHand: "chin-rest", secondaryHand: "pointing-finger" },
  tired: { blend: { happy: 0, angry: 0.06, sad: 0.42, surprised: 0, relaxed: 0.36, blink: 0.54 }, eyebrowTiltDeg: 8, eyebrowLift: -0.22, gazeYaw: -4, gazePitch: -10, primaryPose: "shoulder-slump-sigh", secondaryPose: "hand-on-chin-think", primaryHand: "collar-tug", secondaryHand: "chin-rest" },
  determined: { blend: { happy: 0.08, angry: 0.36, sad: 0, surprised: 0.06, relaxed: 0.14, blink: 0.04 }, eyebrowTiltDeg: -14, eyebrowLift: -0.24, gazeYaw: 0, gazePitch: 2, primaryPose: "heroic-chest-brace", secondaryPose: "lean-forward-confront", primaryHand: "clenched-fist", secondaryHand: "pointing-finger" },
};

const JUNGSEONG_VISEME_MAP: readonly VisemeId[] = [
  "aa", "ee", "aa", "ee", "oh", "ee", "oh", "ee", "oh", "aa", "ee",
  "oh", "oh", "ou", "ou", "ee", "ih", "ou", "ou", "ih", "ih",
];
const JUNGSEONG_LABELS: readonly string[] = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ",
  "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
const LATIN_VISEME_MAP: Readonly<Record<string, VisemeId>> = {
  a: "aa", i: "ih", y: "ih", u: "ou", e: "ee", o: "oh",
};

function round2(n: number): number { return Math.round(n * 100) / 100; }
function clamp(n: number, min: number, max: number): number { return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function clamp01(n: number): number { return round2(clamp(n, 0, 1)); }

export function clampIntensity(value: number | undefined): EmotionIntensity {
  if (typeof value !== "number" || !Number.isFinite(value)) return 3;
  const r = Math.round(clamp(value, 1, 5));
  return r <= 1 ? 1 : r === 2 ? 2 : r === 3 ? 3 : r === 4 ? 4 : 5;
}

export function getArchetypeMeta(id: CharacterArchetype): CharacterArchetypeMeta {
  for (const item of CHARACTER_ARCHETYPES) {
    if (item.id === id) return item;
  }
  return { id: "stoic", labelKo: "냉정", labelEn: "Stoic", summaryKo: "표정 폭을 절제합니다.", summaryEn: "Restrains facial amplitude.", expressionScale: 0.72, mouthScale: 0.74, preferredEmotion: "determined", secondaryAffinity: "tired" };
}

export function getEmotionMeta(id: DialogueEmotion): EmotionMeta {
  for (const item of DIALOGUE_EMOTIONS) {
    if (item.id === id) return item;
  }
  return { id: "determined", labelKo: "결의·단호", labelEn: "Determined", valence: "neutral" };
}

export function getPreviousCutPreset(id: PreviousCutPresetId): PreviousCutPreset {
  for (const item of PREVIOUS_CUT_PRESETS) {
    if (item.id === id) return item;
  }
  return {
    id: "calm-neutral", labelKo: "평온 대화 컷", labelEn: "Calm Dialogue Cut",
    snapshot: { labelKo: "직전 컷 · 평온 대화", labelEn: "Prev Cut · Calm Dialogue", emotion: "determined", viseme: "closed", blendShapes: makeBlend({ happy: 0.12, relaxed: 0.42, blink: 0.08 }), eyebrowTiltDeg: 0, eyebrowLift: 0, gazeYaw: 0, gazePitch: 0, upperBodyPoseId: "hand-on-chin-think", handGestureId: "open-palm" },
  };
}

function extractVisemeFromDialogue(dialogue: string): {
  readonly viseme: VisemeId; readonly syllable: string | null;
  readonly reasonKo: string; readonly reasonEn: string;
} {
  const compact = dialogue.replace(/\([^)]*\)/gu, " ").trim().replace(/[\s.,!?~…'"\-·]/gu, "");
  if (compact.length === 0) {
    return { viseme: "closed", syllable: null, reasonKo: "무언·침묵 대사로 판단해 입을 다문 closed 비젬을 선택했습니다.", reasonEn: "Detected silent line; mapped to closed viseme." };
  }
  if (/^(?:음+|흠+|읍+|윽|쩝|hmm+)$/iu.test(compact)) {
    return { viseme: "closed", syllable: compact.slice(-1), reasonKo: `입을 다문 콧소리('${compact}')로 감지해 closed 비젬을 적용합니다.`, reasonEn: `Closed-mouth hum ('${compact}') mapped to closed viseme.` };
  }
  for (let i = compact.length - 1; i >= 0; i -= 1) {
    const ch = compact.charAt(i);
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const jungIdx = Math.floor(((code - 0xac00) % 588) / 28);
      const viseme = JUNGSEONG_VISEME_MAP[jungIdx] ?? "aa";
      const vowelLabel = JUNGSEONG_LABELS[jungIdx] ?? "ㅏ";
      return { viseme, syllable: ch, reasonKo: `마지막 발화 음절 '${ch}'(중성 ${vowelLabel}) 기준으로 ${viseme} 입모양을 매칭했습니다.`, reasonEn: `Matched final syllable '${ch}' (${vowelLabel}) to ${viseme} viseme.` };
    }
  }
  const lastJamo = compact.slice(-1);
  if ("ㅜㅠㅡ".includes(lastJamo)) {
    return { viseme: "ou", syllable: lastJamo, reasonKo: `자모 표기 '${lastJamo}'에 맞춰 ou 비젬을 선택했습니다.`, reasonEn: `Mapped trailing Jamo '${lastJamo}' to ou viseme.` };
  }
  if ("ㅋㅎ".includes(lastJamo)) {
    return { viseme: "ee", syllable: lastJamo, reasonKo: `웃음 자모 '${lastJamo}'에 맞춰 ee 비젬을 선택했습니다.`, reasonEn: `Mapped laugh Jamo '${lastJamo}' to ee viseme.` };
  }
  const lower = compact.toLowerCase();
  for (let i = lower.length - 1; i >= 0; i -= 1) {
    const ch = lower.charAt(i);
    const mapped = LATIN_VISEME_MAP[ch];
    if (mapped) {
      return { viseme: mapped, syllable: ch, reasonKo: `영문 모음 '${ch}' 기준 ${mapped} 입모양을 매칭했습니다.`, reasonEn: `Matched vowel '${ch}' to ${mapped} viseme.` };
    }
  }
  return { viseme: "closed", syllable: null, reasonKo: "뚜렷한 개방 모음이 없어 closed 입모양으로 유지합니다.", reasonEn: "No open vowel detected; keeping closed mouth shape." };
}

/** 한국어 대사 텍스트·감정 강도·캐릭터 성격 아키타입을 분석해 8대 감정과 입모양 비젬을 산출한다. */
export function analyzeDialogueIntent(input: DialogueAnalysisInput): DialogueIntentAnalysis {
  const dialogue = input.dialogue.trim();
  const archetype: CharacterArchetype = input.archetype ?? "stoic";
  const archMeta = getArchetypeMeta(archetype);
  const effectiveIntensity = clampIntensity(input.intensity);
  const scores: Record<DialogueEmotion, number> = {
    joy: 0.1, anger: 0.1, sadness: 0.1, surprise: 0.1,
    embarrassed: 0.1, smirk: 0.1, tired: 0.1, determined: 0.1,
  };
  const signals: string[] = [];

  scores[archMeta.preferredEmotion] += 0.35;
  scores[archMeta.secondaryAffinity] += 0.15;

  const lower = dialogue.toLowerCase();
  for (const emotion of DIALOGUE_EMOTIONS) {
    for (const kw of EMOTION_LEXICON[emotion.id]) {
      if (lower.includes(kw)) {
        scores[emotion.id] += kw.length >= 3 ? 2.6 : 2.1;
        if (signals.length < 6) signals.push(`어휘:${kw}`);
      }
    }
  }

  let punctuationEnergy = 0;
  if (/[?!]{2,}/u.test(dialogue) && dialogue.includes("?") && dialogue.includes("!")) {
    scores.surprise += 1.6; scores.anger += 0.9; scores.embarrassed += 0.5;
    punctuationEnergy += 2; signals.push("부호(?!)");
  } else if (/!{2,}/u.test(dialogue)) {
    scores.anger += 1.25; scores.determined += 1.1; scores.surprise += 0.75; scores.joy += 0.45;
    punctuationEnergy += 2; signals.push("강조감탄(!!)");
  } else if (dialogue.includes("!")) {
    scores.determined += 0.45; scores.joy += 0.45; scores.anger += 0.35; scores.surprise += 0.35;
    punctuationEnergy += 1; signals.push("감탄부호(!)");
  }
  if (/\?{2,}/u.test(dialogue)) {
    scores.surprise += 1.15; scores.embarrassed += 0.45; punctuationEnergy += 1; signals.push("연속의문(??)");
  } else if (dialogue.includes("?")) {
    scores.surprise += 0.35; scores.smirk += 0.25; signals.push("의문부호(?)");
  }
  if (/(?:\.{2,}|…)/u.test(dialogue)) {
    scores.sadness += 0.85; scores.tired += 0.95; scores.embarrassed += 0.65;
    punctuationEnergy -= 1; signals.push("말줄임표(...)");
  }
  if (dialogue.includes("~")) {
    scores.joy += 0.95; scores.smirk += 0.6; signals.push("물결표(~)");
  }
  if (/(?:^|\s)(?:아|어|그|저|으),/u.test(dialogue)) {
    scores.embarrassed += 1.3; scores.surprise += 0.35; signals.push("더듬기(,)");
  }

  const ranked = [...DIALOGUE_EMOTIONS]
    .map((m) => ({ id: m.id, score: scores[m.id] }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0] ?? { id: "determined" as DialogueEmotion, score: 1 };
  const second = ranked[1] ?? { id: "joy" as DialogueEmotion, score: 0.5 };
  const total = ranked.reduce((acc, item) => acc + item.score, 0);
  const visemeMatch = extractVisemeFromDialogue(dialogue);

  return {
    dialogue, archetype, effectiveIntensity,
    suggestedIntensity: clampIntensity(3 + punctuationEnergy),
    primaryEmotion: top.id, secondaryEmotion: second.id,
    emotionScores: {
      joy: round2(scores.joy / total), anger: round2(scores.anger / total),
      sadness: round2(scores.sadness / total), surprise: round2(scores.surprise / total),
      embarrassed: round2(scores.embarrassed / total), smirk: round2(scores.smirk / total),
      tired: round2(scores.tired / total), determined: round2(scores.determined / total),
    },
    confidence: clamp01(0.56 + Math.min(0.4, Math.max(0, top.score - second.score) * 0.14)),
    detectedSignals: signals.length > 0 ? signals : ["기본 어조"],
    viseme: visemeMatch.viseme, visemeSourceSyllable: visemeMatch.syllable,
    visemeReasonKo: visemeMatch.reasonKo, visemeReasonEn: visemeMatch.reasonEn,
  };
}

function buildBlendShapes(params: {
  readonly emotion: DialogueEmotion; readonly viseme: VisemeId;
  readonly intensity: EmotionIntensity; readonly archetype: CharacterArchetype;
  readonly amplitudeBoost?: number;
}): VrmBlendShapeWeights {
  const { emotion, viseme, intensity, archetype, amplitudeBoost = 1 } = params;
  const profile = EMOTION_RIG_PROFILES[emotion];
  const arch = getArchetypeMeta(archetype);
  const scale = (0.44 + (intensity - 1) * 0.14) * arch.expressionScale * amplitudeBoost;

  let happy = profile.blend.happy * scale;
  let angry = profile.blend.angry * scale;
  let relaxed = profile.blend.relaxed * (0.65 + (intensity - 1) * 0.08);
  let blink = profile.blend.blink;

  if (archetype === "tsundere" && (emotion === "joy" || emotion === "embarrassed")) {
    angry += 0.18; happy *= 0.72;
  } else if (archetype === "gentle") {
    relaxed += 0.16; angry *= 0.66;
  } else if (archetype === "villain" && (emotion === "anger" || emotion === "determined" || emotion === "smirk")) {
    happy += 0.16; relaxed += 0.12;
  } else if (archetype === "stoic") {
    blink *= 0.75;
  }

  const mouth = viseme === "closed"
    ? 0
    : clamp01((0.4 + (intensity - 1) * 0.12) * arch.mouthScale * amplitudeBoost);

  return {
    happy: clamp01(happy), angry: clamp01(angry), sad: clamp01(profile.blend.sad * scale),
    surprised: clamp01(profile.blend.surprised * scale), relaxed: clamp01(relaxed), blink: clamp01(blink),
    aa: viseme === "aa" ? mouth : 0, ih: viseme === "ih" ? mouth : 0,
    ou: viseme === "ou" ? mouth : 0, ee: viseme === "ee" ? mouth : 0, oh: viseme === "oh" ? mouth : 0,
  };
}

function getArchetypeNuancePreset(archetype: CharacterArchetype, emotion: DialogueEmotion): {
  readonly pose: UpperBodyPoseId; readonly hand: HandGestureId;
  readonly browDelta: number; readonly yawDelta: number; readonly pitchDelta: number;
  readonly noteKo: string; readonly noteEn: string;
} {
  switch (archetype) {
    case "stoic":
      return { pose: emotion === "anger" || emotion === "determined" ? "arms-crossed-guard" : "hand-on-chin-think", hand: emotion === "anger" ? "clenched-fist" : "chin-rest", browDelta: -3, yawDelta: 4, pitchDelta: -2, noteKo: "냉정 성격에 맞춰 입 벌림을 줄이고 팔짱·턱 받침으로 감정을 절제했습니다.", noteEn: "Applies stoic restraint with tight mouth amplitude and guarded posture." };
    case "energetic":
      return { pose: emotion === "sadness" || emotion === "tired" ? "shy-hunch-deflect" : "open-gesture-greet", hand: emotion === "anger" ? "pointing-finger" : "peace-relaxed", browDelta: 4, yawDelta: 5, pitchDelta: 3, noteKo: "활발한 캐릭터 결에 맞춰 시선을 높이고 열린 상체·경쾌한 손 동작을 강조했습니다.", noteEn: "Boosts energetic readability with lively brow lift and open gestures." };
    case "tsundere":
      return { pose: emotion === "anger" ? "arms-crossed-guard" : "shy-hunch-deflect", hand: emotion === "joy" || emotion === "embarrassed" ? "collar-tug" : "wave-halt", browDelta: -5, yawDelta: -14, pitchDelta: -3, noteKo: "츤데레 기질을 살려 시선을 살짝 비틀고 방어적인 손 제스처로 속마음을 숨깁니다.", noteEn: "Uses tsundere averted gaze and defensive hand cues to veil true intent." };
    case "gentle":
      return { pose: emotion === "sadness" ? "shoulder-slump-sigh" : "open-gesture-greet", hand: emotion === "sadness" || emotion === "embarrassed" ? "chest-hold" : "open-palm", browDelta: 5, yawDelta: 0, pitchDelta: 1, noteKo: "온화한 인상을 유지하도록 눈썹 경사를 완화하고 열린 손바닥으로 시선을 맞춥니다.", noteEn: "Softens brow tilt and centers warm gaze with an open-palm gesture." };
    case "villain":
      return { pose: "tilted-smirk-command", hand: emotion === "anger" ? "pointing-finger" : "chin-rest", browDelta: -4, yawDelta: 10, pitchDelta: -5, noteKo: "카리스마 연출로 턱을 들고 내려다보는 시선과 여유로운 손 모양을 조합했습니다.", noteEn: "Frames charismatic poise using downward gaze and composed chin rest." };
  }
}

/** 직전 컷과 대상 추천안 사이의 표정·시선·눈썹 점프를 진단하고 필요 시 중간 전환안을 생성한다. */
export function checkExpressionContinuity(
  previousCut: CharacterCutSnapshot,
  target: CharacterAdjustmentProposal,
): ExpressionContinuityReport {
  const emotionKeys = ["happy", "angry", "sad", "surprised", "relaxed"] as const;
  let l1Sum = 0;
  for (const key of emotionKeys) l1Sum += Math.abs(previousCut.blendShapes[key] - target.blendShapes[key]);
  const emotionDelta = round2(l1Sum);
  const eyebrowDeltaDeg = Math.round(Math.abs(previousCut.eyebrowTiltDeg - target.eyebrowTiltDeg));
  const gazeDeltaDeg = Math.round(Math.hypot(previousCut.gazeYaw - target.gazeYaw, previousCut.gazePitch - target.gazePitch));
  const prevValence = getEmotionMeta(previousCut.emotion).valence;
  const nextValence = getEmotionMeta(target.emotion).valence;
  const valenceFlipped =
    (prevValence === "positive" && nextValence === "negative")
    || (prevValence === "negative" && nextValence === "positive");
  const prevEnergy = UPPER_BODY_POSE_PRESETS[previousCut.upperBodyPoseId].energyLevel;
  const nextEnergy = UPPER_BODY_POSE_PRESETS[target.upperBodyPoseId].energyLevel;
  const poseJump = Math.abs(prevEnergy - nextEnergy);

  const expressionJumpScore = Math.round(clamp(
    emotionDelta * 30 + (valenceFlipped ? 26 : 0) + Math.min(20, eyebrowDeltaDeg * 0.7) + Math.min(14, gazeDeltaDeg * 0.65) + poseJump * 3.5,
    0, 100,
  ));
  const severity: ContinuitySeverity = expressionJumpScore >= 65 ? "abrupt-jump" : expressionJumpScore >= 35 ? "notice" : "smooth";

  const factorsKo: string[] = [];
  const factorsEn: string[] = [];
  if (valenceFlipped) {
    factorsKo.push(`감정 극성 반전 (${getEmotionMeta(previousCut.emotion).labelKo} → ${getEmotionMeta(target.emotion).labelKo})`);
    factorsEn.push(`Valence polarity flip (${previousCut.emotion} → ${target.emotion})`);
  }
  if (eyebrowDeltaDeg >= 16) {
    factorsKo.push(`눈썹 각도 급변 (${eyebrowDeltaDeg}°)`);
    factorsEn.push(`Sharp eyebrow angle shift (${eyebrowDeltaDeg}°)`);
  }
  if (gazeDeltaDeg >= 16) {
    factorsKo.push(`시선 이동 폭 과다 (${gazeDeltaDeg}°)`);
    factorsEn.push(`Large gaze swing (${gazeDeltaDeg}°)`);
  }
  if (poseJump >= 3) {
    factorsKo.push(`상체 에너지 급전환 (${prevEnergy} → ${nextEnergy})`);
    factorsEn.push(`Abrupt upper-body energy shift (${prevEnergy} → ${nextEnergy})`);
  }
  if (factorsKo.length === 0) {
    factorsKo.push("표정·시선 변화가 자연 연결 범위 안입니다.");
    factorsEn.push("Facial and gaze deltas remain within smooth continuity bounds.");
  }

  let bridgeProposal: CharacterAdjustmentProposal | null = null;
  if (severity !== "smooth") {
    const lerp = (a: number, b: number): number => clamp01(a * 0.48 + b * 0.52);
    const pb = previousCut.blendShapes;
    const tb = target.blendShapes;
    bridgeProposal = {
      id: `bridge-${previousCut.emotion}-to-${target.emotion}`, rank: 2, variant: "continuity-bridge",
      titleKo: "직전 컷 완충 전환안", titleEn: "Continuity Bridge Transition",
      emotion: target.emotion, viseme: target.viseme, confidence: 0.91,
      blendShapes: {
        happy: lerp(pb.happy, tb.happy), angry: lerp(pb.angry, tb.angry), sad: lerp(pb.sad, tb.sad),
        surprised: clamp01(Math.max(lerp(pb.surprised, tb.surprised), 0.18)),
        relaxed: lerp(pb.relaxed, tb.relaxed), blink: clamp01(lerp(pb.blink, tb.blink) + 0.08),
        aa: lerp(pb.aa, tb.aa), ih: lerp(pb.ih, tb.ih), ou: lerp(pb.ou, tb.ou), ee: lerp(pb.ee, tb.ee), oh: lerp(pb.oh, tb.oh),
      },
      eyebrowTiltDeg: Math.round((previousCut.eyebrowTiltDeg + target.eyebrowTiltDeg) * 0.5),
      eyebrowLift: round2((previousCut.eyebrowLift + target.eyebrowLift) * 0.5),
      gazeYaw: Math.round((previousCut.gazeYaw + target.gazeYaw) * 0.5),
      gazePitch: Math.round((previousCut.gazePitch + target.gazePitch) * 0.5),
      upperBodyPoseId: valenceFlipped ? "arms-crossed-guard" : "hand-on-chin-think",
      handGestureId: valenceFlipped ? "wave-halt" : "open-palm",
      reasonKo: `직전 '${getEmotionMeta(previousCut.emotion).labelKo}' 컷에서 급변을 막기 위해 표정 가중치·눈썹 각도를 중간값으로 완충했습니다.`,
      reasonEn: `Blends facial weights and brow tilt midway from '${previousCut.emotion}' to prevent a jarring cut jump.`,
      requiresAuthorApproval: true,
    };
  }

  return {
    expressionJumpScore, severity, emotionDelta, eyebrowDeltaDeg, gazeDeltaDeg, valenceFlipped,
    jumpFactorsKo: factorsKo, jumpFactorsEn: factorsEn,
    summaryKo: severity === "abrupt-jump" ? `직전 컷 대비 표정 점프(${expressionJumpScore}점)가 큽니다. 중간 전환안 적용을 권장합니다.`
      : severity === "notice" ? `감정 전환 폭(${expressionJumpScore}점)이 다소 큽니다. 필요 시 완충 전환안으로 다듬으세요.`
        : `직전 컷과 자연스럽게 이어집니다 (점프 지수 ${expressionJumpScore}점).`,
    summaryEn: severity === "abrupt-jump" ? `Abrupt expression jump (${expressionJumpScore}/100) from previous cut. Bridge transition recommended.`
      : severity === "notice" ? `Noticeable expression shift (${expressionJumpScore}/100). Optional bridge transition available.`
        : `Smooth continuity with previous cut (jump index ${expressionJumpScore}/100).`,
    bridgeProposal,
  };
}

/** 대사·감정 분석 결과를 바탕으로 Top-3 비파괴 표정·입모양·포즈·손 모양 추천안을 생성한다. */
export function recommendCharacterAdjustments(
  input: DialogueAnalysisInput,
  previousCut?: CharacterCutSnapshot | null,
): CharacterAdvisorRecommendationBundle {
  const analysis = analyzeDialogueIntent(input);
  const { primaryEmotion, secondaryEmotion, effectiveIntensity, archetype, viseme } = analysis;
  const primaryProfile = EMOTION_RIG_PROFILES[primaryEmotion];
  const secondaryProfile = EMOTION_RIG_PROFILES[secondaryEmotion];
  const archMeta = getArchetypeMeta(archetype);
  const nuance = getArchetypeNuancePreset(archetype, primaryEmotion);
  const emotionKo = getEmotionMeta(primaryEmotion).labelKo;
  const secondaryKo = getEmotionMeta(secondaryEmotion).labelKo;
  const intensityScale = 0.72 + (effectiveIntensity - 1) * 0.1;

  const p1: CharacterAdjustmentProposal = {
    id: `proposal-1-${primaryEmotion}-${archetype}-${viseme}`, rank: 1, variant: "canonical",
    titleKo: "정석 감정 매칭안", titleEn: "Canonical Emotion Match",
    emotion: primaryEmotion, viseme, confidence: clamp01(Math.max(0.76, analysis.confidence)),
    blendShapes: buildBlendShapes({ emotion: primaryEmotion, viseme, intensity: effectiveIntensity, archetype }),
    eyebrowTiltDeg: Math.round(clamp(primaryProfile.eyebrowTiltDeg * intensityScale, -26, 24)),
    eyebrowLift: round2(clamp(primaryProfile.eyebrowLift * intensityScale, -1, 1)),
    gazeYaw: Math.round(clamp(primaryProfile.gazeYaw, -24, 24)),
    gazePitch: Math.round(clamp(primaryProfile.gazePitch, -18, 18)),
    upperBodyPoseId: primaryProfile.primaryPose, handGestureId: primaryProfile.primaryHand,
    reasonKo: `'${emotionKo}' 어조와 '${viseme}' 입모양을 ${archMeta.labelKo} 톤으로 맞춘 표준 연출입니다.`,
    reasonEn: `Canonical ${primaryEmotion} read with '${viseme}' viseme tuned for ${archMeta.labelEn} archetype.`,
    requiresAuthorApproval: true,
  };

  const p2: CharacterAdjustmentProposal = {
    id: `proposal-2-${primaryEmotion}-${archetype}-nuance`, rank: 2, variant: "archetype-nuance",
    titleKo: `${archMeta.labelKo} 성격 변주안`, titleEn: `${archMeta.labelEn} Nuance Variant`,
    emotion: primaryEmotion, viseme, confidence: clamp01(Math.max(0.68, p1.confidence - 0.07)),
    blendShapes: buildBlendShapes({ emotion: primaryEmotion, viseme, intensity: effectiveIntensity, archetype, amplitudeBoost: archetype === "energetic" ? 1.08 : 0.9 }),
    eyebrowTiltDeg: Math.round(clamp(p1.eyebrowTiltDeg + nuance.browDelta, -26, 24)),
    eyebrowLift: round2(clamp(p1.eyebrowLift + (nuance.browDelta > 0 ? 0.1 : -0.08), -1, 1)),
    gazeYaw: Math.round(clamp(p1.gazeYaw + nuance.yawDelta, -24, 24)),
    gazePitch: Math.round(clamp(p1.gazePitch + nuance.pitchDelta, -18, 18)),
    upperBodyPoseId: nuance.pose, handGestureId: nuance.hand,
    reasonKo: nuance.noteKo, reasonEn: nuance.noteEn, requiresAuthorApproval: true,
  };

  const contrastIntensity = clampIntensity(effectiveIntensity >= 4 ? effectiveIntensity - 1 : effectiveIntensity + 1);
  const p3Base = buildBlendShapes({ emotion: primaryEmotion, viseme, intensity: contrastIntensity, archetype, amplitudeBoost: 0.86 });
  const p3Sub = buildBlendShapes({ emotion: secondaryEmotion, viseme, intensity: clampIntensity(Math.max(1, effectiveIntensity - 1)), archetype, amplitudeBoost: 0.55 });
  const p3: CharacterAdjustmentProposal = {
    id: `proposal-3-${primaryEmotion}-with-${secondaryEmotion}`, rank: 3, variant: "dramatic-contrast",
    titleKo: `${secondaryKo} 여운 대조안`, titleEn: `${getEmotionMeta(secondaryEmotion).labelEn} Subtext Contrast`,
    emotion: secondaryEmotion, viseme, confidence: clamp01(Math.max(0.58, p2.confidence - 0.09)),
    blendShapes: {
      happy: clamp01(p3Base.happy * 0.65 + p3Sub.happy * 0.35), angry: clamp01(p3Base.angry * 0.65 + p3Sub.angry * 0.35),
      sad: clamp01(p3Base.sad * 0.65 + p3Sub.sad * 0.35), surprised: clamp01(p3Base.surprised * 0.65 + p3Sub.surprised * 0.35),
      relaxed: clamp01(p3Base.relaxed * 0.65 + p3Sub.relaxed * 0.35), blink: clamp01(p3Base.blink * 0.6 + p3Sub.blink * 0.4),
      aa: p3Base.aa, ih: p3Base.ih, ou: p3Base.ou, ee: p3Base.ee, oh: p3Base.oh,
    },
    eyebrowTiltDeg: Math.round(clamp((p1.eyebrowTiltDeg + secondaryProfile.eyebrowTiltDeg) * 0.5, -26, 24)),
    eyebrowLift: round2(clamp((p1.eyebrowLift + secondaryProfile.eyebrowLift) * 0.5, -1, 1)),
    gazeYaw: Math.round(clamp(secondaryProfile.gazeYaw !== 0 ? secondaryProfile.gazeYaw : 8, -24, 24)),
    gazePitch: Math.round(clamp(secondaryProfile.gazePitch, -18, 18)),
    upperBodyPoseId: secondaryProfile.primaryPose === p1.upperBodyPoseId ? primaryProfile.secondaryPose : secondaryProfile.primaryPose,
    handGestureId: secondaryProfile.primaryHand === p1.handGestureId ? primaryProfile.secondaryHand : secondaryProfile.primaryHand,
    reasonKo: `주 감정 '${emotionKo}' 아래 '${secondaryKo}' 여운을 겹쳐 입체적인 대조 컷을 만듭니다.`,
    reasonEn: `Layers '${secondaryEmotion}' subtext under '${primaryEmotion}' for dramatic contrast.`,
    requiresAuthorApproval: true,
  };

  return { analysis, proposals: [p1, p2, p3], continuityCheck: previousCut ? checkExpressionContinuity(previousCut, p1) : null };
}

/** 제안안으로부터 컷 스냅샷을 생성한다. */
export function snapshotFromProposal(proposal: CharacterAdjustmentProposal): CharacterCutSnapshot {
  return {
    labelKo: `적용안 · ${proposal.titleKo}`, labelEn: `Applied · ${proposal.titleEn}`,
    emotion: proposal.emotion, viseme: proposal.viseme, blendShapes: { ...proposal.blendShapes },
    eyebrowTiltDeg: proposal.eyebrowTiltDeg, eyebrowLift: proposal.eyebrowLift,
    gazeYaw: proposal.gazeYaw, gazePitch: proposal.gazePitch,
    upperBodyPoseId: proposal.upperBodyPoseId, handGestureId: proposal.handGestureId,
  };
}

/** 비파괴 적용·되돌리기 어시스턴트 세션의 초기 상태를 생성한다. */
export function createAdvisorSessionState(baseline?: CharacterCutSnapshot, previousCut?: CharacterCutSnapshot): AdvisorApplyState {
  const defaultCut = getPreviousCutPreset("calm-neutral").snapshot;
  const resolvedBaseline: CharacterCutSnapshot = baseline
    ? { ...baseline, blendShapes: { ...baseline.blendShapes } }
    : { ...defaultCut, labelKo: "원본 컷 (작가 기본값)", labelEn: "Original Baseline Cut" };
  const resolvedPrev: CharacterCutSnapshot = previousCut
    ? { ...previousCut, blendShapes: { ...previousCut.blendShapes } }
    : { ...defaultCut, blendShapes: { ...defaultCut.blendShapes } };
  return {
    baseline: resolvedBaseline,
    current: { ...resolvedBaseline, blendShapes: { ...resolvedBaseline.blendShapes } },
    previousCut: resolvedPrev,
    previewingProposalId: null, appliedProposalId: null, status: "idle", canRevert: false, history: [],
  };
}

/** 추천안을 실제 원본·적용 상태를 건드리지 않고 미리보기 상태로 토글한다. */
export function previewAdvisorProposal(state: AdvisorApplyState, proposalId: string | null): AdvisorApplyState {
  const nextPreviewId = state.previewingProposalId === proposalId ? null : proposalId;
  const nextStatus: AdvisorSessionStatus = nextPreviewId ? "previewing" : state.appliedProposalId ? "applied" : "idle";
  return { ...state, previewingProposalId: nextPreviewId, status: nextStatus };
}

/** 작가 승인으로 추천안을 1클릭 비파괴 적용한다(baseline 원본은 항상 보존). */
export function applyAdvisorProposal(state: AdvisorApplyState, proposal: CharacterAdjustmentProposal): AdvisorApplyState {
  const nextTransition: AdvisorStateTransition = {
    step: state.history.length + 1, action: "apply", proposalId: proposal.id, labelKo: `${proposal.titleKo} 적용`,
  };
  return {
    ...state, current: snapshotFromProposal(proposal), previewingProposalId: null, appliedProposalId: proposal.id,
    status: "applied", canRevert: true, history: [...state.history, nextTransition],
  };
}

/** 적용된 표정·포즈·손 모양을 원본(baseline) 상태로 즉시 되돌린다. */
export function revertAdvisorProposal(state: AdvisorApplyState): AdvisorApplyState {
  if (!state.canRevert && state.appliedProposalId === null) {
    return { ...state, previewingProposalId: null, status: "idle" };
  }
  const nextTransition: AdvisorStateTransition = {
    step: state.history.length + 1, action: "revert", proposalId: null, labelKo: "원본 상태로 되돌림",
  };
  return {
    ...state, current: { ...state.baseline, blendShapes: { ...state.baseline.blendShapes } },
    previewingProposalId: null, appliedProposalId: null, status: "reverted", canRevert: false,
    history: [...state.history, nextTransition],
  };
}

/** 직전 컷 참조 스냅샷을 갱신한다(원본·현재 적용 상태 보존). */
export function updateAdvisorPreviousCut(state: AdvisorApplyState, previousCut: CharacterCutSnapshot): AdvisorApplyState {
  return { ...state, previousCut: { ...previousCut, blendShapes: { ...previousCut.blendShapes } } };
}

/** 현재 분석·추천안·비파괴 적용 상태와 연속성 진단 결과를 JSON 문자열로 직렬화한다. */
export function exportAdvisorStateJson(params: {
  readonly bundle: CharacterAdvisorRecommendationBundle;
  readonly session: AdvisorApplyState;
}): string {
  const { bundle, session } = params;
  return JSON.stringify({
    schemaVersion: "toonstudio.char-expression-pose-advisor.v1",
    nonDestructivePolicy: "author-approval-required",
    analysis: bundle.analysis,
    session: {
      status: session.status, canRevert: session.canRevert,
      appliedProposalId: session.appliedProposalId, previewingProposalId: session.previewingProposalId,
      baseline: session.baseline, current: session.current, previousCut: session.previousCut,
      historyCount: session.history.length,
    },
    continuityCheck: bundle.continuityCheck,
    topProposals: bundle.proposals,
  }, null, 2);
}
