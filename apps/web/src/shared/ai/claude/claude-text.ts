/**
 * 모델 출력과 사용자 입력을 화면·클립보드·프롬프트로 내보내기 전에 정리하는 순수 함수.
 *
 * 마지막 관문에서 한 번 더 정리한다.
 * - 제어 문자(C0·DEL·C1)는 공백으로 바꾼다. 여러 줄 글에서는 줄바꿈만 남기고, U+0085·U+2028·U+2029도 줄바꿈으로 본다.
 * - 보이지 않는 서식 문자(제로 폭 공백·방향 제어·단어 결합자·BOM·태그 문자 등)는 지운다. 방향 제어는 화면과 클립보드에서 글자 순서를
 *   뒤집고, 보이지 않는 글자는 이미지 속 글을 통해 유도될 수 있어서다. 이모지·인도계·페르시아어 글자에 쓰이는 ZWJ·ZWNJ와 변이 선택자는 남긴다.
 * - 길이는 UTF-16 조각이 아니라 코드 포인트 기준이다. 잘라야 하면 이모지 가족·결합 문자 같은 글자 덩어리가 반으로 쪼개지지 않도록
 *   앞선 경계에서 자른다.
 */

type Disposition = "keep" | "space" | "newline" | "drop";

/** ZWJ(U+200D)·ZWNJ(U+200C)·변이 선택자(U+FE00~FE0F)는 이모지와 여러 문자 체계에서 의미가 있어 여기에 넣지 않는다. */
function isInvisibleFormatCharacter(code: number): boolean {
  return code === 0xad // 소프트 하이픈
    || code === 0x61c // 아랍 문자 표시
    || code === 0x180e // 몽골 모음 구분자
    || code === 0x200b // 제로 폭 공백
    || code === 0x200e || code === 0x200f // 좌우 표시
    || (code >= 0x202a && code <= 0x202e) // 방향 삽입·덮어쓰기
    || (code >= 0x2060 && code <= 0x206f) // 단어 결합자·보이지 않는 연산자·방향 격리
    || code === 0xfeff // BOM
    || (code >= 0xfff9 && code <= 0xfffc) // 주석 표시·개체 대체 문자
    || (code >= 0xe0000 && code <= 0xe007f); // 태그 문자(보이지 않는 글자 밀반입에 쓰인다)
}

function dispositionOf(code: number): Disposition {
  if (code === 10 || code === 0x85 || code === 0x2028 || code === 0x2029) return "newline";
  if (code < 32 || (code >= 127 && code <= 0x9f)) return "space";
  return isInvisibleFormatCharacter(code) ? "drop" : "keep";
}

function replaceControlCharacters(text: string, keepNewline: boolean): string {
  let result = "";
  for (const character of text) {
    switch (dispositionOf(character.codePointAt(0) ?? 0)) {
      case "keep":
        result += character;
        break;
      case "drop":
        break;
      case "newline":
        result += keepNewline ? "\n" : " ";
        break;
      default:
        result += " ";
    }
  }
  return result;
}

interface GraphemeSegmenter {
  segment(text: string): Iterable<{ readonly segment: string }>;
}

/** `Intl.Segmenter`는 구형 브라우저에 없을 수 있어 있을 때만 쓴다(없으면 코드 포인트 기준으로 자르고 끝의 ZWJ만 걷는다). */
const graphemeSegmenter: GraphemeSegmenter | null = (() => {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locales?: string, options?: { granularity: "grapheme" }) => GraphemeSegmenter;
  }).Segmenter;
  return Segmenter ? new Segmenter(undefined, { granularity: "grapheme" }) : null;
})();

export interface ClippedText {
  readonly text: string;
  /** 길이 제한 때문에 잘려 나간 부분이 있는가. */
  readonly clipped: boolean;
}

function clipDetailed(text: string, maxLength: number): ClippedText {
  const limit = Math.max(0, Math.floor(maxLength));
  const codePoints = [...text];
  if (codePoints.length <= limit) return { text: text.trim(), clipped: false };
  if (graphemeSegmenter) {
    let kept = "";
    let count = 0;
    for (const { segment } of graphemeSegmenter.segment(text)) {
      const size = [...segment].length;
      if (count + size > limit) break;
      kept += segment;
      count += size;
    }
    // 첫 덩어리부터 한도를 넘는 비정상 입력(결합 문자 수백 개 등)은 코드 포인트 기준으로 자른다.
    if (kept.length > 0 || limit === 0) return { text: kept.trim(), clipped: true };
  }
  return { text: codePoints.slice(0, limit).join("").replace(/\u200d+$/u, "").trim(), clipped: true };
}

function tidyMultiline(text: string): string {
  return replaceControlCharacters(text, true)
    .replace(/[ \t]+/gu, " ")
    .replace(/ ?\n ?/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function tidySingleLine(text: string): string {
  return replaceControlCharacters(text, false).replace(/\s+/gu, " ").trim();
}

/** 여러 줄을 허용하는 글(상세 설명·말풍선 번역 등). 줄바꿈 둘레의 공백과 세 번 이상 이어진 줄바꿈을 정리한다. */
export function cleanMultilineText(text: string, maxLength: number): string {
  return clipDetailed(tidyMultiline(text), maxLength).text;
}

/** `cleanMultilineText`와 같되 길이 제한으로 잘렸는지도 알려 준다(잘렸다는 사실을 사용자에게 말해야 하는 곳에서 쓴다). */
export function cleanMultilineTextDetailed(text: string, maxLength: number): ClippedText {
  return clipDetailed(tidyMultiline(text), maxLength);
}

/** 한 줄 글(제목·메모·대사 한 줄·명령 이름). 모든 공백 연속을 한 칸으로 줄인다. */
export function cleanSingleLineText(text: string, maxLength: number): string {
  return clipDetailed(tidySingleLine(text), maxLength).text;
}

export function cleanSingleLineTextDetailed(text: string, maxLength: number): ClippedText {
  return clipDetailed(tidySingleLine(text), maxLength);
}
