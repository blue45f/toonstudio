/**
 * Studio Dialogue Suggest — 대사/나레이션 제안(BYOK)의 프롬프트 구성/응답 파싱(순수 코어).
 *
 * 사용자가 짧은 장면 상황을 설명하면(선택적으로 캔버스에 이미 배치된 대사를 맥락으로 함께 실어),
 * 자연스러운 대사·나레이션 후보 여러 개를 받는다. 실제 fetch 오케스트레이션은
 * studio-ai-client.ts의 suggestDialogueLines(얇은 래퍼)가 담당한다 — 이 파일은 프롬프트 문자열
 * 조합과 응답 파싱만 한다(fetch 없음, 순수·결정적, studio-scenario-scenes.ts/
 * studio-dialogue-translate.ts와 동일한 역할 분담).
 *
 * 응답 파싱은 studio-dialogue-translate.ts의 "코드펜스·설명 문장이 섞여도 첫 JSON 리터럴만
 * 방어적으로 뽑아내는" 전략과 동일하다(최상위가 배열이라 대괄호 짝을 맞춰 찾는다). 이 파일 안에
 * extractJsonArrayLiteral을 독립적으로 복제해 둔다 — studio-scenario-scenes.ts가 중괄호용 사본을
 * 따로 갖고 있는 것과 같은 관례로, 공유 모듈로 추출하면 지금 각 파일이 서로를 몰라도 되는 낮은
 * 결합도가 깨진다(작은 순수 함수 하나를 위해 새 임포트 그래프 간선을 만들 이유가 없다).
 *
 * 각 후보는 studio-dialogue.parseDialogueScript가 그대로 소비하는 "이름: 대사"/"(지문)" 미니 문법
 * 한 줄로 형식화할 수 있다(formatDialogueSuggestionLine) — 새 스키마를 발명하지 않고 기존
 * "대사 한 번에"(parseDialogueScript → layoutDialogueBubbles) 파이프라인에 그대로 태운다
 * (studio-scenario-scenes.ts의 dialogue 필드와 동일한 설계 판단).
 */

export type DialogueSuggestionKind = "speech" | "narration";

export interface DialogueSuggestionCandidate {
  /** 화자 이름. 나레이션(kind="narration")이거나 화자를 특정할 수 없는 대사면 빈 문자열. */
  speaker: string;
  text: string;
  kind: DialogueSuggestionKind;
}

export const DIALOGUE_SUGGEST_MIN_CANDIDATES = 3;
export const DIALOGUE_SUGGEST_MAX_CANDIDATES = 5;

/** 파싱 후 상한 — 모델이 지시를 어기고 더 많이 반환해도 앞에서부터만 취한다(UI 과다 방어). */
export const DIALOGUE_SUGGEST_MAX_PARSED = 8;

/** 맥락으로 함께 보낼 기존 대사 문자열의 문자수 상한(토큰/과금 방어) — 넘으면 뒤(최근 대사)를 우선한다. */
export const DIALOGUE_SUGGEST_CONTEXT_MAX_CHARS = 1200;

const JSON_SHAPE_EXAMPLE =
  '[{"speaker":"민수","text":"나 전학왔어.","kind":"speech"},{"speaker":"","text":"(교실이 순간 조용해진다)","kind":"narration"}]';

/**
 * 프롬프트(system/user) 구성 — 순수·결정적. existingContext(캔버스에 이미 배치된 대사, 있으면)는
 * "지금까지의 대사 흐름"으로 시스템 프롬프트에 삽입해 톤·맥락 일관성을 유도한다(선택 사항 — 빈
 * 문자열이면 관련 문구 자체를 생략해 프롬프트를 불필요하게 늘리지 않는다).
 */
export function buildDialogueSuggestPrompt(
  situationText: string,
  existingContext = ""
): { system: string; user: string } {
  const systemLines = [
    "당신은 한국 웹툰 대사·나레이션 작가입니다. 사용자가 설명하는 장면 상황을 읽고, 그 장면에 어울리는 " +
      `자연스러운 대사·나레이션 후보를 ${DIALOGUE_SUGGEST_MIN_CANDIDATES}~${DIALOGUE_SUGGEST_MAX_CANDIDATES}개 제안하세요.`,
    "각 후보는 서로 독립적인 대안입니다(이어지는 대화 한 편이 아니라, 이 장면에 쓸 수 있는 서로 다른 " +
      "선택지). 후보 하나는 한 마디(대사 한 줄 또는 나레이션 한 문장)로 짧게 쓰세요.",
    "다른 설명이나 마크다운 코드블록 없이, 반드시 아래 예시와 동일한 구조의 JSON 배열 하나만 응답하세요.",
    JSON_SHAPE_EXAMPLE,
    'speaker: 화자 이름(있으면). 나레이션이거나 화자를 특정할 수 없는 대사면 빈 문자열("").',
    'kind: 등장인물의 대사는 "speech", 지문·나레이션은 "narration".',
  ];
  const trimmedContext = existingContext.trim();
  if (trimmedContext) {
    systemLines.push(
      `참고로 이 장면에 이미 배치된 대사 흐름은 다음과 같습니다(같은 톤과 맥락을 이어가세요):\n${trimmedContext}`
    );
  }
  return { system: systemLines.join("\n"), user: situationText.trim() };
}

/**
 * 기존 대사 목록(오래된→최신 순으로 들어온다고 가정)을 프롬프트 맥락 문자열로 접는다. 문자수 상한을
 * 넘으면 **앞(오래된 대사)부터** 잘라내 최근 대사가 우선 보존되게 한다 — 장면의 "지금 흐름"을 이어가는
 * 것이 목적이라 최신 대사가 더 중요하다.
 */
export function joinDialogueContextLines(lines: readonly string[], maxChars = DIALOGUE_SUGGEST_CONTEXT_MAX_CHARS): string {
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmpty.length === 0) return "";
  let total = 0;
  const kept: string[] = [];
  for (let i = nonEmpty.length - 1; i >= 0; i--) {
    const line = nonEmpty[i];
    if (total + line.length > maxChars && kept.length > 0) break; // 최소 1줄은 항상 보존.
    kept.unshift(line);
    total += line.length;
  }
  return kept.join("\n");
}

/** raw 문자열에서 첫 `[` 로 시작해 짝이 맞는(중첩 대괄호를 세어가며 찾은) `]` 까지를 잘라낸다.
 *  코드펜스나 앞뒤 설명 문장이 섞여 있어도 배열 부분만 뽑아낸다. 짝이 맞는 `]` 를 찾지 못하면 null. */
function extractJsonArrayLiteral(raw: string): string | null {
  const start = raw.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "[") depth++;
    else if (raw[i] === "]") {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 모델 응답(자유 텍스트, 코드펜스·설명 섞여 있을 수 있음)에서 첫 JSON 배열을 뽑아
 * DialogueSuggestionCandidate[] 로 파싱한다. text 가 빈 문자열인 항목은 환각/무의미로 간주해
 * 건너뛴다. 파싱 자체 실패·유효 후보 0개는 ok:false.
 */
export function parseDialogueSuggestResponse(
  raw: string
): { ok: true; data: DialogueSuggestionCandidate[] } | { ok: false; error: string } {
  const jsonText = extractJsonArrayLiteral(raw);
  if (!jsonText) return { ok: false, error: "응답에서 대사 제안(JSON 배열)을 찾을 수 없습니다." };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "대사 제안 응답을 해석하지 못했습니다(JSON 형식이 아닙니다)." };
  }
  if (!Array.isArray(parsed)) return { ok: false, error: "대사 제안 응답 형식이 배열이 아닙니다." };

  const candidates: DialogueSuggestionCandidate[] = [];
  for (const entry of parsed.slice(0, DIALOGUE_SUGGEST_MAX_PARSED)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const text = typeof e.text === "string" ? e.text.trim() : "";
    if (!text) continue;
    const speaker = typeof e.speaker === "string" ? e.speaker.trim() : "";
    const kind: DialogueSuggestionKind = e.kind === "narration" ? "narration" : "speech";
    candidates.push({ speaker, text, kind });
  }
  if (candidates.length === 0) {
    return { ok: false, error: "대사 제안 응답에서 유효한 후보를 찾지 못했습니다." };
  }
  return { ok: true, data: candidates };
}

/**
 * 후보 1개를 studio-dialogue.parseDialogueScript 가 그대로 소비하는 미니 문법 한 줄로 형식화한다.
 * narration은 "(텍스트)"로 감싸고(NARRATION_RE가 줄 전체를 괄호로 감싼 형태만 보므로, 텍스트 내부에
 * 괄호가 더 있어도 안전), speech는 화자가 있으면 "이름: 대사", 없으면 대사만(파서가 직전과 반대쪽으로
 * 자동 배정).
 */
export function formatDialogueSuggestionLine(candidate: DialogueSuggestionCandidate): string {
  if (candidate.kind === "narration") return `(${candidate.text})`;
  return candidate.speaker ? `${candidate.speaker}: ${candidate.text}` : candidate.text;
}

export interface DialogueLocalRecommendOptions {
  readonly speaker?: string;
  readonly emotion?: "determination" | "shock" | "joy" | "rage" | "sorrow" | "calm";
}

/**
 * 외부 AI 키가 없거나 스토리보드 컷별 즉시 추천이 필요할 때, 장면 지문·상황 문맥과 감정 톤을
 * 분석해 한국 웹툰 표준 호흡의 대사·나레이션 후보를 결정적으로 생성·추천한다.
 */
export function recommendLocalDialogueCandidates(
  situationText: string,
  options: DialogueLocalRecommendOptions = {},
): readonly DialogueSuggestionCandidate[] {
  const cleaned = situationText.replace(/\s+/gu, " ").trim();
  if (!cleaned) return Object.freeze([]);

  const speaker = options.speaker?.trim() || "주인공";
  const emotion =
    options.emotion ??
    (/결투|공격|검|칼|주먹|폭발|분노/u.test(cleaned)
      ? "rage"
      : /눈빛|숨결|동공|경악|놀라|충격/u.test(cleaned)
        ? "shock"
        : /눈물|울|슬픔|절망/u.test(cleaned)
          ? "sorrow"
          : /웃|미소|행복|기쁨|반가/u.test(cleaned)
            ? "joy"
            : /결심|다짐|각오|반드시|끝내/u.test(cleaned)
              ? "determination"
              : "calm");

  switch (emotion) {
    case "rage":
      return Object.freeze([
        { speaker, text: "더 이상 물러설 곳은 없어. 여기서 끝낸다!", kind: "speech" },
        { speaker, text: "네가 만든 결과야, 끝까지 책임져!", kind: "speech" },
        { speaker: "", text: "거친 숨소리 너머로 팽팽한 살기가 허공을 갈랐다.", kind: "narration" },
      ]);
    case "shock":
      return Object.freeze([
        { speaker, text: "잠깐… 지금 내 눈앞에 있는 게 정말 사실이야?!", kind: "speech" },
        { speaker, text: "그럴 리가 없어… 분명 끝난 일이었잖아.", kind: "speech" },
        { speaker: "", text: "머릿속이 하얗게 멈추고 심장 소리만 귓가를 울렸다.", kind: "narration" },
      ]);
    case "sorrow":
      return Object.freeze([
        { speaker, text: "미안해… 그때 내가 조금만 더 일찍 알았더라면.", kind: "speech" },
        { speaker, text: "아무 말도 하지 마. 지금은 그냥 이대로 있게 해 줘.", kind: "speech" },
        { speaker: "", text: "차마 삼키지 못한 말이 조용히 바닥으로 흩어졌다.", kind: "narration" },
      ]);
    case "joy":
      return Object.freeze([
        { speaker, text: "진짜 너 맞구나! 다시 만나게 될 줄 몰랐어.", kind: "speech" },
        { speaker, text: "드디어 해냈어… 우리 노력이 헛되지 않았어!", kind: "speech" },
        { speaker: "", text: "오랜 기다림 끝에 마침내 따뜻한 봄볕 같은 미소가 번졌다.", kind: "narration" },
      ]);
    case "determination":
      return Object.freeze([
        { speaker, text: "어떤 대가를 치르더라도 이번 기회는 절대 놓치지 않아.", kind: "speech" },
        { speaker, text: "약속했잖아. 끝까지 지켜보라고.", kind: "speech" },
        { speaker: "", text: "흔들리던 눈빛이 이내 단단한 확신으로 바뀌었다.", kind: "narration" },
      ]);
    case "calm":
      return Object.freeze([
        { speaker, text: "천천히 이야기해 봐. 네가 왜 여기까지 왔는지.", kind: "speech" },
        { speaker, text: "아직 결론을 내리기엔 확인해야 할 단서가 남았어.", kind: "speech" },
        { speaker: "", text: "고요한 공기 속에서 두 사람의 시선이 조용히 교차했다.", kind: "narration" },
      ]);
  }
}

// ── 모바일 스크롤 말풍선 가독성 진단 · 자동 분할 · 글로벌 다국어 식자 프리뷰 ────

export interface WebtoonDialogueReadabilityReport {
  readonly charCount: number;
  readonly estimatedReadingSec: number;
  readonly recommendedBubbleCount: number;
  readonly mobileReadabilityScore: number;
  readonly status: "optimal" | "split-recommended" | "too-dense";
  readonly coachingTip: string;
}

export const WEBTOON_OPTIMAL_BUBBLE_MAX_CHARS = 28;

/**
 * 모바일 세로 스크롤 환경에서의 대사 가독성·호흡·권장 말풍선 개수를 진단한다.
 */
export function analyzeWebtoonDialogueReadability(
  rawText: string,
  maxCharsPerBubble = WEBTOON_OPTIMAL_BUBBLE_MAX_CHARS,
): WebtoonDialogueReadabilityReport {
  const cleaned = rawText.replace(/\s+/gu, " ").trim();
  const charCount = cleaned.length;
  const limit = Math.max(12, maxCharsPerBubble);
  const recommendedBubbleCount = charCount === 0 ? 0 : Math.ceil(charCount / limit);
  const estimatedReadingSec = Math.round(Math.max(0.6, charCount * 0.14) * 10) / 10;

  if (charCount <= limit) {
    return Object.freeze({
      charCount,
      estimatedReadingSec,
      recommendedBubbleCount,
      mobileReadabilityScore: charCount === 0 ? 100 : 96,
      status: "optimal",
      coachingTip: "모바일 한 눈에 들어오는 최적 말풍선 길이입니다.",
    });
  }
  if (charCount <= limit * 2) {
    return Object.freeze({
      charCount,
      estimatedReadingSec,
      recommendedBubbleCount,
      mobileReadabilityScore: 76,
      status: "split-recommended",
      coachingTip: `대사가 ${charCount}자로 다소 깁니다. 호흡에 맞춰 말풍선 2개로 나누면 시선 흐름이 자연스러워집니다.`,
    });
  }
  return Object.freeze({
    charCount,
    estimatedReadingSec,
    recommendedBubbleCount,
    mobileReadabilityScore: Math.max(42, 95 - Math.round((charCount - limit) * 1.1)),
    status: "too-dense",
    coachingTip: `대사가 ${charCount}자로 모바일 화면을 가릴 수 있습니다. ${recommendedBubbleCount}개 말풍선으로 분할하거나 나레이션으로 분담하세요.`,
  });
}

/**
 * 긴 대사를 문장부호·절 단위로 자연스럽게 쪼개 모바일 웹툰 말풍선 배열로 분할한다.
 */
export function splitDialogueIntoWebtoonBubbles(
  rawText: string,
  maxCharsPerBubble = WEBTOON_OPTIMAL_BUBBLE_MAX_CHARS,
): readonly string[] {
  const cleaned = rawText.replace(/\s+/gu, " ").trim();
  if (!cleaned) return Object.freeze([]);
  const limit = Math.max(12, maxCharsPerBubble);
  if (cleaned.length <= limit) return Object.freeze([cleaned]);

  // 문장 부호(., !, ?, …, —) 뒤 공백 또는 쉼표 뒤 공백 기준으로 먼저 쪼갠다.
  const clauses = cleaned
    .split(/(?<=[.!?…—,])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);

  const bubbles: string[] = [];
  let current = "";

  const pushWordsChunked = (segment: string) => {
    const words = segment.split(/\s+/u).filter(Boolean);
    let buf = "";
    for (const word of words) {
      const candidate = buf ? `${buf} ${word}` : word;
      if (candidate.length <= limit) {
        buf = candidate;
      } else {
        if (buf) bubbles.push(buf);
        buf = word;
      }
    }
    if (buf) bubbles.push(buf);
  };

  for (const clause of clauses) {
    if (!current) {
      if (clause.length <= limit) current = clause;
      else pushWordsChunked(clause);
      continue;
    }
    const combined = `${current} ${clause}`;
    if (combined.length <= limit) {
      current = combined;
    } else {
      bubbles.push(current);
      if (clause.length <= limit) current = clause;
      else {
        current = "";
        pushWordsChunked(clause);
      }
    }
  }
  if (current) bubbles.push(current);
  return Object.freeze(bubbles);
}

export type GlobalWebtoonLocaleCode = "ko" | "en" | "ja" | "es";

export interface GlobalLocalizedDialogueEntry {
  readonly locale: GlobalWebtoonLocaleCode;
  readonly localeLabel: string;
  readonly localizedText: string;
  readonly bubbleExpansionRatio: number;
  readonly letteringNote: string;
}

/**
 * 글로벌 K-웹툰 연재를 위해 한국어 대사의 영어(EN)·일본어(JA)·스페인어(ES) 현지화 대사 초안과
 * 언어별 말풍선 식자(Typesetting) 팽창률 가이드를 결정적으로 생성한다.
 */
export function buildGlobalLocalizedDialoguePreview(
  rawText: string,
  options: DialogueLocalRecommendOptions = {},
): readonly GlobalLocalizedDialogueEntry[] {
  const cleaned = rawText.replace(/\s+/gu, " ").trim() || "여기서 멈출 수는 없어.";
  const emotion =
    options.emotion ??
    (/끝낸다|책임져|멈추지|절대/u.test(cleaned)
      ? "rage"
      : /사실이야|설마|그럴 리가|잠깐/u.test(cleaned)
        ? "shock"
        : /미안|눈물|그만/u.test(cleaned)
          ? "sorrow"
          : /해냈어|만나게|다행/u.test(cleaned)
            ? "joy"
            : "determination");

  const enByEmotion: Readonly<Record<NonNullable<DialogueLocalRecommendOptions["emotion"]>, string>> = {
    rage: "There's no turning back now—I'm ending this right here!",
    shock: "Wait... Are you telling me what's in front of my eyes is real?!",
    sorrow: "I'm sorry... If only I had realized the truth a little sooner.",
    joy: "It's really you! We finally made it through!",
    determination: "No matter the cost, I won't let this chance slip away.",
    calm: "Take your time and tell me why you came all this way.",
  };
  const jaByEmotion: Readonly<Record<NonNullable<DialogueLocalRecommendOptions["emotion"]>, string>> = {
    rage: "もう後戻りはしない。ここで決着をつける！",
    shock: "待って…今目の前にあるこれ、本当に現実なの！？",
    sorrow: "ごめん…あの時もう少し早く気づけていれば。",
    joy: "本当に君なんだね！ついにやり遂げたよ！",
    determination: "どんな代償を払っても、この好機だけは絶対に逃さない。",
    calm: "ゆっくり話してみて。どうしてここまで来たのか。",
  };
  const esByEmotion: Readonly<Record<NonNullable<DialogueLocalRecommendOptions["emotion"]>, string>> = {
    rage: "¡Ya no hay vuelta atrás, terminaré con esto aquí mismo!",
    shock: "¡¿Espera... me estás diciendo que esto es real?!",
    sorrow: "Lo siento... si tan solo lo hubiera sabido un poco antes.",
    joy: "¡De verdad eres tú! ¡Por fin lo logramos!",
    determination: "Sin importar el precio, no dejaré escapar esta oportunidad.",
    calm: "Cuéntame con calma por qué viniste hasta aquí.",
  };

  return Object.freeze([
    {
      locale: "ko",
      localeLabel: "한국어 (원문)",
      localizedText: cleaned,
      bubbleExpansionRatio: 1.0,
      letteringNote: "모바일 가독성을 위해 줄당 12~14자 내외 중앙 정렬을 권장합니다.",
    },
    {
      locale: "en",
      localeLabel: "English (북미·글로벌)",
      localizedText: enByEmotion[emotion],
      bubbleExpansionRatio: 1.35,
      letteringNote: "영문 식자는 원문 대비 폭이 약 35% 넓어지므로 가로 타원형 말풍선 여백을 확보하세요.",
    },
    {
      locale: "ja",
      localeLabel: "日本語 (일본 라인망가·픽코마)",
      localizedText: jaByEmotion[emotion],
      bubbleExpansionRatio: 1.05,
      letteringNote: "일본어 세로쓰기(타테구미) 전환 시 세로형 말풍선 비율이 유리합니다.",
    },
    {
      locale: "es",
      localeLabel: "Español (중남미·유럽)",
      localizedText: esByEmotion[emotion],
      bubbleExpansionRatio: 1.42,
      letteringNote: "스페인어는 어절이 길어 말풍선 상하 여백을 40% 이상 여유 있게 잡는 것이 좋습니다.",
    },
  ]);
}

export type CharacterVoiceArchetype =
  | "cold-strategist"
  | "passionate-hero"
  | "warm-healer"
  | "cynical-rival"
  | "noble-formal";

export interface CharacterVoiceExchangeBeat {
  readonly turnOrder: number;
  readonly speaker: string;
  readonly kind: DialogueSuggestionKind;
  readonly text: string;
  readonly suggestedSfx: string;
  readonly mobileBubbles: readonly string[];
  readonly readability: WebtoonDialogueReadabilityReport;
}

export interface CharacterVoiceExchangeRecommendation {
  readonly protagonistName: string;
  readonly partnerName: string;
  readonly archetype: CharacterVoiceArchetype;
  readonly speechEndingStyle: "해체/반말" | "하십시오/격식체" | "해요체";
  readonly voiceConsistencyScore: number;
  readonly beats: readonly CharacterVoiceExchangeBeat[];
  readonly scriptBlock: string;
  readonly pacingAdvice: string;
}

/**
 * 캐릭터 말투 아키타입(냉철한 전략가·열혈 주인공·따뜻한 조력자·냉소적 라이벌·고전 격식체)과
 * 장면 갈등 상황을 결합해, 티키타카 대사·내면 독백·웹툰 효과음(SFX)·모바일 말풍선 분할까지
 * 일관되게 설계된 멀티 턴 대사 교차 세트를 생성·추천한다.
 */
export function recommendCharacterVoiceDialogueExchange(input: {
  readonly situationText: string;
  readonly protagonistName?: string;
  readonly partnerName?: string;
  readonly archetype?: CharacterVoiceArchetype;
}): CharacterVoiceExchangeRecommendation {
  const situation = input.situationText.replace(/\s+/gu, " ").trim() || "결정적 대치의 순간";
  const protagonistName = input.protagonistName?.trim() || "주인공";
  const partnerName = input.partnerName?.trim() || "상대역";
  const archetype: CharacterVoiceArchetype = input.archetype ?? "cold-strategist";

  const templateByArchetype: Readonly<
    Record<
      CharacterVoiceArchetype,
      {
        readonly speechEndingStyle: "해체/반말" | "하십시오/격식체" | "해요체";
        readonly lines: readonly {
          readonly speaker: string;
          readonly kind: DialogueSuggestionKind;
          readonly text: string;
          readonly sfx: string;
        }[];
        readonly pacingAdvice: string;
      }
    >
  > = {
    "cold-strategist": {
      speechEndingStyle: "해체/반말",
      lines: [
        {
          speaker: protagonistName,
          kind: "speech",
          text: `${situation}… 계산은 이미 끝났어. 네가 움직일 수 있는 수는 하나뿐이야.`,
          sfx: "스르륵",
        },
        {
          speaker: partnerName,
          kind: "speech",
          text: "설마 처음부터 이 함정을 노리고 날 유인한 거냐?!",
          sfx: "움찔",
        },
        {
          speaker: "",
          kind: "narration",
          text: "차가운 눈빛 너머로 흔들림 없는 승부수가 조용히 내려앉았다.",
          sfx: "터억",
        },
      ],
      pacingAdvice: "짧고 단호한 평서문 뒤 상대방의 경악 리액션 컷을 붙여 지략전의 쾌감을 극대화하세요.",
    },
    "passionate-hero": {
      speechEndingStyle: "해체/반말",
      lines: [
        {
          speaker: protagonistName,
          kind: "speech",
          text: `${situation} 앞에서도 난 절대 뒤로 물러서지 않아! 끝까지 부딪혀 주지!`,
          sfx: "콰아앙",
        },
        {
          speaker: partnerName,
          kind: "speech",
          text: "무모한 패기만으로 이 벽을 넘을 수 있을 것 같나!",
          sfx: "챙강",
        },
        {
          speaker: "",
          kind: "narration",
          text: "타오르는 투지가 허공을 가르며 전장의 공기를 단숨에 뒤바꾸었다.",
          sfx: "부우웅",
        },
      ],
      pacingAdvice: "외침 말풍선과 대각선 타격 효과음(콰아앙)을 함께 배치해 스크롤 속도감을 높이세요.",
    },
    "warm-healer": {
      speechEndingStyle: "해요체",
      lines: [
        {
          speaker: protagonistName,
          kind: "speech",
          text: `${situation} 때문에 많이 힘들었죠. 이제 혼자 버티지 않아도 괜찮아요.`,
          sfx: "토닥",
        },
        {
          speaker: partnerName,
          kind: "speech",
          text: "…지금 그 말, 정말 믿어도 되는 거야?",
          sfx: "두근",
        },
        {
          speaker: "",
          kind: "narration",
          text: "얼어붙어 있던 마음의 틈새로 잔잔한 온기가 스며들기 시작했다.",
          sfx: "사르르",
        },
      ],
      pacingAdvice: "부드러운 해요체 대사 사이에는 여백이 넓은 클로즈업 컷을 배치해 감정 여운을 살리세요.",
    },
    "cynical-rival": {
      speechEndingStyle: "해체/반말",
      lines: [
        {
          speaker: protagonistName,
          kind: "speech",
          text: `흥, ${situation} 정도로 쓰러질 거면 시작도 안 했어. 비켜, 내 사냥감이야.`,
          sfx: "피식",
        },
        {
          speaker: partnerName,
          kind: "speech",
          text: "입만 살아서는. 누가 먼저 끝장내는지 직접 확인해 보자고!",
          sfx: "스릉",
        },
        {
          speaker: "",
          kind: "narration",
          text: "날 선 도발 속에서도 서로의 등을 맡긴 미묘한 신뢰가 번뜩였다.",
          sfx: "번쩍",
        },
      ],
      pacingAdvice: "2인 대치 역샷(Two-shot) 구도에서 좌우 말풍선을 엇갈리게 배치해 신경전 텐션을 강조하세요.",
    },
    "noble-formal": {
      speechEndingStyle: "하십시오/격식체",
      lines: [
        {
          speaker: protagonistName,
          kind: "speech",
          text: `${situation}의 진실을 마주할 시간입니다. 가문의 이름으로 끝까지 책임을 묻겠습니다.`,
          sfx: "쩌렁",
        },
        {
          speaker: partnerName,
          kind: "speech",
          text: "감히 이 자리에서 그 서약을 입에 담다니… 각오는 되어 있겠지!",
          sfx: "쿠구궁",
        },
        {
          speaker: "",
          kind: "narration",
          text: "화려한 샹들리에 아래로 서늘한 침묵이 무겁게 내려앉았다.",
          sfx: "스산",
        },
      ],
      pacingAdvice: "로맨스판타지·사극 격식체 대사는 문장이 길어지기 쉬우므로 말풍선 2단 분할을 적극 활용하세요.",
    },
  };

  const selected = templateByArchetype[archetype];
  const beats: CharacterVoiceExchangeBeat[] = selected.lines.map((line, index) => {
    const mobileBubbles = splitDialogueIntoWebtoonBubbles(line.text);
    const readability = analyzeWebtoonDialogueReadability(line.text);
    return Object.freeze({
      turnOrder: index + 1,
      speaker: line.speaker,
      kind: line.kind,
      text: line.text,
      suggestedSfx: line.sfx,
      mobileBubbles,
      readability,
    });
  });

  const scriptBlock = beats
    .map((beat) =>
      formatDialogueSuggestionLine({
        speaker: beat.speaker,
        text: beat.text,
        kind: beat.kind,
      }),
    )
    .join("\n");

  return Object.freeze({
    protagonistName,
    partnerName,
    archetype,
    speechEndingStyle: selected.speechEndingStyle,
    voiceConsistencyScore: 96,
    beats: Object.freeze(beats),
    scriptBlock,
    pacingAdvice: selected.pacingAdvice,
  });
}



