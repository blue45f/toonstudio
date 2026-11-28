/**
 * Wave 96 — 한국어 웹툰 대본·콘티 비트 파서 및 영화적 샷 문법(Shot Grammar) 추천기.
 */

export type SceneTimeOfDay = "daylight" | "sunset" | "night-neon" | "interior-warm";
export type BeatEmotionTag =
  | "calm-dialogue"
  | "tension"
  | "shock-reveal"
  | "action-impact"
  | "intimate-warmth"
  | "melancholy-isolation";
export type PowerDynamics = "neutral" | "speaker-dominant" | "speaker-vulnerable";
export type ComicShotScale =
  | "extreme-wide"
  | "wide"
  | "medium-full"
  | "over-the-shoulder"
  | "medium-closeup"
  | "closeup"
  | "extreme-closeup";
export type VerticalCameraAngleBias = "low-angle" | "eye-level" | "high-angle";
export type ScriptBeatKind = "dialogue" | "stage-direction";

export interface ScriptBeat {
  readonly beatId: string;
  readonly beatIndex: number;
  readonly kind: ScriptBeatKind;
  readonly speakerId: string;
  readonly listenerId: string | null;
  readonly dialogueText: string;
  readonly cueText: string;
  readonly stageDirectionText: string;
  readonly emotionTag: BeatEmotionTag;
  readonly powerDynamics: PowerDynamics;
  readonly actionIntensity: number;
  readonly intentionalAxisReset: boolean;
  readonly explicitShotScaleHint: ComicShotScale | null;
  readonly lineNumber: number;
}

export interface ParsedScriptScene {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly rawHeader: string;
  readonly locationLabel: string;
  readonly sceneTimeOfDay: SceneTimeOfDay;
  readonly participantIds: readonly string[];
  readonly beats: readonly ScriptBeat[];
}

export interface ParseKoreanScriptOptions {
  readonly sceneId?: string;
  readonly defaultSceneTitle?: string;
  readonly defaultTimeOfDay?: SceneTimeOfDay;
  readonly knownCharacterIds?: readonly string[];
  readonly includeStageDirectionsAsBeats?: boolean;
}

export interface ShotGrammarRecommendation {
  readonly shotScale: ComicShotScale;
  readonly shotScaleRank: number;
  readonly focalLengthMm: number;
  readonly verticalPitchBias: VerticalCameraAngleBias;
  readonly verticalPitchOffsetDeg: number;
  readonly dutchRollDeg: number;
  readonly leadRoomScreenOffset: number;
  readonly headroomRatio: number;
  readonly subjectDistanceMeters: number;
  readonly cameraHeightOffsetMeters: number;
  readonly rationaleKo: string;
}

export const SHOT_SCALE_RANK_MAP: Readonly<Record<ComicShotScale, number>> = {
  "extreme-wide": 0,
  wide: 1,
  "medium-full": 2,
  "over-the-shoulder": 3,
  "medium-closeup": 4,
  closeup: 5,
  "extreme-closeup": 6,
};

interface ShotScaleBaseSpec {
  readonly focalLengthMm: number;
  readonly distanceMeters: number;
  readonly headroomRatio: number;
  readonly leadRoomMagnitude: number;
}

const SHOT_SCALE_BASE_SPECS: Readonly<Record<ComicShotScale, ShotScaleBaseSpec>> = {
  "extreme-wide": { focalLengthMm: 24, distanceMeters: 8.6, headroomRatio: 0.22, leadRoomMagnitude: 0.0 },
  wide: { focalLengthMm: 30, distanceMeters: 5.2, headroomRatio: 0.18, leadRoomMagnitude: 0.05 },
  "medium-full": { focalLengthMm: 38, distanceMeters: 3.3, headroomRatio: 0.15, leadRoomMagnitude: 0.12 },
  "over-the-shoulder": { focalLengthMm: 52, distanceMeters: 2.35, headroomRatio: 0.13, leadRoomMagnitude: 0.16 },
  "medium-closeup": { focalLengthMm: 68, distanceMeters: 1.85, headroomRatio: 0.12, leadRoomMagnitude: 0.17 },
  closeup: { focalLengthMm: 85, distanceMeters: 1.28, headroomRatio: 0.1, leadRoomMagnitude: 0.16 },
  "extreme-closeup": { focalLengthMm: 112, distanceMeters: 0.86, headroomRatio: 0.08, leadRoomMagnitude: 0.06 },
};

const TIME_RULES: readonly { readonly mood: SceneTimeOfDay; readonly keywords: readonly string[] }[] = [
  { mood: "night-neon", keywords: ["야경", "심야", "네온", "새벽", "가로등", "달빛", "한밤", "밤", "야간", "어둠", "night", "neon"] },
  { mood: "sunset", keywords: ["석양", "노을", "황혼", "해질녘", "해 질 녘", "저녁놀", "붉은 하늘", "골든아워", "sunset", "dusk"] },
  { mood: "interior-warm", keywords: ["카페", "실내", "작업실", "아틀리에", "서재", "거실", "식당", "도서관", "다방", "찻집", "커피숍", "방", "스튜디오", "바", "라운지", "주방", "interior", "cafe", "warm"] },
  { mood: "daylight", keywords: ["낮", "정오", "오전", "오후", "햇살", "맑은", "운동장", "광장", "공원", "거리", "daylight", "morning"] },
];

const SHOT_SCALE_HINTS: readonly { readonly scale: ComicShotScale; readonly tokens: readonly string[] }[] = [
  { scale: "extreme-closeup", tokens: ["익스트림 클로즈업", "extreme-closeup", "ecu"] },
  { scale: "extreme-wide", tokens: ["익스트림 와이드", "극광각", "extreme-wide", "ews"] },
  { scale: "over-the-shoulder", tokens: ["오버 더 숄더", "어깨너머", "over-the-shoulder", "ots"] },
  { scale: "medium-closeup", tokens: ["미디엄 클로즈업", "바스트", "medium-closeup", "mcu"] },
  { scale: "closeup", tokens: ["클로즈업", "closeup"] },
  { scale: "medium-full", tokens: ["미디엄 풀", "니샷", "medium-full"] },
  { scale: "wide", tokens: ["와이드", "롱샷", "풀샷", "wide"] },
];

const AXIS_RESET_TOKENS: readonly string[] = [
  "축 전환", "축전환", "180도 전환", "시점 반전", "축 리셋", "axis-reset", "axis reset",
];

const EMOTION_KEYWORDS: Readonly<Record<BeatEmotionTag, readonly string[]>> = {
  "action-impact": [
    "검을 뽑", "칼을 뽑", "뽑아 든", "뽑아들", "휘두르", "휘둘", "돌진", "격돌", "폭발", "타격",
    "주먹", "발차기", "공격", "추격", "내리치", "방아쇠", "몸을 던", "뛰어오르", "베어", "격투", "부딪", "액션", "검", "칼날",
  ],
  "shock-reveal": [
    "충격", "경악", "놀람", "놀라", "당황", "반전", "정체", "진실", "배신", "설마",
    "말도 안", "믿을 수 없", "눈을 크게", "얼어붙", "숨을 들이", "비명", "범인", "거짓말", "진짜 정체",
  ],
  tension: [
    "분노", "화남", "격앙", "긴장", "경고", "위협", "노려", "째려", "냉소", "살기",
    "대치", "속삭임", "속삭이", "압박", "불안", "다급", "잠깐", "뒤에", "조심", "심각", "굳은", "날카로", "겨누", "끝내자", "멈춰", "위험",
  ],
  "intimate-warmth": [
    "다정", "따뜻", "부드럽", "안도", "고백", "위로", "포옹", "손을 잡", "사랑", "고마워", "괜찮아", "미소", "진심", "애틋", "온기", "웃으며", "함께",
  ],
  "melancholy-isolation": [
    "슬픔", "우울", "고독", "외로", "눈물", "울먹", "체념", "후회", "허무", "쓸쓸", "혼자", "이별", "떠나", "고개를 숙", "한숨", "침묵", "멀어지", "쓸쓸히",
  ],
  "calm-dialogue": ["차분", "담담", "평온", "설명", "인사", "끄덕", "일상", "조용히", "정리", "안내", "확인"],
};

const DOMINANT_KEYWORDS: readonly string[] = [
  "분노", "위압", "내려다보", "명령", "호통", "압도", "냉소", "비웃", "우위", "선언", "당당",
  "카리스마", "겨누", "검을 뽑", "칼을 뽑", "뽑아 든", "지배", "단호", "강압", "끝내자", "무릎 꿇", "비켜", "닥쳐", "외침", "외친다", "격앙",
];

const VULNERABLE_KEYWORDS: readonly string[] = [
  "속삭임", "속삭이", "떨림", "떨리", "겁", "두려", "무릎을 꿇", "주저앉", "뒷걸음", "애원",
  "부탁", "울먹", "눈물", "위축", "당황", "체념", "고개를 숙", "미안", "살려", "제발", "약하게", "흐느", "웅크", "겁먹", "불안",
];

const EMOTION_BASE_INTENSITY: Readonly<Record<BeatEmotionTag, number>> = {
  "calm-dialogue": 0.2,
  "intimate-warmth": 0.24,
  "melancholy-isolation": 0.3,
  tension: 0.64,
  "shock-reveal": 0.82,
  "action-impact": 0.92,
};

const EMOTION_ORDER: readonly BeatEmotionTag[] = [
  "action-impact", "shock-reveal", "tension", "intimate-warmth", "melancholy-isolation", "calm-dialogue",
];

interface RawParsedEntry {
  readonly kind: ScriptBeatKind;
  readonly speakerId: string | null;
  readonly dialogueText: string;
  readonly cueText: string;
  readonly stageDirectionText: string;
  readonly intentionalAxisReset: boolean;
  readonly explicitShotScaleHint: ComicShotScale | null;
  readonly lineNumber: number;
}

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : min;

const roundTo = (v: number, d: number): number => {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
};

function countKeywordHits(text: string, keywords: readonly string[]): number {
  const n = text.toLowerCase();
  let hits = 0;
  for (let i = 0; i < keywords.length; i += 1) {
    const kw = keywords[i];
    if (kw && n.indexOf(kw.toLowerCase()) !== -1) hits += 1;
  }
  return hits;
}

function inferSceneTimeOfDay(headerText: string, fallback: SceneTimeOfDay): SceneTimeOfDay {
  for (let i = 0; i < TIME_RULES.length; i += 1) {
    const rule = TIME_RULES[i];
    if (rule && countKeywordHits(headerText, rule.keywords) > 0) return rule.mood;
  }
  return fallback;
}

function parseExplicitShotScale(directiveText: string): ComicShotScale | null {
  for (let i = 0; i < SHOT_SCALE_HINTS.length; i += 1) {
    const rule = SHOT_SCALE_HINTS[i];
    if (rule && countKeywordHits(directiveText, rule.tokens) > 0) return rule.scale;
  }
  return null;
}

function stripWrappingQuotes(rawText: string): string {
  const t = rawText.trim();
  if (t.length < 2) return t;
  const f = t.charAt(0);
  const l = t.charAt(t.length - 1);
  const paired =
    (f === '"' && l === '"') || (f === "\u201C" && l === "\u201D") ||
    (f === "'" && l === "'") || (f === "\u2018" && l === "\u2019");
  return paired ? t.slice(1, t.length - 1).trim() : t;
}

function classifyEmotionTag(cue: string, stage: string, dialogue: string): BeatEmotionTag {
  const scores: Record<BeatEmotionTag, number> = {
    "calm-dialogue": 0.4,
    tension: 0,
    "shock-reveal": 0,
    "action-impact": 0,
    "intimate-warmth": 0,
    "melancholy-isolation": 0,
  };
  for (let i = 0; i < EMOTION_ORDER.length; i += 1) {
    const tag = EMOTION_ORDER[i];
    if (!tag) continue;
    const kw = EMOTION_KEYWORDS[tag];
    scores[tag] += countKeywordHits(cue, kw) * 3.0 + countKeywordHits(stage, kw) * 2.4 + countKeywordHits(dialogue, kw) * 1.4;
  }
  if (dialogue.indexOf("?!") !== -1 || dialogue.indexOf("!?") !== -1) scores["shock-reveal"] += 2.2;
  else if (dialogue.indexOf("!") !== -1) {
    scores.tension += 0.6;
    scores["action-impact"] += 0.3;
  }
  if (dialogue.indexOf("...") !== -1 || dialogue.indexOf("…") !== -1) {
    scores.tension += 0.35;
    scores["melancholy-isolation"] += 0.25;
  }
  let bestTag: BeatEmotionTag = "calm-dialogue";
  let bestScore = scores["calm-dialogue"];
  for (let i = 0; i < EMOTION_ORDER.length; i += 1) {
    const tag = EMOTION_ORDER[i];
    if (tag && scores[tag] > bestScore) {
      bestScore = scores[tag];
      bestTag = tag;
    }
  }
  return bestTag;
}

function classifyPowerDynamics(cue: string, stage: string, dialogue: string): PowerDynamics {
  const dom = countKeywordHits(cue, DOMINANT_KEYWORDS) * 2.6 + countKeywordHits(stage, DOMINANT_KEYWORDS) * 2.0 + countKeywordHits(dialogue, DOMINANT_KEYWORDS) * 1.2;
  const vul = countKeywordHits(cue, VULNERABLE_KEYWORDS) * 2.6 + countKeywordHits(stage, VULNERABLE_KEYWORDS) * 2.0 + countKeywordHits(dialogue, VULNERABLE_KEYWORDS) * 1.2;
  if (dom > vul && dom >= 1.2) return "speaker-dominant";
  if (vul > dom && vul >= 1.2) return "speaker-vulnerable";
  return "neutral";
}

function computeActionIntensity(tag: BeatEmotionTag, cue: string, stage: string, dialogue: string): number {
  let intensity = EMOTION_BASE_INTENSITY[tag];
  const combined = `${cue} ${stage} ${dialogue}`;
  if (combined.indexOf("?!") !== -1 || combined.indexOf("!?") !== -1) intensity += 0.1;
  else if (combined.indexOf("!") !== -1) intensity += 0.06;
  const kineticHits = countKeywordHits(combined, EMOTION_KEYWORDS["action-impact"]);
  if (kineticHits > 0) intensity += Math.min(0.14, kineticHits * 0.06);
  return roundTo(clamp(intensity, 0, 1), 3);
}

function extractActorFromStageDirection(directionText: string, knownActors: readonly string[]): string | null {
  for (let i = 0; i < knownActors.length; i += 1) {
    const actor = knownActors[i];
    if (actor && directionText.indexOf(actor) !== -1) return actor;
  }
  const match = /^([가-힣A-Za-z0-9_]{2,10})(?:이|가|은|는)\s/.exec(directionText.trim());
  return match && match[1] ? match[1] : null;
}

function resolveListenerId(
  speakerId: string,
  combinedText: string,
  lastSpeakerId: string | null,
  participants: readonly string[],
): string | null {
  for (let i = 0; i < participants.length; i += 1) {
    const c = participants[i];
    if (c && c !== speakerId && combinedText.indexOf(c) !== -1) return c;
  }
  if (lastSpeakerId !== null && lastSpeakerId !== speakerId) return lastSpeakerId;
  for (let i = 0; i < participants.length; i += 1) {
    const c = participants[i];
    if (c && c !== speakerId) return c;
  }
  return null;
}

export function parseKoreanWebtoonScript(
  scriptText: string,
  options: ParseKoreanScriptOptions = {},
): ParsedScriptScene {
  const sceneId = options.sceneId ?? "scene-01";
  const defaultTitle = options.defaultSceneTitle ?? "기본 장면";
  const defaultTime = options.defaultTimeOfDay ?? "daylight";
  const includeStage = options.includeStageDirectionsAsBeats !== false;

  const lines = scriptText.replace(/\r\n/g, "\n").split("\n");
  let sceneTitle = defaultTitle;
  let rawHeader = "";
  let sceneTimeOfDay: SceneTimeOfDay = defaultTime;
  let pendingAxisReset = false;
  let pendingShotScaleHint: ComicShotScale | null = null;
  let pendingStageDirection = "";

  const rawEntries: RawParsedEntry[] = [];
  const participants: string[] = [];
  const register = (id: string): void => {
    const t = id.trim();
    if (t.length > 0 && participants.indexOf(t) === -1) participants.push(t);
  };
  if (options.knownCharacterIds) options.knownCharacterIds.forEach(register);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    let line = (lines[index] ?? "").trim();
    if (line.length === 0) continue;

    const headerMatch = /^\[(?:장면|씬|scene|s#)\s*[^:\]]*[:\s]\s*([^\]]+)\]$/i.exec(line);
    if (headerMatch && headerMatch[1]) {
      rawHeader = line;
      sceneTitle = headerMatch[1].trim();
      sceneTimeOfDay = inferSceneTimeOfDay(sceneTitle, defaultTime);
      continue;
    }

    const standaloneDir = /^\[(?:카메라|축|샷|camera|shot)\s*:?\s*([^\]]*)\]$/i.exec(line);
    if (standaloneDir) {
      if (countKeywordHits(standaloneDir[0], AXIS_RESET_TOKENS) > 0) pendingAxisReset = true;
      const scale = parseExplicitShotScale(standaloneDir[0]);
      if (scale !== null) pendingShotScaleHint = scale;
      continue;
    }

    let inlineReset = false;
    let inlineScale: ComicShotScale | null = null;
    line = line
      .replace(/\[(?:카메라|축|샷|camera|shot)[^\]]*\]/gi, (tag) => {
        if (countKeywordHits(tag, AXIS_RESET_TOKENS) > 0) inlineReset = true;
        const scale = parseExplicitShotScale(tag);
        if (scale !== null) inlineScale = scale;
        return "";
      })
      .trim();

    if (line.length === 0) {
      if (inlineReset) pendingAxisReset = true;
      if (inlineScale !== null) pendingShotScaleHint = inlineScale;
      continue;
    }

    const explicitStage = /^(?:\(|\[)\s*지문\s*[:-]\s*([^)\]]+)(?:\)|\])$/.exec(line);
    const parenStage = /^\(([^()]{2,})\)$/.exec(line);
    if (explicitStage || parenStage) {
      const dirText = (explicitStage?.[1] ?? parenStage?.[1] ?? "").trim();
      if (includeStage) {
        const actor = extractActorFromStageDirection(dirText, participants);
        if (actor !== null) register(actor);
        rawEntries.push({
          kind: "stage-direction",
          speakerId: actor,
          dialogueText: "",
          cueText: "",
          stageDirectionText: dirText,
          intentionalAxisReset: pendingAxisReset || inlineReset,
          explicitShotScaleHint: inlineScale ?? pendingShotScaleHint,
          lineNumber,
        });
        pendingAxisReset = false;
        pendingShotScaleHint = null;
      } else {
        pendingStageDirection = pendingStageDirection ? `${pendingStageDirection} ${dirText}` : dirText;
        if (inlineReset) pendingAxisReset = true;
        if (inlineScale !== null) pendingShotScaleHint = inlineScale;
      }
      continue;
    }

    const speakerMatch = /^([가-힣A-Za-z0-9_.\s]{1,24}?)(?:\s*\(([^)]+)\))?\s*[:：]\s*(.+)$/.exec(line);
    if (speakerMatch && speakerMatch[1] && speakerMatch[3]) {
      const speakerId = speakerMatch[1].trim();
      register(speakerId);
      rawEntries.push({
        kind: "dialogue",
        speakerId,
        dialogueText: stripWrappingQuotes(speakerMatch[3]),
        cueText: (speakerMatch[2] ?? "").trim(),
        stageDirectionText: pendingStageDirection,
        intentionalAxisReset: pendingAxisReset || inlineReset,
        explicitShotScaleHint: inlineScale ?? pendingShotScaleHint,
        lineNumber,
      });
      pendingAxisReset = false;
      pendingShotScaleHint = null;
      pendingStageDirection = "";
    }
  }

  const beats: ScriptBeat[] = [];
  let lastSpeakerId: string | null = null;
  for (let i = 0; i < rawEntries.length; i += 1) {
    const entry = rawEntries[i];
    if (!entry) continue;
    const stageActor: string | null =
      entry.kind === "stage-direction" ? extractActorFromStageDirection(entry.stageDirectionText, participants) : null;
    const resolvedSpeaker: string = entry.speakerId ?? stageActor ?? lastSpeakerId ?? participants[0] ?? "화자";
    register(resolvedSpeaker);

    const emotionTag = classifyEmotionTag(entry.cueText, entry.stageDirectionText, entry.dialogueText);
    beats.push({
      beatId: `${sceneId}-beat-${String(i + 1).padStart(2, "0")}`,
      beatIndex: i,
      kind: entry.kind,
      speakerId: resolvedSpeaker,
      listenerId: resolveListenerId(resolvedSpeaker, `${entry.dialogueText} ${entry.stageDirectionText}`, lastSpeakerId, participants),
      dialogueText: entry.dialogueText,
      cueText: entry.cueText,
      stageDirectionText: entry.stageDirectionText,
      emotionTag,
      powerDynamics: classifyPowerDynamics(entry.cueText, entry.stageDirectionText, entry.dialogueText),
      actionIntensity: computeActionIntensity(emotionTag, entry.cueText, entry.stageDirectionText, entry.dialogueText),
      intentionalAxisReset: entry.intentionalAxisReset,
      explicitShotScaleHint: entry.explicitShotScaleHint,
      lineNumber: entry.lineNumber,
    });
    lastSpeakerId = resolvedSpeaker;
  }

  return {
    sceneId,
    sceneTitle,
    rawHeader,
    locationLabel: sceneTitle,
    sceneTimeOfDay,
    participantIds: participants,
    beats,
  };
}

function selectShotScaleForBeat(beat: ScriptBeat, beatIndex: number, totalBeats: number): ComicShotScale {
  if (beat.explicitShotScaleHint !== null) return beat.explicitShotScaleHint;
  const safeTotal = Math.max(1, totalBeats);
  const progress = safeTotal > 1 ? beatIndex / (safeTotal - 1) : 0.5;
  const hasPartner = beat.listenerId !== null;

  switch (beat.emotionTag) {
    case "action-impact":
      return beat.actionIntensity >= 0.82 ? "wide" : "medium-full";
    case "shock-reveal":
      return beat.actionIntensity >= 0.86 ? "extreme-closeup" : "closeup";
    case "intimate-warmth":
      return beat.actionIntensity >= 0.28 || beatIndex > 0 ? "closeup" : "medium-closeup";
    case "melancholy-isolation":
      return beatIndex === 0 || (safeTotal >= 3 && beatIndex === safeTotal - 1) ? "wide" : "medium-closeup";
    case "tension":
      if (beatIndex === 0 && safeTotal >= 5 && beat.actionIntensity < 0.72) return "medium-full";
      if (progress >= 0.75) return "closeup";
      return hasPartner && beatIndex % 2 === 1 ? "over-the-shoulder" : "medium-closeup";
    case "calm-dialogue":
    default:
      if (beatIndex === 0 && safeTotal >= 3) return "wide";
      return hasPartner ? (beatIndex % 2 === 1 ? "over-the-shoulder" : "medium-closeup") : "medium-full";
  }
}

function resolveFocalLengthMm(beat: ScriptBeat, shotScale: ComicShotScale): number {
  const base = SHOT_SCALE_BASE_SPECS[shotScale].focalLengthMm;
  if (beat.emotionTag === "action-impact") return clamp(Math.min(base, shotScale === "wide" ? 28 : 34), 24, 35);
  if (beat.emotionTag === "shock-reveal") return clamp(Math.max(base, shotScale === "extreme-closeup" ? 115 : 90), 78, 135);
  if (beat.emotionTag === "intimate-warmth") return clamp(Math.max(base, shotScale === "closeup" ? 85 : 78), 75, 135);
  if (beat.emotionTag === "tension" && shotScale === "medium-closeup") return 72;
  return clamp(base, 24, 135);
}

function resolveDutchRollDeg(beat: ScriptBeat, beatIndex: number): number {
  const sign = beatIndex % 2 === 0 ? 1 : -1;
  switch (beat.emotionTag) {
    case "calm-dialogue":
    case "intimate-warmth":
    case "melancholy-isolation":
      return 0;
    case "tension":
      return beat.actionIntensity < 0.72 ? 0 : roundTo(sign * clamp(4 + (beat.actionIntensity - 0.72) * 14, 4, 7), 1);
    case "shock-reveal":
      return roundTo(sign * clamp(8 + beat.actionIntensity * 4.5, 8, 13), 1);
    case "action-impact":
      return roundTo(sign * clamp(7 + beat.actionIntensity * 6, 7, 13.5), 1);
  }
}

export function recommendShotGrammarForBeat(
  beat: ScriptBeat,
  beatIndex: number,
  totalBeats: number,
): ShotGrammarRecommendation {
  const shotScale = selectShotScaleForBeat(beat, beatIndex, totalBeats);
  const baseSpec = SHOT_SCALE_BASE_SPECS[shotScale];
  const focalLengthMm = resolveFocalLengthMm(beat, shotScale);
  const dutchRollDeg = resolveDutchRollDeg(beat, beatIndex);

  const verticalPitchBias: VerticalCameraAngleBias =
    beat.powerDynamics === "speaker-dominant"
      ? "low-angle"
      : beat.powerDynamics === "speaker-vulnerable"
        ? "high-angle"
        : "eye-level";
  const verticalPitchOffsetDeg =
    verticalPitchBias === "low-angle"
      ? roundTo(9 + beat.actionIntensity * 5, 1)
      : verticalPitchBias === "high-angle"
        ? roundTo(-(9 + beat.actionIntensity * 5), 1)
        : 0;
  const cameraHeightOffsetMeters =
    verticalPitchBias === "low-angle"
      ? roundTo(-(0.32 + beat.actionIntensity * 0.14), 3)
      : verticalPitchBias === "high-angle"
        ? roundTo(0.36 + beat.actionIntensity * 0.16, 3)
        : 0;

  const angleNote =
    verticalPitchBias === "low-angle"
      ? "로우 앵글로 화자의 위압감을 살리고"
      : verticalPitchBias === "high-angle"
        ? "하이 앵글로 위축된 시선을 강조하고"
        : "아이 레벨로 대등한 시선을 유지하고";
  const rollNote =
    dutchRollDeg !== 0
      ? ` ${Math.abs(dutchRollDeg)}° 더치 롤로 불안정한 긴장감을 보탰습니다.`
      : " 수평 수직선을 안정적으로 유지했습니다.";

  return {
    shotScale,
    shotScaleRank: SHOT_SCALE_RANK_MAP[shotScale],
    focalLengthMm,
    verticalPitchBias,
    verticalPitchOffsetDeg,
    dutchRollDeg,
    leadRoomScreenOffset: roundTo((beat.listenerId !== null ? 1 : 0) * baseSpec.leadRoomMagnitude, 3),
    headroomRatio: baseSpec.headroomRatio,
    subjectDistanceMeters: baseSpec.distanceMeters,
    cameraHeightOffsetMeters,
    rationaleKo: `${shotScale} 구도와 ${focalLengthMm}mm 렌즈로 ${beat.emotionTag} 정서를 잡으며, ${angleNote}${rollNote}`,
  };
}
