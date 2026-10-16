/**
 * 투고 패키지 — 스튜디오 웹툰 문서를 회차 순서로 놓고 번호를 붙이는 순수 도우미.
 *
 * 프로젝트의 문서 목록(`readStudioProjectDocuments`)은 '최근에 연 순(내림차순)'이다. 그 순서 그대로 1..N 번호를 붙이면
 * 1화→2화→3화로 만든 프로젝트가 번호 1 에 3화 문서, 번호 3 에 1화 문서로 거꾸로 담기고, 사용자가 칸 제목을 따라 이미지를
 * 올리면 ZIP 의 `ep-001` 에 실제 3화 원고가 들어가도 점검은 통과한다. 그래서 열람 기록이 아니라 다음 두 가지로 정한다.
 *
 * 1. 모든 문서 제목이 서로 다른 회차 숫자(`1화`·`제3화`·`EP02`…)로 시작하면 그 숫자가 번호이고 숫자 순으로 놓는다.
 * 2. 그렇지 않으면 문서를 만든 순서(오래된 것이 앞)로 1화부터 번호를 붙인다. 만든 시각이 같으면(가져온 프로젝트) 제목의
 *    숫자 크기 순(`2` < `10`), 그래도 같으면 받은 순서를 따른다.
 *
 * 일부 제목만 숫자를 가졌거나 숫자가 겹치면 어느 쪽이 맞는지 알 수 없으므로 번호를 제목에서 읽지 않고 2 번 규칙을 쓴다.
 */
import { compareNaturalNames } from "./submission-package-text";

/** 스튜디오 웹툰 문서 한 건에서 회차 칸을 채우는 데 쓰는 정보. */
export interface SubmissionDocumentSeed {
  readonly id: string;
  readonly title: string;
  readonly width: number | null;
  readonly height: number | null;
  readonly pageCount: number;
  /** 문서를 만든 시각(ISO 8601). 읽을 수 없으면 가장 나중에 만든 것으로 본다. */
  readonly createdAt: string;
}

export interface NumberedSubmissionDocument {
  readonly document: SubmissionDocumentSeed;
  readonly number: number;
}

/**
 * 제목 맨 앞의 회차 표시. `EP01`·`Ep.3`·`Episode 12` 또는 `1화`·`제3화`·`12회`(`3회차` 포함).
 * 연도나 제목의 일부일 수 있는 숫자(`2024 여름 특집`)를 회차로 오해하지 않도록 `화`·`회`나 `EP` 표시가 있을 때만 읽고,
 * 숫자는 4자리까지만 받는다.
 */
const TITLE_EPISODE_PATTERNS: readonly RegExp[] = [/^(?:ep|episode)\.?\s*(\d{1,4})(?!\d)/iu, /^제?\s*(\d{1,4})\s*[화회]/u];

/** 제목 맨 앞의 회차 숫자(1 이상). 없으면 null. 전각 숫자·공백도 읽는다. */
export function readEpisodeNumberFromTitle(title: string): number | null {
  const text = title.normalize("NFKC").trim();
  for (const pattern of TITLE_EPISODE_PATTERNS) {
    const digits = pattern.exec(text)?.[1];
    if (digits === undefined) continue;
    const number = Number(digits);
    return number >= 1 ? number : null;
  }
  return null;
}

function creationTime(value: string): number {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

/** 모든 제목이 서로 다른 회차 숫자를 가졌을 때만 그 숫자와 숫자 순서를 돌려준다. 하나라도 아니면 null. */
function numberedByTitle(documents: readonly SubmissionDocumentSeed[]): NumberedSubmissionDocument[] | null {
  const numbered: NumberedSubmissionDocument[] = [];
  const seen = new Set<number>();
  for (const document of documents) {
    const number = readEpisodeNumberFromTitle(document.title);
    if (number === null || seen.has(number)) return null;
    seen.add(number);
    numbered.push({ document, number });
  }
  return numbered.sort((left, right) => left.number - right.number);
}

/** 문서를 회차 순서로 놓고 번호를 붙인다. 받은 배열은 바꾸지 않는다. */
export function orderSubmissionDocuments(documents: readonly SubmissionDocumentSeed[]): NumberedSubmissionDocument[] {
  const byCreation = documents
    .map((document, index) => ({ document, index, time: creationTime(document.createdAt) }))
    .sort((left, right) => left.time - right.time || compareNaturalNames(left.document.title, right.document.title) || left.index - right.index)
    .map((entry) => entry.document);
  return numberedByTitle(byCreation) ?? byCreation.map((document, index) => ({ document, number: index + 1 }));
}
