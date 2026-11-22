/**
 * 대본 → 웹툰 자동 콘티 생성 엔진 (₩0 100% 브라우저 로컬 결정적 파이프라인).
 *
 * 장면 헤더·화자·대사·지문·감정 태그·효과음(SFX)을 결정적으로 파싱해
 * 컷 분할, 카메라 샷/앵글 구도, 비겹침 말풍선 좌표, 세로 스크롤 페이싱 리듬을 산출한다.
 */

export type StoryboardEmotion =
  | "neutral" | "joy" | "sadness" | "anger" | "fear" | "tension" | "surprise" | "romance" | "monologue";

export type CameraShotType =
  | "establishing" | "wide" | "medium-wide" | "medium" | "over-the-shoulder"
  | "close-up" | "extreme-close-up" | "detail-insert" | "full-bleed-splash";

export type CameraAngle = "eye-level" | "high-angle" | "low-angle" | "dutch-tilt" | "birds-eye";

export type CompositionRule =
  | "rule-of-thirds" | "center-impact" | "golden-spiral" | "diagonal-tension" | "leading-lines";

export type BubbleShapeKind =
  | "standard" | "shout-burst" | "thought-cloud" | "whisper-dashed" | "narration-box";

export type PacingBeatPhase = "setup" | "build" | "turn" | "climax" | "resolution";

export interface ParsedScriptLine {
  readonly lineNumber: number;
  readonly kind: "scene-header" | "dialogue" | "direction" | "sfx" | "cut-break";
  readonly raw: string;
  readonly sceneNumber: number;
  readonly speaker?: string;
  readonly text: string;
  readonly emotion: StoryboardEmotion;
  readonly deliveryCue?: string;
  readonly location?: string;
  readonly timeOfDay?: string;
}

export interface ParsedScriptScene {
  readonly sceneNumber: number;
  readonly heading: string;
  readonly location: string;
  readonly timeOfDay: string;
  readonly lines: readonly ParsedScriptLine[];
  readonly speakers: readonly string[];
  readonly dominantEmotion: StoryboardEmotion;
}

export interface ParsedScriptDocument {
  readonly title: string;
  readonly scenes: readonly ParsedScriptScene[];
  readonly totalDialogues: number;
  readonly totalDirections: number;
  readonly totalSfx: number;
  readonly cast: readonly string[];
}

export interface StoryboardBubblePlacement {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly shape: BubbleShapeKind;
  readonly emotion: StoryboardEmotion;
  readonly readingOrder: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSizePx: number;
  readonly estimatedLines: number;
  readonly tailDirection: "bottom-left" | "bottom-right" | "top-center" | "none";
}

export interface StoryboardSfxCue {
  readonly id: string;
  readonly text: string;
  readonly emphasis: "quiet" | "normal" | "strong";
  readonly x: number;
  readonly y: number;
  readonly rotationDeg: number;
}

export interface StoryboardCut {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly sceneNumber: number;
  readonly sceneHeading: string;
  readonly location: string;
  readonly timeOfDay: string;
  readonly shotType: CameraShotType;
  readonly cameraAngle: CameraAngle;
  readonly composition: CompositionRule;
  readonly emotion: StoryboardEmotion;
  readonly beatPhase: PacingBeatPhase;
  readonly tension01: number;
  readonly actionSummary: string;
  readonly charactersInCut: readonly string[];
  readonly bubbles: readonly StoryboardBubblePlacement[];
  readonly sfxCues: readonly StoryboardSfxCue[];
  readonly yStartPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly gutterAfterPx: number;
  readonly estimatedReadSeconds: number;
}

export interface StoryboardPacingWarning {
  readonly code: "monotone-shots" | "dialogue-wall" | "low-breathing-space";
  readonly cutIndices: readonly number[];
  readonly message: string;
}

export interface StoryboardPacingProfile {
  readonly totalCuts: number;
  readonly totalScrollHeightPx: number;
  readonly averageCutHeightPx: number;
  readonly averageGutterPx: number;
  readonly estimatedReadSeconds: number;
  readonly tensionCurve: readonly number[];
  readonly shotDistribution: Readonly<Record<CameraShotType, number>>;
  readonly warnings: readonly StoryboardPacingWarning[];
}

export interface StoryboardGenerationOptions {
  readonly title?: string;
  readonly canvasWidthPx?: number;
  readonly safeMarginPx?: number;
  readonly maxDialoguesPerCut?: number;
  readonly baseGutterPx?: number;
}

export interface StoryboardPlan {
  readonly title: string;
  readonly canvasWidthPx: number;
  readonly safeMarginPx: number;
  readonly parsed: ParsedScriptDocument;
  readonly cuts: readonly StoryboardCut[];
  readonly pacing: StoryboardPacingProfile;
}

const DEFAULT_CANVAS_WIDTH_PX = 800;
const DEFAULT_SAFE_MARGIN_PX = 28;
const DEFAULT_MAX_DIALOGUES_PER_CUT = 2;
const DEFAULT_BASE_GUTTER_PX = 84;
const BUBBLE_VERTICAL_GAP_PX = 16;

const SCENE_HEADER_REGEX =
  /^(?:(?:S#\s*(\d+))|(?:#\s*(\d+))|(?:SCENE\s+(\d+))|(?:씬\s*(\d+))|(?:\[장면\s*(\d+)\]))\s*[.:)-]?\s*(.*)$/iu;
const INT_EXT_HEADER_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|실내\.|실외\.)\s*(.+)$/iu;
const SFX_EXPLICIT_REGEX = /^(?:\[(?:효과음|SFX)\s*[:：]\s*(.+?)\]|(?:효과음|SFX)\s*[:：]\s*(.+)|\*([^*]{1,24})\*)$/iu;
const CUT_BREAK_REGEX = /^(?:---+|===+|\[(?:컷\s*전환|CUT)\]|\/cut)$/iu;
const DIALOGUE_LINE_REGEX =
  /^([가-힣A-Za-z0-9_.\s]{1,20}?)(?:\s*(?:\(([^)]{1,24})\)|\[([^\]]{1,24})\]))?\s*[:：]\s*(.+)$/u;
const PAREN_DIRECTION_REGEX = /^(?:\((.+)\)|\[(.+)\]|>\s*(.+))$/u;

const EMOTION_KEYWORDS: readonly { readonly emotion: StoryboardEmotion; readonly keywords: readonly string[] }[] = [
  { emotion: "anger", keywords: ["분노", "화남", "격앙", "외침", "절규", "소리치", "노려보", "주먹", "angry", "shout", "yell", "rage"] },
  { emotion: "fear", keywords: ["공포", "두려", "떨림", "비명", "소름", "식은땀", "fear", "terrified", "tremble", "scream"] },
  { emotion: "tension", keywords: ["긴장", "경계", "대치", "살기", "추격", "위기", "침묵", "숨죽", "tense", "suspense", "stare"] },
  { emotion: "surprise", keywords: ["놀람", "충격", "경악", "반전", "멈칫", "헉", "shock", "gasp", "surprise"] },
  { emotion: "sadness", keywords: ["슬픔", "눈물", "울먹", "흐느", "체념", "쓸쓸", "이별", "sad", "cry", "tears", "sigh"] },
  { emotion: "romance", keywords: ["로맨스", "설렘", "두근", "수줍", "고백", "다정", "따뜻한 미소", "blush", "romance", "gentle"] },
  { emotion: "joy", keywords: ["기쁨", "웃음", "환하게", "미소", "신나", "환호", "happy", "laugh", "smile", "cheer"] },
  { emotion: "monologue", keywords: ["독백", "속마음", "나레이션", "내레이션", "회상", "narration", "monologue", "voiceover", "v.o"] },
];

const TIME_KEYWORDS = [
  "새벽", "여명", "아침", "정오", "낮", "오후", "노을", "석양", "해질녘", "황혼", "저녁", "밤", "야간", "심야", "자정",
  "dawn", "morning", "noon", "day", "afternoon", "sunset", "dusk", "evening", "night", "midnight",
] as const;

const EXTREME_CLOSEUP_HINTS = ["눈동자", "눈빛", "입술", "속눈썹", "숨결", "손끝", "떨리는 손", "eyes", "pupil", "lips"];
const DETAIL_INSERT_HINTS = ["반지", "편지", "시계", "열쇠", "스마트폰", "화면", "검날", "방아쇠", "발자국", "ring", "letter", "phone", "blade"];
const WIDE_ESTABLISHING_HINTS = ["전경", "옥상", "거리", "도시", "운동장", "광장", "하늘", "골목", "복도", "성벽", "city", "street", "rooftop", "sky"];
const LOW_ANGLE_HINTS = ["위압", "거대", "올려다", "내려찍", "군림", "도약", "towering", "looms", "leap"];
const HIGH_ANGLE_HINTS = ["내려다", "고립", "웅크", "추락", "바닥에", "쓰러", "isolated", "crouching", "falling"];

const BASE_TENSION_BY_EMOTION: Readonly<Record<StoryboardEmotion, number>> = {
  neutral: 0.28, joy: 0.42, romance: 0.52, monologue: 0.44, sadness: 0.56, tension: 0.76, fear: 0.84, surprise: 0.88, anger: 0.9,
};
const PHASE_TENSION_BOOST: Readonly<Record<PacingBeatPhase, number>> = {
  setup: -0.06, build: 0.04, turn: 0.08, climax: 0.12, resolution: -0.1,
};
const BASE_HEIGHT_BY_SHOT: Readonly<Record<CameraShotType, number>> = {
  establishing: 760, wide: 680, "medium-wide": 620, medium: 560, "over-the-shoulder": 580,
  "close-up": 600, "extreme-close-up": 520, "detail-insert": 460, "full-bleed-splash": 1120,
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const roundTo2 = (value: number): number => Math.round(value * 100) / 100;

function stripWrappingQuotes(text: string): string {
  const t = text.trim();
  if (
    (t.startsWith('"') && t.endsWith('"'))
    || (t.startsWith("'") && t.endsWith("'"))
    || (t.startsWith("“") && t.endsWith("”"))
    || (t.startsWith("「") && t.endsWith("」"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function inferEmotion(text: string, cue?: string): StoryboardEmotion {
  const combined = `${cue ?? ""} ${text}`.toLowerCase();
  for (const entry of EMOTION_KEYWORDS) {
    if (entry.keywords.some((keyword) => combined.includes(keyword))) return entry.emotion;
  }
  if (text.includes("?!") || text.includes("!?")) return "surprise";
  if (text.includes("!!")) return "anger";
  if (text.includes("...") || text.includes("…")) return "tension";
  return "neutral";
}

function splitLocationAndTime(headingText: string): { location: string; timeOfDay: string } {
  const trimmed = headingText.trim();
  if (!trimmed) return { location: "미지정 장소", timeOfDay: "낮" };

  const dashParts = trimmed.split(/\s*[-–—|/]\s*/u).filter(Boolean);
  if (dashParts.length >= 2) {
    const tail = dashParts[dashParts.length - 1] ?? "";
    if (TIME_KEYWORDS.some((kw) => tail.toLowerCase().includes(kw))) {
      return { location: dashParts.slice(0, -1).join(" · "), timeOfDay: tail };
    }
  }

  const parenMatch = trimmed.match(/^(.*?)\s*\(([^)]+)\)\s*$/u);
  if (parenMatch) {
    const loc = (parenMatch[1] ?? "").trim();
    const paren = (parenMatch[2] ?? "").trim();
    if (TIME_KEYWORDS.some((kw) => paren.toLowerCase().includes(kw))) {
      return { location: loc || trimmed, timeOfDay: paren };
    }
  }

  const inlineTime = TIME_KEYWORDS.find((kw) => trimmed.toLowerCase().includes(kw));
  return { location: trimmed, timeOfDay: inlineTime ?? "낮" };
}

function computeDominantEmotion(lines: readonly ParsedScriptLine[]): StoryboardEmotion {
  const counts = new Map<StoryboardEmotion, number>();
  for (const line of lines) {
    if (line.emotion !== "neutral") counts.set(line.emotion, (counts.get(line.emotion) ?? 0) + 1);
  }
  let best: StoryboardEmotion = "neutral";
  let bestCount = 0;
  for (const [emotion, count] of counts.entries()) {
    if (count > bestCount) {
      best = emotion;
      bestCount = count;
    }
  }
  return best;
}

/**
 * 대본 원문을 장면·화자·대사·지문·효과음 단위로 결정적 파싱한다.
 */
export function parseScriptDocument(rawScript: string, fallbackTitle = "무제 에피소드"): ParsedScriptDocument {
  const rawLines = rawScript.replace(/\r\n?/gu, "\n").split("\n");
  const scenesBuilder: {
    sceneNumber: number; heading: string; location: string; timeOfDay: string; lines: ParsedScriptLine[];
  }[] = [];

  let activeSceneNumber = 0;
  let totalDialogues = 0;
  let totalDirections = 0;
  let totalSfx = 0;
  const castSet = new Set<string>();

  const pushSceneHeader = (sceneNumber: number, heading: string, parseTarget: string, raw: string, lineNumber: number) => {
    const { location, timeOfDay } = splitLocationAndTime(parseTarget);
    const headerLine: ParsedScriptLine = {
      lineNumber, kind: "scene-header", raw, sceneNumber, text: heading,
      emotion: inferEmotion(parseTarget), location, timeOfDay,
    };
    scenesBuilder.push({ sceneNumber, heading, location, timeOfDay, lines: [headerLine] });
  };

  const ensureScene = (heading = "장면 1") => {
    const existing = scenesBuilder[scenesBuilder.length - 1];
    if (existing) return existing;
    activeSceneNumber = 1;
    const { location, timeOfDay } = splitLocationAndTime(heading);
    const created = { sceneNumber: 1, heading, location, timeOfDay, lines: [] as ParsedScriptLine[] };
    scenesBuilder.push(created);
    return created;
  };

  for (let idx = 0; idx < rawLines.length; idx += 1) {
    const trimmed = (rawLines[idx] ?? "").trim();
    if (!trimmed) continue;
    const lineNumber = idx + 1;

    if (CUT_BREAK_REGEX.test(trimmed)) {
      const scene = ensureScene();
      scene.lines.push({ lineNumber, kind: "cut-break", raw: trimmed, sceneNumber: scene.sceneNumber, text: "", emotion: "neutral" });
      continue;
    }

    const sceneMatch = trimmed.match(SCENE_HEADER_REGEX);
    if (sceneMatch) {
      const parsedNum = Number(sceneMatch[1] ?? sceneMatch[2] ?? sceneMatch[3] ?? sceneMatch[4] ?? sceneMatch[5] ?? activeSceneNumber + 1);
      activeSceneNumber = Number.isFinite(parsedNum) && parsedNum > 0 ? parsedNum : activeSceneNumber + 1;
      const body = (sceneMatch[6] ?? "").trim() || `장면 ${activeSceneNumber}`;
      pushSceneHeader(activeSceneNumber, body, body, trimmed, lineNumber);
      continue;
    }

    const intExtMatch = trimmed.match(INT_EXT_HEADER_REGEX);
    if (intExtMatch) {
      activeSceneNumber += 1;
      pushSceneHeader(activeSceneNumber, trimmed, (intExtMatch[2] ?? "").trim(), trimmed, lineNumber);
      continue;
    }

    const sfxMatch = trimmed.match(SFX_EXPLICIT_REGEX);
    if (sfxMatch) {
      const sfxText = (sfxMatch[1] ?? sfxMatch[2] ?? sfxMatch[3] ?? "").trim();
      if (sfxText) {
        const scene = ensureScene();
        totalSfx += 1;
        scene.lines.push({ lineNumber, kind: "sfx", raw: trimmed, sceneNumber: scene.sceneNumber, text: sfxText, emotion: inferEmotion(sfxText) });
      }
      continue;
    }

    const dirParenMatch = trimmed.match(PAREN_DIRECTION_REGEX);
    if (dirParenMatch) {
      const scene = ensureScene();
      const dirText = (dirParenMatch[1] ?? dirParenMatch[2] ?? dirParenMatch[3] ?? "").trim();
      totalDirections += 1;
      scene.lines.push({ lineNumber, kind: "direction", raw: trimmed, sceneNumber: scene.sceneNumber, text: dirText, emotion: inferEmotion(dirText) });
      continue;
    }

    const dialogueMatch = trimmed.match(DIALOGUE_LINE_REGEX);
    if (dialogueMatch) {
      const speakerRaw = (dialogueMatch[1] ?? "").trim();
      const cue = (dialogueMatch[2] ?? dialogueMatch[3] ?? "").trim() || undefined;
      const speech = stripWrappingQuotes(dialogueMatch[4] ?? "");
      if (speakerRaw && speech) {
        const scene = ensureScene();
        const isNarration = /^(?:나레이션|내레이션|해설|narration|narrator)$/iu.test(speakerRaw);
        if (!isNarration) castSet.add(speakerRaw);
        totalDialogues += 1;
        scene.lines.push({
          lineNumber, kind: "dialogue", raw: trimmed, sceneNumber: scene.sceneNumber,
          speaker: speakerRaw, text: speech, emotion: isNarration ? "monologue" : inferEmotion(speech, cue), deliveryCue: cue,
        });
        continue;
      }
    }

    const scene = ensureScene();
    totalDirections += 1;
    scene.lines.push({ lineNumber, kind: "direction", raw: trimmed, sceneNumber: scene.sceneNumber, text: trimmed, emotion: inferEmotion(trimmed) });
  }

  const scenes: ParsedScriptScene[] = scenesBuilder.map((scene) => ({
    sceneNumber: scene.sceneNumber,
    heading: scene.heading,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    lines: scene.lines,
    speakers: [...new Set(scene.lines.filter((line) => line.kind === "dialogue" && line.speaker).map((line) => line.speaker as string))],
    dominantEmotion: computeDominantEmotion(scene.lines),
  }));

  return {
    title: fallbackTitle.trim() || "무제 에피소드",
    scenes,
    totalDialogues,
    totalDirections,
    totalSfx,
    cast: [...castSet],
  };
}

interface CutDraft {
  readonly scene: ParsedScriptScene;
  readonly isSceneOpening: boolean;
  readonly directions: ParsedScriptLine[];
  readonly dialogues: ParsedScriptLine[];
  readonly sfx: ParsedScriptLine[];
}

function isHighImpactLine(line: ParsedScriptLine): boolean {
  return line.emotion === "anger" || line.emotion === "surprise" || line.emotion === "fear"
    || line.text.includes("!!") || line.text.includes("?!");
}

function segmentSceneIntoDrafts(scene: ParsedScriptScene, maxDialoguesPerCut: number): CutDraft[] {
  const drafts: CutDraft[] = [];
  let current: CutDraft | null = null;

  const commitDraft = (draft: CutDraft | null): null => {
    if (draft && (draft.directions.length > 0 || draft.dialogues.length > 0 || draft.sfx.length > 0 || draft.isSceneOpening)) {
      drafts.push(draft);
    }
    return null;
  };

  const openDraft = (existing: CutDraft | null, isOpening: boolean): CutDraft =>
    existing ?? { scene, isSceneOpening: isOpening, directions: [], dialogues: [], sfx: [] };

  const bodyLines = scene.lines.filter((line) => line.kind !== "scene-header");
  if (bodyLines.length === 0) {
    return [{ scene, isSceneOpening: true, directions: [], dialogues: [], sfx: [] }];
  }

  for (let i = 0; i < bodyLines.length; i += 1) {
    const line = bodyLines[i];
    if (!line) continue;
    const nextLine = bodyLines[i + 1];

    if (line.kind === "cut-break") {
      current = commitDraft(current);
    } else if (line.kind === "direction") {
      if (current && (current.dialogues.length > 0 || current.directions.length >= 2)) {
        current = commitDraft(current);
      }
      const draft = openDraft(current, drafts.length === 0);
      draft.directions.push(line);
      current = isHighImpactLine(line) && draft.dialogues.length === 0 && nextLine?.kind !== "sfx"
        ? commitDraft(draft)
        : draft;
    } else if (line.kind === "sfx") {
      const draft = openDraft(current, drafts.length === 0);
      draft.sfx.push(line);
      current = draft;
    } else if (line.kind === "dialogue") {
      const mustSplit = current !== null && (
        (isHighImpactLine(line) && current.dialogues.length > 0)
        || current.dialogues.length >= maxDialoguesPerCut
        || (current.isSceneOpening && current.directions.length > 0 && current.dialogues.length === 0 && drafts.length === 0)
      );
      if (mustSplit) current = commitDraft(current);
      const draft = openDraft(current, drafts.length === 0);
      draft.dialogues.push(line);
      current = isHighImpactLine(line) && nextLine?.kind !== "sfx" ? commitDraft(draft) : draft;
    }
  }

  commitDraft(current);
  return drafts;
}

function chooseShotAndFraming(
  draft: CutDraft,
  cutIndex: number,
  totalCuts: number,
  emotion: StoryboardEmotion,
): { shotType: CameraShotType; cameraAngle: CameraAngle; composition: CompositionRule } {
  const combinedText = [
    ...draft.directions.map((d) => d.text),
    ...draft.dialogues.map((d) => `${d.deliveryCue ?? ""} ${d.text}`),
  ].join(" ").toLowerCase();

  const hasStrongSfx = draft.sfx.some((s) => s.text.includes("!") || s.text.length >= 3);
  const isClimaxZone = totalCuts >= 4 && cutIndex >= Math.floor(totalCuts * 0.65) && cutIndex <= Math.floor(totalCuts * 0.9);

  let shotType: CameraShotType = "medium";
  if (draft.isSceneOpening && draft.dialogues.length === 0) shotType = "establishing";
  else if (isClimaxZone && (emotion === "anger" || emotion === "surprise") && hasStrongSfx) shotType = "full-bleed-splash";
  else if (EXTREME_CLOSEUP_HINTS.some((kw) => combinedText.includes(kw))) shotType = "extreme-close-up";
  else if (DETAIL_INSERT_HINTS.some((kw) => combinedText.includes(kw)) && draft.dialogues.length <= 1) shotType = "detail-insert";
  else if (WIDE_ESTABLISHING_HINTS.some((kw) => combinedText.includes(kw)) && draft.dialogues.length <= 1) {
    shotType = draft.isSceneOpening ? "establishing" : "wide";
  } else if (emotion === "anger" || emotion === "surprise" || emotion === "fear" || emotion === "romance") shotType = "close-up";
  else if (draft.dialogues.length >= 2) {
    shotType = new Set(draft.dialogues.map((d) => d.speaker)).size >= 2 ? "over-the-shoulder" : "medium";
  } else if (draft.directions.length > 0 && draft.dialogues.length === 0) shotType = "medium-wide";

  let cameraAngle: CameraAngle = "eye-level";
  if (LOW_ANGLE_HINTS.some((kw) => combinedText.includes(kw)) || shotType === "full-bleed-splash") cameraAngle = "low-angle";
  else if (HIGH_ANGLE_HINTS.some((kw) => combinedText.includes(kw))) cameraAngle = "high-angle";
  else if (emotion === "fear" || emotion === "tension" || emotion === "surprise") cameraAngle = "dutch-tilt";
  else if (shotType === "establishing") cameraAngle = "birds-eye";

  let composition: CompositionRule = "rule-of-thirds";
  if (shotType === "full-bleed-splash" || shotType === "extreme-close-up" || emotion === "surprise") composition = "center-impact";
  else if (cameraAngle === "dutch-tilt" || emotion === "anger" || emotion === "tension") composition = "diagonal-tension";
  else if (shotType === "establishing" || shotType === "wide") composition = "leading-lines";
  else if (emotion === "romance" || emotion === "sadness") composition = "golden-spiral";

  return { shotType, cameraAngle, composition };
}

function chooseBubbleShape(line: ParsedScriptLine): BubbleShapeKind {
  const cue = (line.deliveryCue ?? "").toLowerCase();
  const speaker = (line.speaker ?? "").toLowerCase();
  if (
    line.emotion === "monologue"
    || /^(?:나레이션|내레이션|해설|narration|narrator)$/iu.test(speaker)
    || cue.includes("나레이션") || cue.includes("내레이션")
  ) {
    return cue.includes("독백") || cue.includes("속마음") ? "thought-cloud" : "narration-box";
  }
  if (cue.includes("독백") || cue.includes("속마음") || cue.includes("생각")) return "thought-cloud";
  if (cue.includes("속삭") || cue.includes("소곤") || cue.includes("작게") || cue.includes("whisper")) return "whisper-dashed";
  if (line.emotion === "anger" || line.emotion === "surprise" || line.text.includes("!!") || cue.includes("외침")) return "shout-burst";
  return "standard";
}

function resolveBeatPhase(cutIndex: number, totalCuts: number): PacingBeatPhase {
  if (totalCuts <= 1) return "setup";
  const ratio = cutIndex / Math.max(1, totalCuts - 1);
  if (ratio < 0.2) return "setup";
  if (ratio < 0.52) return "build";
  if (ratio < 0.72) return "turn";
  if (ratio < 0.9) return "climax";
  return "resolution";
}

function estimateBubbleLayout(
  dialogues: readonly ParsedScriptLine[],
  cutIndex: number,
  canvasWidthPx: number,
  safeMarginPx: number,
): { readonly bubbles: readonly StoryboardBubblePlacement[]; readonly minRequiredHeightPx: number } {
  const innerWidth = Math.max(220, canvasWidthPx - safeMarginPx * 2);
  const maxBubbleWidth = Math.round(innerWidth * 0.62);
  const minBubbleWidth = Math.min(maxBubbleWidth, 180);
  const bubbles: StoryboardBubblePlacement[] = [];
  let cursorY = safeMarginPx + 12;

  for (let i = 0; i < dialogues.length; i += 1) {
    const line = dialogues[i];
    if (!line) continue;
    const shape = chooseBubbleShape(line);
    const fontSizePx = shape === "shout-burst" ? 22 : shape === "whisper-dashed" ? 15 : 18;
    const targetCharsPerLine = shape === "narration-box" ? 18 : 13;
    const textLength = Math.max(1, line.text.length);
    const estimatedLines = Math.max(1, Math.ceil(textLength / targetCharsPerLine));
    const width = Math.round(clamp(Math.ceil(Math.min(textLength, targetCharsPerLine) * fontSizePx * 0.92 + 44), minBubbleWidth, maxBubbleWidth));
    const height = Math.round(estimatedLines * Math.round(fontSizePx * 1.45) + 34);
    const alignRight = i % 2 === 1;
    const x = alignRight ? Math.max(safeMarginPx, canvasWidthPx - safeMarginPx - width) : safeMarginPx;

    bubbles.push({
      id: `cut-${cutIndex + 1}-bubble-${i + 1}`,
      speaker: line.speaker ?? "내레이션",
      text: line.text,
      shape,
      emotion: line.emotion,
      readingOrder: i + 1,
      x,
      y: cursorY,
      width,
      height,
      fontSizePx,
      estimatedLines,
      tailDirection: shape === "narration-box" ? "none" : alignRight ? "bottom-right" : "bottom-left",
    });
    cursorY += height + BUBBLE_VERTICAL_GAP_PX;
  }

  return { bubbles, minRequiredHeightPx: cursorY + safeMarginPx };
}

function computeGutterAfterPx(baseGutterPx: number, emotion: StoryboardEmotion, shotType: CameraShotType, isSceneBoundaryAfter: boolean): number {
  let factor = 1;
  if (isSceneBoundaryAfter) factor = 2.1;
  else if (shotType === "full-bleed-splash" || emotion === "surprise") factor = 1.65;
  else if (emotion === "sadness" || emotion === "monologue" || emotion === "romance") factor = 1.35;
  else if (emotion === "anger" || emotion === "fear") factor = 0.72;
  return Math.round(clamp(baseGutterPx * factor, 44, 240));
}

function buildPacingWarnings(cuts: readonly StoryboardCut[]): StoryboardPacingWarning[] {
  const warnings: StoryboardPacingWarning[] = [];

  for (let i = 2; i < cuts.length; i += 1) {
    const a = cuts[i - 2];
    const b = cuts[i - 1];
    const c = cuts[i];
    if (a && b && c && a.shotType === b.shotType && b.shotType === c.shotType) {
      warnings.push({
        code: "monotone-shots",
        cutIndices: [i - 2, i - 1, i],
        message: `${i - 1}~${i + 1}컷의 샷 구도(${c.shotType})가 연속 반복되어 시선 리듬이 단조로울 수 있습니다.`,
      });
    }
  }

  const tightRun: number[] = [];
  const flushTightRun = () => {
    if (tightRun.length >= 4) {
      warnings.push({
        code: "low-breathing-space",
        cutIndices: [...tightRun],
        message: `연속 ${tightRun.length}개 컷의 여백이 좁아 호흡 구간(여백 120px 이상) 삽입이 필요합니다.`,
      });
    }
    tightRun.length = 0;
  };

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    if (!cut) continue;
    const totalChars = cut.bubbles.reduce((acc, bubble) => acc + bubble.text.length, 0);
    if (totalChars > 95) {
      warnings.push({
        code: "dialogue-wall",
        cutIndices: [i],
        message: `${i + 1}컷의 대사 분량(${totalChars}자)이 많아 390px 모바일 화면에서 컷 분할을 권장합니다.`,
      });
    }
    if (cut.gutterAfterPx <= 64) tightRun.push(i);
    else flushTightRun();
  }
  flushTightRun();
  return warnings;
}

/**
 * 대본 원문을 웹툰 컷 분할·카메라 샷 구도·말풍선 배치·세로 페이싱 콘티로 변환한다.
 */
export function generateStoryboardFromScript(
  rawScript: string,
  options: StoryboardGenerationOptions = {},
): StoryboardPlan {
  const canvasWidthPx = Math.round(clamp(options.canvasWidthPx ?? DEFAULT_CANVAS_WIDTH_PX, 390, 2400));
  const safeMarginPx = Math.round(clamp(options.safeMarginPx ?? DEFAULT_SAFE_MARGIN_PX, 16, Math.floor(canvasWidthPx * 0.15)));
  const maxDialoguesPerCut = Math.round(clamp(options.maxDialoguesPerCut ?? DEFAULT_MAX_DIALOGUES_PER_CUT, 1, 4));
  const baseGutterPx = Math.round(clamp(options.baseGutterPx ?? DEFAULT_BASE_GUTTER_PX, 44, 200));

  const parsed = parseScriptDocument(rawScript, options.title ?? "무제 에피소드");
  const allDrafts: CutDraft[] = [];
  for (const scene of parsed.scenes) allDrafts.push(...segmentSceneIntoDrafts(scene, maxDialoguesPerCut));

  const totalCuts = allDrafts.length;
  const cuts: StoryboardCut[] = [];
  let yCursorPx = 0;

  const shotDistribution: Record<CameraShotType, number> = {
    establishing: 0, wide: 0, "medium-wide": 0, medium: 0, "over-the-shoulder": 0,
    "close-up": 0, "extreme-close-up": 0, "detail-insert": 0, "full-bleed-splash": 0,
  };

  for (let cutIndex = 0; cutIndex < totalCuts; cutIndex += 1) {
    const draft = allDrafts[cutIndex];
    if (!draft) continue;

    const cutEmotion = computeDominantEmotion([...draft.directions, ...draft.dialogues, ...draft.sfx]);
    const emotion = cutEmotion !== "neutral" ? cutEmotion : draft.scene.dominantEmotion;
    const beatPhase = resolveBeatPhase(cutIndex, totalCuts);
    const { shotType, cameraAngle, composition } = chooseShotAndFraming(draft, cutIndex, totalCuts, emotion);
    const tension01 = roundTo2(clamp(BASE_TENSION_BY_EMOTION[emotion] + PHASE_TENSION_BOOST[beatPhase] + (draft.sfx.length > 0 ? 0.06 : 0), 0.1, 1));

    const { bubbles, minRequiredHeightPx } = estimateBubbleLayout(draft.dialogues, cutIndex, canvasWidthPx, safeMarginPx);
    const heightPx = Math.max(BASE_HEIGHT_BY_SHOT[shotType] + (tension01 >= 0.8 ? 90 : 0), minRequiredHeightPx + 180);
    const nextDraft = allDrafts[cutIndex + 1];
    const gutterAfterPx = computeGutterAfterPx(baseGutterPx, emotion, shotType, nextDraft !== undefined && nextDraft.scene.sceneNumber !== draft.scene.sceneNumber);

    const sfxCues: StoryboardSfxCue[] = draft.sfx.map((sfxLine, sfxIdx) => ({
      id: `cut-${cutIndex + 1}-sfx-${sfxIdx + 1}`,
      text: sfxLine.text,
      emphasis: sfxLine.text.includes("!") ? "strong" : sfxLine.text.length <= 2 ? "quiet" : "normal",
      x: Math.round(safeMarginPx + ((sfxIdx % 2 === 0 ? 0.56 : 0.14) * (canvasWidthPx - safeMarginPx * 2))),
      y: Math.round(heightPx - safeMarginPx - 92 - sfxIdx * 54),
      rotationDeg: sfxIdx % 2 === 0 ? -8 : 7,
    }));

    const charactersInCut = [...new Set(draft.dialogues.map((line) => line.speaker).filter((s): s is string => Boolean(s)))];
    const actionSummary = draft.directions.length > 0
      ? draft.directions.map((line) => line.text).join(" ")
      : draft.dialogues.length > 0 ? `${charactersInCut.join("·") || "인물"} 대사 컷` : `${draft.scene.location} 전경 설정 컷`;
    const charCount = draft.dialogues.reduce((sum, line) => sum + line.text.length, 0);
    const estimatedReadSeconds = roundTo2(1.4 + charCount * 0.065 + (shotType === "full-bleed-splash" ? 1.2 : 0));

    shotDistribution[shotType] += 1;
    cuts.push({
      cutId: `cut-${String(cutIndex + 1).padStart(3, "0")}`,
      cutIndex,
      sceneNumber: draft.scene.sceneNumber,
      sceneHeading: draft.scene.heading,
      location: draft.scene.location,
      timeOfDay: draft.scene.timeOfDay,
      shotType,
      cameraAngle,
      composition,
      emotion,
      beatPhase,
      tension01,
      actionSummary,
      charactersInCut,
      bubbles,
      sfxCues,
      yStartPx: yCursorPx,
      widthPx: canvasWidthPx,
      heightPx,
      gutterAfterPx,
      estimatedReadSeconds,
    });
    yCursorPx += heightPx + gutterAfterPx;
  }

  return {
    title: parsed.title,
    canvasWidthPx,
    safeMarginPx,
    parsed,
    cuts,
    pacing: {
      totalCuts,
      totalScrollHeightPx: yCursorPx,
      averageCutHeightPx: totalCuts > 0 ? Math.round(cuts.reduce((sum, cut) => sum + cut.heightPx, 0) / totalCuts) : 0,
      averageGutterPx: totalCuts > 0 ? Math.round(cuts.reduce((sum, cut) => sum + cut.gutterAfterPx, 0) / totalCuts) : 0,
      estimatedReadSeconds: roundTo2(cuts.reduce((sum, cut) => sum + cut.estimatedReadSeconds, 0)),
      tensionCurve: cuts.map((cut) => cut.tension01),
      shotDistribution,
      warnings: buildPacingWarnings(cuts),
    },
  };
}
