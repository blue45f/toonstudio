// 컷 번호는 줄바꿈뿐 아니라 같은 문단의 ‘2컷에서는’ 같은 표기도 받는다.
const panelMarker = /(?:^|[\s.!?。！？|])(?:\[[ \t]*)?(?:(?:\d{1,3}[ \t]*컷|컷[ \t]*\d{1,3}|(?:마지막|엔딩)[ \t]*컷)(?:에서(?:는)?|에는|은|는|엔)?|엔딩(?=[ \t]*[:：\]]))(?=[\s.:：)\]-]|$)[ \t]*[.:：)\]-]?[ \t]*/gu;
const editorialNotes = /(?:(?:^|[\n.!?。！？])[ \t]*(?:요청(?:사항)?|검토 요청|편집 메모|작가 메모|참고)|(?:^|\n)[ \t]*메모)[ \t]*[:：]/u;
const episodeMarker = /(?:^|[\s[→])(?:제[ \t]*)?(\d{1,3})[ \t]*화(?:의|에서(?:는)?|에는|는|와|를)?(?=[\s.:：\]→]|$)/gu;
const manuscriptHeader = /(?:^|\n)[ \t]*(?:\[(?:원고|대본|콘티)\]|(?:원고|대본|콘티)[ \t]*[:：])[ \t]*/u;
const sentenceSegmenter = new Intl.Segmenter("ko", { granularity: "sentence" });
const requestEnding = /(?:주세요|주십시오|부탁(?:해요|합니다|드립니다)|분석해\s*줘|점검해\s*줘)[.!?。！？]*$/u;
const points = /(?<!\d)\d{1,3}(?:\s*\/\s*100(?:\s*점)?|\s*점)/gu;

function normalizeExcerpt(text: string): string {
  return text.normalize("NFC").replace(/\s+/gu, " ").trim();
}

function isTrailingRequest(segment: string): boolean {
  const sentence = segment.trim();
  // 컷·화자 표기나 따옴표가 붙은 대사는 요청형·의문형이어도 원고에 속한다.
  if (sentence.search(panelMarker) === 0 || /^(?:[“「"‘]|[\p{L}]{1,8}\s*[:：])/u.test(sentence)) return false;
  return requestEnding.test(sentence) || /[?？]$/u.test(sentence);
}

function endingPassage(inputText: string): string {
  const sections = inputText.normalize("NFC").split(manuscriptHeader);
  const source = sections.at(-1) ?? "";
  const [body, notes] = source.split(editorialNotes, 2);
  const sentences = Array.from(sentenceSegmenter.segment(body), part => part.segment);
  while (sentences.length && isTrailingRequest(sentences.at(-1) ?? "")) sentences.pop();
  const manuscript = sentences.join("").trim();
  const episodes = new Set(Array.from(manuscript.matchAll(episodeMarker), match => Number(match[1])));
  if (episodes.size > 1) return "";

  const numbered = Array.from(manuscript.matchAll(panelMarker));
  const circled = Array.from(manuscript.matchAll(/(?:^|\s)([①-⑳])(?=\s)/gu));
  const ordered = circled.length >= 2 && circled.every((entry, i) => entry[1].charCodeAt(0) === 0x2460 + i);
  const lastPanel = ordered ? circled.at(-1) : numbered.at(-1);
  if (lastPanel) return manuscript.slice(lastPanel.index + lastPanel[0].length);

  // 산문은 원고/요청 경계가 있거나 장면 서술이 여러 문장일 때 끝 문장을 대조한다.
  if (sections.length === 1 && notes === undefined && sentences.length < 2) return "";
  return sentences.at(-1)?.trim() ?? "";
}

export function checkScrollEndingEvidence(inputText: string, cliffhangerTip: string): "matched" | "unmatched" | "uncited" {
  if (!/[「」“”"]/u.test(cliffhangerTip)) return "uncited";
  const citation = cliffhangerTip.trimStart().match(/^(?:「([^「」]+)」|“([^“”]+)”|"([^"]+)")/u);
  const quote = citation?.slice(1).find(Boolean);
  if (!quote || (quote.match(/[\p{L}\p{N}\p{Extended_Pictographic}]/gu)?.length ?? 0) < 3) return "unmatched";
  return normalizeExcerpt(endingPassage(inputText)).includes(normalizeExcerpt(quote)) ? "matched" : "unmatched";
}

export function withoutUnverifiedEndingScore(text: string, fallback: string, inputText = ""): string {
  const source = normalizeExcerpt(inputText);
  const kept = Array.from(sentenceSegmenter.segment(text), part => part.segment).filter(sentence => {
    const normalized = normalizeExcerpt(sentence);
    return Array.from(normalized.matchAll(points)).every(match => {
      // 미평가 때는 원고에 실제 있는 ‘전광판의 2점’ 같은 문맥만 서술에 남긴다.
      const before = normalized.slice(0, match.index).match(/[\p{L}\p{N}]+\s*$/u)?.[0];
      const after = normalized.slice(match.index + match[0].length).match(/^[\p{L}]*\s+[\p{L}\p{N}]+/u)?.[0];
      return Boolean((before && source.includes(before + match[0])) || (after && source.includes(match[0] + after)));
    });
  });
  return kept.join("").trim() || fallback;
}
