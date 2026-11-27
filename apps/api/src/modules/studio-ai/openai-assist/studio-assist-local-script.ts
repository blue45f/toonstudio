import type { OpenAiAssistStructuredResult } from "../studio-openai-creative-assist.dto";
import { DIALOGUE_TONE_LABELS } from "./studio-openai-prompt-catalog";

type LocalData<M extends OpenAiAssistStructuredResult["mode"]> =
  Extract<OpenAiAssistStructuredResult, { mode: M }>["data"];

const quotedText = /“([^”]+)”|‘([^’]+)’|"([^"]+)"|「([^」]+)」|'([^'\n]+)'/gu;

function quoteBody(match: RegExpMatchArray): string {
  return match.slice(1).find((body) => body !== undefined)?.trim() ?? "";
}

// 결과 계약은 UTF-16 길이를 검사하므로 이모지의 서로게이트 쌍 중간에서는 자르지 않는다.
function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/u, "").trimEnd() + "…";
}

function splitBalloon(text: string, preferred: number): [string, string] {
  if (Array.from(text).length <= 24) return [text, ""];
  const lower = Math.max(1, text.length - 240);
  const upper = Math.min(300, text.length - 1);
  const breaks = [...text.matchAll(/\s+/gu)].map((space) => space.index).filter((at) => at >= lower && at <= upper);
  if (breaks.length === 0 && text.length <= 300) return [text, ""];
  // 수식어와 명사를 떼지 않도록 문장 끝, 절 끝, 일반 띄어쓰기 순서로 고른다.
  const sentences = breaks.filter((at) => /[.!?…。！？][”’"'」)]?$/u.test(text.slice(0, at)));
  const clauses = breaks.filter((at) => /(?:[,，;；]|니까|지만|는데|다면|으면)$/u.test(text.slice(0, at)));
  const candidates = sentences.length ? sentences : clauses.length ? clauses : breaks;
  const at = candidates.reduce((best, candidate) =>
    Math.abs(candidate - preferred) < Math.abs(best - preferred) ? candidate : best,
  candidates[0] ?? upper);
  // 긴 단일 단어도 두 필드의 계약 범위 안에서 보존한다.
  const boundary = /[\uD800-\uDBFF]/u.test(text.charAt(at - 1)) ? at - 1 : at;
  return [text.slice(0, boundary).trimEnd(), text.slice(boundary).trimStart()];
}

const conversationalForms: Readonly<Record<string, string>> = {
  이것은: "이건", 그것은: "그건", 저것은: "저건", 이것을: "이걸", 그것을: "그걸", 저것을: "저걸",
};

export function buildLocalDialogueLayout(input: string): LocalData<"dialogue-polish"> {
  const quotes = [...input.matchAll(quotedText)].filter((match) => {
    const before = input.slice(0, match.index).trimEnd();
    const after = input.slice(match.index + match[0].length).trimStart();
    return (!before && !after) || /(?:대사|말한다|묻는다|대답한다)\s*[:：.]?$/u.test(before)
      || ((before.length === 0 || /[.!?。！？]$/u.test(before)) && /[.!?…。！？]$/u.test(quoteBody(match)));
  }).map(quoteBody).filter(Boolean);
  const source = (quotes[0] || input.replace(/^\s*대사\s*[:：]\s*/u, "") || input).replace(/\s+/gu, " ").trim();
  // 최장 300 + 240자에 경계 이모지 하나의 여지를 둔다.
  const text = excerpt(source, 539);
  const sentenceEndings = [...text.matchAll(/[.!?…。！？][”’]?\s/gu)];
  const lastSentenceEnd = sentenceEndings.at(-1)?.index;
  const [opening, continuation] = text.length <= 300 ? [text, ""] : splitBalloon(text, 300);
  const [line, subBubble] = splitBalloon(text, lastSentenceEnd === undefined ? text.length * 0.65 : lastSentenceEnd + 1);
  const contracted = text.replace(/(^|\s)([이그저]것[은을])(?=\s)/gu,
    (_, lead: string, word: string) => lead + conversationalForms[word]);
  const [shortLine, shortTail] = splitBalloon(contracted, contracted.length / 2);
  return {
    readabilityNote: [
      "로컬 코치는 원문 표현과 존댓말을 보존하고 말풍선 호흡을 제안합니다.",
      quotes.length > 1 ? "인용문이 여러 개여서 첫 대사를 사용했습니다." : "",
      source.length > text.length ? "표시 한도를 넘은 뒷부분은 다음 요청에 이어 넣어 주세요." : "",
    ].filter(Boolean).join(" "),
    balloons: [
      {
        toneLabel: DIALOGUE_TONE_LABELS[0], line: opening, subBubble: continuation,
        reason: "원문의 문장과 순서를 살려 한 번에 읽을 분량을 확인하세요.",
      },
      {
        toneLabel: DIALOGUE_TONE_LABELS[1], line: shortLine, subBubble: shortTail,
        reason: contracted !== text ? "지시대명사를 입말로 줄여 원래 뜻을 유지합니다."
          : shortTail ? "조건과 높임말을 유지하고 두 말풍선에 나눠 읽도록 했습니다."
          : "발화를 한 말풍선에 담아 한 호흡에 읽도록 했습니다.",
      },
      {
        toneLabel: DIALOGUE_TONE_LABELS[2], line, subBubble,
        reason: subBubble ? "두 번째 말풍선을 한 박자 뒤에 놓아 다음 구절이 들리게 하세요." : "짧은 발화를 그대로 두고 말풍선 주위에 여백을 주세요.",
      },
    ],
  };
}

const cutHeader = /^\s*(?:컷\s*\d{1,2}|\d{1,2}\s*컷)(?=[\s.:：)\]-]|$)\s*[.:：)\]-]?\s*/u;
const requestedCutCount = /^\s*(?:정확히\s*)?(\d{1,2})\s*컷(?:으로|로)\s*(?:나눠|나누어|분할해|구성해)\s*주세요[.!]?\s*/u;
const spokenLine = /^([\p{L}][\p{L}\p{N}_ ·]{0,18})\s*[:：]\s*(.+)$/u;
const stageLabel = /(?:장면|지문|배경|효과음|쪽지|메모|자막|간판|회상|현재|과거|시간|장소|줄거리|제목|설명|연출|SFX)$/iu;

function spokenText(beat: string): string {
  const labeled = beat.match(spokenLine);
  if (labeled && !stageLabel.test(labeled[1].trim())) {
    const body = labeled[2].trim();
    const quote = [...body.matchAll(quotedText)][0];
    return quote?.[0] === body ? quoteBody(quote) : body;
  }
  return [...beat.matchAll(quotedText)].filter((match) => {
    const before = beat.slice(0, match.index).trimEnd();
    const after = beat.slice(match.index + match[0].length).trimStart();
    return (!before && !after) || /(?:대사|말한다|묻는다|대답한다)[.：:]?$/u.test(before)
      || /^(?:[이]?라고\s*)?(?:묻|물었|말[했한하]|했다|대답|외[쳤친치]|속삭|중얼)/u.test(after);
  }).map(quoteBody).join("\n");
}

function splitLongAction(scene: string): string[] {
  if (scene.length <= 480 || spokenText(scene)) return [scene];
  const chunks: string[] = [];
  let rest = scene;
  while (rest.length > 480) {
    const wordBreak = rest.lastIndexOf(" ", 480);
    const hardLimit = /[\uD800-\uDBFF]/u.test(rest.charAt(479)) ? 479 : 480;
    const boundary = wordBreak >= 360 ? wordBreak : hardLimit;
    chunks.push(rest.slice(0, boundary).trimEnd());
    rest = rest.slice(boundary).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function splitSceneSentences(line: string): string[] {
  const beats: string[] = [];
  let start = 0;
  // 따옴표 안의 문장 부호는 분리하지 않아 한 화자의 발화를 중간에 잃지 않는다.
  const tokens = /“[^”]+”|‘[^’]+’|"[^"]+"|「[^」]+」|'[^'\n]+'|[.!?。！？]\s+/gu;
  for (const token of line.matchAll(tokens)) {
    if (/^[.!?。！？]/u.test(token[0])) {
      const end = token.index + token[0].length;
      beats.push(line.slice(start, end).trim());
      start = end;
    }
  }
  beats.push(line.slice(start).trim());
  return beats.filter((beat) =>
    !(/(?:인물|대사|사건|장면)/u.test(beat) && /(?:추가하지|넣지)\s*마세요[.!]?$/u.test(beat)));
}

export function buildLocalScriptCuts(input: string, title: string): LocalData<"script-to-cuts"> {
  const requested = input.match(requestedCutCount);
  const script = input.slice(requested?.[0].length ?? 0).trim();
  const lines = script.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  const beats: string[] = [];
  if (lines.some((line) => cutHeader.test(line))) {
    for (const line of lines) {
      if (cutHeader.test(line)) beats.push(line.replace(cutHeader, ""));
      else if (beats.length) beats[beats.length - 1] += "\n" + line;
      else beats.push(line);
    }
  } else {
    for (const line of lines) {
      if (spokenLine.test(line)) beats.push(line);
      else beats.push(...splitSceneSentences(line).flatMap(splitLongAction));
    }
  }
  const scenes = beats.map((beat) => beat.trim()).filter(Boolean);
  const count = Math.min(20, scenes.length, requested ? Math.max(1, Number(requested[1])) : scenes.length);
  let clipped = false;
  const cuts: LocalData<"script-to-cuts">["cuts"] = Array.from({ length: count }, (_, index) => {
    // 컷 수를 줄일 때 앞쪽부터 인접한 장면을 묶어 마지막 엔딩 장면은 최대한 독립시킨다.
    const group = scenes.slice(Math.ceil(index * scenes.length / count), Math.ceil((index + 1) * scenes.length / count));
    const action = group.join("\n");
    const speech = group.flatMap((scene) => scene.split("\n")).map(spokenText).filter(Boolean).join("\n");
    clipped ||= action.length > 480 || speech.length > 320;
    return {
      cutNumber: index + 1,
      beatKind: speech ? "dialogue" : index === 0 ? "setup" : "action",
      shotType: speech ? "미디엄 샷 · 화자의 표정" : index === 0 ? "와이드 샷 · 장면 도입" : "미디엄 샷 · 행동 중심",
      visualAction: excerpt(action, 480),
      dialogue: excerpt(speech, 320),
      scrollGapHint: speech ? "말풍선을 읽은 뒤 다음 컷으로 넘어가도록 여백을 남기세요." : "다음 행동과의 시간 차이에 맞춰 여백을 조절하세요.",
    };
  });
  return {
    episodeGoal: `'${title}' 원고 순서에 따라 ${count}컷으로 나눴습니다.`,
    pacingTip: count === 0 ? "나눌 대본이나 장면을 입력해 주세요." :
      "각 컷에서 원고의 행동과 발화를 먼저 확인한 뒤 구도를 조정하세요." +
      (requested && count !== Number(requested[1]) ? ` 원고에서 나눌 수 있는 장면과 최대 20컷 한도에 맞춰 ${count}컷을 제안합니다.` : "") +
      (clipped ? " 한 컷의 표시 한도를 넘은 부분은 원문에서 확인하세요." : ""),
    cuts,
  };
}
