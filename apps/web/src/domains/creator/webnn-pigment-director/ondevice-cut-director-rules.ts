/**
 * 온디바이스 웹툰 컷 연출 · 한국어 대사 문법 타입 계약, 번역투 치환 규칙, 과밀 말풍선 분할기 및 데모 콘티.
 */

export type ShotSize = "ECU" | "CU" | "MS" | "WS";
export type CutBeatType = "setup" | "dialogue" | "tension" | "climax" | "breather";
export type OnDeviceDirectorBackend =
  | "window-ai-nano"
  | "webgpu-local-llm"
  | "offline-webtoon-grammar";

export interface WindowAiLanguageModelLike {
  readonly capabilities?: () => Promise<{ readonly available?: string }>;
  readonly availability?: () => Promise<string>;
  readonly create?: (options?: Record<string, unknown>) => Promise<{
    readonly prompt?: (text: string) => Promise<string>;
    readonly destroy?: () => void;
  }>;
}

export interface OnDeviceDirectorEnvLike {
  readonly ai?: { readonly languageModel?: WindowAiLanguageModelLike };
  readonly LanguageModel?: WindowAiLanguageModelLike;
  readonly navigator?: {
    readonly gpu?: {
      readonly requestAdapter?: () => Promise<{ readonly info?: { readonly description?: string } } | null>;
    };
  };
}

export interface OnDeviceDirectorRuntime {
  readonly backend: OnDeviceDirectorBackend;
  readonly hasWindowAi: boolean;
  readonly hasWebGpuAdapter: boolean;
  readonly adapterLabel: string;
  readonly localExecutionReady: boolean;
  readonly privacyMode: "100%-ondevice-zero-upload";
  readonly runtimeNote: string;
}

export interface DialogueBalloonInput {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
  readonly xPct: number;
  readonly yPct: number;
  readonly readingOrder: number;
}

export interface CutSceneInput {
  readonly id: string;
  readonly cutIndex: number;
  readonly shotSize: ShotSize;
  readonly panelHeightPx: number;
  readonly gutterAfterPx: number;
  readonly beatType: CutBeatType;
  readonly balloons: readonly DialogueBalloonInput[];
}

export interface ShotDistributionSummary {
  readonly totalCuts: number;
  readonly counts: Readonly<Record<ShotSize, number>>;
  readonly ratiosPct: Readonly<Record<ShotSize, number>>;
  readonly monotonyRunMax: number;
}

export type RhythmIssueKind =
  | "monotony-run"
  | "ms-overuse"
  | "missing-establishing-ws"
  | "missing-emotional-closeup"
  | "beat-shot-mismatch"
  | "cramped-gutter";

export interface RhythmDiagnosticIssue {
  readonly kind: RhythmIssueKind;
  readonly severity: "warn" | "bad";
  readonly cutIndices: readonly number[];
  readonly message: string;
  readonly recommendation: string;
}

export type DialogueFindingKind = "translationese" | "balloon-overcrowded";

export interface TranslationeseMatch {
  readonly ruleId: string;
  readonly matchedPhrase: string;
  readonly reason: string;
  readonly replacementHint: string;
}

export interface DialogueDiagnosticFinding {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly balloonId: string;
  readonly speaker: string;
  readonly kind: DialogueFindingKind;
  readonly severity: "warn" | "bad";
  readonly originalText: string;
  readonly suggestedRewrite: string;
  readonly suggestedSplitBalloons: readonly string[];
  readonly charCount: number;
  readonly estimatedMobileLines: number;
  readonly matchedRules: readonly TranslationeseMatch[];
  readonly message: string;
}

export type EyeFlowIssueKind =
  | "reverse-vertical-jump"
  | "right-to-left-reversal"
  | "sharp-horizontal-zigzag"
  | "balloon-collision";

export interface EyeFlowDiagnosticIssue {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly fromBalloonId: string;
  readonly toBalloonId: string;
  readonly kind: EyeFlowIssueKind;
  readonly severity: "warn" | "bad";
  readonly message: string;
  readonly suggestedPosition: { readonly xPct: number; readonly yPct: number };
}

export interface CutDirectorDiagnosisReport {
  readonly runtime: OnDeviceDirectorRuntime;
  readonly overallScore: number;
  readonly rhythmScore: number;
  readonly dialogueNaturalnessScore: number;
  readonly eyeFlowScore: number;
  readonly shotDistribution: ShotDistributionSummary;
  readonly rhythmIssues: readonly RhythmDiagnosticIssue[];
  readonly dialogueFindings: readonly DialogueDiagnosticFinding[];
  readonly eyeFlowIssues: readonly EyeFlowDiagnosticIssue[];
  readonly elapsedMs: number;
}

export const SHOT_SIZE_META_KO: Readonly<
  Record<ShotSize, { readonly label: string; readonly shortDesc: string }>
> = {
  ECU: { label: "익스트림 클로즈업", shortDesc: "눈동자·손끝 등 극적 감정 집중" },
  CU: { label: "클로즈업", shortDesc: "표정 변화·핵심 대사 강조" },
  MS: { label: "미디엄 샷", shortDesc: "인물 간 대화·상반신 제스처" },
  WS: { label: "와이드 샷", shortDesc: "공간 설정·동선 환기" },
};

interface TranslationeseRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly reason: string;
  readonly hint: string;
  readonly rewrite: (text: string) => string;
}

const TRANSLATIONESE_RULES: readonly TranslationeseRule[] = [
  {
    id: "enable-nominalization",
    pattern: /하는\s*것을\s*가능하게\s*(?:합니다|한다|해요|해)/g,
    reason: "직역 명사화로 대사 호흡이 길어집니다.",
    hint: "'~할 수 있게 해'로 단축",
    rewrite: (t) => t.replace(/하는\s*것을\s*가능하게\s*(?:합니다|한다|해요|해)/g, "할 수 있게 해"),
  },
  {
    id: "in-terms-of",
    pattern: /에\s*있어서(?=\s|$|[,.!?])/g,
    reason: "문어체 '~에 있어서'가 구어체 말풍선 몰입을 끊습니다.",
    hint: "'~에서'로 단순화",
    rewrite: (t) => t.replace(/에\s*있어서(?=\s|$|[,.!?])/g, "에서"),
  },
  {
    id: "through-chain",
    pattern: /(을|를)\s*통해(?=\s)/g,
    reason: "'~을/를 통해' 남용은 설명문처럼 딱딱합니다.",
    hint: "'~으로/로'로 수단 직접 연결",
    rewrite: (t) => t.replace(/(을|를)\s*통해(?=\s)/g, (_m, p: string) => (p === "을" ? "으로" : "로")),
  },
  {
    id: "intuitive-experience",
    pattern: /직관적인\s*경험을\s*제공(?:합니다|한다|해요|해)/g,
    reason: "추상 마케팅 문구로 캐릭터 대사에 어색합니다.",
    hint: "체감 행동으로 치환",
    rewrite: (t) => t.replace(/직관적인\s*경험을\s*제공(?:합니다|한다|해요|해)/g, "바로 손에 익어"),
  },
  {
    id: "tend-to",
    pattern: /하는\s*경향이\s*있(?:습니다|다|어요|어)/g,
    reason: "'tend to' 직역으로 캐릭터 말투가 부자연스럽습니다.",
    hint: "'~하는 편이야'로 전환",
    rewrite: (t) => t.replace(/하는\s*경향이\s*있(?:습니다|다|어요|어)/g, "하는 편이야"),
  },
  {
    id: "pronoun-dangsin",
    pattern: /당신은\s+/g,
    reason: "'당신은' 주어는 번역투로 읽힙니다.",
    hint: "호칭 변경 또는 '넌 '으로 축약",
    rewrite: (t) => t.replace(/당신은\s+/g, "넌 "),
  },
  {
    id: "pronoun-geugeoseun",
    pattern: /그것은\s+/g,
    reason: "'It is' 직역 주어('그것은')가 호흡을 무겁게 합니다.",
    hint: "'그건 '으로 축약",
    rewrite: (t) => t.replace(/그것은\s+/g, "그건 "),
  },
  {
    id: "need-to",
    pattern: /할\s*필요가\s*있(?:습니다|다|어요|어)/g,
    reason: "'need to' 직역보다 직설적 서술어가 웹툰에 어울립니다.",
    hint: "'~해야 해'로 단축",
    rewrite: (t) => t.replace(/할\s*필요가\s*있(?:습니다|다|어요|어)/g, "해야 해"),
  },
  {
    id: "the-fact-that",
    pattern: /라는\s*사실(을|이|에)/g,
    reason: "'the fact that' 직역 명사화가 길이를 불립니다.",
    hint: "'~라는 걸/게/데'로 구어 축약",
    rewrite: (t) =>
      t.replace(/라는\s*사실(을|이|에)/g, (_m, p: string) =>
        p === "이" ? "라는 게" : p === "에" ? "라는 데" : "라는 걸",
      ),
  },
  {
    id: "double-passive",
    pattern: /되어지(고|는|ㄴ|면|다)/g,
    reason: "이중 피동 비문('~되어지다')입니다.",
    hint: "단일 피동('~되다')으로 교정",
    rewrite: (t) => t.replace(/되어지(고|는|ㄴ|면|다)/g, "되$1"),
  },
  {
    id: "have-object-calque",
    pattern: /(을|를)\s*가지고\s*있(?:습니다|다|어요|어)/g,
    reason: "'have' 직역('가지고 있다')이 길고 늘어집니다.",
    hint: "'~을/를 쥐고 있어'로 축약",
    rewrite: (t) => t.replace(/(을|를)\s*가지고\s*있(?:습니다|다|어요|어)/g, (_m, p: string) => `${p} 쥐고 있어`),
  },
  {
    id: "thinking-about",
    pattern: /에\s*대해\s*생각하고\s*있었(?:습니다|다|어요|어)/g,
    reason: "'was thinking about' 직역투입니다.",
    hint: "'생각 중이었어'로 압축",
    rewrite: (t) => t.replace(/에\s*대해\s*생각하고\s*있었(?:습니다|다|어요|어)/g, " 생각 중이었어"),
  },
];

function splitByWordBudget(text: string, budget: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length <= 1) {
    const mid = Math.ceil(text.length / 2);
    return [text.slice(0, mid).trim(), text.slice(mid).trim()].filter((s) => s.length > 0);
  }
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length === 0) current = word;
    else if (current.length + 1 + word.length <= budget) current = `${current} ${word}`;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** 과밀 한국어 대사를 모바일 세로 스크롤 말풍선 호흡 단위로 분할한다. */
export function splitOvercrowdedKoreanBalloon(
  text: string,
  maxCharsPerBalloon = 24,
): readonly string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxCharsPerBalloon) return normalized.length > 0 ? [normalized] : [];

  const rawSentences = normalized
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const chunks: string[] = [];
  const clauseSplitter = /(?<=,|는데|지만|거든|니까|해서|그래서|근데)\s+/;

  for (const sentence of rawSentences) {
    if (sentence.length <= maxCharsPerBalloon) {
      chunks.push(sentence);
      continue;
    }
    const clauses = sentence.split(clauseSplitter).map((c) => c.trim()).filter((c) => c.length > 0);
    if (clauses.length > 1) {
      for (const clause of clauses) {
        if (clause.length <= maxCharsPerBalloon + 4) chunks.push(clause);
        else chunks.push(...splitByWordBudget(clause, maxCharsPerBalloon));
      }
    } else {
      chunks.push(...splitByWordBudget(sentence, maxCharsPerBalloon));
    }
  }

  const merged: string[] = [];
  for (const piece of chunks) {
    const prev = merged[merged.length - 1];
    if (prev && piece.length <= 6 && prev.length + piece.length + 1 <= maxCharsPerBalloon + 4) {
      merged[merged.length - 1] = `${prev} ${piece}`;
    } else {
      merged.push(piece);
    }
  }
  return merged;
}

/** 단일 말풍선 대사의 번역투·과밀 여부를 진단하고 구어체 교정안과 분할안을 생성한다. */
export function inspectKoreanDialogueBalloon(text: string): {
  readonly matchedRules: readonly TranslationeseMatch[];
  readonly suggestedRewrite: string;
  readonly isOvercrowded: boolean;
  readonly charCount: number;
  readonly estimatedMobileLines: number;
  readonly suggestedSplitBalloons: readonly string[];
} {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const matchedRules: TranslationeseMatch[] = [];
  let rewritten = cleaned;

  for (const rule of TRANSLATIONESE_RULES) {
    const freshRegex = new RegExp(rule.pattern.source, rule.pattern.flags);
    const match = freshRegex.exec(cleaned);
    if (match) {
      matchedRules.push({
        ruleId: rule.id,
        matchedPhrase: match[0].trim(),
        reason: rule.reason,
        replacementHint: rule.hint,
      });
      rewritten = rule.rewrite(rewritten);
    }
  }

  rewritten = rewritten.replace(/\s{2,}/g, " ").trim();
  const nonSpaceChars = rewritten.replace(/\s/g, "").length;
  const estimatedMobileLines = Math.max(1, Math.ceil(nonSpaceChars / 10));
  const sentenceCount = rewritten.split(/[.!?…]+/).filter((s) => s.trim().length > 0).length;
  const isOvercrowded =
    cleaned.length > 36 || estimatedMobileLines >= 4 || (sentenceCount >= 2 && cleaned.length > 26);

  return {
    matchedRules,
    suggestedRewrite: rewritten,
    isOvercrowded,
    charCount: cleaned.length,
    estimatedMobileLines,
    suggestedSplitBalloons: isOvercrowded ? splitOvercrowdedKoreanBalloon(rewritten, 22) : [rewritten],
  };
}

/** 데모용 한국어 웹툰 4컷 시퀀스(번역투 · 과밀 말풍선 · 시선 역행 · MS 4연속 단조로움 포함). */
export const CUT_DIRECTOR_DEMO_SCENES: readonly CutSceneInput[] = [
  {
    id: "cut-1",
    cutIndex: 1,
    shotSize: "MS",
    panelHeightPx: 620,
    gutterAfterPx: 54,
    beatType: "setup",
    balloons: [
      {
        id: "b1-1",
        speaker: "수연",
        text: "당신은 이 지도를 통해 비밀 통로를 찾는 것을 가능하게 합니다.",
        xPct: 68,
        yPct: 30,
        readingOrder: 1,
      },
      { id: "b1-2", speaker: "민호", text: "잠깐, 정말 여기서 열리는 거야?", xPct: 28, yPct: 26, readingOrder: 2 },
    ],
  },
  {
    id: "cut-2",
    cutIndex: 2,
    shotSize: "MS",
    panelHeightPx: 580,
    gutterAfterPx: 72,
    beatType: "dialogue",
    balloons: [
      {
        id: "b2-1",
        speaker: "수연",
        text: "그것은 오래전부터 봉인되어지고 있었는데, 지금 당장 우리가 내려가서 열쇠를 확인할 필요가 있습니다. 늦으면 문이 닫혀 버려요!",
        xPct: 32,
        yPct: 38,
        readingOrder: 1,
      },
    ],
  },
  {
    id: "cut-3",
    cutIndex: 3,
    shotSize: "MS",
    panelHeightPx: 640,
    gutterAfterPx: 60,
    beatType: "tension",
    balloons: [
      { id: "b3-1", speaker: "민호", text: "그 문제에 대해 생각하고 있었어.", xPct: 34, yPct: 62, readingOrder: 1 },
      { id: "b3-2", speaker: "수연", text: "뒤에서 발소리가 가까워져!", xPct: 72, yPct: 28, readingOrder: 2 },
    ],
  },
  {
    id: "cut-4",
    cutIndex: 4,
    shotSize: "MS",
    panelHeightPx: 720,
    gutterAfterPx: 90,
    beatType: "climax",
    balloons: [
      { id: "b4-1", speaker: "민호", text: "여기에 있어서 물러설 수 없어!", xPct: 50, yPct: 44, readingOrder: 1 },
    ],
  },
];
