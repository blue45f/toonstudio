import type { OpenAiAssistStructuredResult } from "./studio-openai-assist-result";

export const DIALOGUE_TONE_LABELS = ["자연스러운 구어체", "짧고 강한 핵심형", "감정 여운 강조형"] as const;

type LocalData<M extends OpenAiAssistStructuredResult["mode"]> =
  Extract<OpenAiAssistStructuredResult, { mode: M }>["data"];

const quotedText = /“([^”]+)”|‘([^’]+)’|"([^"]+)"|「([^」]+)」|'([^'\n]+)'/gu;
const stageLabel = /(?:장면|지문|배경|효과음|쪽지|메모|자막|간판|회상|현재|과거|시간|장소|줄거리|제목|설명|연출|보증문|안내문|전광판|단말기|화면|SFX)$/iu;
const speakerPrefix = /(?:^|[\n.!?。！？”’"'」)）]|(?:컷\s*\d{1,2}|\d{1,2}\s*컷)\s*[:：])[ \t]*([\p{L}][\p{L}\p{N}_ ·]{0,18})\s*[:：][ \t]*$/u;
const writtenCue = /(?:보증문|안내문|자막|간판|시간표|영수증|화면|전광판|(?:적혀|쓰여|새겨져|인쇄되어)\s*있다)[.:：]$/u;

function quoteBody(match: RegExpMatchArray): string {
  return match.slice(1).find((body) => body !== undefined)?.trim() ?? "";
}

function isWholeUtterance(input: string, quote: RegExpMatchArray): boolean {
  const tail = input.slice((quote.index ?? 0) + quote[0].length);
  const next = tail.trimStart();
  if (!next || next.startsWith(quote[0][0])) return true;
  if (next.startsWith("(") || next.startsWith("（")) {
    const followingQuote = next.indexOf(quote[0][0]);
    if (followingQuote > 0 && connectsSpeakerBalloons(next.slice(0, followingQuote))) return true;
  }
  if (/^(?:이?라고|이?라는)\s*(?:적|쓰|써|새겨|인쇄|표시|문구|글씨)/u.test(next)) return false;
  const nextSpeaker = next.match(spokenLine);
  if (nextSpeaker && !stageLabel.test(nextSpeaker[1].trim())) return true;
  // ‘내일’은 안 돼처럼 발화 안에서 한 낱말만 인용한 경우에는 대사 전체를 보존한다.
  return /^\s/u.test(tail) && (/^[\r\n]/u.test(tail) || /[.!?…。！？]$/u.test(quoteBody(quote)));
}

function speakerOfQuote(input: string, quote: RegExpMatchArray): string | undefined {
  const speaker = input.slice(0, quote.index).match(speakerPrefix)?.[1].trim();
  return speaker && !stageLabel.test(speaker) && isWholeUtterance(input, quote) ? speaker : undefined;
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
  const candidates = [...input.matchAll(quotedText)].flatMap((match) => {
    const before = input.slice(0, match.index).trimEnd();
    const after = input.slice(match.index + match[0].length).trimStart();
    const text = quoteBody(match);
    const introduced = /(?:대사|말한다|묻는다|대답한다)\s*[:：.]?$/u.test(before);
    const standalone = (!before && !after) || ((!before || /[.!?。！？]$/u.test(before)) && /[.!?…。！？]$/u.test(text));
    if (!text || !(introduced || standalone || speakerOfQuote(input, match))) return [];
    return [{ text, written: writtenCue.test(before) }];
  });
  // 소품에 적혔다고 명시한 인용은 다른 발화 후보가 있을 때만 뒤로 보낸다.
  const speech = candidates.filter((candidate) => !candidate.written);
  const quotes = (speech.length ? speech : candidates).map((candidate) => candidate.text);
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

function connectsSpeakerBalloons(gap: string): boolean {
  const cue = gap.trim().normalize("NFKC");
  if (!cue) return true;
  // 명시된 화자의 주어가 생략된 시선·연기 지시 하나만 인정한다. 지문은 visualAction에 그대로 남는다.
  if (/^\(\s*(?:고개를\s*(?:끄덕이며|숙이며)|(?:잠시\s*)?숨을\s*고르(?:며|고)|웃으며|속삭이듯)\s*\)$/u.test(cue)) return true;
  const target = /^\(\s*([\p{L}]+)[을를]\s*(?:바라|돌아)?보며\s*\)$/u.exec(cue)?.[1];
  return Boolean(target && !stageLabel.test(target) && !/(?:판|표지|팻말|글씨|문구|문서|서류|종이|영수증|편지|책)$/u.test(target));
}

// 인용 앞의 행동·발화 단서와 인용 자체를 함께 읽는다. 화자의 이름은 추론하지 않는다.
function isNarratedSpeech(beat: string, quote: RegExpMatchArray): boolean {
  const before = beat.slice(0, quote.index).trimEnd();
  const after = beat.slice((quote.index ?? 0) + quote[0].length).trimStart();
  if (!before && !after) return true;
  if (/^(?:이?라고|이?라는)\s*(?:적|쓰|써|새겨|인쇄|표시|문구|글씨)/u.test(after)) return false;
  if (/^(?:이?라고\s*)?(?:묻|물었|말[했한하]|했다|대답|외[쳤친치]|속삭|중얼)/u.test(after)
    && !/^[^.!?。！？]{0,20}지\s*(?:않|못)/u.test(after)) return true;
  if (/^(?:하는\s*)?(?:한마디|목소리|대답)(?:가|이)\s*들(?:린다|렸다)/u.test(after)) return true;
  if (/(?:대사|말한다|말했다|묻는다|물었다|대답한다|소리친다|속삭인다|부탁한다|달라고 한다|소리 내어 읽는다|낭독한다)[.：:]?$/u.test(before)) return true;
  if (!/^[“"「]/u.test(quote[0]) || !isWholeUtterance(beat, quote)) return false;
  const action = before.match(/(?:^|[.!?。！？”’"'」])\s*([^.!?。！？“”‘’"'「」]+)[.!?。！？]$/u)?.[1];
  if (!action || !/[가-힣]+[이가은는]\s/u.test(action)) return false;
  if (/(?:간판|안내판|게시판|전광판|명판|게시물|안내문|쪽지|메모|글씨|문구|자막|화면|표지|포스터|영수증|편지|서류|공문|스티커|인쇄|적혀|쓰여|써져|새겨|타이핑|생각|마음속|상상|말없이|무언)/u.test(action)
    || /(?:쓴다|적는다|새긴다|입력한다|표시한다|붙인다|읽는다)$/u.test(action)) return false;
  const ending = action.match(/([가-힣])다$/u)?.[1];
  // 현재 동작 서술의 -ㄴ다·-는다에서 '다' 바로 앞 음절의 종성은 ㄴ이다.
  if (!ending || (ending.charCodeAt(0) - 0xac00) % 28 !== 4) return false;
  return /(?:요|죠|네|군|구나|지|니|야|래|어|아|와|해|소|오|세|십시오|니다|니까|겠다)[.!?…。！？](?:\s|$)/u.test(quoteBody(quote));
}

function spokenText(beat: string): string {
  const labeled = beat.match(spokenLine);
  const turns: Array<{ speaker?: string; text: string }> = [];
  let lastEnd = 0;
  let opening = "";
  for (const quote of beat.matchAll(quotedText)) {
    const speaker = speakerOfQuote(beat, quote);
    const lastTurn = turns.at(-1);
    if (speaker) {
      turns.push({ speaker, text: quoteBody(quote) });
    } else if (lastTurn && opening === quote[0][0] && connectsSpeakerBalloons(beat.slice(lastEnd, quote.index)) && isWholeUtterance(beat, quote)) {
      lastTurn.text += "\n" + quoteBody(quote);
    } else if (isNarratedSpeech(beat, quote)) {
      turns.push({ text: quoteBody(quote) });
    } else {
      continue;
    }
    lastEnd = quote.index + quote[0].length;
    opening = quote[0][0];
  }
  // 따옴표 없이 화자가 이어 말하는 대본은 기존 원문 전체를 보존한다.
  const hasPlainSpeaker = /(?:^|[.!?。！？”’"'」)）])\s*[\p{L}][\p{L}\p{N}_ ·]{0,18}[:：]\s*[^\s“‘"「']/u.test(beat);
  if (turns.length && !hasPlainSpeaker) {
    return turns.map(({ speaker, text }) => speaker && turns.length > 1 ? `${speaker}: ${text}` : text).join("\n");
  }
  if (labeled && !stageLabel.test(labeled[1].trim())) {
    const body = labeled[2].trim();
    const quote = [...body.matchAll(quotedText)][0];
    return quote?.[0] === body ? quoteBody(quote) : body;
  }
  return turns.map(turn => turn.text).join("\n");
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
      if (/^[“‘"「']/u.test(line.slice(end))) continue;
      beats.push(line.slice(start, end).trim());
      start = end;
    }
  }
  beats.push(line.slice(start).trim());
  return beats.filter((beat) =>
    !(/(?:인물|대사|사건|장면)/u.test(beat) && /(?:추가하지|넣지)\s*마세요[.!]?$/u.test(beat)));
}

function expandCircledCutHeaders(script: string): string {
  if (!/^①\s/u.test(script)) return script;
  // 인용문은 한 토큰으로 읽으므로 대사·소품 안에 적힌 순번은 구분자가 되지 않는다.
  const tokens = new RegExp(quotedText.source + "|(?<!\\S)[①-⑳](?=\\s)", "gu");
  const markers = [...script.matchAll(tokens)].filter((match) => match[0].length === 1);
  if (markers.length < 2 || markers.some((marker, i) => marker[0].charCodeAt(0) !== 0x2460 + i)) return script;
  return markers.map((marker, i) =>
    `${i + 1}컷. ${script.slice(marker.index + 1, markers[i + 1]?.index).trim()}`,
  ).join("\n");
}

export function buildLocalScriptCuts(input: string, title: string): LocalData<"script-to-cuts"> {
  const marker = /^[ \t]*\[원고\][ \t]*(?:\r?\n|$)/mu.exec(input);
  const requested = marker
    ? input.slice(0, marker.index).split(/\r?\n/u).map((line) => line.match(requestedCutCount)).find(Boolean)
    : input.match(requestedCutCount);
  const scriptStart = marker ? marker.index + marker[0].length : requested?.[0].length ?? 0;
  const script = input.slice(scriptStart).trim();
  const lines = expandCircledCutHeaders(script).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
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
